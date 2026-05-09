use wf_ir::AppIr;

use crate::diagnostics::Diagnostic;

pub fn validate(ir: &AppIr) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();

    for task in &ir.ai_tasks {
        if task.prompt.trim().is_empty() {
            let mut diag = Diagnostic::error(
                "WFI001",
                format!("AI task '{}' has an empty prompt.", task.id),
            );
            diag.node_id = Some(task.id.clone());
            diagnostics.push(diag);
        }
    }

    diagnostics
}
