use std::path::PathBuf;

use serde::Serialize;
use wf_export::ExportManager;
use wf_graph::{DefaultGraphParser, GraphParser};
use wf_ir::build_ir;
use wf_schema::ProjectFile;
use wf_validate::{has_errors, DefaultIrValidator, IrValidator};

#[derive(Debug, Clone, Serialize)]
pub struct ExportOutput {
    pub source_dir: String,
    pub bundle_path: Option<String>,
    pub manifest_path: String,
}

#[tauri::command]
pub fn export_source(project: ProjectFile, exports_root: String) -> Result<ExportOutput, String> {
    do_export(project, exports_root, false)
}

#[tauri::command]
pub fn export_bundle(project: ProjectFile, exports_root: String) -> Result<ExportOutput, String> {
    do_export(project, exports_root, true)
}

fn do_export(project: ProjectFile, exports_root: String, bundle: bool) -> Result<ExportOutput, String> {
    let parser = DefaultGraphParser;
    let graph = parser
        .parse_project(&project)
        .map_err(|err| format!("failed to parse project graph: {err}"))?;
    let ir = build_ir(&project, &graph).map_err(|err| format!("failed to build IR: {err}"))?;

    let validator = DefaultIrValidator;
    let diagnostics = validator.validate(&ir);
    if has_errors(&diagnostics) {
        return Err(format!(
            "export blocked by validation errors: {}",
            serde_json::to_string(&diagnostics).unwrap_or_else(|_| "[]".into())
        ));
    }

    let manager = ExportManager::new();
    let root = PathBuf::from(exports_root);
    let result = if bundle {
        manager
            .export_with_bundle(&ir, &root, &project.project.id)
            .map_err(|err| format!("bundle export failed: {err}"))?
    } else {
        manager
            .export_source_only(&ir, &root, &project.project.id)
            .map_err(|err| format!("source export failed: {err}"))?
    };

    Ok(ExportOutput {
        source_dir: result.source_dir.display().to_string(),
        bundle_path: result.bundle_path.map(|p| p.display().to_string()),
        manifest_path: result.manifest_path.display().to_string(),
    })
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use wf_template::instantiate_template;

    use super::export_source;

    #[test]
    fn export_source_command_writes_files() {
        let project = instantiate_template("notes", "ExportCommand");
        let root = PathBuf::from("target/test-generated/export-command");
        let result = export_source(project, root.display().to_string()).expect("export source works");

        assert!(PathBuf::from(result.source_dir).exists());
        assert!(PathBuf::from(result.manifest_path).exists());
    }
}
