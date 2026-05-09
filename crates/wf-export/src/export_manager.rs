use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::Utc;
use wf_assemble::{build_manifest, from_generated, write_tree};
use wf_codegen_slint::{CodeGenerator, SlintCodeGenerator};
use wf_ir::AppIr;
use wf_schema::ExportManifest;

use crate::{cargo_build::run_cargo_build, cargo_bundle::run_cargo_bundle};

#[derive(Debug, Clone)]
pub struct ExportResult {
    pub source_dir: PathBuf,
    pub bundle_path: Option<PathBuf>,
    pub manifest_path: PathBuf,
}

#[derive(Debug, Default)]
pub struct ExportManager {
    generator: SlintCodeGenerator,
}

impl ExportManager {
    pub fn new() -> Self {
        Self {
            generator: SlintCodeGenerator::default(),
        }
    }

    pub fn export_source_only(
        &self,
        ir: &AppIr,
        exports_root: &Path,
        project_id: &str,
    ) -> Result<ExportResult> {
        self.export(ir, exports_root, project_id, false)
    }

    pub fn export_with_bundle(
        &self,
        ir: &AppIr,
        exports_root: &Path,
        project_id: &str,
    ) -> Result<ExportResult> {
        self.export(ir, exports_root, project_id, true)
    }

    fn export(
        &self,
        ir: &AppIr,
        exports_root: &Path,
        project_id: &str,
        include_bundle: bool,
    ) -> Result<ExportResult> {
        let timestamp = Utc::now().format("%Y-%m-%dT%H-%M-%SZ").to_string();
        let slug = slugify(&ir.meta.app_name);
        let base = exports_root.join(timestamp).join(slug);
        let source_dir = base.join("source");
        fs::create_dir_all(&source_dir)
            .with_context(|| format!("failed to create source directory {source_dir:?}"))?;

        let generated = self.generator.generate(ir)?;
        let tree = from_generated(&generated);
        let generated_files = write_tree(&source_dir, &tree)?;

        let mut bundle_path = None;
        if include_bundle {
            run_cargo_build(&source_dir)?;

            if run_cargo_bundle(&source_dir).is_ok() {
                bundle_path = crate::cargo_bundle::bundle_output_path(&source_dir);
            }

            if bundle_path.is_none() {
                #[cfg(target_os = "macos")]
                {
                    bundle_path = Some(create_manual_macos_bundle(
                        &source_dir,
                        &ir.meta.app_name,
                        &ir.meta.package_id,
                    )?);
                }
                #[cfg(target_os = "linux")]
                {
                    bundle_path = Some(crate::linux_bundle::create_linux_bundle(
                        &source_dir,
                        &crate_name(&ir.meta.app_name),
                    )?);
                }
                // On other platforms bundle_path stays None; manifest omits it.
            }
        }

        let manifest = build_manifest(
            project_id,
            &ir.meta.app_name,
            &source_dir.display().to_string(),
            bundle_path.as_ref().map(|p| p.display().to_string()),
            generated_files,
        );

        let manifest_path = base.join("export-manifest.json");
        if let Some(parent) = manifest_path.parent() {
            fs::create_dir_all(parent)
                .with_context(|| format!("failed to create manifest parent {parent:?}"))?;
        }
        write_manifest(&manifest_path, &manifest)?;

        Ok(ExportResult {
            source_dir,
            bundle_path,
            manifest_path,
        })
    }
}

fn write_manifest(path: &Path, manifest: &ExportManifest) -> Result<()> {
    let json = serde_json::to_string_pretty(manifest)?;
    fs::write(path, json).with_context(|| format!("failed writing manifest at {path:?}"))
}

fn slugify(input: &str) -> String {
    input
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .to_lowercase()
        .trim_matches('-')
        .to_owned()
}

fn crate_name(input: &str) -> String {
    input
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '_' })
        .collect::<String>()
}

#[cfg(target_os = "macos")]
fn create_manual_macos_bundle(
    source_dir: &Path,
    app_name: &str,
    package_id: &str,
) -> Result<PathBuf> {
    let binary_name = crate_name(app_name);
    let binary_src = source_dir.join("target/release").join(&binary_name);

    let bundle_root = source_dir
        .join("target/release/bundle/osx")
        .join(format!("{app_name}.app"));
    let contents = bundle_root.join("Contents");
    let macos_dir = contents.join("MacOS");
    let resources_dir = contents.join("Resources");

    fs::create_dir_all(&macos_dir)
        .with_context(|| format!("failed to create bundle executable dir {macos_dir:?}"))?;
    fs::create_dir_all(&resources_dir)
        .with_context(|| format!("failed to create bundle resources dir {resources_dir:?}"))?;

    let bundled_binary = macos_dir.join(&binary_name);
    fs::copy(&binary_src, &bundled_binary).with_context(|| {
        format!(
            "failed to copy release binary from {binary_src:?} to {bundled_binary:?}"
        )
    })?;

    let plist = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>CFBundleExecutable</key><string>{binary_name}</string>
  <key>CFBundleIdentifier</key><string>{package_id}</string>
  <key>CFBundleInfoDictionaryVersion</key><string>6.0</string>
  <key>CFBundleName</key><string>{app_name}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
</dict>
</plist>
"#
    );
    fs::write(contents.join("Info.plist"), plist)
        .with_context(|| format!("failed writing Info.plist for bundle {bundle_root:?}"))?;

    Ok(bundle_root)
}
