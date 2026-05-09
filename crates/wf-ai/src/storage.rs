use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

use anyhow::{Context, Result};

use crate::contracts::AiResponse;

pub fn append_history(path: &Path, response: &AiResponse) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create AI history dir {parent:?}"))?;
    }

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .with_context(|| format!("failed to open AI history file {path:?}"))?;

    let line = serde_json::to_string(response)?;
    file.write_all(line.as_bytes())?;
    file.write_all(b"\n")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::contracts::{AiMode, AiResponse};
    use chrono::Utc;
    use serde_json::json;
    use std::fs;

    fn tmpdir(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("wf_ai_{tag}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn sample_response() -> AiResponse {
        AiResponse {
            mode: AiMode::Text,
            provider: "ollama".into(),
            output: json!({ "text": "test output" }),
            created_at: Utc::now(),
        }
    }

    #[test]
    fn append_history_creates_file_with_valid_jsonl() {
        let dir = tmpdir("create_file");
        let path = dir.join("history.jsonl");
        append_history(&path, &sample_response()).unwrap();
        let content = fs::read_to_string(&path).unwrap();
        assert!(!content.trim().is_empty());
        let parsed: AiResponse = serde_json::from_str(content.trim_end()).unwrap();
        assert_eq!(parsed.provider, "ollama");
    }

    #[test]
    fn append_history_appends_multiple_lines() {
        let dir = tmpdir("append_multiple");
        let path = dir.join("history.jsonl");
        append_history(&path, &sample_response()).unwrap();
        append_history(&path, &sample_response()).unwrap();
        let content = fs::read_to_string(&path).unwrap();
        assert_eq!(content.lines().count(), 2);
    }

    #[test]
    fn append_history_creates_parent_dirs() {
        let dir = tmpdir("parent_dirs");
        let path = dir.join("nested").join("deep").join("history.jsonl");
        append_history(&path, &sample_response()).unwrap();
        assert!(path.exists());
    }
}
