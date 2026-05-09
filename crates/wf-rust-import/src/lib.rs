pub mod parser;

use std::fs;
use std::path::Path;

use anyhow::{Context, Result};
use chrono::Utc;
use uuid::Uuid;
use wf_schema::{
    AssetRecord, ProjectFile, ProjectMetadata, ProjectSettings, TargetType, ThemeMode,
    WorkspaceState, PROJECT_SCHEMA_VERSION,
};

pub use parser::parse_rust_source;

pub fn import_rust_file(path: &Path) -> Result<ProjectFile> {
    let source = fs::read_to_string(path)
        .with_context(|| format!("failed to read Rust source from {path:?}"))?;
    let label = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("imported.rs")
        .to_owned();
    let normalized_graph = parse_rust_source(&source, &label)?;

    let now = Utc::now();
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("imported")
        .to_owned();
    let app_name = stem.clone();
    let package_id = format!("com.warpforge.imported.{}", slugify(&stem));

    Ok(ProjectFile {
        schema_version: PROJECT_SCHEMA_VERSION,
        project: ProjectMetadata {
            id: Uuid::new_v4().to_string(),
            app_name,
            package_id,
            version: "0.1.0".into(),
            author: "WarpForge User".into(),
            description: format!("Imported from Rust source ({label})"),
            target_type: TargetType::DesktopSlint,
            theme: ThemeMode::Auto,
            created_at: now,
            updated_at: now,
            stage_width: None,
            stage_height: None,
        },
        workspace_state: WorkspaceState {
            zoom: 1.0,
            pan_x: 0.0,
            pan_y: 0.0,
            selected_block_ids: vec![],
            blockly_xml: None,
            comments: vec![],
            groups: vec![],
        },
        normalized_graph,
        ir_snapshot: None,
        assets: Vec::<AssetRecord>::new(),
        ai_history: vec![],
        stage_state: None,
        settings: ProjectSettings {
            autosave_interval_secs: 20,
            validate_on_change: false,
            codegen_deterministic: true,
            ai_default_text_provider: "ollama".into(),
            ai_default_image_provider: "comfyui".into(),
        },
    })
}

fn slugify(input: &str) -> String {
    input
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .to_lowercase()
        .trim_matches('-')
        .to_owned()
}
