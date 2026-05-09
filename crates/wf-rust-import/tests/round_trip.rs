use std::path::PathBuf;

use wf_rust_import::import_rust_file;

fn workspace_root() -> PathBuf {
    // CARGO_MANIFEST_DIR points at .../crates/wf-rust-import. Two parents up = workspace root.
    let here = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    here.parent().unwrap().parent().unwrap().to_path_buf()
}

#[test]
fn imports_real_world_instantiate_rs_without_panicking() {
    let path = workspace_root().join("crates/wf-template/src/instantiate.rs");
    assert!(path.exists(), "fixture missing: {path:?}");

    let project = import_rust_file(&path).expect("import succeeds");

    // app_name comes from file stem.
    assert_eq!(project.project.app_name, "instantiate");

    // Graph should contain many nodes (instantiate.rs is ~780 lines, has multiple fns).
    let n = project.normalized_graph.nodes.len();
    assert!(n > 5, "expected many nodes from instantiate.rs, got {n}");

    let kinds: Vec<&str> = project
        .normalized_graph
        .nodes
        .iter()
        .map(|n| n.kind.as_str())
        .collect();

    // The file has uses, fns, and at least one fn body (so let/expr stmts).
    assert!(kinds.contains(&"rust.use"), "expected rust.use; got {kinds:?}");
    assert!(kinds.contains(&"rust.fn"), "expected rust.fn; got {kinds:?}");

    // Verify we can find specific known fns.
    let fn_names: Vec<String> = project
        .normalized_graph
        .nodes
        .iter()
        .filter(|n| n.kind == "rust.fn")
        .filter_map(|n| n.props.get("name").and_then(|v| v.as_str()).map(str::to_owned))
        .collect();
    assert!(
        fn_names.contains(&"instantiate_template".to_string()),
        "missing instantiate_template fn; got fns {fn_names:?}"
    );
    assert!(
        fn_names.contains(&"slugify".to_string()),
        "missing slugify fn; got fns {fn_names:?}"
    );
}
