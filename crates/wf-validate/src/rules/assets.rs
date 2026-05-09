use wf_ir::AppIr;

use crate::diagnostics::Diagnostic;

pub fn validate(ir: &AppIr) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();

    for resource in &ir.resources {
        if resource.path.trim().is_empty() {
            let mut diag = Diagnostic::error(
                "WFA001",
                format!("Resource '{}' has an empty path.", resource.id),
            );
            diag.node_id = Some(resource.id.clone());
            diagnostics.push(diag);
        }
    }

    diagnostics
}
