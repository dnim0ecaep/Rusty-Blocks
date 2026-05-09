use std::collections::HashSet;

use wf_ir::AppIr;

use crate::diagnostics::{Diagnostic, Location};

pub fn validate(ir: &AppIr) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();

    let screen_ids: HashSet<&str> = ir.screens.iter().map(|screen| screen.id.as_str()).collect();
    let component_ids: HashSet<&str> = ir
        .components
        .iter()
        .map(|component| component.id.as_str())
        .collect();

    for window in &ir.windows {
        if !screen_ids.contains(window.root_screen.as_str()) {
            let mut diag = Diagnostic::error(
                "WFR001",
                format!("Window '{}' references unknown root screen.", window.id),
            );
            diag.node_id = Some(window.id.clone());
            diag.location = Some(Location {
                node_id: Some(window.id.clone()),
                field: Some("root_screen".into()),
            });
            diagnostics.push(diag);
        }
    }

    for screen in &ir.screens {
        for component_id in &screen.components {
            if !component_ids.contains(component_id.as_str()) {
                let mut diag = Diagnostic::error(
                    "WFR002",
                    format!(
                        "Screen '{}' references unknown component '{}'.",
                        screen.id, component_id
                    ),
                );
                diag.node_id = Some(screen.id.clone());
                diag.location = Some(Location {
                    node_id: Some(screen.id.clone()),
                    field: Some("components".into()),
                });
                diagnostics.push(diag);
            }
        }
    }

    diagnostics
}
