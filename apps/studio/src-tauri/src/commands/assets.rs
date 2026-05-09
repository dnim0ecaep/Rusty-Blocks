use std::fs;
use std::path::{Path, PathBuf};

use chrono::Utc;
use tauri::State;
use uuid::Uuid;
use wf_schema::{AssetKind, AssetRecord};

use crate::state::AppState;

#[tauri::command]
pub fn asset_import(
    project_root: String,
    source_path: String,
    kind: String,
    state: State<AppState>,
) -> Result<AssetRecord, String> {
    let source = PathBuf::from(&source_path);
    if !source.exists() {
        return Err(format!("source asset does not exist: {source:?}"));
    }

    let id = Uuid::new_v4().to_string();
    let ext = source
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("bin")
        .to_owned();
    let relative = format!("assets/imported/{}.{}", id, ext);
    let destination = Path::new(&project_root).join(&relative);

    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("failed creating asset directory {parent:?}: {err}"))?;
    }

    fs::copy(&source, &destination).map_err(|err| {
        format!(
            "failed copying asset from {source:?} to {destination:?}: {err}"
        )
    })?;

    let asset = AssetRecord {
        id: id.clone(),
        kind: parse_asset_kind(&kind),
        path: relative,
        prompt: None,
        metadata: serde_json::json!({"source": source_path}),
        created_at: Utc::now(),
        version: 1,
    };

    if let Some(project) = state.current_project.lock().as_mut() {
        project.assets.push(asset.clone());
    }

    Ok(asset)
}

#[tauri::command]
pub fn asset_list(state: State<AppState>) -> Result<Vec<AssetRecord>, String> {
    Ok(state
        .current_project
        .lock()
        .as_ref()
        .map(|project| project.assets.clone())
        .unwrap_or_default())
}

fn parse_asset_kind(input: &str) -> AssetKind {
    match input {
        "icon" => AssetKind::Icon,
        "image" => AssetKind::Image,
        "text_snippet" => AssetKind::TextSnippet,
        "prompt" => AssetKind::Prompt,
        "screenshot" => AssetKind::Screenshot,
        _ => AssetKind::Image,
    }
}

#[cfg(test)]
mod tests {
    use wf_schema::AssetKind;

    use super::parse_asset_kind;

    #[test]
    fn parses_known_and_unknown_asset_kinds() {
        assert!(matches!(parse_asset_kind("icon"), AssetKind::Icon));
        assert!(matches!(parse_asset_kind("image"), AssetKind::Image));
        assert!(matches!(parse_asset_kind("unknown"), AssetKind::Image));
    }
}
