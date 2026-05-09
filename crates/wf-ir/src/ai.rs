use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct AiTaskIr {
    pub id: String,
    pub mode: AiTaskMode,
    pub prompt: String,
    pub output_asset_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum AiTaskMode {
    Text,
    Image,
    Recommendation,
    Explanation,
}
