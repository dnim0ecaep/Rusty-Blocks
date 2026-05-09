pub mod diagnostics;
pub mod rules;

use diagnostics::{Diagnostic, Severity};
use wf_ir::AppIr;

pub trait IrValidator {
    fn validate(&self, ir: &AppIr) -> Vec<Diagnostic>;
}

#[derive(Debug, Default)]
pub struct DefaultIrValidator;

impl IrValidator for DefaultIrValidator {
    fn validate(&self, ir: &AppIr) -> Vec<Diagnostic> {
        let mut diagnostics = Vec::new();
        diagnostics.extend(rules::naming::validate(ir));
        diagnostics.extend(rules::references::validate(ir));
        diagnostics.extend(rules::structure::validate(ir));
        diagnostics.extend(rules::target_compat::validate(ir));
        diagnostics.extend(rules::assets::validate(ir));
        diagnostics.extend(rules::ai::validate(ir));

        diagnostics.sort_by(|a, b| a.code.cmp(&b.code).then(a.message.cmp(&b.message)));
        diagnostics
    }
}

pub fn has_errors(diags: &[Diagnostic]) -> bool {
    diags.iter().any(|d| matches!(d.severity, Severity::Error))
}
