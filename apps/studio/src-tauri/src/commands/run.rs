use std::io::{BufRead, BufReader};
use std::process::{Command, Stdio};
use std::thread;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use wf_assemble::{from_generated, write_tree};
use wf_codegen_slint::{CodeGenerator, SlintCodeGenerator};
use wf_graph::{DefaultGraphParser, GraphParser};
use wf_ir::build_ir;
use wf_schema::ProjectFile;

use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunAppOutput {
    pub pid: u32,
    pub binary_path: String,
    pub source_dir: String,
}

/// One line of build progress streamed to the studio's logs panel.
/// `kind` partitions stage markers, cargo output, errors, and a final
/// done sentinel so the JS side can colour-code or stop a spinner.
#[derive(Debug, Clone, Serialize)]
struct CompileLogEvent {
    kind: &'static str,
    message: String,
}

fn emit_log(app: &AppHandle, kind: &'static str, message: impl Into<String>) {
    let _ = app.emit(
        "compile_log",
        CompileLogEvent {
            kind,
            message: message.into(),
        },
    );
}

fn slugify(input: &str) -> String {
    input
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .to_lowercase()
        .trim_matches('-')
        .to_owned()
}

fn crate_name(input: &str) -> String {
    input
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '_' })
        .collect::<String>()
}

#[tauri::command]
pub async fn run_generated_app(
    app: AppHandle,
    project: ProjectFile,
    state: State<'_, AppState>,
) -> Result<RunAppOutput, String> {
    // Macro-style helper so each stage gets logged + returned errors are
    // also emitted, never silent.
    let fail = |app: &AppHandle, msg: String| -> String {
        emit_log(app, "error", msg.clone());
        emit_log(app, "done", "failed");
        msg
    };

    // Reap any stale child first so we don't leak descriptors.
    {
        let mut slot = state.running_app.lock();
        if let Some(mut existing) = slot.take() {
            let _ = existing.kill();
            let _ = existing.wait();
        }
    }

    // 1. Parse and build IR
    emit_log(&app, "stage", "Parsing project graph…");
    let parser = DefaultGraphParser;
    let graph = parser
        .parse_project(&project)
        .map_err(|e| fail(&app, format!("Failed to parse graph: {}", e)))?;

    emit_log(&app, "stage", "Building IR…");
    let ir = build_ir(&project, &graph)
        .map_err(|e| fail(&app, format!("Failed to build IR: {}", e)))?;

    // 2. Generate source to temp directory
    let temp_dir = std::env::temp_dir().join("warpforge-run").join(slugify(&ir.meta.app_name));
    emit_log(&app, "stage", format!("Generating Slint source → {}", temp_dir.display()));
    std::fs::create_dir_all(&temp_dir)
        .map_err(|e| fail(&app, format!("Failed to create temp directory: {}", e)))?;

    let generator = SlintCodeGenerator::default();
    let generated = generator
        .generate(&ir)
        .map_err(|e| fail(&app, format!("Code generation failed: {}", e)))?;

    let tree = from_generated(&generated);
    write_tree(&temp_dir, &tree)
        .map_err(|e| fail(&app, format!("Failed to write source tree: {}", e)))?;

    // 3. Build the app — stream cargo output line-by-line so the user
    //    can watch progress instead of staring at an empty panel for
    //    the 30-60 s a release build takes.
    emit_log(&app, "stage", "Running cargo build --release…");
    let mut child = Command::new("cargo")
        .arg("build")
        .arg("--release")
        .current_dir(&temp_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| fail(&app, format!("Failed to spawn cargo build: {}", e)))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let app_for_stdout = app.clone();
    let app_for_stderr = app.clone();
    let stdout_handle = stdout.map(|s| {
        thread::spawn(move || {
            for line in BufReader::new(s).lines().flatten() {
                emit_log(&app_for_stdout, "stdout", line);
            }
        })
    });
    let stderr_handle = stderr.map(|s| {
        thread::spawn(move || {
            // cargo prints almost everything to stderr (it's "progress",
            // not errors) — surface it the same way as stdout so the
            // user sees the build steps. Truly-fatal lines still come
            // through; the JS side just doesn't colour them differently.
            for line in BufReader::new(s).lines().flatten() {
                emit_log(&app_for_stderr, "stderr", line);
            }
        })
    });
    let build_status = child
        .wait()
        .map_err(|e| fail(&app, format!("Cargo build failed: {}", e)))?;
    if let Some(h) = stdout_handle { let _ = h.join(); }
    if let Some(h) = stderr_handle { let _ = h.join(); }

    if !build_status.success() {
        return Err(fail(
            &app,
            "Cargo build failed. Check the log for compiler errors.".into(),
        ));
    }

    // 4. Find and run the binary
    let binary_name = crate_name(&ir.meta.app_name);
    
    // Try different possible binary locations
    let mut binary_path = temp_dir.join("target/release").join(&binary_name);
    
    // On Windows, add .exe extension
    #[cfg(target_os = "windows")]
    {
        if !binary_path.exists() {
            binary_path = temp_dir.join("target/release").join(format!("{}.exe", binary_name));
        }
    }
    
    // Fallback to debug build if release doesn't exist
    if !binary_path.exists() {
        binary_path = temp_dir.join("target/debug").join(&binary_name);
        #[cfg(target_os = "windows")]
        {
            if !binary_path.exists() {
                binary_path = temp_dir.join("target/debug").join(format!("{}.exe", binary_name));
            }
        }
    }

    if !binary_path.exists() {
        return Err(fail(
            &app,
            format!(
                "Binary not found. Expected at {:?}. Check build output for errors.",
                binary_path
            ),
        ));
    }

    // Spawn the process detached so it continues running after this function returns
    emit_log(&app, "stage", format!("Launching {}…", binary_path.display()));
    let child = Command::new(&binary_path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| fail(&app, format!("Failed to run app: {}", e)))?;

    let pid = child.id();
    state.running_app.lock().replace(child);

    emit_log(&app, "done", format!("Running (pid {}).", pid));

    Ok(RunAppOutput {
        pid,
        binary_path: binary_path.display().to_string(),
        source_dir: temp_dir.display().to_string(),
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KillAppOutput {
    pub killed_pid: Option<u32>,
}

#[tauri::command]
pub async fn kill_running_app(state: State<'_, AppState>) -> Result<KillAppOutput, String> {
    let mut child = match state.running_app.lock().take() {
        Some(child) => child,
        None => return Ok(KillAppOutput { killed_pid: None }),
    };

    let pid = child.id();
    child
        .kill()
        .map_err(|e| format!("Failed to kill running app (pid {pid}): {e}"))?;
    let _ = child.wait();

    Ok(KillAppOutput {
        killed_pid: Some(pid),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_slugify() {
        assert_eq!(slugify("My App"), "my-app");
        assert_eq!(slugify("Test@App#123"), "test-app-123");
    }

    #[test]
    fn test_crate_name() {
        assert_eq!(crate_name("My App"), "my_app");
        assert_eq!(crate_name("Test-App"), "test_app");
    }
}
