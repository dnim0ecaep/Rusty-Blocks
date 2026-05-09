use std::fs;
use std::path::Path;

pub fn save_json(path: &Path, payload: &str) -> std::io::Result<()> {
    fs::write(path, payload)
}
