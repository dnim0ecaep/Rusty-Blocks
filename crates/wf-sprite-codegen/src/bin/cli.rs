//! `wf-sprite-codegen` CLI.
//!
//! Usage:
//!   wf-sprite-codegen <project.warpforge.json> <out_dir>
//!
//! Emits a buildable Cargo project at <out_dir>. Inside, run
//! `cargo build --release` to produce the native sprite-app binary.
//!
//! The runtime dependency uses a `path =` reference to the in-tree
//! `wf-sprite-runtime` crate so changes to the engine are picked up
//! without re-publishing.

use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::ExitCode;

use anyhow::Context;

fn main() -> ExitCode {
    let args: Vec<String> = env::args().collect();
    if args.len() != 3 {
        eprintln!("usage: wf-sprite-codegen <project.warpforge.json> <out_dir>");
        return ExitCode::from(2);
    }
    if let Err(e) = run(&args[1], &args[2]) {
        eprintln!("error: {e:?}");
        return ExitCode::FAILURE;
    }
    ExitCode::SUCCESS
}

fn run(project_path: &str, out_dir: &str) -> anyhow::Result<()> {
    let json = fs::read_to_string(project_path)
        .with_context(|| format!("read {project_path}"))?;
    let out = PathBuf::from(out_dir);

    // Resolve absolute path to the in-tree runtime — relative to this
    // binary's CARGO_MANIFEST_DIR. The CLI binary lives at
    // crates/wf-sprite-codegen/src/bin/cli.rs, so two levels up gives us
    // the workspace root.
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let runtime_path = manifest.parent().unwrap().join("wf-sprite-runtime");
    let runtime_path = fs::canonicalize(&runtime_path).unwrap_or(runtime_path);

    let dir = wf_sprite_codegen::compile_to_dir(
        &json,
        &out,
        wf_sprite_codegen::RuntimeDep::Path(runtime_path),
    )?;
    println!("Generated Cargo project at: {}", dir.display());
    println!("Build with: cargo build --release --manifest-path {}/Cargo.toml", dir.display());
    Ok(())
}
