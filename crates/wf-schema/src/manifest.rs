use chrono::{DateTime, Utc};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ExportManifest {
    pub project_id: String,
    pub project_name: String,
    pub source_dir: String,
    pub bundle_path: Option<String>,
    pub generated_files: Vec<String>,
    pub created_at: DateTime<Utc>,
    pub generator_version: String,
}
