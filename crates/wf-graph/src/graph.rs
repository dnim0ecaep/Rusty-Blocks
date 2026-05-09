use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ParsedNode {
    pub id: String,
    pub kind: String,
    pub category: String,
    pub props: BTreeMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
pub struct ParsedEdge {
    pub id: String,
    pub from: String,
    pub to: String,
    pub edge_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct ParsedGraph {
    pub nodes: Vec<ParsedNode>,
    pub edges: Vec<ParsedEdge>,
}
