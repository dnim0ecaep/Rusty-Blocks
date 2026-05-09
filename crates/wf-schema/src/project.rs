use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::workspace::{NormalizedGraph, WorkspaceState};

pub const PROJECT_SCHEMA_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ProjectFile {
    pub schema_version: u32,
    pub project: ProjectMetadata,
    pub workspace_state: WorkspaceState,
    pub normalized_graph: NormalizedGraph,
    pub ir_snapshot: Option<Value>,
    pub assets: Vec<AssetRecord>,
    pub ai_history: Vec<AiHistoryEntry>,
    /// Sprite/stage runtime state. Stored opaquely as JSON because the
    /// front-end owns the schema; the IR pipeline does not consume it.
    /// Optional + skipped when None so older project files keep loading.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stage_state: Option<Value>,
    pub settings: ProjectSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ProjectMetadata {
    pub id: String,
    pub app_name: String,
    pub package_id: String,
    pub version: String,
    pub author: String,
    pub description: String,
    pub target_type: TargetType,
    pub theme: ThemeMode,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    /// Custom sprite-stage logical dimensions (Scratch coordinate space).
    /// Optional — older project files don't carry these; the IR fills in
    /// 480 × 360 (Scratch defaults) when absent. Only meaningful for
    /// sprite-runtime projects; ignored when `stage_state` is None.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stage_width: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stage_height: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum TargetType {
    DesktopSlint,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ThemeMode {
    Auto,
    Light,
    Dark,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ProjectSettings {
    pub autosave_interval_secs: u64,
    pub validate_on_change: bool,
    pub codegen_deterministic: bool,
    pub ai_default_text_provider: String,
    pub ai_default_image_provider: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AssetRecord {
    pub id: String,
    pub kind: AssetKind,
    pub path: String,
    pub prompt: Option<String>,
    pub metadata: Value,
    pub created_at: DateTime<Utc>,
    pub version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum AssetKind {
    Icon,
    Image,
    TextSnippet,
    Prompt,
    Screenshot,
    /// Sprite costume — image (SVG/PNG) embedded as base64 in `path`.
    Costume,
    /// Sprite sound — audio (WAV/MP3) embedded as base64 in `path`.
    Sound,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AiHistoryEntry {
    pub id: String,
    pub mode: AiMode,
    pub prompt: String,
    pub response: Value,
    pub created_at: DateTime<Utc>,
    pub provider: String,
    pub linked_asset_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum AiMode {
    Text,
    Image,
    Recommendation,
    Explanation,
}
