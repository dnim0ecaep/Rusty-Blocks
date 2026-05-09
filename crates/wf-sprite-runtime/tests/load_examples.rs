//! Headless verification: load a generated project.json and confirm
//! sprites/scripts make it into the live Stage. Catches the case where
//! `cargo build` succeeds but the rendered window is empty because some
//! field deserialization (camelCase vs snake_case) silently dropped the
//! sprite data.

use std::fs;
use std::path::PathBuf;

use wf_sprite_runtime::{build_headless, Project};

fn workspace_root() -> PathBuf {
    // tests/ → crates/wf-sprite-runtime/ → crates/ → workspace root
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
        .unwrap()
        .to_path_buf()
}

#[test]
fn star_burst_example_round_trips_through_codegen_format() {
    let root = workspace_root();
    let example = root.join("examples/star-burst.warpforge.json");
    let raw = fs::read_to_string(&example).expect("read example");

    // Skip codegen — the runtime should accept the example file directly,
    // since `compiled_scripts` is optional and the runtime gracefully
    // tolerates legacy `scripts_xml` (it just won't have anything to run
    // until codegen converts it).
    let project = Project::from_json(&raw).expect("parse example");
    let stage = project.stage().expect("stage_state present");

    assert_eq!(stage.sprites.len(), 2, "expected 2 sprites");
    let star = stage.sprites.iter().find(|s| s.name == "Star").expect("Star sprite");
    assert!(star.visible, "Star must be visible at startup");
    assert_eq!(star.x, 0.0);
    assert_eq!(star.y, 0.0);
    assert_eq!(star.size, 50.0);

    // Without codegen, compiled_scripts is empty (field deserializes from
    // missing key). That's fine for this test — we're checking the
    // sprite data round-trips, not the scripts.
    assert!(
        star.compiled_scripts.is_empty(),
        "raw example shouldn't have compiled_scripts yet"
    );
}

#[test]
fn generated_project_has_runnable_compiled_scripts() {
    // Run codegen → load the resulting project.json → verify sprites
    // arrive with their compiled_scripts intact.
    let root = workspace_root();
    let example = root.join("examples/star-burst.warpforge.json");
    let raw = fs::read_to_string(&example).expect("read example");
    let tmp = std::env::temp_dir().join("wf_load_examples_test");
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&tmp).expect("mkdir tmp");

    let runtime_path = root.join("crates/wf-sprite-runtime");
    wf_sprite_codegen::compile_to_dir(
        &raw,
        &tmp,
        wf_sprite_codegen::RuntimeDep::Path(runtime_path),
    )
    .expect("codegen");

    let project_json = fs::read_to_string(tmp.join("project.json")).expect("read project.json");
    let (stage, mut scheduler) = build_headless(&project_json).expect("build_headless");

    assert_eq!(stage.sprites.len(), 2);
    let star = stage.sprites.iter().find(|s| s.name == "Star").unwrap();
    assert!(
        !star.compiled_scripts.is_empty(),
        "Star's compiled_scripts must be populated post-codegen"
    );
    assert!(star.visible);

    // Fire the green flag — should queue at least one script per sprite
    // that has a flag hat (both do).
    scheduler.fire_green_flag(&stage);
    assert!(
        scheduler.active_count() >= 2,
        "expected ≥2 scripts after green flag, got {}",
        scheduler.active_count()
    );
}
