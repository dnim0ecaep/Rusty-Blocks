//! Tauri commands for the sprite-runtime compile path.
//!
//! `compile_sprite_app` runs `wf-sprite-codegen` to emit a Cargo project
//! into `<exports_root>/<timestamp>/<crate>/`, then shells out to
//! `cargo build --release`. Returns the produced binary path so the
//! frontend can show it / open it.

use std::path::{Path, PathBuf};
use std::process::Command;

use chrono::Utc;
use serde::{Deserialize, Serialize};
use wf_schema::ProjectFile;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompileSpriteAppOutput {
    /// Absolute path to the emitted Cargo project root.
    pub source_dir: String,
    /// Absolute path to the produced binary (target/release/<crate>).
    pub binary_path: String,
    /// Stdout + stderr of the cargo build, truncated.
    pub log: String,
}

#[tauri::command]
pub async fn compile_sprite_app(
    project: ProjectFile,
    exports_root: String,
) -> Result<CompileSpriteAppOutput, String> {
    // Run codegen + build off the Tauri main thread so the UI stays
    // responsive. The cargo invocation is the slow part (minutes on a
    // first build).
    tokio::task::spawn_blocking(move || compile_sprite_app_blocking(project, exports_root))
        .await
        .map_err(|e| format!("join error: {e}"))?
}

fn compile_sprite_app_blocking(
    project: ProjectFile,
    exports_root: String,
) -> Result<CompileSpriteAppOutput, String> {
    let timestamp = Utc::now().format("%Y%m%d-%H%M%S").to_string();
    let project_slug = sanitize(&project.project.app_name);
    let out_dir = PathBuf::from(&exports_root)
        .join(&timestamp)
        .join(&project_slug);

    // Re-serialize the ProjectFile so codegen sees exactly what was
    // passed in. The codegen crate handles the XML→JSON transcompile.
    let raw = serde_json::to_string(&project)
        .map_err(|e| format!("serialize project: {e}"))?;

    // Resolve the runtime path relative to this binary's manifest dir.
    // CARGO_MANIFEST_DIR points at apps/studio/src-tauri at build time,
    // so two `..`s gets us to the workspace root, then into crates/.
    let runtime_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../crates/wf-sprite-runtime");
    let runtime_path = std::fs::canonicalize(&runtime_path)
        .unwrap_or(runtime_path);

    wf_sprite_codegen::compile_to_dir(
        &raw,
        &out_dir,
        wf_sprite_codegen::RuntimeDep::Path(runtime_path),
    )
    .map_err(|e| format!("codegen failed: {e}"))?;

    let manifest = out_dir.join("Cargo.toml");
    let output = Command::new("cargo")
        .args(["build", "--release", "--manifest-path"])
        .arg(&manifest)
        .output()
        .map_err(|e| format!("spawn cargo: {e}"))?;

    let mut log = String::from_utf8_lossy(&output.stdout).to_string();
    log.push_str(&String::from_utf8_lossy(&output.stderr));
    if !output.status.success() {
        // Truncate noisy logs.
        let trimmed: String = log.lines().rev().take(80).collect::<Vec<_>>().into_iter().rev().collect::<Vec<_>>().join("\n");
        return Err(format!("cargo build failed:\n{trimmed}"));
    }

    let binary = locate_binary(&out_dir, &project_slug)
        .ok_or_else(|| "binary not found after build".to_string())?;

    Ok(CompileSpriteAppOutput {
        source_dir: out_dir.to_string_lossy().into_owned(),
        binary_path: binary.to_string_lossy().into_owned(),
        log,
    })
}

/// Sanitize a project name to a Rust-friendly + filesystem-friendly slug.
/// Mirrors the codegen crate's `sanitize_crate_name` so the output binary
/// path is predictable from the frontend.
fn sanitize(name: &str) -> String {
    let mut out = String::new();
    for c in name.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if c == ' ' || c == '-' || c == '_' {
            if !out.ends_with('_') && !out.is_empty() {
                out.push('_');
            }
        }
    }
    while out.ends_with('_') { out.pop(); }
    if out.is_empty() { return "sprite_app".into(); }
    if out.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) {
        out.insert(0, '_');
    }
    out
}

fn locate_binary(out_dir: &Path, crate_name: &str) -> Option<PathBuf> {
    let primary = out_dir.join("target/release").join(crate_name);
    if primary.exists() { return Some(primary); }
    // Windows binaries get .exe appended.
    let win = out_dir.join("target/release").join(format!("{crate_name}.exe"));
    if win.exists() { return Some(win); }
    None
}
