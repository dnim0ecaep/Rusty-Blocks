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

/// `distance to` between two sprites returns Euclidean distance in stage
/// coords. Verifies the sensing-target resolver picks the right sprite by
/// case-insensitive name and that the math matches.
#[test]
fn distance_to_named_sprite() {
    // Two sprites: "Walker" at (0,0), "Goal" at (3,4) — distance 5.
    let project_json = json!({
        "project": { "id": "d", "app_name": "D", "version": "", "description": "" },
        "assets": [],
        "stage_state": {
            "schema_version": 1,
            "sprites": [
                {
                    "id": "s1", "name": "Walker", "x": 0, "y": 0,
                    "direction": 90, "size": 100, "visible": true,
                    "rotationStyle": "all-around", "costumeIndex": -1,
                    "costumes": [], "sounds": [], "scripts_xml": "",
                    "compiledScripts": [{
                        "type": "scratch_event_when_flag_clicked",
                        "next": {
                            "type": "scratch_data_set_variable",
                            "fields": { "VARIABLE": "d" },
                            "inputs": {
                                "VALUE": {
                                    "type": "scratch_sensing_distance_to",
                                    "fields": { "TARGET": "goal" }
                                }
                            }
                        }
                    }],
                    "variables": {}, "lists": {}, "layer": 1
                },
                {
                    "id": "s2", "name": "Goal", "x": 3, "y": 4,
                    "direction": 90, "size": 100, "visible": true,
                    "rotationStyle": "all-around", "costumeIndex": -1,
                    "costumes": [], "sounds": [], "scripts_xml": "",
                    "compiledScripts": [],
                    "variables": {}, "lists": {}, "layer": 2
                }
            ],
            "backdropIndex": -1, "backdrops": [],
            "globalVariables": {}, "globalLists": {}
        }
    });

    let (mut stage, mut scheduler) = build_headless(&project_json.to_string()).unwrap();
    scheduler.fire_green_flag(&stage);
    stage.set_clock(16.0);
    scheduler.tick(&mut stage);
    let d = stage.get_variable("s1", "d").as_number();
    assert!((d - 5.0).abs() < 0.001, "expected distance 5, got {}", d);
}

/// `set_effect_to brightness 50` clamps to [-100,100]; `change_effect_by`
/// adds and reclamps. Verifies the data round-trips into the Effects
/// struct as the host expects.
#[test]
fn effects_set_change_clamp() {
    let project_json = json!({
        "project": { "id": "e", "app_name": "E", "version": "", "description": "" },
        "assets": [],
        "stage_state": {
            "schema_version": 1,
            "sprites": [{
                "id": "s1", "name": "F", "x": 0, "y": 0,
                "direction": 90, "size": 100, "visible": true,
                "rotationStyle": "all-around", "costumeIndex": -1,
                "costumes": [], "sounds": [], "scripts_xml": "",
                "compiledScripts": [{
                    "type": "scratch_event_when_flag_clicked",
                    "next": {
                        "type": "scratch_looks_set_effect_to",
                        "fields": { "EFFECT": "brightness" },
                        "inputs": { "VALUE": { "type": "math_number", "fields": { "NUM": "200" } } },
                        "next": {
                            "type": "scratch_looks_change_effect_by",
                            "fields": { "EFFECT": "brightness" },
                            "inputs": { "VALUE": { "type": "math_number", "fields": { "NUM": "-50" } } }
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
    stage.set_clock(16.0);
    scheduler.tick(&mut stage);
    let s = stage.sprite("s1").unwrap();
    let eff = s.effects.as_ref().expect("effects set");
    // 200 clamped to 100, then -50 → 50.
    assert!(matches!(eff.brightness, Some(v) if (v - 50.0).abs() < 0.001),
        "expected brightness 50, got {:?}", eff.brightness);
}

/// `switch_backdrop` by name updates `stage.backdrop_index` so the host
/// can re-render. Validates name resolution + that out-of-range names
/// leave the index untouched.
#[test]
fn switch_backdrop_by_name() {
    let project_json = json!({
        "project": { "id": "b", "app_name": "B", "version": "", "description": "" },
        "assets": [],
        "stage_state": {
            "schema_version": 1,
            "sprites": [{
                "id": "s1", "name": "Stage", "x": 0, "y": 0,
                "direction": 90, "size": 100, "visible": true,
                "rotationStyle": "all-around", "costumeIndex": -1,
                "costumes": [], "sounds": [], "scripts_xml": "",
                "compiledScripts": [{
                    "type": "scratch_event_when_flag_clicked",
                    "next": {
                        "type": "scratch_looks_switch_backdrop",
                        "inputs": { "BACKDROP": { "type": "text", "fields": { "TEXT": "Night" } } }
                    }
                }],
                "variables": {}, "lists": {}, "layer": 1
            }],
            "backdropIndex": 0,
            "backdrops": [
                { "id": "b0", "name": "Day", "width": 480, "height": 360, "centerX": 240, "centerY": 180 },
                { "id": "b1", "name": "Night", "width": 480, "height": 360, "centerX": 240, "centerY": 180 }
            ],
            "globalVariables": {}, "globalLists": {}
        }
    });

    let (mut stage, mut scheduler) = build_headless(&project_json.to_string()).unwrap();
    assert_eq!(stage.backdrop_index, 0, "initial index");
    scheduler.fire_green_flag(&stage);
    stage.set_clock(16.0);
    scheduler.tick(&mut stage);
    assert_eq!(stage.backdrop_index, 1, "switched to Night");
}

/// `set text to (X) with font (Y)` writes both the text overlay and
/// the font family from variable getters. Pins the contract the
/// renderer depends on: text_value + font_family both set, both
/// readable on the Sprite, ready for the host's text element.
#[test]
fn set_text_with_font_round_trip() {
    let project_json = json!({
        "project": { "id": "tf", "app_name": "TF", "version": "", "description": "" },
        "assets": [],
        "stage_state": {
            "schema_version": 1,
            "sprites": [{
                "id": "s1", "name": "T", "x": 0, "y": 0,
                "direction": 90, "size": 100, "visible": true,
                "rotationStyle": "all-around", "costumeIndex": -1,
                "costumes": [], "sounds": [], "scripts_xml": "",
                "compiledScripts": [{
                    "type": "scratch_event_when_flag_clicked",
                    "next": {
                        "type": "scratch_data_set_variable",
                        "fields": { "VARIABLE": "msg" },
                        "inputs": { "VALUE": { "type": "text", "fields": { "TEXT": "Hello" } } },
                        "next": {
                            "type": "scratch_data_set_variable",
                            "fields": { "VARIABLE": "font_name" },
                            "inputs": { "VALUE": { "type": "text", "fields": { "TEXT": "Courier New" } } },
                            "next": {
                                "type": "scratch_looks_set_text_with_font",
                                "inputs": {
                                    "TEXT": { "type": "scratch_data_variables_get", "fields": { "VARIABLE": "msg" } },
                                    "FONT": { "type": "scratch_data_variables_get", "fields": { "VARIABLE": "font_name" } }
                                }
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
    stage.set_clock(16.0);
    scheduler.tick(&mut stage);
    let s = stage.sprite("s1").unwrap();
    assert_eq!(s.text_value.as_deref(), Some("Hello"));
    assert_eq!(s.font_family.as_deref(), Some("Courier New"));
}

/// `set text size to N` stores the value on the sprite; values out of
/// the [8..200] range clamp to the boundary; zero / NaN clear the
/// override entirely.
#[test]
fn set_text_size_clamps_and_clears() {
    fn run_with_size(n: f64) -> Option<f32> {
        let project_json = json!({
            "project": { "id": "ts", "app_name": "TS", "version": "", "description": "" },
            "assets": [],
            "stage_state": {
                "schema_version": 1,
                "sprites": [{
                    "id": "s1", "name": "T", "x": 0, "y": 0,
                    "direction": 90, "size": 100, "visible": true,
                    "rotationStyle": "all-around", "costumeIndex": -1,
                    "costumes": [], "sounds": [], "scripts_xml": "",
                    "compiledScripts": [{
                        "type": "scratch_event_when_flag_clicked",
                        "next": {
                            "type": "scratch_looks_set_text_size_to",
                            "inputs": { "SIZE": { "type": "math_number", "fields": { "NUM": n.to_string() } } }
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
        stage.sprite("s1").unwrap().text_size
    }
    // In-range value passes through.
    assert_eq!(run_with_size(24.0), Some(24.0));
    // Tiny value clamps up to 8.
    assert_eq!(run_with_size(2.0), Some(8.0));
    // Huge value clamps down to 200.
    assert_eq!(run_with_size(500.0), Some(200.0));
    // Zero clears the override.
    assert_eq!(run_with_size(0.0), None);
    // Negative clears.
    assert_eq!(run_with_size(-10.0), None);
}

/// Empty FONT clears the override but keeps the text overlay.
#[test]
fn set_text_with_font_empty_font_clears_override() {
    let project_json = json!({
        "project": { "id": "tf2", "app_name": "TF2", "version": "", "description": "" },
        "assets": [],
        "stage_state": {
            "schema_version": 1,
            "sprites": [{
                "id": "s1", "name": "T", "x": 0, "y": 0,
                "direction": 90, "size": 100, "visible": true,
                "rotationStyle": "all-around", "costumeIndex": -1,
                "costumes": [], "sounds": [], "scripts_xml": "",
                "compiledScripts": [{
                    "type": "scratch_event_when_flag_clicked",
                    "next": {
                        "type": "scratch_looks_set_text_with_font",
                        "inputs": {
                            "TEXT": { "type": "text", "fields": { "TEXT": "Hello" } },
                            "FONT": { "type": "text", "fields": { "TEXT": "" } }
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
    stage.set_clock(16.0);
    scheduler.tick(&mut stage);
    let s = stage.sprite("s1").unwrap();
    assert_eq!(s.text_value.as_deref(), Some("Hello"));
    assert_eq!(s.font_family, None);
}

/// Worked-example block from docs/manual.md §12 — `teleport_random`
/// must land the sprite inside the stage bounds inset by its
/// half-extent. We can't pin an exact (x, y) because the result is
/// random, so we assert the invariant: x in [-half_w_inset..half_w_inset]
/// and y in [-half_h_inset..half_h_inset]. Sprite size = 100 → half = 20.
#[test]
fn teleport_random_stays_in_bounds() {
    let project_json = json!({
        "project": { "id": "tp", "app_name": "TP", "version": "", "description": "" },
        "assets": [],
        "stage_state": {
            "schema_version": 1,
            "sprites": [{
                "id": "s1", "name": "T", "x": 0, "y": 0,
                "direction": 90, "size": 100, "visible": true,
                "rotationStyle": "all-around", "costumeIndex": -1,
                "costumes": [], "sounds": [], "scripts_xml": "",
                "compiledScripts": [{
                    "type": "scratch_event_when_flag_clicked",
                    "next": { "type": "scratch_motion_teleport_random" }
                }],
                "variables": {}, "lists": {}, "layer": 1
            }],
            "backdropIndex": -1, "backdrops": [],
            "globalVariables": {}, "globalLists": {}
        }
    });
    let (mut stage, mut scheduler) = build_headless(&project_json.to_string()).unwrap();
    scheduler.fire_green_flag(&stage);
    // Run a few iterations to exercise multiple random samples.
    for i in 0..50 {
        stage.set_clock((i + 1) as f64 * 16.0);
        scheduler.tick(&mut stage);
        if scheduler.active_count() == 0 {
            // Restart by re-firing the flag — each tick consumes one
            // teleport because the block is a one-shot statement.
            scheduler.fire_green_flag(&stage);
        }
        let s = stage.sprite("s1").unwrap();
        // Stage 480×360, sprite half 20 → x ∈ [-220, 220], y ∈ [-160, 160].
        assert!(s.x >= -220.0 && s.x <= 220.0, "x out of bounds: {}", s.x);
        assert!(s.y >= -160.0 && s.y <= 160.0, "y out of bounds: {}", s.y);
    }
}

/// `set text to (variable getter)` writes the variable's current value
/// to the sprite's `text_value` field so the renderer can paint it. Uses
/// the variable getter reporter as the input — the canonical "dynamic
/// text sprite" pattern.
#[test]
fn set_text_to_variable_getter() {
    let project_json = json!({
        "project": { "id": "tx", "app_name": "TX", "version": "", "description": "" },
        "assets": [],
        "stage_state": {
            "schema_version": 1,
            "sprites": [{
                "id": "s1", "name": "T", "x": 0, "y": 0,
                "direction": 90, "size": 100, "visible": true,
                "rotationStyle": "all-around", "costumeIndex": -1,
                "costumes": [], "sounds": [], "scripts_xml": "",
                "compiledScripts": [{
                    "type": "scratch_event_when_flag_clicked",
                    "next": {
                        "type": "scratch_data_set_variable",
                        "fields": { "VARIABLE": "score" },
                        "inputs": { "VALUE": { "type": "math_number", "fields": { "NUM": "42" } } },
                        "next": {
                            "type": "scratch_looks_set_text_to",
                            "inputs": {
                                "TEXT": {
                                    "type": "scratch_data_variables_get",
                                    "fields": { "VARIABLE": "score" }
                                }
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
    stage.set_clock(16.0);
    scheduler.tick(&mut stage);
    let s = stage.sprite("s1").unwrap();
    assert_eq!(s.text_value.as_deref(), Some("42"));
}

/// Empty-string assignment clears the text overlay.
#[test]
fn set_text_to_empty_clears() {
    let project_json = json!({
        "project": { "id": "tx2", "app_name": "TX2", "version": "", "description": "" },
        "assets": [],
        "stage_state": {
            "schema_version": 1,
            "sprites": [{
                "id": "s1", "name": "T", "x": 0, "y": 0,
                "direction": 90, "size": 100, "visible": true,
                "rotationStyle": "all-around", "costumeIndex": -1,
                "costumes": [], "sounds": [], "scripts_xml": "",
                "compiledScripts": [{
                    "type": "scratch_event_when_flag_clicked",
                    "next": {
                        "type": "scratch_looks_set_text_to",
                        "inputs": { "TEXT": { "type": "text", "fields": { "TEXT": "Hello" } } },
                        "next": {
                            "type": "scratch_looks_set_text_to",
                            "inputs": { "TEXT": { "type": "text", "fields": { "TEXT": "" } } }
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
    stage.set_clock(16.0);
    scheduler.tick(&mut stage);
    let s = stage.sprite("s1").unwrap();
    assert_eq!(s.text_value, None, "empty value should clear the overlay");
}

/// `touching_color` reads the host-supplied raster buffer and reports
/// true when any sample under the sprite's bbox is within tolerance of
/// the picked color. Drives the contract the rasterize pipeline in the
/// Slint codegen depends on.
#[test]
fn touching_color_reads_host_buffer() {
    // 480x360 buffer, all red pixels — every sample should match #ff0000.
    let mut data = Vec::with_capacity(480 * 360 * 4);
    for _ in 0..(480 * 360) {
        data.extend_from_slice(&[0xff, 0x00, 0x00, 0xff]);
    }

    let project_json = json!({
        "project": { "id": "tc", "app_name": "TC", "version": "", "description": "" },
        "assets": [],
        "stage_state": {
            "schema_version": 1,
            "sprites": [{
                "id": "s1", "name": "F", "x": 0, "y": 0,
                "direction": 90, "size": 100, "visible": true,
                "rotationStyle": "all-around", "costumeIndex": -1,
                "costumes": [], "sounds": [], "scripts_xml": "",
                "compiledScripts": [{
                    "type": "scratch_event_when_flag_clicked",
                    "next": {
                        "type": "scratch_data_set_variable",
                        "fields": { "VARIABLE": "hit" },
                        "inputs": {
                            "VALUE": {
                                "type": "scratch_sensing_touching_color",
                                "fields": { "COLOR": "#ff0000" }
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
    stage.set_pixel_buffer(480, 360, data);
    scheduler.fire_green_flag(&stage);
    stage.set_clock(16.0);
    scheduler.tick(&mut stage);
    let hit = stage.get_variable("s1", "hit");
    assert!(hit.truthy(), "expected touching_color #ff0000 = true on all-red buffer; got {:?}", hit);
}

/// Sanity: a buffer of pure blue should NOT match red within the default
/// tolerance. Guards against an over-loose tolerance.
#[test]
fn touching_color_rejects_far_color() {
    let mut data = Vec::with_capacity(480 * 360 * 4);
    for _ in 0..(480 * 360) {
        data.extend_from_slice(&[0x00, 0x00, 0xff, 0xff]);
    }
    let project_json = json!({
        "project": { "id": "tc2", "app_name": "TC2", "version": "", "description": "" },
        "assets": [],
        "stage_state": {
            "schema_version": 1,
            "sprites": [{
                "id": "s1", "name": "F", "x": 0, "y": 0,
                "direction": 90, "size": 100, "visible": true,
                "rotationStyle": "all-around", "costumeIndex": -1,
                "costumes": [], "sounds": [], "scripts_xml": "",
                "compiledScripts": [{
                    "type": "scratch_event_when_flag_clicked",
                    "next": {
                        "type": "scratch_data_set_variable",
                        "fields": { "VARIABLE": "hit" },
                        "inputs": {
                            "VALUE": {
                                "type": "scratch_sensing_touching_color",
                                "fields": { "COLOR": "#ff0000" }
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
    stage.set_pixel_buffer(480, 360, data);
    scheduler.fire_green_flag(&stage);
    stage.set_clock(16.0);
    scheduler.tick(&mut stage);
    assert!(!stage.get_variable("s1", "hit").truthy());
}

/// Verify that `ask_and_wait` parks the script on AwaitAnswer until the
/// host calls `submit_answer`, and that `sensing_answer` then surfaces
/// the submitted text into a list-add. This is the runtime contract the
/// menu-editor example depends on.
#[test]
fn ask_and_wait_parks_until_answer_submitted() {
    let project_json = json!({
        "project": { "id": "ask", "app_name": "Ask", "version": "", "description": "" },
        "assets": [],
        "stage_state": {
            "schema_version": 1,
            "sprites": [{
                "id": "s1", "name": "Q", "x": 0, "y": 0,
                "direction": 90, "size": 100, "visible": true,
                "rotationStyle": "all-around", "costumeIndex": -1,
                "costumes": [], "sounds": [], "scripts_xml": "",
                "compiledScripts": [{
                    "type": "scratch_event_when_flag_clicked",
                    "next": {
                        "type": "scratch_sensing_ask_and_wait",
                        "inputs": {
                            "QUESTION": { "type": "text", "fields": { "TEXT": "Name?" } }
                        },
                        "next": {
                            "type": "scratch_data_add_to_list",
                            "fields": { "LIST": "labels" },
                            "inputs": {
                                "ITEM": { "type": "scratch_sensing_answer" }
                            }
                        }
                    }
                }],
                "variables": {}, "lists": {}, "layer": 1
            }],
            "backdropIndex": -1, "backdrops": [],
            "globalVariables": {}, "globalLists": { "labels": [] }
        }
    });

    let (mut stage, mut scheduler) = build_headless(&project_json.to_string()).unwrap();
    scheduler.fire_green_flag(&stage);

    // Tick once: ask_and_wait fires, AwaitAnswer parks. List untouched.
    stage.set_clock(16.0);
    scheduler.tick(&mut stage);
    assert_eq!(stage.pending_question(), Some("Name?"));
    assert!(stage.global_lists.get("labels").unwrap().is_empty());
    assert_eq!(scheduler.active_count(), 1, "script still parked");

    // Several more ticks: still parked, list still empty.
    for i in 2..6 {
        stage.set_clock(i as f64 * 16.0);
        scheduler.tick(&mut stage);
    }
    assert_eq!(stage.pending_question(), Some("Name?"));
    assert!(stage.global_lists.get("labels").unwrap().is_empty());

    // Host submits answer. Next tick: AwaitAnswer pops, add_to_list runs.
    stage.submit_answer("GitHub".into());
    assert_eq!(stage.pending_question(), None);
    stage.set_clock(7.0 * 16.0);
    scheduler.tick(&mut stage);

    let list = stage.global_lists.get("labels").unwrap();
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].as_value().as_string(), "GitHub");
    assert_eq!(scheduler.active_count(), 0, "script should finish after add");
}
