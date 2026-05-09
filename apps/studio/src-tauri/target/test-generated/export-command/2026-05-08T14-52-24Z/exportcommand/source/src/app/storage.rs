//! Persistence helpers — auto-generated when the project wires
//! `io.save_local_data` / `io.load_local_data` / `io.write_file`.
//!
//! Storage layout: `<user-data-dir>/exportcommand/<key>.json` for structured
//! state, `<user-data-dir>/exportcommand/<name>.txt` for free-form text.

#![allow(dead_code)]

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

const APP_SLUG: &str = "exportcommand";
const STORAGE_KEY: &str = "notes";

fn data_dir() -> PathBuf {
    let dir = directories::ProjectDirs::from("com", "warpforge", APP_SLUG)
        .map(|d| d.data_local_dir().to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."));
    let _ = fs::create_dir_all(&dir);
    dir
}

pub fn data_path() -> PathBuf {
    data_dir().join(format!("{}.json", STORAGE_KEY))
}

pub fn load_items() -> Vec<String> {
    let path = data_path();
    let raw = match fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

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
