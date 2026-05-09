//! End-to-end verifier for sprite-runtime examples.
//!
//! Walks `<examples_dir>/*.warpforge.json`, picks the ones that carry a
//! `stage_state` (sprite-runtime projects), runs codegen → cargo build,
//! and reports pass/fail. Mirrors `crates/wf-template/src/bin/verify_examples.rs`
//! but for the sprite pipeline.
//!
//! Usage:
//!     cargo run -p wf-sprite-codegen --bin verify_sprite_examples -- examples
//!
//! Pass `--launch` to additionally spawn each binary for ~1s and check it
//! doesn't immediately exit. Skipped by default — needs a graphical
//! environment, which CI may lack.

use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};
use std::time::{Duration, Instant};

fn main() -> ExitCode {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("usage: verify_sprite_examples <examples_dir> [--launch]");
        return ExitCode::from(2);
    }
    let examples_dir = PathBuf::from(&args[1]);
    let launch = args.iter().any(|a| a == "--launch");

    let work_root = env::temp_dir().join("wf_verify_sprite_examples");
    let _ = fs::remove_dir_all(&work_root);
    fs::create_dir_all(&work_root).expect("create work root");

    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let runtime_path = manifest
        .parent()
        .unwrap()
        .join("wf-sprite-runtime")
        .canonicalize()
        .expect("locate wf-sprite-runtime");

    let mut total = 0;
    let mut passed = 0;

    for entry in fs::read_dir(&examples_dir).expect("read examples dir") {
        let entry = entry.expect("dirent");
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        if !path.file_name().unwrap().to_string_lossy().ends_with(".warpforge.json") {
            continue;
        }
        let raw = fs::read_to_string(&path).expect("read example");
        // Pick only sprite-runtime examples — ones with a populated
        // stage_state.sprites array.
        if !looks_like_sprite_runtime_project(&raw) {
            continue;
        }
        total += 1;
        let name = path.file_stem().unwrap().to_string_lossy().to_string();
        println!("=== {name} ===");

        let out_dir = work_root.join(&name);
        let result = compile_and_build(&raw, &out_dir, &runtime_path, launch);
        match result {
            Ok(_) => {
                println!("  ✓ ok");
                passed += 1;
            }
            Err(e) => {
                println!("  ✗ {e}");
            }
        }
    }

    println!("\n=== summary ===");
    println!("{}/{} sprite-runtime examples built", passed, total);
    if total == 0 {
        println!("(no sprite-runtime examples found — looking for files with non-empty stage_state.sprites)");
    }
    if passed == total && total > 0 {
        ExitCode::SUCCESS
    } else if total == 0 {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}

fn looks_like_sprite_runtime_project(raw: &str) -> bool {
    // Cheap: just check if the file mentions stage_state with a
    // non-empty sprites array. Avoid full deserialization for speed.
    let v: serde_json::Value = match serde_json::from_str(raw) {
        Ok(v) => v, Err(_) => return false,
    };
    let sprites = v.get("stage_state").and_then(|s| s.get("sprites")).and_then(|s| s.as_array());
    matches!(sprites, Some(arr) if !arr.is_empty())
}

fn compile_and_build(
    raw: &str,
    out_dir: &Path,
    runtime_path: &Path,
    launch: bool,
) -> Result<(), String> {
    wf_sprite_codegen::compile_to_dir(
        raw,
        out_dir,
        wf_sprite_codegen::RuntimeDep::Path(runtime_path.to_path_buf()),
    )
    .map_err(|e| format!("codegen: {e}"))?;

    let manifest = out_dir.join("Cargo.toml");
    let status = Command::new("cargo")
        .args(["build", "--manifest-path"])
        .arg(&manifest)
        .status()
        .map_err(|e| format!("spawn cargo: {e}"))?;
    if !status.success() {
        return Err("cargo build failed".into());
    }

    if launch {
        // Find the binary path. Cargo emits target/<profile>/<name>.
        let bin = find_binary(out_dir).ok_or("binary not found after build")?;
        let mut child = Command::new(&bin)
            .spawn()
            .map_err(|e| format!("spawn binary: {e}"))?;
        let started = Instant::now();
        loop {
            if let Some(status) = child.try_wait().map_err(|e| format!("try_wait: {e}"))? {
                return Err(format!("binary exited early with {status:?}"));
            }
            if started.elapsed() > Duration::from_secs(2) {
                let _ = child.kill();
                return Ok(());
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    }
    Ok(())
}

fn find_binary(out_dir: &Path) -> Option<PathBuf> {
    let debug = out_dir.join("target/debug");
    for entry in fs::read_dir(&debug).ok()? {
        let p = entry.ok()?.path();
        if p.is_file() {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Ok(meta) = p.metadata() {
                    if meta.permissions().mode() & 0o111 != 0 {
                        return Some(p);
                    }
                }
            }
            #[cfg(not(unix))]
            { return Some(p); }
        }
    }
    None
}
