#[cfg(target_os = "macos")]
mod mac_bundle {
    use std::path::PathBuf;

    use wf_export::ExportManager;
    use wf_graph::{DefaultGraphParser, GraphParser};
    use wf_ir::build_ir;
    use wf_template::instantiate_template;

    #[test]
    fn exports_macos_bundle() {
        let project = instantiate_template("notes", "QuickNotes");
        let graph = DefaultGraphParser
            .parse_project(&project)
            .expect("graph parse");
        let ir = build_ir(&project, &graph).expect("ir build");

        let tmp = PathBuf::from("target/test-exports-bundle");
        let manager = ExportManager::new();
        let result = manager
            .export_with_bundle(&ir, &tmp, &project.project.id)
            .expect("bundle export should work on macOS");

        let bundle_root = result.bundle_path.expect("bundle path should exist");
        assert!(bundle_root.exists());
    }
}

#[cfg(target_os = "linux")]
mod linux_bundle_integration {
    use std::path::PathBuf;

    use wf_export::ExportManager;
    use wf_graph::{DefaultGraphParser, GraphParser};
    use wf_ir::build_ir;
    use wf_template::instantiate_template;

    #[test]
    fn exports_linux_bundle() {
        let project = instantiate_template("notes", "QuickNotes");
        let graph = DefaultGraphParser
            .parse_project(&project)
            .expect("graph parse");
        let ir = build_ir(&project, &graph).expect("ir build");

        let tmp = PathBuf::from("target/test-exports-bundle-linux");
        let manager = ExportManager::new();
        let result = manager
            .export_with_bundle(&ir, &tmp, &project.project.id)
            .expect("bundle export should work on Linux");

        let bundle_dir = result.bundle_path.expect("Linux bundle path should exist");
        assert!(bundle_dir.exists(), "bundle dir should exist: {bundle_dir:?}");
        assert!(bundle_dir.join("quicknotes").exists(), "binary should be in bundle dir");
        assert!(
            bundle_dir.join("launch-quicknotes.sh").exists(),
            "launcher script should be in bundle dir"
        );
    }
}
