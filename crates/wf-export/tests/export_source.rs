use std::path::PathBuf;

use wf_export::ExportManager;
use wf_graph::{DefaultGraphParser, GraphParser};
use wf_ir::build_ir;
use wf_template::instantiate_template;

#[test]
fn exports_source_tree_and_manifest() {
    let project = instantiate_template("notes", "QuickNotes");
    let graph = DefaultGraphParser
        .parse_project(&project)
        .expect("graph parse");
    let ir = build_ir(&project, &graph).expect("ir build");

    let tmp = PathBuf::from("target/test-exports");
    let manager = ExportManager::new();
    let result = manager
        .export_source_only(&ir, &tmp, &project.project.id)
        .expect("source export should work");

    assert!(result.source_dir.exists());
    assert!(result.manifest_path.exists());
}

#[test]
fn generated_source_is_deterministic() {
    let project = instantiate_template("notes", "QuickNotes");
    let graph = DefaultGraphParser
        .parse_project(&project)
        .expect("graph parse");
    let ir = build_ir(&project, &graph).expect("ir build");
    let manager = ExportManager::new();

    let tmp1 = PathBuf::from("target/test-exports-determinism/run1");
    let tmp2 = PathBuf::from("target/test-exports-determinism/run2");

    let r1 = manager.export_source_only(&ir, &tmp1, &project.project.id).expect("run1");
    let r2 = manager.export_source_only(&ir, &tmp2, &project.project.id).expect("run2");

    let files1: std::collections::BTreeMap<_, _> = walkdir::WalkDir::new(&r1.source_dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| {
            let rel = e.path().strip_prefix(&r1.source_dir).unwrap().to_owned();
            let content = std::fs::read_to_string(e.path()).unwrap_or_default();
            (rel, content)
        })
        .collect();

    let files2: std::collections::BTreeMap<_, _> = walkdir::WalkDir::new(&r2.source_dir)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .map(|e| {
            let rel = e.path().strip_prefix(&r2.source_dir).unwrap().to_owned();
            let content = std::fs::read_to_string(e.path()).unwrap_or_default();
            (rel, content)
        })
        .collect();

    assert_eq!(files1.keys().collect::<Vec<_>>(), files2.keys().collect::<Vec<_>>(), "file lists differ");
    for (path, content1) in &files1 {
        let content2 = &files2[path];
        assert_eq!(content1, content2, "file {path:?} differs between runs");
    }
}
