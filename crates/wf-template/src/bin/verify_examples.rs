//! Run the full pipeline (parse → IR → validate → codegen → assemble → cargo build → launch)
//! against every `*.warpforge.json` in a target directory and report per-example
//! pass/fail by stage.
//!
//! Usage:
//!   cargo run -p wf-template --bin verify_examples -- <examples_dir> [--build] [--launch]
//!
//! Default mode runs through codegen + assemble (fast). `--build` adds
//! `cargo build --release` of the generated source. `--launch` additionally
//! spawns the built binary with a short timeout to confirm it starts.

use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode, Stdio};
use std::time::{Duration, Instant};

use wf_assemble::{from_generated, write_tree};
use wf_codegen_slint::{CodeGenerator, SlintCodeGenerator};
use wf_graph::{DefaultGraphParser, GraphParser};
use wf_ir::build_ir;
use wf_schema::ProjectFile;
use wf_validate::{has_errors, DefaultIrValidator, IrValidator};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Stage {
    Read,
    Parse,
    Ir,
    Validate,
    Codegen,
    Assemble,
    Build,
    Launch,
}

impl Stage {
    fn label(self) -> &'static str {
        match self {
            Stage::Read => "read",
            Stage::Parse => "parse",
            Stage::Ir => "ir",
            Stage::Validate => "validate",
            Stage::Codegen => "codegen",
            Stage::Assemble => "assemble",
            Stage::Build => "build",
            Stage::Launch => "launch",
        }
    }
}

#[derive(Debug)]
struct ExampleResult {
    name: String,
    farthest_stage: Stage,
    failed_stage: Option<Stage>,
    error: Option<String>,
    warnings: Vec<String>,
}

fn main() -> ExitCode {
    let mut args = env::args().skip(1);
    let examples_dir = match args.next() {
        Some(p) => PathBuf::from(p),
        None => {
            eprintln!("usage: verify_examples <examples_dir> [--build] [--launch]");
            return ExitCode::from(2);
        }
    };

    let mut do_build = false;
    let mut do_launch = false;
    for flag in args {
        match flag.as_str() {
            "--build" => do_build = true,
            "--launch" => {
                do_build = true;
                do_launch = true;
            }
            other => {
                eprintln!("unknown flag: {other}");
                return ExitCode::from(2);
            }
        }
    }

    let mut entries: Vec<(String, PathBuf)> = match fs::read_dir(&examples_dir) {
        Ok(rd) => rd
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter_map(|p| {
                if !p.is_file() {
                    return None;
                }
                let name = p.file_name().and_then(|n| n.to_str())?;
                let stem = name.strip_suffix(".warpforge.json")?;
                Some((stem.to_string(), p))
            })
            .collect(),
        Err(err) => {
            eprintln!("failed to list {examples_dir:?}: {err}");
            return ExitCode::FAILURE;
        }
    };
    entries.sort();

    if entries.is_empty() {
        eprintln!("no *.warpforge.json files found in {examples_dir:?}");
        return ExitCode::FAILURE;
    }

    let work_root = env::temp_dir().join("wf_verify_examples");
    let _ = fs::remove_dir_all(&work_root);
    fs::create_dir_all(&work_root).expect("create work_root");

    let mut results: Vec<ExampleResult> = Vec::new();
    for (name, path) in &entries {
        println!("\n=== {name} ===");
        let result = run_one(name, path, &work_root, do_build, do_launch);
        match (&result.failed_stage, &result.error) {
            (Some(stage), Some(err)) => {
                println!("  ✗ FAIL at {} — {}", stage.label(), err.lines().next().unwrap_or(err));
            }
            _ => {
                println!("  ✓ ok through {}", result.farthest_stage.label());
            }
        }
        for w in &result.warnings {
            println!("    ! {w}");
        }
        results.push(result);
    }

    println!("\n=== summary ===");
    let mut by_stage: BTreeMap<&str, Vec<String>> = BTreeMap::new();
    let mut passed = 0usize;
    for r in &results {
        if let Some(stage) = r.failed_stage {
            by_stage.entry(stage.label()).or_default().push(r.name.clone());
        } else {
            passed += 1;
        }
    }
    println!("{}/{} examples reached final stage", passed, results.len());
    for (stage, names) in &by_stage {
        println!("  {} failures: {}", stage, names.join(", "));
    }

    if passed == results.len() {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}

fn run_one(
    name: &str,
    path: &Path,
    work_root: &Path,
    do_build: bool,
    do_launch: bool,
) -> ExampleResult {
    let mut warnings: Vec<String> = Vec::new();

    macro_rules! fail {
        ($stage:expr, $msg:expr) => {{
            return ExampleResult {
                name: name.to_string(),
                farthest_stage: $stage,
                failed_stage: Some($stage),
                error: Some($msg),
                warnings,
            }
        }};
    }

    // 1. Read
    let raw = match fs::read_to_string(path) {
        Ok(s) => s,
        Err(e) => fail!(Stage::Read, format!("read failed: {e}")),
    };

    let project: ProjectFile = match serde_json::from_str(&raw) {
        Ok(p) => p,
        Err(e) => fail!(Stage::Read, format!("schema parse failed: {e}")),
    };

    // 2. Graph parse
    let graph = match DefaultGraphParser.parse_project(&project) {
        Ok(g) => g,
        Err(e) => fail!(Stage::Parse, format!("graph parse failed: {e}")),
    };

    // 3. IR build
    let ir = match build_ir(&project, &graph) {
        Ok(ir) => ir,
        Err(e) => fail!(Stage::Ir, format!("ir build failed: {e}")),
    };

    // 4. Validate
    let diags = DefaultIrValidator.validate(&ir);
    for d in &diags {
        if !matches!(d.severity, wf_validate::diagnostics::Severity::Error) {
            warnings.push(format!("[{}] {}: {}", severity_label(&d.severity), d.code, d.message));
        }
    }
    if has_errors(&diags) {
        let errs: Vec<String> = diags
            .iter()
            .filter(|d| matches!(d.severity, wf_validate::diagnostics::Severity::Error))
            .map(|d| format!("[{}] {}", d.code, d.message))
            .collect();
        fail!(Stage::Validate, format!("validation errors: {}", errs.join("; ")));
    }

    // 5. Codegen
    let generated = match SlintCodeGenerator::default().generate(&ir) {
        Ok(g) => g,
        Err(e) => fail!(Stage::Codegen, format!("codegen failed: {e}")),
    };

    // 6. Assemble
    let project_dir = work_root.join(name);
    let _ = fs::remove_dir_all(&project_dir);
    if let Err(e) = fs::create_dir_all(&project_dir) {
        fail!(Stage::Assemble, format!("create project dir failed: {e}"));
    }
    let tree = from_generated(&generated);
    if let Err(e) = write_tree(&project_dir, &tree) {
        fail!(Stage::Assemble, format!("write tree failed: {e}"));
    }

    if !do_build {
        return ExampleResult {
            name: name.to_string(),
            farthest_stage: Stage::Assemble,
            failed_stage: None,
            error: None,
            warnings,
        };
    }

    // 7. cargo build
    println!("  · cargo build --release …");
    let build_started = Instant::now();
    let build_out = match Command::new("cargo")
        .args(["build", "--release"])
        .current_dir(&project_dir)
        .stderr(Stdio::piped())
        .stdout(Stdio::piped())
        .output()
    {
        Ok(o) => o,
        Err(e) => fail!(Stage::Build, format!("spawn cargo failed: {e}")),
    };
    println!("    build took {:?}", build_started.elapsed());
    if !build_out.status.success() {
        let stderr = String::from_utf8_lossy(&build_out.stderr);
        let summary = build_summary(&stderr);
        fail!(Stage::Build, format!("cargo build failed: {summary}"));
    }

    if !do_launch {
        return ExampleResult {
            name: name.to_string(),
            farthest_stage: Stage::Build,
            failed_stage: None,
            error: None,
            warnings,
        };
    }

    // 8. Launch with timeout
    let bin_dir = project_dir.join("target/release");
    let bin = match find_executable(&bin_dir) {
        Some(p) => p,
        None => fail!(Stage::Launch, "could not locate built binary".into()),
    };
    println!("  · launching {bin:?} (3s timeout)");
    let mut child = match Command::new(&bin)
        .stderr(Stdio::piped())
        .stdout(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => fail!(Stage::Launch, format!("spawn binary failed: {e}")),
    };
    let timeout = Duration::from_secs(3);
    let start = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                if status.success() {
                    break;
                } else {
                    let _ = child.wait();
                    fail!(Stage::Launch, format!("binary exited non-zero: {status}"));
                }
            }
            Ok(None) => {
                if start.elapsed() >= timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    // Stayed alive for the full timeout — that's a pass.
                    break;
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(e) => fail!(Stage::Launch, format!("try_wait failed: {e}")),
        }
    }

    ExampleResult {
        name: name.to_string(),
        farthest_stage: Stage::Launch,
        failed_stage: None,
        error: None,
        warnings,
    }
}

fn severity_label(sev: &wf_validate::diagnostics::Severity) -> &'static str {
    use wf_validate::diagnostics::Severity::*;
    match sev {
        Info => "info",
        Warning => "warn",
        Error => "error",
    }
}

fn build_summary(stderr: &str) -> String {
    let lines: Vec<&str> = stderr
        .lines()
        .filter(|l| {
            let lt = l.trim_start();
            lt.starts_with("error") || lt.starts_with("error[")
        })
        .take(5)
        .collect();
    if lines.is_empty() {
        let last: Vec<&str> = stderr.lines().rev().take(5).collect();
        last.into_iter().rev().collect::<Vec<_>>().join(" | ")
    } else {
        lines.join(" | ")
    }
}

fn find_executable(dir: &Path) -> Option<PathBuf> {
    let rd = fs::read_dir(dir).ok()?;
    for entry in rd.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let meta = match fs::metadata(&path) {
            Ok(m) => m,
            Err(_) => continue,
        };
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if meta.permissions().mode() & 0o111 == 0 {
                continue;
            }
        }
        let _ = meta;
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if name.is_empty() || name.starts_with('.') || name.contains('-') && name.ends_with(".d") {
            continue;
        }
        if name.ends_with(".d") || name.ends_with(".rlib") {
            continue;
        }
        return Some(path);
    }
    None
}
