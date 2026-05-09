use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::{AiTaskIr, CollectionIr, ComponentIr, DataModelIr, EventHandlerIr, ScreenIr};

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AppIr {
    pub ir_version: u32,
    pub meta: AppMeta,
    pub target: TargetProfile,
    pub windows: Vec<WindowIr>,
    pub routes: Vec<String>,
    pub screens: Vec<ScreenIr>,
    pub components: Vec<ComponentIr>,
    pub data_models: Vec<DataModelIr>,
    pub collections: Vec<CollectionIr>,
    pub event_handlers: Vec<EventHandlerIr>,
    pub services: Vec<ServiceIr>,
    pub resources: Vec<ResourceIr>,
    pub ai_tasks: Vec<AiTaskIr>,
    pub export_profile: ExportProfile,
    /// Optional sprite-runtime stage carried verbatim from the project's
    /// `stage_state`. When present, codegen replaces the screen UI with
    /// a sprite stage view and embeds the sprite-runtime engine.
    /// Absent for non-sprite projects (the existing codegen examples).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sprite_stage: Option<SpriteStageIr>,
}

/// Sprite-runtime stage info, projected verbatim from the studio's
/// `stage_state` JSON. Stored as `serde_json::Value` so wf-ir doesn't
/// need to know about Sprite/ScriptNode types — codegen unpacks it.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct SpriteStageIr {
    /// Logical stage dimensions in Scratch coordinate space (e.g.
    /// 480 × 360 by default). The Slint codegen multiplies by its own
    /// RENDER_SCALE for the actual window size, and uses these values
    /// directly for sprite-coordinate ↔ pixel conversion.
    pub width: u32,
    pub height: u32,
    /// The original `stage_state` object, byte-identical to what the
    /// studio writes. Codegen passes this through to project.json so the
    /// generated binary's sprite-runtime engine can hydrate from it.
    #[schemars(skip)]
    pub stage_state: serde_json::Value,
    /// Project assets (costumes + sounds) carried verbatim. Costume
    /// blobs are base64 data URLs the runtime decodes to slint::Image at
    /// startup; sounds are decoded via rodio when audio is enabled.
    #[serde(default)]
    #[schemars(skip)]
    pub assets: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AppMeta {
    pub app_name: String,
    pub package_id: String,
    pub version: String,
    pub author: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct TargetProfile {
    pub platform: String,
    pub ui_stack: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct WindowIr {
    pub id: String,
    pub title: String,
    pub root_screen: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ServiceIr {
    pub id: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ResourceIr {
    pub id: String,
    pub kind: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ExportProfile {
    pub include_bundle: bool,
    pub include_source: bool,
    pub deterministic: bool,
}
