use wf_ir::{AppIr, ComponentKind};

use crate::diagnostics::Diagnostic;

pub fn validate(ir: &AppIr) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();

    if ir.target.ui_stack != "slint" {
        diagnostics.push(Diagnostic::error(
            "WFT001",
            format!("Unsupported UI stack '{}' for MVP.", ir.target.ui_stack),
        ));
    }

    for component in &ir.components {
        if matches!(component.kind, ComponentKind::Unknown(_)) {
            let mut diag = Diagnostic::warning(
                "WFT002",
                format!(
                    "Component '{}' is not recognized by the Slint generator.",
                    component.id
                ),
            );
            diag.node_id = Some(component.id.clone());
            diagnostics.push(diag);
        }
    }

    diagnostics
}
