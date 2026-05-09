use std::path::Path;
use std::process::Command;

use anyhow::{bail, Context, Result};

pub fn run_cargo_build(project_dir: &Path) -> Result<()> {
    let status = Command::new("cargo")
        .arg("build")
        .arg("--release")
        .current_dir(project_dir)
        .status()
        .with_context(|| format!("failed to run cargo build in {project_dir:?}"))?;

    if !status.success() {
        bail!("cargo build failed with status {status}");
    }

    Ok(())
}
