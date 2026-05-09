//! Headless smoke test for the runtime.
//!
//! Builds a tiny project programmatically (no dependency on the studio's
//! example file format), loads it through `Project::from_json`, and runs
//! a few scheduler ticks. Asserts the sprite moved.

use serde_json::json;
use wf_sprite_runtime::build_headless;

#[test]
fn sprite_bouncer_minimal_advance() {
    // A single sprite, single flag-clicked hat that moves 10 steps once.
    let project_json = json!({
        "project": {
            "id": "smoke",
            "app_name": "Smoke",
            "version": "0.1",
            "description": ""
        },
        "assets": [],
        "stage_state": {
            "schema_version": 1,
            "sprites": [{
                "id": "s1",
                "name": "Walker",
                "x": 0, "y": 0,
                "direction": 90,
                "size": 100,
                "visible": true,
                "rotationStyle": "all-around",
                "costumeIndex": -1,
                "costumes": [],
                "sounds": [],
                "scripts_xml": "",
                "compiledScripts": [{
                    "type": "scratch_event_when_flag_clicked",
                    "next": {
                        "type": "scratch_motion_move_steps",
                        "fields": { "STEPS": "10" }
                    }
                }],
                "variables": {},
                "lists": {},
                "layer": 1
            }],
            "backdropIndex": -1,
            "backdrops": [],
            "globalVariables": {},
            "globalLists": {}
        }
    });

    let (mut stage, mut scheduler) = build_headless(&project_json.to_string()).unwrap();
    scheduler.fire_green_flag(&stage);
    assert_eq!(scheduler.active_count(), 1);

    // Advance one virtual frame: the move executes (no yields needed).
    stage.set_clock(16.0);
    scheduler.tick(&mut stage);

    let s = stage.sprite("s1").unwrap();
    assert!((s.x - 10.0).abs() < 0.001, "expected x ~= 10, got {}", s.x);
    assert_eq!(scheduler.active_count(), 0, "single-block script should finish");
}

#[test]
fn forever_loop_yields_per_frame() {
    let project_json = json!({
        "project": { "id": "f", "app_name": "F", "version": "", "description": "" },
        "assets": [],
        "stage_state": {
            "schema_version": 1,
            "sprites": [{
                "id": "s1", "name": "L", "x": 0, "y": 0,
                "direction": 90, "size": 100, "visible": true,
                "rotationStyle": "all-around", "costumeIndex": -1,
                "costumes": [], "sounds": [], "scripts_xml": "",
                "compiledScripts": [{
                    "type": "scratch_event_when_flag_clicked",
                    "next": {
                        "type": "scratch_control_forever",
                        "inputs": {
                            "DO": {
                                "type": "scratch_motion_change_x",
                                "fields": { "DX": "5" }
                            }
                        }
                    }
                }],
                "variables": {}, "lists": {}, "layer": 1
            }],
            "backdropIndex": -1, "backdrops": [],
            "globalVariables": {}, "globalLists": {}
        }
    });

    let (mut stage, mut scheduler) = build_headless(&project_json.to_string()).unwrap();
    scheduler.fire_green_flag(&stage);

    // First tick sets up the forever frame; each subsequent tick runs
    // one body iteration. After 4 ticks we expect 3 iterations = x >= 15.
    for i in 0..4 {
        stage.set_clock((i + 1) as f64 * 16.0);
        scheduler.tick(&mut stage);
    }
    let s = stage.sprite("s1").unwrap();
    assert!(s.x >= 15.0, "expected x >= 15 after 4 frames, got {}", s.x);
    assert_eq!(scheduler.active_count(), 1, "forever should still be running");
}

#[test]
fn variables_round_trip_set_and_get() {
    let project_json = json!({
        "project": { "id": "v", "app_name": "V", "version": "", "description": "" },
        "assets": [],
        "stage_state": {
            "schema_version": 1,
            "sprites": [{
                "id": "s1", "name": "C", "x": 0, "y": 0,
                "direction": 90, "size": 100, "visible": true,
                "rotationStyle": "all-around", "costumeIndex": -1,
                "costumes": [], "sounds": [], "scripts_xml": "",
                "compiledScripts": [{
                    "type": "scratch_event_when_flag_clicked",
                    "next": {
                        "type": "scratch_data_set_variable",
                        "fields": { "VARIABLE": "score", "VALUE": "42" }
                    }
                }],
                "variables": {}, "lists": {}, "layer": 1
            }],
            "backdropIndex": -1, "backdrops": [],
            "globalVariables": {}, "globalLists": {}
        }
    });

    let (mut stage, mut scheduler) = build_headless(&project_json.to_string()).unwrap();
    scheduler.fire_green_flag(&stage);
    stage.set_clock(16.0);
    scheduler.tick(&mut stage);

    assert_eq!(stage.get_variable("s1", "score").as_string(), "42");
}
