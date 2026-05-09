use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateSpec {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
}

pub fn default_templates() -> Vec<TemplateSpec> {
    vec![
        TemplateSpec {
            id: "notes",
            name: "Notes App",
            description: "Simple local notes manager",
        },
        TemplateSpec {
            id: "settings-tool",
            name: "Settings Tool",
            description: "Desktop settings editor",
        },
        TemplateSpec {
            id: "checklist",
            name: "Checklist App",
            description: "Task checklist manager",
        },
        TemplateSpec {
            id: "dashboard",
            name: "Local Dashboard",
            description: "Status dashboard",
        },
        TemplateSpec {
            id: "content-editor",
            name: "Content Editor",
            description: "Text and content editor",
        },
        TemplateSpec {
            id: "form-entry",
            name: "Form Data Entry",
            description: "Structured form capture app",
        },
        TemplateSpec {
            id: "calculator",
            name: "Calculator",
            description: "Classic calculator with a 4×5 button grid",
        },
        TemplateSpec {
            id: "pomodoro-timer",
            name: "Pomodoro Timer",
            description: "Focus timer with start/pause/reset and tick handler",
        },
        TemplateSpec {
            id: "recipe-card",
            name: "Recipe Card",
            description: "Single-page recipe layout with ingredients and steps",
        },
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    const ALL_IDS: &[&str] = &[
        "notes",
        "checklist",
        "content-editor",
        "dashboard",
        "form-entry",
        "settings-tool",
        "calculator",
        "pomodoro-timer",
        "recipe-card",
    ];

    #[test]
    fn default_templates_returns_all_built_in() {
        assert_eq!(default_templates().len(), ALL_IDS.len());
    }

    #[test]
    fn default_templates_has_all_expected_ids() {
        let templates = default_templates();
        let ids: Vec<_> = templates.iter().map(|t| t.id).collect();
        for expected in ALL_IDS {
            assert!(ids.contains(expected), "missing template id: {expected}");
        }
    }

    #[test]
    fn template_specs_have_nonempty_names_and_descriptions() {
        for spec in default_templates() {
            assert!(!spec.name.is_empty(), "{} has empty name", spec.id);
            assert!(!spec.description.is_empty(), "{} has empty description", spec.id);
        }
    }
}
