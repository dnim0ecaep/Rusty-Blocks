//! Persistence helpers — auto-generated when the project wires
//! `io.save_local_data` or `io.load_local_data`. Stores the items list
//! as a JSON array under the user's per-app data dir.

use std::fs;
use std::path::PathBuf;

const APP_SLUG: &str = "exportcommand";
const STORAGE_KEY: &str = "notes";

/// Resolve `<user-data-dir>/<app_slug>/<key>.json`. Falls back to the
/// current directory if the platform doesn't expose a data dir.
pub fn data_path() -> PathBuf {
    let dir = directories::ProjectDirs::from("com", "warpforge", APP_SLUG)
        .map(|d| d.data_local_dir().to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."));
    let _ = fs::create_dir_all(&dir);
    dir.join(format!("{}.json", STORAGE_KEY))
}

/// Load saved items, or return empty when the file is missing/corrupt.
pub fn load_items() -> Vec<String> {
    let path = data_path();
    let raw = match fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

/// Best-effort save. Failures are logged but never panic — losing one
/// save is preferable to crashing the app on a write error.
pub fn save_items(items: &[String]) {
    let path = data_path();
    match serde_json::to_string_pretty(items) {
        Ok(json) => {
            if let Err(e) = fs::write(&path, json) {
                eprintln!("[wf-storage] save failed at {}: {e}", path.display());
            }
        }
        Err(e) => eprintln!("[wf-storage] serialize failed: {e}"),
    }
}
