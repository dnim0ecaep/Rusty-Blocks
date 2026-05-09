use wf_graph::{DefaultGraphParser, GraphParser};
use wf_ir::{
    AiTaskIr, AiTaskMode, AppIr, AppMeta, CollectionIr, ComponentIr, ComponentKind, DataModelIr,
    EventHandlerIr, EventTrigger, ExportProfile, ResourceIr, ScreenIr, TargetProfile, WindowIr,
};
use wf_ir::build_ir;
use wf_template::instantiate_template;
use wf_validate::{diagnostics::Severity, DefaultIrValidator, IrValidator};

fn base_ir() -> AppIr {
    AppIr {
        ir_version: 1,
        meta: AppMeta {
            app_name: "TestApp".into(),
            package_id: "com.test.app".into(),
            version: "0.1.0".into(),
            author: "Tester".into(),
            description: "Test".into(),
        },
        target: TargetProfile {
            platform: "desktop".into(),
            ui_stack: "slint".into(),
        },
        windows: vec![WindowIr {
            id: "w1".into(),
            title: "Test".into(),
            root_screen: "s1".into(),
            width: 800,
            height: 600,
        }],
        routes: vec!["/".into()],
        screens: vec![ScreenIr {
            id: "s1".into(),
            name: "Home".into(),
            route: "/".into(),
            components: vec![],
        }],
        components: vec![],
        data_models: vec![DataModelIr { id: "m1".into(), name: "M1".into(), fields: vec![] }],
        collections: vec![CollectionIr {
            name: "items".into(),
            item_type: wf_ir::TypeRef::Scalar(wf_ir::ScalarType::String),
        }],
        event_handlers: vec![EventHandlerIr {
            id: "e1".into(),
            trigger: EventTrigger::AppStart,
            target: None,
            actions: vec![],
        }],
        services: vec![],
        resources: vec![],
        ai_tasks: vec![],
        export_profile: ExportProfile {
            include_bundle: true,
            include_source: true,
            deterministic: true,
        },
        sprite_stage: None,
    }
}

fn codes(ir: &AppIr) -> Vec<String> {
    DefaultIrValidator.validate(ir).into_iter().map(|d| d.code).collect()
}

fn errors(ir: &AppIr) -> Vec<String> {
    DefaultIrValidator.validate(ir)
        .into_iter()
        .filter(|d| d.severity == Severity::Error)
        .map(|d| d.code)
        .collect()
}

fn warnings(ir: &AppIr) -> Vec<String> {
    DefaultIrValidator.validate(ir)
        .into_iter()
        .filter(|d| d.severity == Severity::Warning)
        .map(|d| d.code)
        .collect()
}

#[test]
fn all_templates_validate_without_errors() {
    let templates = [
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
    for template_id in templates {
        let project = instantiate_template(template_id, "TestApp");
        let graph = DefaultGraphParser
            .parse_project(&project)
            .expect(&format!("{template_id}: graph parse"));
        let ir = build_ir(&project, &graph).expect(&format!("{template_id}: ir build"));
        let diagnostics = DefaultIrValidator.validate(&ir);

        let errors: Vec<_> = diagnostics
            .iter()
            .filter(|d| d.severity == Severity::Error)
            .collect();

        assert!(errors.is_empty(), "{template_id}: unexpected errors: {errors:?}");
    }
}

#[test]
fn wfn001_empty_app_name() {
    let mut ir = base_ir();
    ir.meta.app_name = "".into();
    assert!(errors(&ir).contains(&"WFN001".to_string()));
    assert!(errors(&base_ir()).iter().all(|c| c != "WFN001"));
}

#[test]
fn wfn002_invalid_package_id() {
    let mut ir = base_ir();
    ir.meta.package_id = "NotADomain".into();
    assert!(errors(&ir).contains(&"WFN002".to_string()));

    let mut ir2 = base_ir();
    ir2.meta.package_id = "com.UPPER.case".into();
    assert!(errors(&ir2).contains(&"WFN002".to_string()));

    assert!(errors(&base_ir()).iter().all(|c| c != "WFN002"));
}

#[test]
fn wfr001_unknown_root_screen() {
    let mut ir = base_ir();
    ir.windows[0].root_screen = "nonexistent_screen".into();
    assert!(errors(&ir).contains(&"WFR001".to_string()));
    assert!(errors(&base_ir()).iter().all(|c| c != "WFR001"));
}

#[test]
fn wfr002_unknown_component_reference() {
    let mut ir = base_ir();
    ir.screens[0].components = vec!["ghost_component".into()];
    assert!(errors(&ir).contains(&"WFR002".to_string()));
    assert!(errors(&base_ir()).iter().all(|c| c != "WFR002"));
}

#[test]
fn wfs001_no_windows() {
    let mut ir = base_ir();
    ir.windows.clear();
    assert!(errors(&ir).contains(&"WFS001".to_string()));
    assert!(errors(&base_ir()).iter().all(|c| c != "WFS001"));
}

#[test]
fn wfs002_no_screens() {
    let mut ir = base_ir();
    ir.screens.clear();
    assert!(errors(&ir).contains(&"WFS002".to_string()));
    assert!(errors(&base_ir()).iter().all(|c| c != "WFS002"));
}

#[test]
fn wfs003_no_event_handlers_is_warning_not_error() {
    let mut ir = base_ir();
    ir.event_handlers.clear();
    let diags = DefaultIrValidator.validate(&ir);
    assert!(diags.iter().any(|d| d.code == "WFS003" && d.severity == Severity::Warning));
    assert!(diags.iter().all(|d| d.code != "WFS003" || d.severity != Severity::Error));
    assert!(warnings(&base_ir()).iter().all(|c| c != "WFS003"));
}

#[test]
fn wfs003_suppressed_when_sprite_stage_has_scripts() {
    // Sprite projects keep interactivity in stage_state.sprites[].scripts_xml,
    // not in IR event_handlers — so an empty event_handlers list is *not*
    // an interactivity gap there.
    let mut ir = base_ir();
    ir.event_handlers.clear();
    ir.sprite_stage = Some(wf_ir::SpriteStageIr {
        width: 480,
        height: 360,
        assets: serde_json::Value::Array(Vec::new()),
        stage_state: serde_json::json!({
            "sprites": [{
                "id": "s1",
                "name": "Friend",
                "scripts_xml": "<xml><block type=\"scratch_event_when_flag_clicked\"/></xml>"
            }]
        }),
    });
    assert!(
        warnings(&ir).iter().all(|c| c != "WFS003"),
        "WFS003 should be suppressed when a sprite carries scripts_xml",
    );

    // But an empty sprite stage (no scripts) still triggers the warning.
    let mut ir_empty = base_ir();
    ir_empty.event_handlers.clear();
    ir_empty.sprite_stage = Some(wf_ir::SpriteStageIr {
        width: 480,
        height: 360,
        assets: serde_json::Value::Array(Vec::new()),
        stage_state: serde_json::json!({
            "sprites": [{ "id": "s1", "scripts_xml": "" }]
        }),
    });
    assert!(warnings(&ir_empty).contains(&"WFS003".to_string()));
}

#[test]
fn wft001_unsupported_ui_stack() {
    let mut ir = base_ir();
    ir.target.ui_stack = "flutter".into();
    assert!(errors(&ir).contains(&"WFT001".to_string()));
    assert!(errors(&base_ir()).iter().all(|c| c != "WFT001"));
}

#[test]
fn wft002_unknown_component_kind_is_warning() {
    let mut ir = base_ir();
    ir.components.push(ComponentIr {
        id: "c_unknown".into(),
        kind: ComponentKind::Unknown("ui.custom_widget".into()),
        label: None,
        props: Default::default(),
    });
    let diags = DefaultIrValidator.validate(&ir);
    assert!(diags.iter().any(|d| d.code == "WFT002" && d.severity == Severity::Warning));
    assert!(codes(&base_ir()).iter().all(|c| c != "WFT002"));
}

#[test]
fn wfa001_resource_with_empty_path() {
    let mut ir = base_ir();
    ir.resources.push(ResourceIr {
        id: "res1".into(),
        kind: "image".into(),
        path: "   ".into(),
    });
    assert!(errors(&ir).contains(&"WFA001".to_string()));
    assert!(errors(&base_ir()).iter().all(|c| c != "WFA001"));
}

#[test]
fn wfi001_ai_task_with_empty_prompt() {
    let mut ir = base_ir();
    ir.ai_tasks.push(AiTaskIr {
        id: "ai1".into(),
        mode: AiTaskMode::Text,
        prompt: "".into(),
        output_asset_id: None,
    });
    assert!(errors(&ir).contains(&"WFI001".to_string()));
    assert!(errors(&base_ir()).iter().all(|c| c != "WFI001"));
}
