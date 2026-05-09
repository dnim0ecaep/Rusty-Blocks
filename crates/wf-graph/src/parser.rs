use thiserror::Error;
use wf_schema::ProjectFile;

use crate::{normalize_graph, ParsedGraph};

#[derive(Debug, Error)]
pub enum GraphParseError {
    #[error("graph is empty")]
    EmptyGraph,
}

pub trait GraphParser {
    fn parse_project(&self, project: &ProjectFile) -> Result<ParsedGraph, GraphParseError>;
}

#[derive(Debug, Default)]
pub struct DefaultGraphParser;

impl GraphParser for DefaultGraphParser {
    fn parse_project(&self, project: &ProjectFile) -> Result<ParsedGraph, GraphParseError> {
        let parsed = normalize_graph(&project.normalized_graph);
        if parsed.nodes.is_empty() {
            return Err(GraphParseError::EmptyGraph);
        }
        Ok(parsed)
    }
}
