use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};

use crate::AssembleTree;
use wf_codegen_slint::GeneratedProject;

pub fn from_generated(generated: &GeneratedProject) -> AssembleTree {
    AssembleTree {
        files: generated.text_files.clone(),
        assets_to_copy: generated
            .copied_assets
            .iter()
            .map(|asset| (asset.from.clone(), asset.to.clone()))
            .collect(),
    }
}

pub fn write_tree(output_dir: &Path, tree: &AssembleTree) -> Result<Vec<String>> {
    let mut created = Vec::new();

    for (relative, content) in &tree.files {
        let path = output_dir.join(relative);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .with_context(|| format!("failed to create parent directory {parent:?}"))?;
        }
        fs::write(&path, content).with_context(|| format!("failed to write file {path:?}"))?;
        created.push(relative.clone());
    }

    for (from, to) in &tree.assets_to_copy {
        let src = PathBuf::from(from);
        let dst = output_dir.join(to);
        if !src.exists() {
            continue;
        }
        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent)
                .with_context(|| format!("failed to create parent directory {parent:?}"))?;
        }
        fs::copy(&src, &dst)
            .with_context(|| format!("failed to copy asset from {src:?} to {dst:?}"))?;
        created.push(to.clone());
    }

    created.sort();
    Ok(created)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;
    use wf_codegen_slint::{AssetCopy, GeneratedProject};

    fn tmpdir(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("wf_assemble_{tag}"));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn from_generated_maps_text_files() {
        let mut text_files = BTreeMap::new();
        text_files.insert("Cargo.toml".into(), "[package]".into());
        text_files.insert("src/main.rs".into(), "fn main() {}".into());
        let generated = GeneratedProject { text_files, copied_assets: vec![] };
        let tree = from_generated(&generated);
        assert_eq!(tree.files.len(), 2);
        assert!(tree.files.contains_key("Cargo.toml"));
        assert!(tree.files.contains_key("src/main.rs"));
        assert!(tree.assets_to_copy.is_empty());
    }

    #[test]
    fn from_generated_maps_copied_assets() {
        let generated = GeneratedProject {
            text_files: BTreeMap::new(),
            copied_assets: vec![AssetCopy {
                from: "assets/icon.png".into(),
                to: "ui/icon.png".into(),
            }],
        };
        let tree = from_generated(&generated);
        assert_eq!(tree.assets_to_copy.len(), 1);
        assert_eq!(tree.assets_to_copy[0].0, "assets/icon.png");
        assert_eq!(tree.assets_to_copy[0].1, "ui/icon.png");
    }

    #[test]
    fn write_tree_creates_files_on_disk() {
        let mut files = BTreeMap::new();
        files.insert("Cargo.toml".into(), "[package]\nname = \"test\"".into());
        files.insert("src/main.rs".into(), "fn main() {}".into());
        let tree = AssembleTree { files, assets_to_copy: vec![] };
        let dir = tmpdir("write_tree_creates");
        let created = write_tree(&dir, &tree).unwrap();
        assert_eq!(created.len(), 2);
        assert!(dir.join("Cargo.toml").exists());
        assert!(dir.join("src/main.rs").exists());
        let content = std::fs::read_to_string(dir.join("Cargo.toml")).unwrap();
        assert!(content.contains("name = \"test\""));
    }

    #[test]
    fn write_tree_returns_sorted_file_list() {
        let mut files = BTreeMap::new();
        files.insert("z_last.rs".into(), "".into());
        files.insert("a_first.rs".into(), "".into());
        let tree = AssembleTree { files, assets_to_copy: vec![] };
        let dir = tmpdir("write_tree_sorted");
        let created = write_tree(&dir, &tree).unwrap();
        assert_eq!(created[0], "a_first.rs");
        assert_eq!(created[1], "z_last.rs");
    }

    #[test]
    fn write_tree_skips_missing_assets() {
        let tree = AssembleTree {
            files: BTreeMap::new(),
            assets_to_copy: vec![("nonexistent_asset.png".into(), "ui/icon.png".into())],
        };
        let dir = tmpdir("write_tree_missing_assets");
        let created = write_tree(&dir, &tree).unwrap();
        assert!(created.is_empty());
    }
}
