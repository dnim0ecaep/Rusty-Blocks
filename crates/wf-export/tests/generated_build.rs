use std::path::PathBuf;
use std::process::Command;

use wf_export::ExportManager;
use wf_graph::{DefaultGraphParser, GraphParser};
use wf_ir::build_ir;
use wf_template::instantiate_template;

#[test]
fn generated_source_compiles() {
    let project = instantiate_template("notes", "QuickNotes");
    let graph = DefaultGraphParser
        .parse_project(&project)
        .expect("graph parse");
    let ir = build_ir(&project, &graph).expect("ir build");

    let tmp = PathBuf::from("target/test-exports-build");
    let manager = ExportManager::new();
    let result = manager
        .export_source_only(&ir, &tmp, &project.project.id)
        .expect("source export should work");

    let status = Command::new("cargo")
        .arg("check")
        .current_dir(&result.source_dir)
        .status()
        .expect("run cargo check on generated project");

    assert!(status.success(), "generated source did not compile");
}
