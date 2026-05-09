use std::path::Path;

use tauri::State;
use wf_schema::ProjectFile;

use crate::state::AppState;

#[tauri::command]
pub fn rust_import_file(
    path: String,
    state: State<'_, AppState>,
) -> Result<ProjectFile, String> {
    let project = wf_rust_import::import_rust_file(Path::new(&path))
        .map_err(|err| format!("Rust import failed: {err}"))?;

    *state.current_project.lock() = Some(project.clone());

    Ok(project)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    fn tmpdir(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("wf_rust_import_cmd_{tag}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn import_returns_project_with_populated_graph() {
        let dir = tmpdir("populated_graph");
        let path = dir.join("hello.rs");
        fs::write(&path, "fn main() { println!(\"hi\"); }").unwrap();

        // Direct call to wf-rust-import to keep this test free of Tauri's State.
        let project = wf_rust_import::import_rust_file(&path).expect("import");
        assert_eq!(project.project.app_name, "hello");
        assert!(!project.normalized_graph.nodes.is_empty());
        assert!(project.workspace_state.blockly_xml.is_none()); // frontend fills this
    }
}
