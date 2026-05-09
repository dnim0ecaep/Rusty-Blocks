use wf_ir::AppIr;

use crate::diagnostics::Diagnostic;

pub fn validate(ir: &AppIr) -> Vec<Diagnostic> {
    let mut diagnostics = Vec::new();

    if ir.windows.is_empty() {
        diagnostics.push(Diagnostic::error(
            "WFS001",
            "Project must define at least one window.",
        ));
    }

    if ir.screens.is_empty() {
        diagnostics.push(Diagnostic::error(
            "WFS002",
            "Project must define at least one screen.",
        ));
    }

    if ir.event_handlers.is_empty() && !sprite_stage_has_scripts(ir) {
        diagnostics.push(Diagnostic::warning(
            "WFS003",
            "No event handlers defined. The app may be non-interactive.",
        ));
    }

    diagnostics
}

/// Sprite projects carry interactivity in `stage_state.sprites[].scripts_xml`,
/// not as IR event_handlers. Treat a non-empty script on any sprite as
/// satisfying the "is this app interactive?" check WFS003 is asking.
fn sprite_stage_has_scripts(ir: &AppIr) -> bool {
    let Some(stage) = ir.sprite_stage.as_ref() else {
        return false;
    };
    let Some(sprites) = stage.stage_state.get("sprites").and_then(|v| v.as_array()) else {
        return false;
    };
    sprites.iter().any(|s| {
        s.get("scripts_xml")
            .and_then(|v| v.as_str())
            .map(|x| !x.trim().is_empty())
            .unwrap_or(false)
    })
}
