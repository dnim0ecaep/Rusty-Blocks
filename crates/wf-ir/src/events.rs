use std::collections::BTreeMap;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct EventHandlerIr {
    pub id: String,
    pub trigger: EventTrigger,
    pub target: Option<String>,
    pub actions: Vec<ActionIr>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum EventTrigger {
    AppStart,
    Click,
    Change,
    Submit,
    Timer,
    Navigation,
    EventReceived,
    Unknown(String),
}

impl EventTrigger {
    pub fn from_block_kind(kind: &str) -> Self {
        match kind {
            "events.on_app_start" => Self::AppStart,
            "events.on_click" => Self::Click,
            "events.on_change" => Self::Change,
            "events.on_submit" => Self::Submit,
            "events.on_timer" => Self::Timer,
            "events.on_navigation" => Self::Navigation,
            "events.on_event_received" => Self::EventReceived,
            other => Self::Unknown(other.to_owned()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ActionIr {
    pub id: String,
    pub kind: String,
    pub args: BTreeMap<String, Value>,
}
