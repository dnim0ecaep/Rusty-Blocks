//! Plain data model for the sprite runtime.
//!
//! Mirrors `apps/studio/src/types/workspace.ts` and the JSON shape emitted by
//! `apps/studio/src/runtime/compileScripts.ts`. Field names use camelCase
//! to match what the studio writes; serde's `rename_all` would break that
//! since some are already snake_case (`scripts_xml`).
//!
//! These types are deliberately permissive: every optional field is `Option`,
//! and unknown fields are ignored so future studio additions don't break older
//! compiled binaries.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// One pre-compiled block. Trees of these (`next` chains, `inputs` maps)
/// represent every script.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptNode {
    /// Block type id, e.g. "scratch_motion_move_steps".
    pub r#type: String,
    /// Field values (literals from dropdown / number / text fields).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fields: Option<HashMap<String, String>>,
    /// Child blocks plugged into named value/statement inputs.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inputs: Option<HashMap<String, ScriptNode>>,
    /// Next block in the same statement chain.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub next: Option<Box<ScriptNode>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
}

impl ScriptNode {
    pub fn field(&self, name: &str) -> Option<&str> {
        self.fields.as_ref()?.get(name).map(|s| s.as_str())
    }

    pub fn input(&self, name: &str) -> Option<&ScriptNode> {
        self.inputs.as_ref()?.get(name)
    }

    /// Read a field as a number, falling back when missing or non-numeric.
    pub fn field_number(&self, name: &str, fallback: f64) -> f64 {
        self.field(name).and_then(|s| s.parse().ok()).unwrap_or(fallback)
    }

    /// Read a field as a String, falling back when missing.
    pub fn field_string(&self, name: &str, fallback: &str) -> String {
        self.field(name).map(|s| s.to_string()).unwrap_or_else(|| fallback.to_string())
    }
}

/// Either a literal value or a dynamic value computed from a sub-tree.
#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Number(f64),
    Text(String),
    Bool(bool),
}

impl Value {
    pub fn as_number(&self) -> f64 {
        match self {
            Value::Number(n) => *n,
            Value::Bool(b) => if *b { 1.0 } else { 0.0 },
            Value::Text(s) => s.parse().unwrap_or(0.0),
        }
    }

    pub fn as_string(&self) -> String {
        match self {
            Value::Number(n) => {
                // Mirror JS Number.prototype.toString — no trailing zeros for ints.
                if n.fract() == 0.0 && n.abs() < 1e16 {
                    format!("{}", *n as i64)
                } else {
                    format!("{}", n)
                }
            }
            Value::Bool(b) => if *b { "true".into() } else { "false".into() },
            Value::Text(s) => s.clone(),
        }
    }

    /// JS-style truthiness: empty string and "0"/"false" are falsy.
    pub fn truthy(&self) -> bool {
        match self {
            Value::Bool(b) => *b,
            Value::Number(n) => *n != 0.0 && !n.is_nan(),
            Value::Text(s) => !s.is_empty() && s != "0" && s != "false",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Costume {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub asset_id: Option<String>,
    pub center_x: f32,
    pub center_y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpriteSound {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub asset_id: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum RotationStyle {
    AllAround,
    LeftRight,
    DontRotate,
}

impl Default for RotationStyle {
    fn default() -> Self { RotationStyle::AllAround }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sprite {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub x: f32,
    #[serde(default)]
    pub y: f32,
    #[serde(default = "default_direction")]
    pub direction: f32,
    #[serde(default = "default_size")]
    pub size: f32,
    #[serde(default = "default_visible")]
    pub visible: bool,
    #[serde(default)]
    pub rotation_style: RotationStyle,
    #[serde(default = "default_costume_index")]
    pub costume_index: i32,
    #[serde(default)]
    pub costumes: Vec<Costume>,
    #[serde(default)]
    pub sounds: Vec<SpriteSound>,
    /// Either the original Blockly XML (legacy) or empty when scripts have
    /// been pre-compiled (preferred). In the compiled case, the runtime
    /// reads `compiled_scripts` instead. Renamed because the studio writes
    /// this in snake_case even though the surrounding fields are
    /// camelCase.
    #[serde(default, rename = "scripts_xml")]
    pub scripts_xml: String,
    /// Pre-compiled top-level statement blocks. Populated by the codegen
    /// step; set this to skip Blockly entirely at runtime.
    #[serde(default)]
    pub compiled_scripts: Vec<ScriptNode>,
    #[serde(default)]
    pub variables: HashMap<String, ScalarJson>,
    #[serde(default)]
    pub lists: HashMap<String, Vec<ScalarJson>>,
    #[serde(default)]
    pub layer: i32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bubble: Option<Bubble>,
    /// Dynamic-text overlay set by `scratch_looks_set_text_to`. Painted
    /// on top of the sprite when present and non-empty. Snake-case in
    /// the JSON to match the studio's `text_value` field name.
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "text_value")]
    pub text_value: Option<String>,
    /// Font family for the dynamic-text overlay, set by
    /// `scratch_looks_set_text_with_font`. CSS-style value: a system
    /// font name, a stack, or None for the renderer default.
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "font_family")]
    pub font_family: Option<String>,
    /// Explicit font size in pixels for the dynamic-text overlay, set
    /// by `scratch_looks_set_text_size_to`. None falls back to the
    /// renderer's auto-derive (~32% of sprite height). Clamped to
    /// 8..200 at write time.
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "text_size")]
    pub text_size: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effects: Option<Effects>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub volume: Option<f32>,
    #[serde(default)]
    pub is_clone: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_sprite_id: Option<String>,
}

fn default_direction() -> f32 { 90.0 }
fn default_size() -> f32 { 100.0 }
fn default_visible() -> bool { true }
fn default_costume_index() -> i32 { -1 }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bubble {
    pub kind: BubbleKind,
    pub text: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum BubbleKind { Say, Think }

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Effects {
    /// 0..200, hue rotation. Wraps mod 200.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fisheye: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub whirl: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pixelate: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mosaic: Option<f32>,
    /// -100..100.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub brightness: Option<f32>,
    /// 0..100. Inverse of opacity.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ghost: Option<f32>,
}

/// JSON-side scalar (variables / list items). Modeled as untagged so the
/// studio's mix of strings + numbers in a single map deserializes cleanly.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum ScalarJson {
    Number(f64),
    Text(String),
}

impl ScalarJson {
    pub fn as_value(&self) -> Value {
        match self {
            ScalarJson::Number(n) => Value::Number(*n),
            ScalarJson::Text(s) => Value::Text(s.clone()),
        }
    }
    pub fn from_value(v: &Value) -> Self {
        match v {
            Value::Number(n) => ScalarJson::Number(*n),
            Value::Text(s) => ScalarJson::Text(s.clone()),
            Value::Bool(b) => ScalarJson::Text(if *b { "true".into() } else { "false".into() }),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageState {
    /// Schema version is written snake_case by the studio. Override the
    /// camelCase rename to match.
    #[serde(default = "default_schema_version", rename = "schema_version")]
    pub schema_version: u32,
    #[serde(default)]
    pub sprites: Vec<Sprite>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub selected_sprite_id: Option<String>,
    #[serde(default = "default_costume_index")]
    pub backdrop_index: i32,
    #[serde(default)]
    pub backdrops: Vec<Costume>,
    #[serde(default)]
    pub global_variables: HashMap<String, ScalarJson>,
    #[serde(default)]
    pub global_lists: HashMap<String, Vec<ScalarJson>>,
}

fn default_schema_version() -> u32 { 1 }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetRecord {
    pub id: String,
    pub kind: AssetKind,
    pub path: String,
    #[serde(default)]
    pub metadata: serde_json::Value,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub version: u32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AssetKind {
    Icon,
    Image,
    TextSnippet,
    Prompt,
    Screenshot,
    Costume,
    Sound,
}

/// Studio-side ProjectFile uses snake_case for top-level + metadata
/// (`app_name`, `package_id`, `created_at`, …). No rename_all here so
/// fields match the JSON byte-for-byte.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMetadata {
    pub id: String,
    pub app_name: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub description: String,
}

/// A subset of the studio's ProjectFile — only what the runtime needs.
/// Top-level keys (`stage_state`, `assets`, `project`) are snake_case in
/// the studio's writer, so no rename_all here either. Unknown fields are
/// tolerated.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub project: ProjectMetadata,
    #[serde(default)]
    pub assets: Vec<AssetRecord>,
    #[serde(default)]
    pub stage_state: Option<StageState>,
}

impl Project {
    pub fn from_json(s: &str) -> anyhow::Result<Self> {
        Ok(serde_json::from_str(s)?)
    }

    pub fn stage(&self) -> Option<&StageState> {
        self.stage_state.as_ref()
    }
}

/// Stage canvas dimensions — Scratch convention.
pub const STAGE_WIDTH: f32 = 480.0;
pub const STAGE_HEIGHT: f32 = 360.0;
