use std::fs;
use std::path::PathBuf;

use tauri::State;
use wf_schema::{migrate_to_latest, ProjectFile};
use wf_template::instantiate_template;

use crate::state::AppState;

#[tauri::command]
pub fn project_new(
    template_id: String,
    app_name: String,
    state: State<AppState>,
) -> Result<ProjectFile, String> {
    let project = new_project(&template_id, &app_name);
    *state.current_project.lock() = Some(project.clone());
    Ok(project)
}

#[tauri::command]
pub fn project_open(path: String, state: State<AppState>) -> Result<ProjectFile, String> {
    let migrated = open_project_from_path(PathBuf::from(path))?;
    *state.current_project.lock() = Some(migrated.clone());
    Ok(migrated)
}

#[tauri::command]
pub fn project_save(
    path: String,
    project: ProjectFile,
    state: State<AppState>,
) -> Result<String, String> {
    let path = PathBuf::from(path);
    save_project_to_path(path.clone(), &project)?;
    *state.current_project.lock() = Some(project);

    Ok(path.display().to_string())
}

fn new_project(template_id: &str, app_name: &str) -> ProjectFile {
    instantiate_template(template_id, app_name)
}

fn open_project_from_path(path: PathBuf) -> Result<ProjectFile, String> {
    let payload = fs::read_to_string(&path)
        .map_err(|err| format!("failed to read project file {path:?}: {err}"))?;
    let project: ProjectFile = serde_json::from_str(&payload)
        .map_err(|err| format!("failed to parse project file {path:?}: {err}"))?;
    migrate_to_latest(project).map_err(|err| format!("failed to migrate project file {path:?}: {err}"))
}

fn save_project_to_path(path: PathBuf, project: &ProjectFile) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("failed to create project directory {parent:?}: {err}"))?;
    }

    let json =
        serde_json::to_string_pretty(project).map_err(|err| format!("failed serializing project: {err}"))?;
    fs::write(&path, json).map_err(|err| format!("failed writing project file {path:?}: {err}"))
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::{new_project, open_project_from_path, save_project_to_path};

    #[test]
    fn project_save_and_open_round_trip() {
        let project = new_project("notes", "RoundTrip");
        let path = PathBuf::from("target/test-projects/round-trip/project.warpforge.json");
        save_project_to_path(path.clone(), &project).expect("save should succeed");

        let loaded = open_project_from_path(path).expect("open should succeed");
        assert_eq!(loaded.project.app_name, "RoundTrip");
        assert_eq!(loaded.schema_version, 1);
    }
}
