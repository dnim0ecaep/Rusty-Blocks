use regex::Regex;
use wf_ir::AppIr;

use crate::diagnostics::Diagnostic;

pub fn validate(ir: &AppIr) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();

    let app_name_ok = !ir.meta.app_name.trim().is_empty();
    if !app_name_ok {
        diagnostics.push(Diagnostic::error(
            "WFN001",
            "Application name must not be empty",
        ));
    }

    let pkg_re =
        Regex::new(r"^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$").expect("valid regex");
    if !pkg_re.is_match(&ir.meta.package_id) {
        let mut diag = Diagnostic::error(
            "WFN002",
            format!("Invalid package id '{}'.", ir.meta.package_id),
        );
        diag.hint = Some("Use reverse-domain format such as com.example.app".into());
        diagnostics.push(diag);
    }

    diagnostics
}
