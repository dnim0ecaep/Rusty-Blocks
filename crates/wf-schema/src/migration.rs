use chrono::Utc;
use thiserror::Error;

use crate::project::{ProjectFile, PROJECT_SCHEMA_VERSION};

#[derive(Debug, Error)]
pub enum MigrationError {
    #[error("project schema version {0} is newer than supported {1}")]
    UnsupportedFutureVersion(u32, u32),
}

pub fn migrate_to_latest(mut project: ProjectFile) -> Result<ProjectFile, MigrationError> {
    if project.schema_version > PROJECT_SCHEMA_VERSION {
        return Err(MigrationError::UnsupportedFutureVersion(
            project.schema_version,
            PROJECT_SCHEMA_VERSION,
        ));
    }

    while project.schema_version < PROJECT_SCHEMA_VERSION {
        project = migrate_one(project);
    }

    project.project.updated_at = Utc::now();
    Ok(project)
}

fn migrate_one(mut project: ProjectFile) -> ProjectFile {
    if project.schema_version == 0 {
        project.schema_version = 1;
        if project.settings.ai_default_image_provider.is_empty() {
            project.settings.ai_default_image_provider = "comfyui".to_owned();
        }
        if project.settings.ai_default_text_provider.is_empty() {
            project.settings.ai_default_text_provider = "ollama".to_owned();
        }
        return project;
    }

    project
}

#[cfg(test)]
mod tests {
    use chrono::Utc;

    use crate::{
        migrate_to_latest,
        project::{
            ProjectFile, ProjectMetadata, ProjectSettings, TargetType, ThemeMode,
            PROJECT_SCHEMA_VERSION,
        },
        workspace::NormalizedGraph,
        WorkspaceState,
    };

    #[test]
    fn migrates_v0_to_latest() {
        let project = ProjectFile {
            schema_version: 0,
            project: ProjectMetadata {
                id: "p1".into(),
                app_name: "Demo".into(),
                package_id: "com.demo.app".into(),
                version: "0.1.0".into(),
                author: "Tester".into(),
                description: "desc".into(),
                target_type: TargetType::DesktopSlint,
                theme: ThemeMode::Auto,
                created_at: Utc::now(),
                updated_at: Utc::now(),
                stage_width: None,
                stage_height: None,
            },
            workspace_state: WorkspaceState::default(),
            normalized_graph: NormalizedGraph::default(),
            ir_snapshot: None,
            assets: vec![],
            ai_history: vec![],
            stage_state: None,
            settings: ProjectSettings {
                autosave_interval_secs: 10,
                validate_on_change: true,
                codegen_deterministic: true,
                ai_default_text_provider: String::new(),
                ai_default_image_provider: String::new(),
            },
        };

        let migrated = migrate_to_latest(project).expect("migration must succeed");
        assert_eq!(migrated.schema_version, PROJECT_SCHEMA_VERSION);
        assert_eq!(migrated.settings.ai_default_text_provider, "ollama");
        assert_eq!(migrated.settings.ai_default_image_provider, "comfyui");
    }
}
