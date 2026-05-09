use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{bail, Context, Result};

pub fn run_cargo_bundle(project_dir: &Path) -> Result<()> {
    let status = Command::new("cargo")
        .arg("bundle")
        .arg("--release")
        .current_dir(project_dir)
        .status()
        .with_context(|| format!("failed to run cargo bundle in {project_dir:?}"))?;

    if !status.success() {
        bail!("cargo bundle failed with status {status}");
    }

    Ok(())
}

/// Returns the output directory produced by `cargo bundle --release` for the
/// current platform, or `None` if it does not exist or the platform is unknown.
pub fn bundle_output_path(source_dir: &Path) -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    let candidate = source_dir.join("target/release/bundle/osx");
    #[cfg(target_os = "linux")]
    let candidate = source_dir.join("target/release/bundle/deb");
    #[cfg(not(any(target_os = "macos", target_os = "linux")))]
    return None;

    if candidate.exists() { Some(candidate) } else { None }
}
