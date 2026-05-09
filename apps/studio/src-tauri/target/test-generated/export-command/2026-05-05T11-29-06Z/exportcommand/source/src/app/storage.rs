use std::fs;
use std::path::Path;

#[allow(dead_code)]
pub fn save_json(path: &Path, payload: &str) -> std::io::Result<()> {
    fs::write(path, payload)
}
