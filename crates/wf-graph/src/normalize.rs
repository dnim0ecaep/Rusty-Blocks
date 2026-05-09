use std::collections::{BTreeMap, HashSet};

use crate::graph::{ParsedEdge, ParsedGraph, ParsedNode};
use wf_schema::{EdgeType, NormalizedGraph};

pub fn normalize_graph(input: &NormalizedGraph) -> ParsedGraph {
    let mut node_ids = HashSet::new();

    let mut nodes: Vec<ParsedNode> = input
        .nodes
        .iter()
        .filter(|node| node_ids.insert(node.id.clone()))
        .map(|node| ParsedNode {
            id: node.id.clone(),
            kind: node.kind.clone(),
            category: node.category.clone(),
            props: node
                .props
                .iter()
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect::<BTreeMap<_, _>>(),
        })
        .collect();

    nodes.sort_by(|a, b| a.id.cmp(&b.id));

    let mut edges: Vec<ParsedEdge> = input
        .edges
        .iter()
        .map(|edge| ParsedEdge {
            id: edge.id.clone(),
            from: edge.from.clone(),
            to: edge.to.clone(),
            edge_type: edge_type_to_string(&edge.edge_type),
        })
        .collect();

    edges.sort_by(|a, b| {
        (&a.from, &a.to, &a.edge_type, &a.id).cmp(&(&b.from, &b.to, &b.edge_type, &b.id))
    });
    edges.dedup();

    ParsedGraph { nodes, edges }
}

fn edge_type_to_string(edge_type: &EdgeType) -> String {
    match edge_type {
        EdgeType::Flow => "flow",
        EdgeType::Data => "data",
        EdgeType::Child => "child",
        EdgeType::Event => "event",
    }
    .to_owned()
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use wf_schema::{EdgeType, GraphEdge, GraphNode, NormalizedGraph};

    use super::normalize_graph;

    #[test]
    fn normalizes_sorts_and_dedups() {
        let graph = NormalizedGraph {
            nodes: vec![
                GraphNode {
                    id: "b".to_string(),
                    kind: "ui.button".to_string(),
                    category: "ui".to_string(),
                    props: BTreeMap::new(),
                },
                GraphNode {
                    id: "a".to_string(),
                    kind: "event.start".to_string(),
                    category: "events".to_string(),
                    props: BTreeMap::new(),
                },
            ],
            edges: vec![
                GraphEdge {
                    id: "2".to_string(),
                    from: "a".to_string(),
                    to: "b".to_string(),
                    edge_type: EdgeType::Flow,
                },
                GraphEdge {
                    id: "2".to_string(),
                    from: "a".to_string(),
                    to: "b".to_string(),
                    edge_type: EdgeType::Flow,
                },
            ],
        };

        let parsed = normalize_graph(&graph);
        assert_eq!(parsed.nodes[0].id, "a");
        assert_eq!(parsed.nodes[1].id, "b");
        assert_eq!(parsed.edges.len(), 1);
    }
}
