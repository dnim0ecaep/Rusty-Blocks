use chrono::Utc;

use wf_schema::ExportManifest;

pub fn build_manifest(
    project_id: &str,
    project_name: &str,
    source_dir: &str,
    bundle_path: Option<String>,
    generated_files: Vec<String>,
) -> ExportManifest {
    ExportManifest {
        project_id: project_id.to_owned(),
        project_name: project_name.to_owned(),
        source_dir: source_dir.to_owned(),
        bundle_path,
        generated_files,
        created_at: Utc::now(),
        generator_version: env!("CARGO_PKG_VERSION").to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_manifest_fields_are_correct() {
        let m = build_manifest(
            "proj-123",
            "MyApp",
            "target/output",
            Some("bundle.app".into()),
            vec!["Cargo.toml".into(), "src/main.rs".into()],
        );
        assert_eq!(m.project_id, "proj-123");
        assert_eq!(m.project_name, "MyApp");
        assert_eq!(m.source_dir, "target/output");
        assert_eq!(m.bundle_path, Some("bundle.app".into()));
        assert_eq!(m.generated_files, vec!["Cargo.toml", "src/main.rs"]);
        assert!(!m.generator_version.is_empty());
    }

    #[test]
    fn build_manifest_without_bundle() {
        let m = build_manifest("p", "N", "s", None, vec![]);
        assert!(m.bundle_path.is_none());
        assert!(m.generated_files.is_empty());
    }
}
