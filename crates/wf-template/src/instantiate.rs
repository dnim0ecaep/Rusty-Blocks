use std::collections::BTreeMap;

use chrono::Utc;
use uuid::Uuid;
use wf_schema::{
    AssetRecord, EdgeType, GraphEdge, GraphNode, NormalizedGraph, ProjectFile, ProjectMetadata,
    ProjectSettings, TargetType, ThemeMode, WorkspaceState, PROJECT_SCHEMA_VERSION,
};

pub fn instantiate_template(template_id: &str, app_name: &str) -> ProjectFile {
    let now = Utc::now();
    let project_id = Uuid::new_v4().to_string();

    let normalized_graph = match template_id {
        "notes" => notes_graph(),
        "checklist" => checklist_graph(),
        "content-editor" => content_editor_graph(),
        "dashboard" => dashboard_graph(),
        "form-entry" => form_entry_graph(),
        "settings-tool" => settings_tool_graph(),
        "calculator" => calculator_graph(),
        "pomodoro-timer" => pomodoro_timer_graph(),
        "recipe-card" => recipe_card_graph(),
        _ => basic_graph(),
    };

    ProjectFile {
        schema_version: PROJECT_SCHEMA_VERSION,
        project: ProjectMetadata {
            id: project_id.clone(),
            app_name: app_name.to_owned(),
            package_id: format!("com.warpforge.{}", slugify(app_name)),
            version: "0.1.0".into(),
            author: "WarpForge User".into(),
            description: format!("{} generated from {} template", app_name, template_id),
            target_type: TargetType::DesktopSlint,
            theme: ThemeMode::Auto,
            created_at: now,
            updated_at: now,
            stage_width: None,
            stage_height: None,
        },
        workspace_state: WorkspaceState {
            zoom: 1.0,
            pan_x: 0.0,
            pan_y: 0.0,
            selected_block_ids: vec![],
            blockly_xml: None,
            comments: vec![],
            groups: vec![],
        },
        normalized_graph,
        ir_snapshot: None,
        assets: Vec::<AssetRecord>::new(),
        ai_history: vec![],
        stage_state: None,
        settings: ProjectSettings {
            autosave_interval_secs: 20,
            validate_on_change: true,
            codegen_deterministic: true,
            ai_default_text_provider: "ollama".into(),
            ai_default_image_provider: "comfyui".into(),
        },
    }
}

fn basic_graph() -> NormalizedGraph {
    NormalizedGraph {
        nodes: vec![
            GraphNode {
                id: "window_main".into(),
                kind: "structure.window".into(),
                category: "structure".into(),
                props: BTreeMap::from([
                    ("title".into(), serde_json::json!("WarpForge App")),
                    ("width".into(), serde_json::json!(1024)),
                    ("height".into(), serde_json::json!(768)),
                ]),
            },
            GraphNode {
                id: "screen_home".into(),
                kind: "structure.screen".into(),
                category: "structure".into(),
                props: BTreeMap::from([
                    ("name".into(), serde_json::json!("Home")),
                    ("route".into(), serde_json::json!("/")),
                ]),
            },
        ],
        edges: vec![GraphEdge {
            id: "edge_window_screen".into(),
            from: "window_main".into(),
            to: "screen_home".into(),
            edge_type: EdgeType::Child,
        }],
    }
}

fn notes_graph() -> NormalizedGraph {
    NormalizedGraph {
        nodes: vec![
            GraphNode {
                id: "window_main".into(),
                kind: "structure.window".into(),
                category: "structure".into(),
                props: BTreeMap::from([
                    ("title".into(), serde_json::json!("QuickNotes")),
                    ("width".into(), serde_json::json!(1024)),
                    ("height".into(), serde_json::json!(768)),
                ]),
            },
            GraphNode {
                id: "screen_home".into(),
                kind: "structure.screen".into(),
                category: "structure".into(),
                props: BTreeMap::from([
                    ("name".into(), serde_json::json!("Home")),
                    ("route".into(), serde_json::json!("/")),
                ]),
            },
            GraphNode {
                id: "event_start".into(),
                kind: "events.on_app_start".into(),
                category: "events".into(),
                props: BTreeMap::new(),
            },
            GraphNode {
                id: "io_load_notes".into(),
                kind: "io.load_local_data".into(),
                category: "io".into(),
                props: BTreeMap::from([("key".into(), serde_json::json!("notes"))]),
            },
            // Real input field — its text becomes the new note when
            // the Add button fires. The state.add_item action below
            // references this id via `value_ref`.
            GraphNode {
                id: "note_input".into(),
                kind: "ui.input".into(),
                category: "ui".into(),
                props: BTreeMap::from([(
                    "placeholder".into(),
                    serde_json::json!("Type a note…"),
                )]),
            },
            GraphNode {
                id: "ui_add_button".into(),
                kind: "ui.button".into(),
                category: "ui".into(),
                props: BTreeMap::from([("label".into(), serde_json::json!("Add"))]),
            },
            GraphNode {
                id: "event_add_click".into(),
                kind: "events.on_click".into(),
                category: "events".into(),
                props: BTreeMap::from([("target".into(), serde_json::json!("ui_add_button"))]),
            },
            GraphNode {
                id: "state_add_item".into(),
                kind: "state.add_item".into(),
                category: "state".into(),
                props: BTreeMap::from([
                    ("collection".into(), serde_json::json!("notes")),
                    ("value_ref".into(), serde_json::json!("note_input")),
                ]),
            },
        ],
        edges: vec![
            GraphEdge {
                id: "edge_window_screen".into(),
                from: "window_main".into(),
                to: "screen_home".into(),
                edge_type: EdgeType::Child,
            },
            GraphEdge {
                id: "edge_start_load".into(),
                from: "event_start".into(),
                to: "io_load_notes".into(),
                edge_type: EdgeType::Flow,
            },
            GraphEdge {
                id: "edge_click_add".into(),
                from: "event_add_click".into(),
                to: "state_add_item".into(),
                edge_type: EdgeType::Flow,
            },
        ],
    }
}

fn checklist_graph() -> NormalizedGraph {
    NormalizedGraph {
        nodes: vec![
            GraphNode {
                id: "window_main".into(),
                kind: "structure.window".into(),
                category: "structure".into(),
                props: BTreeMap::from([
                    ("title".into(), serde_json::json!("Checklist")),
                    ("width".into(), serde_json::json!(800)),
                    ("height".into(), serde_json::json!(600)),
                ]),
            },
            GraphNode {
                id: "screen_home".into(),
                kind: "structure.screen".into(),
                category: "structure".into(),
                props: BTreeMap::from([
                    ("name".into(), serde_json::json!("Home")),
                    ("route".into(), serde_json::json!("/")),
                ]),
            },
            GraphNode {
                id: "ui_input_task".into(),
                kind: "ui.input".into(),
                category: "ui".into(),
                props: BTreeMap::from([
                    ("placeholder".into(), serde_json::json!("New task...")),
                ]),
            },
            GraphNode {
                id: "ui_button_add".into(),
                kind: "ui.button".into(),
                category: "ui".into(),
                props: BTreeMap::from([("label".into(), serde_json::json!("Add Task"))]),
            },
            GraphNode {
                id: "ui_list_tasks".into(),
                kind: "ui.list".into(),
                category: "ui".into(),
                props: BTreeMap::from([("collection".into(), serde_json::json!("tasks"))]),
            },
            GraphNode {
                id: "event_start".into(),
                kind: "events.on_app_start".into(),
                category: "events".into(),
                props: BTreeMap::new(),
            },
            GraphNode {
                id: "io_load_tasks".into(),
                kind: "io.load_local_data".into(),
                category: "io".into(),
                props: BTreeMap::from([("key".into(), serde_json::json!("checklist"))]),
            },
            GraphNode {
                id: "event_click_add".into(),
                kind: "events.on_click".into(),
                category: "events".into(),
                props: BTreeMap::from([("target".into(), serde_json::json!("ui_button_add"))]),
            },
            GraphNode {
                id: "state_add_task".into(),
                kind: "state.add_item".into(),
                category: "state".into(),
                props: BTreeMap::from([
                    ("collection".into(), serde_json::json!("tasks")),
                    ("value_ref".into(), serde_json::json!("ui_input_task")),
                ]),
            },
            GraphNode {
                id: "io_save_tasks".into(),
                kind: "io.save_local_data".into(),
                category: "io".into(),
                props: BTreeMap::from([("key".into(), serde_json::json!("checklist"))]),
            },
        ],
        edges: vec![
            GraphEdge {
                id: "edge_window_screen".into(),
                from: "window_main".into(),
                to: "screen_home".into(),
                edge_type: EdgeType::Child,
            },
            GraphEdge {
                id: "edge_start_load".into(),
                from: "event_start".into(),
                to: "io_load_tasks".into(),
                edge_type: EdgeType::Flow,
            },
            GraphEdge {
                id: "edge_click_add_state".into(),
                from: "event_click_add".into(),
                to: "state_add_task".into(),
                edge_type: EdgeType::Flow,
            },
            GraphEdge {
                id: "edge_click_add_save".into(),
                from: "event_click_add".into(),
                to: "io_save_tasks".into(),
                edge_type: EdgeType::Flow,
            },
        ],
    }
}

fn content_editor_graph() -> NormalizedGraph {
    NormalizedGraph {
        nodes: vec![
            GraphNode {
                id: "window_main".into(),
                kind: "structure.window".into(),
                category: "structure".into(),
                props: BTreeMap::from([
                    ("title".into(), serde_json::json!("Content Editor")),
                    ("width".into(), serde_json::json!(1024)),
                    ("height".into(), serde_json::json!(768)),
                ]),
            },
            GraphNode {
                id: "screen_editor".into(),
                kind: "structure.screen".into(),
                category: "structure".into(),
                props: BTreeMap::from([
                    ("name".into(), serde_json::json!("Editor")),
                    ("route".into(), serde_json::json!("/")),
                ]),
            },
            GraphNode {
                id: "ui_input_title".into(),
                kind: "ui.input".into(),
                category: "ui".into(),
                props: BTreeMap::from([
                    ("placeholder".into(), serde_json::json!("Document title...")),
                ]),
            },
            GraphNode {
                id: "ui_textarea_body".into(),
                kind: "ui.textarea".into(),
                category: "ui".into(),
                props: BTreeMap::from([
                    ("placeholder".into(), serde_json::json!("Start writing...")),
                ]),
            },
            GraphNode {
                id: "ui_button_save".into(),
                kind: "ui.button".into(),
                category: "ui".into(),
                props: BTreeMap::from([("label".into(), serde_json::json!("Save"))]),
            },
            GraphNode {
                id: "ui_button_open".into(),
                kind: "ui.button".into(),
                category: "ui".into(),
                props: BTreeMap::from([("label".into(), serde_json::json!("Open"))]),
            },
            GraphNode {
                id: "event_start".into(),
                kind: "events.on_app_start".into(),
                category: "events".into(),
                props: BTreeMap::new(),
            },
            GraphNode {
                id: "io_load_doc".into(),
                kind: "io.load_local_data".into(),
                category: "io".into(),
                props: BTreeMap::from([("key".into(), serde_json::json!("current_doc"))]),
            },
            GraphNode {
                id: "event_click_save".into(),
                kind: "events.on_click".into(),
                category: "events".into(),
                props: BTreeMap::from([("target".into(), serde_json::json!("ui_button_save"))]),
            },
            GraphNode {
                id: "io_write_doc".into(),
                kind: "io.write_file".into(),
                category: "io".into(),
                props: BTreeMap::from([
                    ("source_ref".into(), serde_json::json!("ui_textarea_body")),
                ]),
            },
            GraphNode {
                id: "event_click_open".into(),
                kind: "events.on_click".into(),
                category: "events".into(),
                props: BTreeMap::from([("target".into(), serde_json::json!("ui_button_open"))]),
            },
            GraphNode {
                id: "io_read_doc".into(),
                kind: "io.read_file".into(),
                category: "io".into(),
                props: BTreeMap::from([
                    ("target_ref".into(), serde_json::json!("ui_textarea_body")),
                ]),
            },
        ],
        edges: vec![
            GraphEdge {
                id: "edge_window_screen".into(),
                from: "window_main".into(),
                to: "screen_editor".into(),
                edge_type: EdgeType::Child,
            },
            GraphEdge {
                id: "edge_start_load".into(),
                from: "event_start".into(),
                to: "io_load_doc".into(),
                edge_type: EdgeType::Flow,
            },
            GraphEdge {
                id: "edge_save_write".into(),
                from: "event_click_save".into(),
                to: "io_write_doc".into(),
                edge_type: EdgeType::Flow,
            },
            GraphEdge {
                id: "edge_open_read".into(),
                from: "event_click_open".into(),
                to: "io_read_doc".into(),
                edge_type: EdgeType::Flow,
            },
        ],
    }
}

fn dashboard_graph() -> NormalizedGraph {
    NormalizedGraph {
        nodes: vec![
            GraphNode {
                id: "window_main".into(),
                kind: "structure.window".into(),
                category: "structure".into(),
                props: BTreeMap::from([
                    ("title".into(), serde_json::json!("Dashboard")),
                    ("width".into(), serde_json::json!(1200)),
                    ("height".into(), serde_json::json!(800)),
                ]),
            },
            GraphNode {
                id: "screen_dashboard".into(),
                kind: "structure.screen".into(),
                category: "structure".into(),
                props: BTreeMap::from([
                    ("name".into(), serde_json::json!("Dashboard")),
                    ("route".into(), serde_json::json!("/")),
                ]),
            },
            GraphNode {
                id: "ui_header".into(),
                kind: "ui.header".into(),
                category: "ui".into(),
                props: BTreeMap::from([("label".into(), serde_json::json!("Status Dashboard"))]),
            },
            GraphNode {
                id: "ui_card_status".into(),
                kind: "ui.card".into(),
                category: "ui".into(),
                props: BTreeMap::from([("label".into(), serde_json::json!("System Status"))]),
            },
            GraphNode {
                id: "ui_text_status".into(),
                kind: "ui.text".into(),
                category: "ui".into(),
                props: BTreeMap::from([("text".into(), serde_json::json!("Loading..."))]),
            },
            GraphNode {
                id: "ui_button_refresh".into(),
                kind: "ui.button".into(),
                category: "ui".into(),
                props: BTreeMap::from([("label".into(), serde_json::json!("Refresh"))]),
            },
            GraphNode {
                id: "ui_list_items".into(),
                kind: "ui.list".into(),
                category: "ui".into(),
                props: BTreeMap::from([("collection".into(), serde_json::json!("entries"))]),
            },
            GraphNode {
                id: "event_start".into(),
                kind: "events.on_app_start".into(),
                category: "events".into(),
                props: BTreeMap::new(),
            },
            GraphNode {
                id: "io_load_data".into(),
                kind: "io.load_local_data".into(),
                category: "io".into(),
                props: BTreeMap::from([("key".into(), serde_json::json!("dashboard_data"))]),
            },
            GraphNode {
                id: "event_timer".into(),
                kind: "events.on_timer".into(),
                category: "events".into(),
                props: BTreeMap::from([("interval_ms".into(), serde_json::json!(30000))]),
            },
            GraphNode {
                id: "io_refresh_data".into(),
                kind: "io.load_local_data".into(),
                category: "io".into(),
                props: BTreeMap::from([("key".into(), serde_json::json!("dashboard_data"))]),
            },
            GraphNode {
                id: "event_click_refresh".into(),
                kind: "events.on_click".into(),
                category: "events".into(),
                props: BTreeMap::from([("target".into(), serde_json::json!("ui_button_refresh"))]),
            },
            GraphNode {
                id: "io_manual_refresh".into(),
                kind: "io.load_local_data".into(),
                category: "io".into(),
                props: BTreeMap::from([("key".into(), serde_json::json!("dashboard_data"))]),
            },
        ],
        edges: vec![
            GraphEdge {
                id: "edge_window_screen".into(),
                from: "window_main".into(),
                to: "screen_dashboard".into(),
                edge_type: EdgeType::Child,
            },
            GraphEdge {
                id: "edge_start_load".into(),
                from: "event_start".into(),
                to: "io_load_data".into(),
                edge_type: EdgeType::Flow,
            },
            GraphEdge {
                id: "edge_timer_refresh".into(),
                from: "event_timer".into(),
                to: "io_refresh_data".into(),
                edge_type: EdgeType::Flow,
            },
            GraphEdge {
                id: "edge_click_refresh".into(),
                from: "event_click_refresh".into(),
                to: "io_manual_refresh".into(),
                edge_type: EdgeType::Flow,
            },
        ],
    }
}

fn form_entry_graph() -> NormalizedGraph {
    NormalizedGraph {
        nodes: vec![
            GraphNode {
                id: "window_main".into(),
                kind: "structure.window".into(),
                category: "structure".into(),
                props: BTreeMap::from([
                    ("title".into(), serde_json::json!("Form Entry")),
                    ("width".into(), serde_json::json!(800)),
                    ("height".into(), serde_json::json!(700)),
                ]),
            },
            GraphNode {
                id: "screen_form".into(),
                kind: "structure.screen".into(),
                category: "structure".into(),
                props: BTreeMap::from([
                    ("name".into(), serde_json::json!("Form")),
                    ("route".into(), serde_json::json!("/")),
                ]),
            },
            GraphNode {
                id: "ui_input_name".into(),
                kind: "ui.input".into(),
                category: "ui".into(),
                props: BTreeMap::from([
                    ("placeholder".into(), serde_json::json!("Full name")),
                ]),
            },
            GraphNode {
                id: "ui_input_email".into(),
                kind: "ui.input".into(),
                category: "ui".into(),
                props: BTreeMap::from([
                    ("placeholder".into(), serde_json::json!("Email address")),
                ]),
            },
            GraphNode {
                id: "ui_select_category".into(),
                kind: "ui.select".into(),
                category: "ui".into(),
                props: BTreeMap::from([
                    ("label".into(), serde_json::json!("Category")),
                    ("options".into(), serde_json::json!(["Option A", "Option B", "Option C"])),
                ]),
            },
            GraphNode {
                id: "ui_textarea_notes".into(),
                kind: "ui.textarea".into(),
                category: "ui".into(),
                props: BTreeMap::from([
                    ("placeholder".into(), serde_json::json!("Additional notes...")),
                ]),
            },
            GraphNode {
                id: "ui_button_submit".into(),
                kind: "ui.button".into(),
                category: "ui".into(),
                props: BTreeMap::from([("label".into(), serde_json::json!("Submit"))]),
            },
            GraphNode {
                id: "ui_list_entries".into(),
                kind: "ui.list".into(),
                category: "ui".into(),
                props: BTreeMap::from([("collection".into(), serde_json::json!("entries"))]),
            },
            GraphNode {
                id: "event_start".into(),
                kind: "events.on_app_start".into(),
                category: "events".into(),
                props: BTreeMap::new(),
            },
            GraphNode {
                id: "io_load_entries".into(),
                kind: "io.load_local_data".into(),
                category: "io".into(),
                props: BTreeMap::from([("key".into(), serde_json::json!("form_entries"))]),
            },
            GraphNode {
                id: "event_submit".into(),
                kind: "events.on_submit".into(),
                category: "events".into(),
                props: BTreeMap::from([("target".into(), serde_json::json!("ui_button_submit"))]),
            },
            GraphNode {
                id: "state_add_entry".into(),
                kind: "state.add_item".into(),
                category: "state".into(),
                props: BTreeMap::from([
                    ("collection".into(), serde_json::json!("entries")),
                    ("value_ref".into(), serde_json::json!("form_data")),
                ]),
            },
            GraphNode {
                id: "io_save_entries".into(),
                kind: "io.save_local_data".into(),
                category: "io".into(),
                props: BTreeMap::from([("key".into(), serde_json::json!("form_entries"))]),
            },
        ],
        edges: vec![
            GraphEdge {
                id: "edge_window_screen".into(),
                from: "window_main".into(),
                to: "screen_form".into(),
                edge_type: EdgeType::Child,
            },
            GraphEdge {
                id: "edge_start_load".into(),
                from: "event_start".into(),
                to: "io_load_entries".into(),
                edge_type: EdgeType::Flow,
            },
            GraphEdge {
                id: "edge_submit_add".into(),
                from: "event_submit".into(),
                to: "state_add_entry".into(),
                edge_type: EdgeType::Flow,
            },
            GraphEdge {
                id: "edge_submit_save".into(),
                from: "event_submit".into(),
                to: "io_save_entries".into(),
                edge_type: EdgeType::Flow,
            },
        ],
    }
}

fn settings_tool_graph() -> NormalizedGraph {
    NormalizedGraph {
        nodes: vec![
            GraphNode {
                id: "window_main".into(),
                kind: "structure.window".into(),
                category: "structure".into(),
                props: BTreeMap::from([
                    ("title".into(), serde_json::json!("Settings")),
                    ("width".into(), serde_json::json!(700)),
                    ("height".into(), serde_json::json!(600)),
                ]),
            },
            GraphNode {
                id: "screen_settings".into(),
                kind: "structure.screen".into(),
                category: "structure".into(),
                props: BTreeMap::from([
                    ("name".into(), serde_json::json!("Settings")),
                    ("route".into(), serde_json::json!("/")),
                ]),
            },
            GraphNode {
                id: "ui_header".into(),
                kind: "ui.header".into(),
                category: "ui".into(),
                props: BTreeMap::from([("label".into(), serde_json::json!("Application Settings"))]),
            },
            GraphNode {
                id: "ui_input_username".into(),
                kind: "ui.input".into(),
                category: "ui".into(),
                props: BTreeMap::from([
                    ("placeholder".into(), serde_json::json!("Username")),
                ]),
            },
            GraphNode {
                id: "ui_input_theme".into(),
                kind: "ui.input".into(),
                category: "ui".into(),
                props: BTreeMap::from([
                    ("placeholder".into(), serde_json::json!("Theme (light/dark)")),
                ]),
            },
            GraphNode {
                id: "ui_toggle_notifications".into(),
                kind: "ui.toggle".into(),
                category: "ui".into(),
                props: BTreeMap::from([("label".into(), serde_json::json!("Enable Notifications"))]),
            },
            GraphNode {
                id: "ui_button_save".into(),
                kind: "ui.button".into(),
                category: "ui".into(),
                props: BTreeMap::from([("label".into(), serde_json::json!("Save Settings"))]),
            },
            GraphNode {
                id: "ui_button_reset".into(),
                kind: "ui.button".into(),
                category: "ui".into(),
                props: BTreeMap::from([("label".into(), serde_json::json!("Reset Defaults"))]),
            },
            GraphNode {
                id: "event_start".into(),
                kind: "events.on_app_start".into(),
                category: "events".into(),
                props: BTreeMap::new(),
            },
            GraphNode {
                id: "io_load_settings".into(),
                kind: "io.load_local_data".into(),
                category: "io".into(),
                props: BTreeMap::from([("key".into(), serde_json::json!("app_settings"))]),
            },
            GraphNode {
                id: "event_click_save".into(),
                kind: "events.on_click".into(),
                category: "events".into(),
                props: BTreeMap::from([("target".into(), serde_json::json!("ui_button_save"))]),
            },
            GraphNode {
                id: "io_save_settings".into(),
                kind: "io.save_local_data".into(),
                category: "io".into(),
                props: BTreeMap::from([("key".into(), serde_json::json!("app_settings"))]),
            },
            GraphNode {
                id: "event_click_reset".into(),
                kind: "events.on_click".into(),
                category: "events".into(),
                props: BTreeMap::from([("target".into(), serde_json::json!("ui_button_reset"))]),
            },
            GraphNode {
                id: "state_reset_settings".into(),
                kind: "state.set_variable".into(),
                category: "state".into(),
                props: BTreeMap::from([
                    ("variable".into(), serde_json::json!("app_settings")),
                    ("value".into(), serde_json::json!({})),
                ]),
            },
        ],
        edges: vec![
            GraphEdge {
                id: "edge_window_screen".into(),
                from: "window_main".into(),
                to: "screen_settings".into(),
                edge_type: EdgeType::Child,
            },
            GraphEdge {
                id: "edge_start_load".into(),
                from: "event_start".into(),
                to: "io_load_settings".into(),
                edge_type: EdgeType::Flow,
            },
            GraphEdge {
                id: "edge_save_settings".into(),
                from: "event_click_save".into(),
                to: "io_save_settings".into(),
                edge_type: EdgeType::Flow,
            },
            GraphEdge {
                id: "edge_reset_state".into(),
                from: "event_click_reset".into(),
                to: "state_reset_settings".into(),
                edge_type: EdgeType::Flow,
            },
        ],
    }
}

fn calculator_graph() -> NormalizedGraph {
    let mut nodes = vec![
        GraphNode {
            id: "window_main".into(),
            kind: "structure.window".into(),
            category: "structure".into(),
            props: BTreeMap::from([
                ("title".into(), serde_json::json!("Calculator")),
                ("width".into(), serde_json::json!(360)),
                ("height".into(), serde_json::json!(520)),
            ]),
        },
        GraphNode {
            id: "screen_home".into(),
            kind: "structure.screen".into(),
            category: "structure".into(),
            props: BTreeMap::from([
                ("name".into(), serde_json::json!("Home")),
                ("route".into(), serde_json::json!("/")),
            ]),
        },
        GraphNode {
            id: "ui_display".into(),
            kind: "ui.text".into(),
            category: "ui".into(),
            // `text_ref` binds the rendered text to the `display`
            // variable, so `state.set_variable name="display"` clicks
            // update the visible value end-to-end. The `text` prop
            // remains as a static placeholder for tooling that doesn't
            // honor text_ref.
            props: BTreeMap::from([
                ("text".into(), serde_json::json!("0")),
                ("text_ref".into(), serde_json::json!("display")),
            ]),
        },
        GraphNode {
            id: "event_start".into(),
            kind: "events.on_app_start".into(),
            category: "events".into(),
            props: BTreeMap::new(),
        },
        GraphNode {
            id: "state_init_display".into(),
            kind: "state.set_variable".into(),
            category: "state".into(),
            props: BTreeMap::from([
                ("name".into(), serde_json::json!("display")),
                ("value".into(), serde_json::json!("0")),
            ]),
        },
    ];

    let mut edges = vec![
        GraphEdge {
            id: "edge_window_screen".into(),
            from: "window_main".into(),
            to: "screen_home".into(),
            edge_type: EdgeType::Child,
        },
        GraphEdge {
            id: "edge_start_init".into(),
            from: "event_start".into(),
            to: "state_init_display".into(),
            edge_type: EdgeType::Flow,
        },
    ];

    // Number buttons 0–9 + operators arranged as a calculator pad.
    let buttons = [
        ("btn_clear", "C"),
        ("btn_div", "÷"),
        ("btn_mul", "×"),
        ("btn_back", "⌫"),
        ("btn_7", "7"),
        ("btn_8", "8"),
        ("btn_9", "9"),
        ("btn_sub", "−"),
        ("btn_4", "4"),
        ("btn_5", "5"),
        ("btn_6", "6"),
        ("btn_add", "+"),
        ("btn_1", "1"),
        ("btn_2", "2"),
        ("btn_3", "3"),
        ("btn_eq", "="),
        ("btn_0", "0"),
        ("btn_dot", "."),
    ];

    for (id, label) in buttons {
        nodes.push(GraphNode {
            id: id.into(),
            kind: "ui.button".into(),
            category: "ui".into(),
            props: BTreeMap::from([("label".into(), serde_json::json!(label))]),
        });
        nodes.push(GraphNode {
            id: format!("event_click_{}", id),
            kind: "events.on_click".into(),
            category: "events".into(),
            props: BTreeMap::from([("target".into(), serde_json::json!(id))]),
        });
        // `state.calc_press` is interpreted by the codegen as one tick
        // of a four-banger calculator state machine. The button label
        // doubles as the token (digits, operators, "C", "⌫", ".").
        nodes.push(GraphNode {
            id: format!("state_press_{}", id),
            kind: "state.calc_press".into(),
            category: "state".into(),
            props: BTreeMap::from([
                ("variable".into(), serde_json::json!("display")),
                ("value".into(), serde_json::json!(label)),
            ]),
        });
        edges.push(GraphEdge {
            id: format!("edge_click_{}_state", id),
            from: format!("event_click_{}", id),
            to: format!("state_press_{}", id),
            edge_type: EdgeType::Flow,
        });
    }

    NormalizedGraph { nodes, edges }
}

fn pomodoro_timer_graph() -> NormalizedGraph {
    NormalizedGraph {
        nodes: vec![
            GraphNode {
                id: "window_main".into(),
                kind: "structure.window".into(),
                category: "structure".into(),
                props: BTreeMap::from([
                    ("title".into(), serde_json::json!("Pomodoro Timer")),
                    ("width".into(), serde_json::json!(420)),
                    ("height".into(), serde_json::json!(360)),
                ]),
            },
            GraphNode {
                id: "screen_home".into(),
                kind: "structure.screen".into(),
                category: "structure".into(),
                props: BTreeMap::from([
                    ("name".into(), serde_json::json!("Focus")),
                    ("route".into(), serde_json::json!("/")),
                ]),
            },
            GraphNode {
                id: "ui_header".into(),
                kind: "ui.header".into(),
                category: "ui".into(),
                props: BTreeMap::from([("title".into(), serde_json::json!("Pomodoro"))]),
            },
            GraphNode {
                id: "ui_time_display".into(),
                kind: "ui.text".into(),
                category: "ui".into(),
                props: BTreeMap::from([("text".into(), serde_json::json!("25:00"))]),
            },
            GraphNode {
                id: "ui_phase_label".into(),
                kind: "ui.text".into(),
                category: "ui".into(),
                props: BTreeMap::from([("text".into(), serde_json::json!("Focus session"))]),
            },
            GraphNode {
                id: "ui_start_btn".into(),
                kind: "ui.button".into(),
                category: "ui".into(),
                props: BTreeMap::from([("label".into(), serde_json::json!("Start"))]),
            },
            GraphNode {
                id: "ui_pause_btn".into(),
                kind: "ui.button".into(),
                category: "ui".into(),
                props: BTreeMap::from([("label".into(), serde_json::json!("Pause"))]),
            },
            GraphNode {
                id: "ui_reset_btn".into(),
                kind: "ui.button".into(),
                category: "ui".into(),
                props: BTreeMap::from([("label".into(), serde_json::json!("Reset"))]),
            },
            GraphNode {
                id: "event_start".into(),
                kind: "events.on_app_start".into(),
                category: "events".into(),
                props: BTreeMap::new(),
            },
            GraphNode {
                id: "state_init_seconds".into(),
                kind: "state.set_variable".into(),
                category: "state".into(),
                props: BTreeMap::from([
                    ("name".into(), serde_json::json!("seconds_remaining")),
                    ("value".into(), serde_json::json!(1500)),
                ]),
            },
            GraphNode {
                id: "event_tick".into(),
                kind: "events.on_timer".into(),
                category: "events".into(),
                props: BTreeMap::from([("interval".into(), serde_json::json!(1000))]),
            },
            GraphNode {
                id: "state_decrement_tick".into(),
                kind: "state.set_variable".into(),
                category: "state".into(),
                props: BTreeMap::from([
                    ("name".into(), serde_json::json!("seconds_remaining")),
                    ("expression".into(), serde_json::json!("seconds_remaining - 1")),
                ]),
            },
            GraphNode {
                id: "event_click_start".into(),
                kind: "events.on_click".into(),
                category: "events".into(),
                props: BTreeMap::from([("target".into(), serde_json::json!("ui_start_btn"))]),
            },
            GraphNode {
                id: "state_set_running".into(),
                kind: "state.set_variable".into(),
                category: "state".into(),
                props: BTreeMap::from([
                    ("name".into(), serde_json::json!("running")),
                    ("value".into(), serde_json::json!(true)),
                ]),
            },
            GraphNode {
                id: "event_click_pause".into(),
                kind: "events.on_click".into(),
                category: "events".into(),
                props: BTreeMap::from([("target".into(), serde_json::json!("ui_pause_btn"))]),
            },
            GraphNode {
                id: "state_clear_running".into(),
                kind: "state.set_variable".into(),
                category: "state".into(),
                props: BTreeMap::from([
                    ("name".into(), serde_json::json!("running")),
                    ("value".into(), serde_json::json!(false)),
                ]),
            },
            GraphNode {
                id: "event_click_reset".into(),
                kind: "events.on_click".into(),
                category: "events".into(),
                props: BTreeMap::from([("target".into(), serde_json::json!("ui_reset_btn"))]),
            },
            GraphNode {
                id: "state_reset_seconds".into(),
                kind: "state.set_variable".into(),
                category: "state".into(),
                props: BTreeMap::from([
                    ("name".into(), serde_json::json!("seconds_remaining")),
                    ("value".into(), serde_json::json!(1500)),
                ]),
            },
        ],
        edges: vec![
            GraphEdge {
                id: "edge_window_screen".into(),
                from: "window_main".into(),
                to: "screen_home".into(),
                edge_type: EdgeType::Child,
            },
            GraphEdge {
                id: "edge_start_init".into(),
                from: "event_start".into(),
                to: "state_init_seconds".into(),
                edge_type: EdgeType::Flow,
            },
            GraphEdge {
                id: "edge_tick_decrement".into(),
                from: "event_tick".into(),
                to: "state_decrement_tick".into(),
                edge_type: EdgeType::Flow,
            },
            GraphEdge {
                id: "edge_click_start_run".into(),
                from: "event_click_start".into(),
                to: "state_set_running".into(),
                edge_type: EdgeType::Flow,
            },
            GraphEdge {
                id: "edge_click_pause_clear".into(),
                from: "event_click_pause".into(),
                to: "state_clear_running".into(),
                edge_type: EdgeType::Flow,
            },
            GraphEdge {
                id: "edge_click_reset_secs".into(),
                from: "event_click_reset".into(),
                to: "state_reset_seconds".into(),
                edge_type: EdgeType::Flow,
            },
        ],
    }
}

fn recipe_card_graph() -> NormalizedGraph {
    NormalizedGraph {
        nodes: vec![
            GraphNode {
                id: "window_main".into(),
                kind: "structure.window".into(),
                category: "structure".into(),
                props: BTreeMap::from([
                    ("title".into(), serde_json::json!("Recipe Card")),
                    ("width".into(), serde_json::json!(640)),
                    ("height".into(), serde_json::json!(720)),
                ]),
            },
            GraphNode {
                id: "screen_home".into(),
                kind: "structure.screen".into(),
                category: "structure".into(),
                props: BTreeMap::from([
                    ("name".into(), serde_json::json!("Recipe")),
                    ("route".into(), serde_json::json!("/")),
                ]),
            },
            GraphNode {
                id: "ui_header".into(),
                kind: "ui.header".into(),
                category: "ui".into(),
                props: BTreeMap::from([(
                    "title".into(),
                    serde_json::json!("Pasta al Pomodoro"),
                )]),
            },
            GraphNode {
                id: "ui_summary".into(),
                kind: "ui.text".into(),
                category: "ui".into(),
                props: BTreeMap::from([(
                    "text".into(),
                    serde_json::json!("Serves 4 · 25 minutes · Easy"),
                )]),
            },
            GraphNode {
                id: "ui_ingredients_title".into(),
                kind: "ui.text".into(),
                category: "ui".into(),
                props: BTreeMap::from([("text".into(), serde_json::json!("Ingredients"))]),
            },
            GraphNode {
                id: "ui_ingredients".into(),
                kind: "ui.textarea".into(),
                category: "ui".into(),
                props: BTreeMap::from([
                    (
                        "placeholder".into(),
                        serde_json::json!("400g spaghetti\n800g canned tomatoes\n4 garlic cloves\nfresh basil\nolive oil, salt"),
                    ),
                    ("rows".into(), serde_json::json!(6)),
                ]),
            },
            GraphNode {
                id: "ui_steps_title".into(),
                kind: "ui.text".into(),
                category: "ui".into(),
                props: BTreeMap::from([("text".into(), serde_json::json!("Steps"))]),
            },
            GraphNode {
                id: "ui_steps".into(),
                kind: "ui.textarea".into(),
                category: "ui".into(),
                props: BTreeMap::from([
                    (
                        "placeholder".into(),
                        serde_json::json!("1. Boil salted water and cook spaghetti al dente.\n2. Sauté sliced garlic in olive oil until fragrant.\n3. Add tomatoes, simmer 10 minutes, season.\n4. Toss pasta with sauce, finish with basil."),
                    ),
                    ("rows".into(), serde_json::json!(8)),
                ]),
            },
            GraphNode {
                id: "ui_save_btn".into(),
                kind: "ui.button".into(),
                category: "ui".into(),
                props: BTreeMap::from([("label".into(), serde_json::json!("Save Recipe"))]),
            },
            GraphNode {
                id: "event_save_click".into(),
                kind: "events.on_click".into(),
                category: "events".into(),
                props: BTreeMap::from([("target".into(), serde_json::json!("ui_save_btn"))]),
            },
            GraphNode {
                id: "io_save_recipe".into(),
                kind: "io.save_local_data".into(),
                category: "io".into(),
                props: BTreeMap::from([("key".into(), serde_json::json!("recipe"))]),
            },
        ],
        edges: vec![
            GraphEdge {
                id: "edge_window_screen".into(),
                from: "window_main".into(),
                to: "screen_home".into(),
                edge_type: EdgeType::Child,
            },
            GraphEdge {
                id: "edge_save_click_io".into(),
                from: "event_save_click".into(),
                to: "io_save_recipe".into(),
                edge_type: EdgeType::Flow,
            },
        ],
    }
}

fn slugify(input: &str) -> String {
    input
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    const ALL_TEMPLATES: &[&str] = &[
        "notes",
        "checklist",
        "content-editor",
        "dashboard",
        "form-entry",
        "settings-tool",
        "calculator",
        "pomodoro-timer",
        "recipe-card",
    ];

    #[test]
    fn all_templates_return_correct_app_name() {
        for id in ALL_TEMPLATES {
            let project = instantiate_template(id, "TestApp");
            assert_eq!(project.project.app_name, "TestApp", "template {id}: wrong app_name");
        }
    }

    #[test]
    fn each_template_has_nonempty_graph_with_edges() {
        for id in ALL_TEMPLATES {
            let project = instantiate_template(id, "TestApp");
            assert!(
                !project.normalized_graph.nodes.is_empty(),
                "template {id}: graph has no nodes"
            );
            assert!(
                !project.normalized_graph.edges.is_empty(),
                "template {id}: graph has no edges"
            );
        }
    }

    #[test]
    fn unknown_template_falls_back_gracefully() {
        let project = instantiate_template("nonexistent-template", "FallbackApp");
        assert_eq!(project.project.app_name, "FallbackApp");
        assert!(!project.normalized_graph.nodes.is_empty());
    }

    #[test]
    fn package_id_is_slugified() {
        let project = instantiate_template("notes", "My Cool App");
        assert_eq!(project.project.package_id, "com.warpforge.my-cool-app");
    }

    #[test]
    fn ai_history_starts_empty() {
        for id in ALL_TEMPLATES {
            let project = instantiate_template(id, "TestApp");
            assert!(project.ai_history.is_empty(), "template {id}: ai_history not empty");
        }
    }
}
