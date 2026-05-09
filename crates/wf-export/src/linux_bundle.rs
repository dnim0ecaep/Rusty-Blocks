use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};

pub fn create_linux_bundle(source_dir: &Path, binary_name: &str) -> Result<PathBuf> {
    let binary_src = source_dir.join("target/release").join(binary_name);
    let bundle_dir = source_dir.join("target/release/bundle/linux");

    fs::create_dir_all(&bundle_dir)
        .with_context(|| format!("failed to create Linux bundle dir {bundle_dir:?}"))?;

    let binary_dst = bundle_dir.join(binary_name);
    fs::copy(&binary_src, &binary_dst).with_context(|| {
        format!("failed to copy release binary from {binary_src:?} to {binary_dst:?}")
    })?;

    set_executable(&binary_dst)?;

    let launcher_name = format!("launch-{binary_name}.sh");
    let launcher = bundle_dir.join(&launcher_name);
    let launcher_content = format!(
        "#!/bin/sh\nDIR=$(dirname \"$(readlink -f \"$0\")\")\nexec \"$DIR/{binary_name}\" \"$@\"\n"
    );
    fs::write(&launcher, &launcher_content)
        .with_context(|| format!("failed to write launcher script at {launcher:?}"))?;
    set_executable(&launcher)?;

    Ok(bundle_dir)
}

#[cfg(unix)]
fn set_executable(path: &Path) -> Result<()> {
    use std::os::unix::fs::PermissionsExt;
    let mut perms = fs::metadata(path)?.permissions();
    perms.set_mode(0o755);
    fs::set_permissions(path, perms)
        .with_context(|| format!("failed to set executable permission on {path:?}"))
}

#[cfg(not(unix))]
fn set_executable(_path: &Path) -> Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmpdir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("wf_export_linux_{tag}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn fake_source_with_binary(root: &Path, binary_name: &str) {
        let release_dir = root.join("target/release");
        fs::create_dir_all(&release_dir).unwrap();
        fs::write(release_dir.join(binary_name), b"ELF fake binary").unwrap();
    }

    #[test]
    fn creates_bundle_dir_with_binary() {
        let source = tmpdir("creates_bundle");
        fake_source_with_binary(&source, "myapp");
        let bundle = create_linux_bundle(&source, "myapp").unwrap();
        assert!(bundle.exists());
        assert!(bundle.join("myapp").exists());
    }

    #[test]
    fn creates_executable_launcher_script() {
        let source = tmpdir("launcher_script");
        fake_source_with_binary(&source, "myapp");
        let bundle = create_linux_bundle(&source, "myapp").unwrap();
        let launcher = bundle.join("launch-myapp.sh");
        assert!(launcher.exists());
        let content = fs::read_to_string(&launcher).unwrap();
        assert!(content.contains("myapp"));
        assert!(content.starts_with("#!/bin/sh"));
    }

    #[cfg(unix)]
    #[test]
    fn binary_and_launcher_are_executable() {
        use std::os::unix::fs::PermissionsExt;
        let source = tmpdir("executable_bits");
        fake_source_with_binary(&source, "myapp");
        let bundle = create_linux_bundle(&source, "myapp").unwrap();
        let binary_mode = fs::metadata(bundle.join("myapp")).unwrap().permissions().mode();
        let launcher_mode = fs::metadata(bundle.join("launch-myapp.sh"))
            .unwrap()
            .permissions()
            .mode();
        assert!(binary_mode & 0o111 != 0, "binary should be executable");
        assert!(launcher_mode & 0o111 != 0, "launcher should be executable");
    }
}
