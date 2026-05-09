pub mod ai;
pub mod app;
pub mod data;
pub mod events;
pub mod ui;

use std::collections::BTreeMap;

use crate::app::{
    AppIr as IrAppIr, AppMeta as IrAppMeta, ExportProfile as IrExportProfile,
    SpriteStageIr as IrSpriteStageIr, TargetProfile as IrTargetProfile,
    WindowIr as IrWindowIr,
};
use crate::data::{
    CollectionIr as IrCollectionIr, DataModelIr as IrDataModelIr, ScalarType as IrScalarType,
    TypeRef as IrTypeRef,
};
use crate::events::{
    ActionIr as IrActionIr, EventHandlerIr as IrEventHandlerIr, EventTrigger as IrEventTrigger,
};
use thiserror::Error;
use crate::ui::{
    ComponentIr as IrComponentIr, ComponentKind as IrComponentKind, ScreenIr as IrScreenIr,
};
use wf_graph::ParsedGraph;
use wf_schema::ProjectFile;

pub use ai::*;
pub use app::*;
pub use data::*;
pub use events::*;
pub use ui::*;

pub const IR_VERSION: u32 = 1;

#[derive(Debug, Error)]
pub enum IrBuildError {
    #[error("missing screen nodes")]
    MissingScreens,
}

pub fn build_ir(project: &ProjectFile, graph: &ParsedGraph) -> Result<IrAppIr, IrBuildError> {
    let mut screens: Vec<IrScreenIr> = graph
        .nodes
        .iter()
        .filter(|node| node.kind == "structure.screen")
        .map(|node| IrScreenIr {
            id: node.id.clone(),
            name: node
                .props
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("Screen")
                .to_owned(),
            route: node
                .props
                .get("route")
                .and_then(|v| v.as_str())
                .unwrap_or("/")
                .to_owned(),
            components: vec![],
        })
        .collect();

    if screens.is_empty() {
        return Err(IrBuildError::MissingScreens);
    }

    screens.sort_by(|a, b| a.id.cmp(&b.id));

    let components: Vec<IrComponentIr> = graph
        .nodes
        .iter()
        .filter(|node| node.category == "ui")
        .map(|node| IrComponentIr {
            id: node.id.clone(),
            kind: IrComponentKind::from_block_kind(&node.kind),
            label: node
                .props
                .get("label")
                .and_then(|v| v.as_str())
                .map(ToOwned::to_owned),
            props: BTreeMap::from_iter(node.props.iter().map(|(k, v)| (k.clone(), v.clone()))),
        })
        .collect();

    for screen in &mut screens {
        screen.components = components
            .iter()
            .map(|component| component.id.clone())
            .collect();
    }

    let windows: Vec<IrWindowIr> = graph
        .nodes
        .iter()
        .filter(|node| node.kind == "structure.window")
        .map(|node| IrWindowIr {
            id: node.id.clone(),
            title: node
                .props
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or(&project.project.app_name)
                .to_owned(),
            root_screen: screens[0].id.clone(),
            width: node
                .props
                .get("width")
                .and_then(|v| v.as_u64())
                .unwrap_or(1024) as u32,
            height: node
                .props
                .get("height")
                .and_then(|v| v.as_u64())
                .unwrap_or(768) as u32,
        })
        .collect();

    let mut event_handlers: Vec<IrEventHandlerIr> = graph
        .nodes
        .iter()
        .filter(|node| node.category == "events")
        .map(|node| IrEventHandlerIr {
            id: node.id.clone(),
            trigger: IrEventTrigger::from_block_kind(&node.kind),
            target: node
                .props
                .get("target")
                .and_then(|v| v.as_str())
                .map(ToOwned::to_owned),
            actions: vec![],
        })
        .collect();

    let action_lookup: BTreeMap<String, IrActionIr> = graph
        .nodes
        .iter()
        .filter(|node| matches!(node.category.as_str(), "io" | "network" | "state" | "ai" | "logic"))
        .map(|node| {
            (
                node.id.clone(),
                IrActionIr {
                    id: node.id.clone(),
                    kind: node.kind.clone(),
                    args: BTreeMap::from_iter(node.props.iter().map(|(k, v)| (k.clone(), v.clone()))),
                },
            )
        })
        .collect();

    for handler in &mut event_handlers {
        let action_ids: Vec<String> = graph
            .edges
            .iter()
            .filter(|edge| edge.from == handler.id)
            .map(|edge| edge.to.clone())
            .collect();

        handler.actions = action_ids
            .iter()
            .filter_map(|id| action_lookup.get(id).cloned())
            .collect();
    }

    event_handlers.sort_by(|a, b| a.id.cmp(&b.id));

    let data_models = vec![IrDataModelIr {
        id: "app_state".into(),
        name: "AppState".into(),
        fields: vec![],
    }];

    let collections = vec![IrCollectionIr {
        name: "items".into(),
        item_type: IrTypeRef::Scalar(IrScalarType::String),
    }];

    Ok(IrAppIr {
        ir_version: IR_VERSION,
        meta: IrAppMeta {
            app_name: project.project.app_name.clone(),
            package_id: project.project.package_id.clone(),
            version: project.project.version.clone(),
            author: project.project.author.clone(),
            description: project.project.description.clone(),
        },
        target: IrTargetProfile {
            platform: "desktop".into(),
            ui_stack: "slint".into(),
        },
        windows,
        routes: screens.iter().map(|screen| screen.route.clone()).collect(),
        screens,
        components,
        data_models,
        collections,
        event_handlers,
        services: vec![],
        resources: vec![],
        ai_tasks: vec![],
        export_profile: IrExportProfile {
            include_bundle: true,
            include_source: true,
            deterministic: true,
        },
        sprite_stage: build_sprite_stage(project),
    })
}

/// Pull the project's `stage_state` into IR if it actually contains
/// sprites. Empty / absent stages return None so non-sprite projects
/// take the original codegen path unchanged.
fn build_sprite_stage(project: &ProjectFile) -> Option<IrSpriteStageIr> {
    let stage = project.stage_state.as_ref()?;
    let sprites = stage.get("sprites").and_then(|v| v.as_array())?;
    if sprites.is_empty() {
        return None;
    }
    // Logical stage dims: read from the project's metadata when present,
    // otherwise fall back to Scratch defaults. Codegen later multiplies
    // these by its own RENDER_SCALE for the window. Clamp to a sane
    // range so a corrupt project file can't emit a 0-sized window.
    let stage_width = project
        .project
        .stage_width
        .filter(|w| (60..=4096).contains(w))
        .unwrap_or(480);
    let stage_height = project
        .project
        .stage_height
        .filter(|h| (60..=4096).contains(h))
        .unwrap_or(360);
    let assets = serde_json::to_value(&project.assets).unwrap_or(serde_json::Value::Array(Vec::new()));
    Some(IrSpriteStageIr {
        width: stage_width,
        height: stage_height,
        stage_state: stage.clone(),
        assets,
    })
}
