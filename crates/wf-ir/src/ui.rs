use std::collections::BTreeMap;

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ScreenIr {
    pub id: String,
    pub name: String,
    pub route: String,
    pub components: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct ComponentIr {
    pub id: String,
    pub kind: ComponentKind,
    pub label: Option<String>,
    pub props: BTreeMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ComponentKind {
    Button,
    Text,
    Input,
    Textarea,
    Select,
    Checkbox,
    Toggle,
    Image,
    Icon,
    Card,
    List,
    Table,
    Tabs,
    Sidebar,
    Header,
    Footer,
    Modal,
    Unknown(String),
}

impl ComponentKind {
    pub fn from_block_kind(kind: &str) -> Self {
        match kind {
            "ui.button" => Self::Button,
            "ui.text" => Self::Text,
            "ui.input" => Self::Input,
            "ui.textarea" => Self::Textarea,
            "ui.select" => Self::Select,
            "ui.checkbox" => Self::Checkbox,
            "ui.toggle" => Self::Toggle,
            "ui.image" => Self::Image,
            "ui.icon" => Self::Icon,
            "ui.card" => Self::Card,
            "ui.list" => Self::List,
            "ui.table" => Self::Table,
            "ui.tabs" => Self::Tabs,
            "ui.sidebar" => Self::Sidebar,
            "ui.header" => Self::Header,
            "ui.footer" => Self::Footer,
            "ui.modal" => Self::Modal,
            other => Self::Unknown(other.to_owned()),
        }
    }
}
