use std::fs;
use std::path::Path;

#[tauri::command]
pub fn module_export(path: String, content: String) -> Result<(), String> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|e| {
                format!("Failed to create parent directory {parent:?}: {e}")
            })?;
        }
    }
    fs::write(p, content).map_err(|e| format!("Failed to write module file {p:?}: {e}"))
}

#[tauri::command]
pub fn module_import(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    fs::read_to_string(p).map_err(|e| format!("Failed to read module file {p:?}: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmpdir(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("wf_modules_cmd_{tag}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn export_then_import_roundtrips_content() {
        let dir = tmpdir("roundtrip");
        let path = dir.join("module.warpforge-blocks.json");
        let content = r#"{"schemaVersion":1,"name":"Test","blocks":[],"snippets":[]}"#;

        module_export(path.display().to_string(), content.to_string()).unwrap();
        let read = module_import(path.display().to_string()).unwrap();
        assert_eq!(read, content);
    }

    #[test]
    fn export_creates_parent_dirs() {
        let dir = tmpdir("parents");
        let path = dir.join("nested").join("deep").join("module.json");
        module_export(path.display().to_string(), "{}".to_string()).unwrap();
        assert!(path.exists());
    }
}
