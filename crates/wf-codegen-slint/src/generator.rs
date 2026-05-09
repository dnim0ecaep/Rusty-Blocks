use std::collections::BTreeMap;
use std::path::PathBuf;

use anyhow::Result;
use wf_ir::AppIr;

use crate::format::stable_format;
use crate::{sprite_templates, templates};

pub trait CodeGenerator {
    fn generate(&self, ir: &AppIr) -> Result<GeneratedProject>;
}

/// Slint codegen frontend.
///
/// `sprite_runtime_path`: when generating a sprite-runtime project
/// (i.e. `ir.sprite_stage` is `Some`), the emitted `Cargo.toml` needs a
/// `path = "..."` reference to the in-tree `wf-sprite-runtime` crate.
/// This field carries that path. When `None` and a sprite stage IS
/// present, codegen falls back to the workspace-relative path computed
/// from `CARGO_MANIFEST_DIR` at build time — fine for in-tree dev,
/// brittle for distributed builds, so callers shipping artifacts should
/// always set this explicitly.
#[derive(Debug, Clone, Default)]
pub struct SlintCodeGenerator {
    pub sprite_runtime_path: Option<PathBuf>,
}

#[derive(Debug, Clone, Default)]
pub struct GeneratedProject {
    pub text_files: BTreeMap<String, String>,
    pub copied_assets: Vec<AssetCopy>,
}

#[derive(Debug, Clone)]
pub struct AssetCopy {
    pub from: String,
    pub to: String,
}

impl SlintCodeGenerator {
    /// Resolve the sprite-runtime crate path for the generated Cargo.toml.
    /// Caller-provided value wins; otherwise compute from this crate's
    /// CARGO_MANIFEST_DIR (workspace dev convention).
    fn resolve_sprite_runtime_path(&self) -> PathBuf {
        if let Some(p) = &self.sprite_runtime_path {
            return p.clone();
        }
        let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        // crates/wf-codegen-slint → crates/wf-sprite-runtime
        p.pop();
        p.push("wf-sprite-runtime");
        p
    }

    fn generate_sprite(&self, ir: &AppIr) -> Result<GeneratedProject> {
        let stage = ir
            .sprite_stage
            .as_ref()
            .expect("generate_sprite called without a sprite stage");
        let runtime_path = self.resolve_sprite_runtime_path();

        let mut text_files = BTreeMap::new();
        text_files.insert(
            "Cargo.toml".into(),
            stable_format(&sprite_templates::cargo_toml(ir, &runtime_path)),
        );
        text_files.insert(
            "build.rs".into(),
            stable_format(&sprite_templates::build_rs()),
        );
        text_files.insert(
            "README.md".into(),
            stable_format(&sprite_templates::readme(ir)),
        );
        text_files.insert(
            "src/main.rs".into(),
            stable_format(&sprite_templates::main_rs(ir)),
        );
        text_files.insert(
            "ui/main.slint".into(),
            stable_format(&sprite_templates::ui_main_slint(stage)),
        );
        // The runtime reads sprite definitions + compiled scripts from
        // this file via include_str!. Built ahead of time so the Slint
        // app doesn't need Blockly at runtime.
        text_files.insert("project.json".into(), sprite_templates::project_json(stage));

        Ok(GeneratedProject {
            text_files,
            copied_assets: Vec::new(),
        })
    }

    fn generate_widget(&self, ir: &AppIr) -> Result<GeneratedProject> {
        let mut text_files = BTreeMap::new();
        text_files.insert("Cargo.toml".into(), stable_format(&templates::cargo_toml(ir)));
        text_files.insert("build.rs".into(), stable_format(&templates::build_rs()));
        text_files.insert("README.md".into(), stable_format(&templates::readme(ir)));
        text_files.insert("src/main.rs".into(), stable_format(&templates::main_rs()));
        text_files.insert("src/app/mod.rs".into(), stable_format(&templates::app_mod_rs()));
        text_files.insert("src/app/state.rs".into(), stable_format(&templates::state_rs()));
        text_files.insert(
            "src/app/events.rs".into(),
            stable_format(&templates::events_rs(ir)),
        );
        text_files.insert(
            "src/app/storage.rs".into(),
            stable_format(&templates::storage_rs(ir)),
        );
        text_files.insert(
            "src/features/mod.rs".into(),
            stable_format(&templates::features_mod_rs()),
        );
        text_files.insert(
            "src/features/notes/mod.rs".into(),
            stable_format(&templates::feature_notes_mod_rs()),
        );
        text_files.insert(
            "src/features/notes/model.rs".into(),
            stable_format(&templates::feature_notes_model_rs()),
        );
        text_files.insert(
            "src/features/notes/handlers.rs".into(),
            stable_format(&templates::feature_notes_handlers_rs()),
        );
        text_files.insert("ui/main.slint".into(), stable_format(&templates::ui_main_slint(ir)));
        text_files.insert(
            "ui/screens/home.slint".into(),
            stable_format(&templates::home_screen_slint(ir)),
        );

        let copied_assets = ir
            .resources
            .iter()
            .map(|resource| AssetCopy {
                from: resource.path.clone(),
                to: format!("assets/{}", resource.id),
            })
            .collect();

        Ok(GeneratedProject {
            text_files,
            copied_assets,
        })
    }
}

impl CodeGenerator for SlintCodeGenerator {
    fn generate(&self, ir: &AppIr) -> Result<GeneratedProject> {
        // Sprite projects route through a different template tree —
        // simpler structure (single window, no widgets/state/events
        // module split) and pulls in wf-sprite-runtime. Non-sprite
        // projects keep the original codegen path unchanged.
        if ir.sprite_stage.is_some() {
            self.generate_sprite(ir)
        } else {
            self.generate_widget(ir)
        }
    }
}

#[cfg(test)]
mod tests {
    use wf_ir::{AppIr, AppMeta, ExportProfile, TargetProfile, WindowIr};

    use super::{CodeGenerator, SlintCodeGenerator};

    fn empty_ir() -> AppIr {
        AppIr {
            ir_version: 1,
            meta: AppMeta {
                app_name: "Demo".into(),
                package_id: "com.demo.app".into(),
                version: "0.1.0".into(),
                author: "WarpForge".into(),
                description: "Demo".into(),
            },
            target: TargetProfile {
                platform: "desktop".into(),
                ui_stack: "slint".into(),
            },
            windows: vec![WindowIr {
                id: "w1".into(),
                title: "Demo".into(),
                root_screen: "home".into(),
                width: 800,
                height: 600,
            }],
            routes: vec!["/".into()],
            screens: vec![],
            components: vec![],
            data_models: vec![],
            collections: vec![],
            event_handlers: vec![],
            services: vec![],
            resources: vec![],
            ai_tasks: vec![],
            export_profile: ExportProfile {
                include_bundle: true,
                include_source: true,
                deterministic: true,
            },
            sprite_stage: None,
        }
    }

    #[test]
    fn generates_stable_project_tree() {
        let ir = empty_ir();
        let generator = SlintCodeGenerator::default();
        let out = generator.generate(&ir).expect("generate ok");
        assert!(out.text_files.contains_key("src/main.rs"));
        assert!(out.text_files.contains_key("build.rs"));
        assert!(out.text_files.contains_key("ui/main.slint"));
        // Non-sprite projects must NOT include a project.json.
        assert!(!out.text_files.contains_key("project.json"));
    }

    #[test]
    fn sprite_project_pulls_in_svg_rasterizer() {
        // The studio writes vector costumes / built-in backdrops as
        // `data:image/svg+xml;base64,…`. Without an SVG rasterizer in
        // the generated app's deps, the runtime silently falls back to
        // the placeholder square — which is exactly the "I picked a
        // costume and I don't see it" symptom we're guarding against.
        let mut ir = empty_ir();
        ir.sprite_stage = Some(wf_ir::SpriteStageIr {
            width: 480,
            height: 360,
            assets: serde_json::json!([{
                "id": "asset_svg",
                "kind": "costume",
                "path": "data:image/svg+xml;base64,PHN2Zy8+",
                "metadata": {},
                "created_at": "2026-05-08T00:00:00Z",
                "version": 1
            }]),
            stage_state: serde_json::json!({
                "sprites": [{
                    "id": "s1",
                    "name": "S",
                    "x": 0, "y": 0, "direction": 90, "size": 100,
                    "visible": true, "rotationStyle": "all-around",
                    "costumeIndex": 0,
                    "costumes": [{
                        "id": "c1", "name": "vec", "assetId": "asset_svg",
                        "centerX": 50, "centerY": 50, "width": 100, "height": 100
                    }],
                    "sounds": [],
                    "scripts_xml": "",
                    "variables": {}, "lists": {}, "layer": 1
                }],
                "globalVariables": {},
                "globalLists": {}
            }),
        });
        let generator = SlintCodeGenerator::default();
        let out = generator.generate(&ir).expect("generate ok");
        let cargo = &out.text_files["Cargo.toml"];
        assert!(
            cargo.contains("resvg"),
            "Cargo.toml must depend on resvg so SVG costumes rasterize:\n{cargo}"
        );
        let main = &out.text_files["src/main.rs"];
        assert!(
            main.contains("fn decode_svg") && main.contains("resvg::usvg::Tree::from_data"),
            "main.rs must dispatch SVG payloads through resvg:\n{main}"
        );
        assert!(
            main.contains("image/svg+xml") && main.contains("decode_raster"),
            "main.rs must split raster vs SVG decoding:\n{main}"
        );
    }

    #[test]
    fn sprite_project_emits_project_json_and_no_widget_modules() {
        let mut ir = empty_ir();
        ir.sprite_stage = Some(wf_ir::SpriteStageIr {
            // SpriteStageIr.width/height are *logical* Scratch dims —
            // the codegen multiplies by RENDER_SCALE for the actual
            // Slint window.
            width: 480,
            height: 360,
            assets: serde_json::Value::Array(Vec::new()),
            stage_state: serde_json::json!({
                "sprites": [{
                    "id": "s1",
                    "name": "S",
                    "x": 0, "y": 0, "direction": 90, "size": 100,
                    "visible": true, "rotationStyle": "all-around",
                    "costumeIndex": -1, "costumes": [], "sounds": [],
                    "scripts_xml": "",
                    "variables": {}, "lists": {}, "layer": 1
                }],
                "globalVariables": {},
                "globalLists": {}
            }),
        });
        let generator = SlintCodeGenerator::default();
        let out = generator.generate(&ir).expect("generate ok");
        // Sprite path emits a different tree.
        assert!(out.text_files.contains_key("project.json"));
        assert!(out.text_files.contains_key("src/main.rs"));
        assert!(out.text_files.contains_key("ui/main.slint"));
        // No widget modules for the sprite path.
        assert!(!out.text_files.contains_key("src/app/mod.rs"));
        assert!(!out.text_files.contains_key("src/features/mod.rs"));
        // main.rs uses the sprite-runtime engine.
        let main = &out.text_files["src/main.rs"];
        assert!(main.contains("wf_sprite_runtime"), "main.rs must use the runtime crate");
        assert!(main.contains("include_str!(\"../project.json\")"));
        // Cargo.toml depends on wf-sprite-runtime.
        let cargo = &out.text_files["Cargo.toml"];
        assert!(cargo.contains("wf-sprite-runtime"), "Cargo.toml must dep on runtime");
        // Slint UI declares the sprites property.
        let ui = &out.text_files["ui/main.slint"];
        assert!(ui.contains("in property <[SpriteData]>"));
    }
}
