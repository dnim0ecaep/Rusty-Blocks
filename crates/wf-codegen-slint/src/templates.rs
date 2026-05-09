//! Slint code generation for non-sprite (widget) projects.
//!
//! The codegen consumes `wf_ir::AppIr` and emits a complete Cargo project
//! that compiles a real Slint window with working button handlers, state,
//! persistence, and (where the IR asks for it) timers, expressions, and a
//! calculator state machine. Each helper here corresponds to one file in
//! the generated project.

use std::collections::{BTreeMap, BTreeSet};

use serde_json::Value;
use wf_ir::{ActionIr, AppIr, ComponentIr, ComponentKind, EventHandlerIr, EventTrigger};

// =====================================================================
// Per-handler / per-action info that the file generators read.
// =====================================================================

/// What kind of value lives in `var_<name>`. Drives the Slint property
/// type, the Rust setter signature, and how `state.set_variable` writes
/// are codegen'd.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum VarType {
    String,
    Int,
    Bool,
}

impl VarType {
    fn slint_ty(self) -> &'static str {
        match self {
            VarType::String => "string",
            VarType::Int => "int",
            VarType::Bool => "bool",
        }
    }
}

/// One handler the runtime needs to wire up.
struct HandlerBinding<'a> {
    trigger: EventTrigger,
    /// Slint callback name (`evt_<id>`). Only meaningful for click handlers.
    callback: Option<String>,
    /// Display label used in the status-text feedback line.
    button_label: String,
    handler_id: &'a str,
    actions: &'a [ActionIr],
}

// =====================================================================
// Project-wide analysis helpers — everything below uses these.
// =====================================================================

/// Slint-safe identifier. Replaces non-alphanumerics with `_` and
/// guarantees the result starts with an alphabetic char (Slint props
/// can't start with digits/underscore).
fn sanitize_ident(input: &str) -> String {
    let mut out: String = input
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    if out.is_empty() || !out.chars().next().unwrap().is_ascii_alphabetic() {
        out.insert(0, 'e');
    }
    out
}

fn escape_str(input: &str) -> String {
    // Both Rust string literals and Slint string literals are
    // single-line: a raw `\n` byte in the source breaks the parser.
    // Escape backslash → quote → CR → LF → tab order matters so the
    // backslash escape doesn't double-escape the newline marker.
    input
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\r', "\\r")
        .replace('\n', "\\n")
        .replace('\t', "\\t")
}

/// Slint property name for a `ui.input` / `ui.textarea`'s two-way text
/// binding. Used by the LineEdit (`text <=> root.<this>`), declared as
/// `in-out property <string>` on the Window, and read by event handlers
/// via `app.get_<this>()`.
fn input_property_name(id: &str) -> String {
    format!("input_{}", sanitize_ident(id))
}

/// Slint property name for a `ui.toggle`'s checked state.
fn toggle_property_name(id: &str) -> String {
    format!("toggle_{}", sanitize_ident(id))
}

/// Read either `name` or `variable` from a `state.set_variable` action.
/// Some templates use `name`, the settings-tool template uses `variable`.
fn action_var_name(action: &ActionIr) -> Option<&str> {
    action
        .args
        .get("name")
        .or_else(|| action.args.get("variable"))
        .and_then(|v| v.as_str())
}

/// True when `action` writes to the named variable via either the literal
/// `value` or an `expression` form.
fn writes_variable(action: &ActionIr) -> bool {
    action.kind == "state.set_variable"
}

/// Pick a variable type from the union of all writes. Mixed types widen
/// to String — the safest fallback since both numbers and booleans can
/// be rendered as strings.
fn classify_value(v: &Value) -> Option<VarType> {
    match v {
        Value::Bool(_) => Some(VarType::Bool),
        Value::Number(_) => Some(VarType::Int),
        Value::String(_) => Some(VarType::String),
        _ => None,
    }
}

/// Scan every `state.set_variable` action across all handlers and infer
/// the type each variable is being written with. Mixed types collapse to
/// String — Rust formatting handles all primitives, so it's a safe
/// widening.
fn variable_types(ir: &AppIr) -> BTreeMap<String, VarType> {
    let mut out: BTreeMap<String, Option<VarType>> = BTreeMap::new();

    for h in &ir.event_handlers {
        for a in &h.actions {
            if !writes_variable(a) {
                continue;
            }
            let Some(name) = action_var_name(a) else {
                continue;
            };
            let entry = out.entry(name.to_owned()).or_insert(None);
            // Literal value wins. Expressions are arithmetic — Int.
            let observed = if let Some(v) = a.args.get("value") {
                classify_value(v)
            } else if a.args.get("expression").is_some() {
                Some(VarType::Int)
            } else {
                None
            };
            if let Some(observed) = observed {
                *entry = match *entry {
                    None => Some(observed),
                    Some(prev) if prev == observed => Some(prev),
                    Some(_) => Some(VarType::String),
                };
            }
        }
    }

    out.into_iter()
        .filter_map(|(k, v)| v.map(|t| (k, t)))
        .collect()
}

/// Variables targeted by `state.calc_press`. We expose them as Slint
/// `<string>` properties so the Text widget can bind to `var_display`.
fn calc_target_variables(ir: &AppIr) -> BTreeSet<String> {
    ir.event_handlers
        .iter()
        .flat_map(|h| h.actions.iter())
        .filter(|a| a.kind == "state.calc_press")
        .filter_map(|a| {
            a.args
                .get("variable")
                .or_else(|| a.args.get("name"))
                .and_then(|v| v.as_str())
                .map(ToOwned::to_owned)
        })
        .collect()
}

/// True if the project uses `state.calc_press` on any click. Drives the
/// CalcState scaffolding in events.rs.
fn needs_calculator(ir: &AppIr) -> bool {
    ir.event_handlers
        .iter()
        .flat_map(|h| h.actions.iter())
        .any(|a| a.kind == "state.calc_press")
}

/// True if any click handler does `io.open_url`.
fn needs_opener(ir: &AppIr) -> bool {
    ir.event_handlers
        .iter()
        .filter(|h| matches!(h.trigger, EventTrigger::Click))
        .flat_map(|h| h.actions.iter())
        .any(|a| a.kind == "io.open_url")
}

/// True if any click handler manipulates an items list. Triggers the
/// `[string]` property + list view + VecModel scaffolding.
fn needs_items_list(ir: &AppIr) -> bool {
    ir.event_handlers
        .iter()
        .filter(|h| matches!(h.trigger, EventTrigger::Click | EventTrigger::Submit))
        .flat_map(|h| h.actions.iter())
        .any(|a| {
            matches!(
                a.kind.as_str(),
                "state.add_item" | "state.clear_items" | "state.delete_item"
            )
        })
}

/// True if `io.write_file` or `io.read_file` is wired to a textarea/input.
/// Drives the file-I/O helpers in storage.rs.
fn needs_file_io(ir: &AppIr) -> bool {
    ir.event_handlers
        .iter()
        .flat_map(|h| h.actions.iter())
        .any(|a| matches!(a.kind.as_str(), "io.read_file" | "io.write_file"))
}

/// True if `io.save_local_data` / `io.load_local_data` is used at all.
/// We persist either the items list (legacy path) or the full var-map
/// (new path), depending on what the project carries.
fn needs_local_data(ir: &AppIr) -> bool {
    ir.event_handlers
        .iter()
        .flat_map(|h| h.actions.iter())
        .any(|a| matches!(a.kind.as_str(), "io.save_local_data" | "io.load_local_data"))
}

/// The persistence key from any io.*_local_data action. Single-key model
/// — multi-collection apps would need codegen extension.
fn local_data_key(ir: &AppIr) -> Option<String> {
    ir.event_handlers
        .iter()
        .flat_map(|h| h.actions.iter())
        .find(|a| matches!(a.kind.as_str(), "io.save_local_data" | "io.load_local_data"))
        .and_then(|a| a.args.get("key"))
        .and_then(|v| v.as_str())
        .map(ToOwned::to_owned)
}

/// True when the project both maintains an items list AND wires at least
/// one io.* action that provides a persistence key.
fn needs_items_persistence(ir: &AppIr) -> bool {
    needs_items_list(ir) && local_data_key(ir).is_some()
}

/// True when the project persists scalar state vars / inputs / toggles
/// (settings-tool, recipe-card, dashboard) — i.e. it uses io.*_local_data
/// but is not an items-list app.
fn needs_var_persistence(ir: &AppIr) -> bool {
    needs_local_data(ir) && !needs_items_list(ir)
}

/// All `ui.input` / `ui.textarea` ids in the project, used for snapshot
/// persistence and for the `text <=> root.input_<id>` binding.
fn text_input_ids(ir: &AppIr) -> Vec<String> {
    ir.components
        .iter()
        .filter(|c| matches!(c.kind, ComponentKind::Input | ComponentKind::Textarea))
        .map(|c| c.id.clone())
        .collect()
}

/// All `ui.toggle` ids in the project.
fn toggle_ids(ir: &AppIr) -> Vec<String> {
    ir.components
        .iter()
        .filter(|c| matches!(c.kind, ComponentKind::Toggle))
        .map(|c| c.id.clone())
        .collect()
}

/// Collect every variable name targeted by `state.set_variable`. Used
/// to declare the Slint properties + the var-snapshot map.
fn set_variable_names(ir: &AppIr) -> BTreeSet<String> {
    let mut names: BTreeSet<String> = ir
        .event_handlers
        .iter()
        .flat_map(|h| h.actions.iter())
        .filter(|a| writes_variable(a))
        .filter_map(|a| action_var_name(a).map(ToOwned::to_owned))
        .collect();

    // Calculator targets need a property too.
    names.extend(calc_target_variables(ir));
    names
}

/// True when the project wires a tick-style `events.on_timer` handler.
/// Drives the slint::Timer scaffolding.
fn needs_timer(ir: &AppIr) -> bool {
    ir.event_handlers
        .iter()
        .any(|h| matches!(h.trigger, EventTrigger::Timer))
}

/// Parse interval from a timer handler. Honors `interval_ms`, falls back
/// to `interval`, defaults to 1000ms.
fn timer_interval_ms(h: &EventHandlerIr) -> u64 {
    // We pull the interval from the action props, since the IR builder
    // attaches handler props to the event node, not the action — but the
    // calculator/pomodoro templates currently put `interval` on the
    // event node, which becomes the handler's *prop* set, not its
    // actions. The IR builder doesn't preserve event node props on the
    // handler, so we default to 1s. (Templates can always emit a tick
    // every second — finer-grained is a future enhancement.)
    let _ = h;
    1000
}

/// True when the project wires `seconds_remaining` (pomodoro pattern).
/// We then auto-derive a `display_time` MM:SS string so the UI can show
/// formatted time without needing the template to express the format.
fn pomodoro_pattern(ir: &AppIr) -> bool {
    set_variable_names(ir).contains("seconds_remaining")
}

// =====================================================================
// File generators.
// =====================================================================

pub fn cargo_toml(ir: &AppIr) -> String {
    let mut extra_deps = String::new();
    if needs_items_persistence(ir) || needs_var_persistence(ir) || needs_file_io(ir) {
        // `directories` resolves the platform-specific user data dir.
        extra_deps.push_str("directories = \"5\"\n");
    }
    if needs_opener(ir) {
        extra_deps.push_str("opener = \"0.7\"\n");
    }
    format!(
        r#"[package]
name = "{name}"
version = "{version}"
edition = "2021"
build = "build.rs"

[dependencies]
slint = "1"
serde = {{ version = "1", features = ["derive"] }}
serde_json = "1"
{extra_deps}
[build-dependencies]
slint-build = "1"

[workspace]
"#,
        name = ir.meta.app_name.to_lowercase().replace(' ', "_"),
        version = ir.meta.version,
    )
}

pub fn build_rs() -> String {
    r#"fn main() {
    slint_build::compile("ui/main.slint").expect("failed to compile Slint UI");
}
"#
    .to_owned()
}

pub fn readme(ir: &AppIr) -> String {
    format!(
        "# {}\n\nGenerated by WarpForge Studio.\n\n## Build\n\n```bash\ncargo build --release\n```\n",
        ir.meta.app_name
    )
}

pub fn main_rs() -> String {
    r#"mod app;
mod features;

fn main() -> Result<(), slint::PlatformError> {
    app::run()
}
"#
    .to_owned()
}

pub fn app_mod_rs() -> String {
    r#"pub mod events;
pub mod state;
pub mod storage;

slint::include_modules!();

pub fn run() -> Result<(), slint::PlatformError> {
    let app = MainWindow::new()?;
    events::wire_events(&app);
    app.run()
}
"#
    .to_owned()
}

pub fn state_rs() -> String {
    r#"#[allow(dead_code)]
#[derive(Debug, Default)]
pub struct AppState {
    pub status: String,
}
"#
    .to_owned()
}

pub fn features_mod_rs() -> String {
    "pub mod notes;\n".to_owned()
}

pub fn feature_notes_mod_rs() -> String {
    "pub mod handlers;\npub mod model;\n".to_owned()
}

pub fn feature_notes_model_rs() -> String {
    r#"#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct Note {
    pub text: String,
}
"#
    .to_owned()
}

pub fn feature_notes_handlers_rs() -> String {
    r#"use super::model::Note;

#[allow(dead_code)]
pub fn add_note(collection: &mut Vec<Note>, text: String) {
    collection.push(Note { text });
}
"#
    .to_owned()
}

pub fn home_screen_slint(ir: &AppIr) -> String {
    format!(
        "// {} home screen placeholder\n",
        ir.meta.app_name
    )
}

// =====================================================================
// storage.rs — persistence helpers (items list, var snapshot, file I/O).
// =====================================================================

pub fn storage_rs(ir: &AppIr) -> String {
    let want_items = needs_items_persistence(ir);
    let want_vars = needs_var_persistence(ir);
    let want_files = needs_file_io(ir);

    if !want_items && !want_vars && !want_files {
        return r#"// No io.save_local_data / io.load_local_data / io.read_file
// wired — storage stub.

use std::fs;
use std::path::Path;

#[allow(dead_code)]
pub fn save_json(path: &Path, payload: &str) -> std::io::Result<()> {
    fs::write(path, payload)
}
"#
        .to_owned();
    }

    let app_slug = ir.meta.app_name.to_lowercase().replace(' ', "_");
    let key = local_data_key(ir).unwrap_or_else(|| "data".to_owned());

    let mut body = String::new();
    body.push_str(&format!(
        r#"//! Persistence helpers — auto-generated when the project wires
//! `io.save_local_data` / `io.load_local_data` / `io.write_file`.
//!
//! Storage layout: `<user-data-dir>/{app_slug}/<key>.json` for structured
//! state, `<user-data-dir>/{app_slug}/<name>.txt` for free-form text.

#![allow(dead_code)]

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

const APP_SLUG: &str = "{app_slug}";
const STORAGE_KEY: &str = "{key}";

fn data_dir() -> PathBuf {{
    let dir = directories::ProjectDirs::from("com", "warpforge", APP_SLUG)
        .map(|d| d.data_local_dir().to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."));
    let _ = fs::create_dir_all(&dir);
    dir
}}

pub fn data_path() -> PathBuf {{
    data_dir().join(format!("{{}}.json", STORAGE_KEY))
}}
"#,
        app_slug = app_slug,
        key = key,
    ));

    if want_items {
        body.push_str(
            r#"
pub fn load_items() -> Vec<String> {
    let path = data_path();
    let raw = match fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

pub fn save_items(items: &[String]) {
    let path = data_path();
    match serde_json::to_string_pretty(items) {
        Ok(json) => {
            if let Err(e) = fs::write(&path, json) {
                eprintln!("[wf-storage] save failed at {}: {e}", path.display());
            }
        }
        Err(e) => eprintln!("[wf-storage] serialize failed: {e}"),
    }
}
"#,
        );
    }

    if want_vars {
        body.push_str(
            r#"
/// Hydrate a previously-saved JSON object map. Empty when missing/corrupt.
pub fn load_vars() -> BTreeMap<String, serde_json::Value> {
    let path = data_path();
    let raw = match fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => return BTreeMap::new(),
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

/// Snapshot the current state to disk. Best-effort; never panics.
pub fn save_vars(vars: &BTreeMap<String, serde_json::Value>) {
    let path = data_path();
    match serde_json::to_string_pretty(vars) {
        Ok(json) => {
            if let Err(e) = fs::write(&path, json) {
                eprintln!("[wf-storage] save failed at {}: {e}", path.display());
            }
        }
        Err(e) => eprintln!("[wf-storage] serialize failed: {e}"),
    }
}
"#,
        );
    }

    if want_files {
        body.push_str(
            r#"
/// Read a free-form text file by logical name (one file per ref id).
pub fn load_text(name: &str) -> String {
    let path = data_dir().join(format!("{}.txt", name));
    fs::read_to_string(&path).unwrap_or_default()
}

/// Write a free-form text blob.
pub fn save_text(name: &str, content: &str) {
    let path = data_dir().join(format!("{}.txt", name));
    if let Err(e) = fs::write(&path, content) {
        eprintln!("[wf-storage] save_text failed at {}: {e}", path.display());
    }
}
"#,
        );
    }

    body
}

// =====================================================================
// events.rs — runtime wiring.
// =====================================================================

/// Build the per-handler binding list. Click handlers get a Slint
/// callback; other triggers (AppStart, Timer) run inline.
fn handler_bindings(ir: &AppIr) -> Vec<HandlerBinding<'_>> {
    let buttons: BTreeMap<&str, &str> = ir
        .components
        .iter()
        .filter(|c| matches!(c.kind, ComponentKind::Button))
        .map(|c| (c.id.as_str(), c.label.as_deref().unwrap_or(c.id.as_str())))
        .collect();

    let mut out: Vec<HandlerBinding<'_>> = Vec::new();
    for h in &ir.event_handlers {
        match h.trigger {
            EventTrigger::Click | EventTrigger::Submit => {
                let target = h.target.as_deref().unwrap_or_default();
                let label = buttons.get(target).copied().unwrap_or(target).to_owned();
                out.push(HandlerBinding {
                    trigger: h.trigger.clone(),
                    callback: Some(format!("evt_{}", sanitize_ident(&h.id))),
                    button_label: label,
                    handler_id: h.id.as_str(),
                    actions: &h.actions,
                });
            }
            EventTrigger::AppStart | EventTrigger::Timer => {
                out.push(HandlerBinding {
                    trigger: h.trigger.clone(),
                    callback: None,
                    button_label: String::new(),
                    handler_id: h.id.as_str(),
                    actions: &h.actions,
                });
            }
            _ => {}
        }
    }
    out.sort_by(|a, b| a.handler_id.cmp(b.handler_id));
    out
}

/// Click bindings only — used by the Slint UI to wire button `clicked =>`
/// callbacks.
fn click_bindings(ir: &AppIr) -> Vec<(String /* button_id */, String /* callback */)> {
    let mut out = Vec::new();
    let buttons: BTreeSet<&str> = ir
        .components
        .iter()
        .filter(|c| matches!(c.kind, ComponentKind::Button))
        .map(|c| c.id.as_str())
        .collect();
    for h in &ir.event_handlers {
        if !matches!(h.trigger, EventTrigger::Click | EventTrigger::Submit) {
            continue;
        }
        let Some(target) = h.target.as_deref() else {
            continue;
        };
        if !buttons.contains(target) {
            continue;
        }
        out.push((target.to_owned(), format!("evt_{}", sanitize_ident(&h.id))));
    }
    out.sort();
    out
}

/// Try to parse an arithmetic expression of the form `<var> [+-*/] <int>`
/// or `<int> [+-*/] <var>`. Returns the Rust expression that computes the
/// new value given `cur` (the current `i32` value of the variable).
fn translate_expression(expr: &str, var_name: &str) -> Option<String> {
    let s = expr.trim();
    for op in &['+', '-', '*', '/'] {
        if let Some((lhs, rhs)) = s.split_once(*op) {
            let l = lhs.trim();
            let r = rhs.trim();
            let var = var_name.trim();
            let lhs_var = l == var;
            let rhs_var = r == var;
            let n_l: Option<i64> = l.parse().ok();
            let n_r: Option<i64> = r.parse().ok();
            return match (lhs_var, n_r, n_l, rhs_var) {
                (true, Some(n), _, _) => Some(format!("cur {} {n}", op)),
                (_, _, Some(n), true) => Some(format!("{n} {} cur", op)),
                _ => None,
            };
        }
    }
    None
}

/// Emit Rust code that performs one action's effect inside an event-fire
/// closure. `var_types` controls how `state.set_variable` writes are
/// formatted; `inputs`, `textareas`, `toggles` are needed for io.* and
/// state.add_item resolution. `indent` is the leading whitespace.
#[allow(clippy::too_many_arguments)]
fn emit_action(
    body: &mut String,
    indent: &str,
    action: &ActionIr,
    var_types: &BTreeMap<String, VarType>,
    text_inputs: &BTreeSet<&str>,
    toggles: &BTreeSet<&str>,
    persist_after_var_change: bool,
) {
    match action.kind.as_str() {
        // ---------- items list ----------
        "state.add_item" => {
            let typed_value: Option<String> = action
                .args
                .get("value_ref")
                .and_then(|v| v.as_str())
                .filter(|id| text_inputs.contains(id))
                .map(input_property_name);
            if let Some(prop) = typed_value {
                body.push_str(&format!(
                    "{indent}if let Some(app) = weak.upgrade() {{\n\
                     {indent}    let typed = app.get_{prop}();\n\
                     {indent}    let trimmed = typed.trim();\n\
                     {indent}    if !trimmed.is_empty() {{\n\
                     {indent}        items.push(SharedString::from(trimmed.to_string()));\n\
                     {indent}        app.set_{prop}(SharedString::default());\n\
                     {indent}    }} else {{\n\
                     {indent}        let n = item_counter.get() + 1;\n\
                     {indent}        item_counter.set(n);\n\
                     {indent}        items.push(SharedString::from(format!(\"Item {{}}\", n)));\n\
                     {indent}    }}\n\
                     {indent}}}\n",
                ));
            } else {
                body.push_str(&format!(
                    "{indent}let n = item_counter.get() + 1;\n\
                     {indent}item_counter.set(n);\n\
                     {indent}items.push(SharedString::from(format!(\"Item {{}}\", n)));\n",
                ));
            }
        }
        "state.delete_item" => {
            body.push_str(&format!(
                "{indent}let len = items.row_count();\n\
                 {indent}if len > 0 {{ items.remove(len - 1); }}\n",
            ));
        }
        "state.clear_items" => {
            body.push_str(&format!(
                "{indent}items.set_vec(Vec::new());\n\
                 {indent}item_counter.set(0);\n",
            ));
        }
        // ---------- scalar state ----------
        "state.set_variable" => {
            let Some(name) = action_var_name(action) else {
                return;
            };
            let ident = sanitize_ident(name);
            let ty = var_types.get(name).copied().unwrap_or(VarType::String);

            if let Some(expr) = action.args.get("expression").and_then(|v| v.as_str()) {
                if let Some(rhs) = translate_expression(expr, name) {
                    body.push_str(&format!(
                        "{indent}if let Some(app) = weak.upgrade() {{\n\
                         {indent}    let cur = app.get_var_{ident}();\n\
                         {indent}    app.set_var_{ident}(({rhs}) as i32);\n\
                         {indent}}}\n"
                    ));
                }
                return;
            }

            let Some(value) = action.args.get("value") else {
                return;
            };
            match ty {
                VarType::Bool => {
                    let b = value.as_bool().unwrap_or(false);
                    body.push_str(&format!(
                        "{indent}if let Some(app) = weak.upgrade() {{ app.set_var_{ident}({b}); }}\n",
                    ));
                }
                VarType::Int => {
                    let n = value.as_i64().unwrap_or(0);
                    body.push_str(&format!(
                        "{indent}if let Some(app) = weak.upgrade() {{ app.set_var_{ident}({n} as i32); }}\n",
                    ));
                }
                VarType::String => {
                    let s = match value {
                        Value::String(s) => s.clone(),
                        Value::Number(n) => n.to_string(),
                        Value::Bool(b) => b.to_string(),
                        _ => String::new(),
                    };
                    body.push_str(&format!(
                        "{indent}if let Some(app) = weak.upgrade() {{ app.set_var_{ident}(SharedString::from(\"{s}\")); }}\n",
                        s = escape_str(&s)
                    ));
                }
            }
        }
        "state.calc_press" => {
            let token = action
                .args
                .get("value")
                .or_else(|| action.args.get("token"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let target = action
                .args
                .get("variable")
                .or_else(|| action.args.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("display");
            let ident = sanitize_ident(target);
            body.push_str(&format!(
                "{indent}{{\n\
                 {indent}    let mut st = calc_state.borrow_mut();\n\
                 {indent}    calc::press(&mut st, \"{tok}\");\n\
                 {indent}    if let Some(app) = weak.upgrade() {{\n\
                 {indent}        app.set_var_{ident}(SharedString::from(st.display.clone()));\n\
                 {indent}    }}\n\
                 {indent}}}\n",
                tok = escape_str(token),
            ));
        }
        // ---------- I/O ----------
        "io.open_url" => {
            let url = action.args.get("url").and_then(|v| v.as_str()).unwrap_or("");
            body.push_str(&format!(
                "{indent}if let Err(e) = opener::open(\"{u}\") {{\n\
                 {indent}    eprintln!(\"[wf-event] io.open_url failed: {{e}}\");\n\
                 {indent}}}\n",
                u = escape_str(url)
            ));
        }
        "io.write_file" => {
            let source = action
                .args
                .get("source_ref")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if text_inputs.contains(source) {
                let prop = input_property_name(source);
                body.push_str(&format!(
                    "{indent}if let Some(app) = weak.upgrade() {{\n\
                     {indent}    let payload = app.get_{prop}().to_string();\n\
                     {indent}    super::storage::save_text(\"{src}\", &payload);\n\
                     {indent}}}\n",
                    src = escape_str(source),
                ));
            }
        }
        "io.read_file" => {
            let target = action
                .args
                .get("target_ref")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if text_inputs.contains(target) {
                let prop = input_property_name(target);
                body.push_str(&format!(
                    "{indent}if let Some(app) = weak.upgrade() {{\n\
                     {indent}    let loaded = super::storage::load_text(\"{tgt}\");\n\
                     {indent}    app.set_{prop}(SharedString::from(loaded));\n\
                     {indent}}}\n",
                    tgt = escape_str(target),
                ));
            }
        }
        "io.save_local_data" => {
            // var-snapshot path: emitted once via emit_save_vars below.
            // items-list path: handled by the post-action save_snippet.
            // Nothing to do per-action here.
        }
        "io.load_local_data" => {
            // Handled in startup hydration, not per-action.
        }
        _ => {
            // Unknown action — falls through to the status-text log.
        }
    }
    let _ = persist_after_var_change;
    let _ = toggles;
}

/// Snapshot all state vars + text inputs + toggles into `storage::save_vars`.
/// Inserted after var-affecting actions when var-persistence is wired.
fn emit_save_vars(
    body: &mut String,
    indent: &str,
    var_types: &BTreeMap<String, VarType>,
    text_inputs: &[String],
    toggles: &[String],
) {
    body.push_str(&format!(
        "{indent}{{\n{indent}    let mut snap: std::collections::BTreeMap<String, serde_json::Value> = std::collections::BTreeMap::new();\n",
    ));
    body.push_str(&format!("{indent}    if let Some(app) = weak.upgrade() {{\n"));
    for (name, ty) in var_types {
        let ident = sanitize_ident(name);
        let getter = match ty {
            VarType::String => {
                format!(
                    "serde_json::Value::String(app.get_var_{ident}().to_string())",
                )
            }
            VarType::Int => format!(
                "serde_json::Value::Number(serde_json::Number::from(app.get_var_{ident}() as i64))",
            ),
            VarType::Bool => format!("serde_json::Value::Bool(app.get_var_{ident}())"),
        };
        body.push_str(&format!(
            "{indent}        snap.insert(\"{name}\".to_string(), {getter});\n",
        ));
    }
    for id in text_inputs {
        let prop = input_property_name(id);
        body.push_str(&format!(
            "{indent}        snap.insert(\"{id}\".to_string(), serde_json::Value::String(app.get_{prop}().to_string()));\n",
        ));
    }
    for id in toggles {
        let prop = toggle_property_name(id);
        body.push_str(&format!(
            "{indent}        snap.insert(\"{id}\".to_string(), serde_json::Value::Bool(app.get_{prop}()));\n",
        ));
    }
    body.push_str(&format!("{indent}    }}\n"));
    body.push_str(&format!(
        "{indent}    super::storage::save_vars(&snap);\n{indent}}}\n",
    ));
}

/// Hydrate vars/inputs/toggles from `storage::load_vars` at startup.
fn emit_load_vars(
    body: &mut String,
    indent: &str,
    var_types: &BTreeMap<String, VarType>,
    text_inputs: &[String],
    toggles: &[String],
) {
    body.push_str(&format!("{indent}let loaded = super::storage::load_vars();\n"));
    for (name, ty) in var_types {
        let ident = sanitize_ident(name);
        match ty {
            VarType::String => body.push_str(&format!(
                "{indent}if let Some(v) = loaded.get(\"{name}\").and_then(|v| v.as_str()) {{ app.set_var_{ident}(SharedString::from(v)); }}\n",
            )),
            VarType::Int => body.push_str(&format!(
                "{indent}if let Some(v) = loaded.get(\"{name}\").and_then(|v| v.as_i64()) {{ app.set_var_{ident}(v as i32); }}\n",
            )),
            VarType::Bool => body.push_str(&format!(
                "{indent}if let Some(v) = loaded.get(\"{name}\").and_then(|v| v.as_bool()) {{ app.set_var_{ident}(v); }}\n",
            )),
        }
    }
    for id in text_inputs {
        let prop = input_property_name(id);
        body.push_str(&format!(
            "{indent}if let Some(v) = loaded.get(\"{id}\").and_then(|v| v.as_str()) {{ app.set_{prop}(SharedString::from(v)); }}\n",
        ));
    }
    for id in toggles {
        let prop = toggle_property_name(id);
        body.push_str(&format!(
            "{indent}if let Some(v) = loaded.get(\"{id}\").and_then(|v| v.as_bool()) {{ app.set_{prop}(v); }}\n",
        ));
    }
}

pub fn events_rs(ir: &AppIr) -> String {
    let bindings = handler_bindings(ir);
    let needs_items = needs_items_list(ir);
    let needs_calc = needs_calculator(ir);
    let var_persist = needs_var_persistence(ir);
    let want_files = needs_file_io(ir);
    let want_timer = needs_timer(ir);
    let pomodoro = pomodoro_pattern(ir);

    let var_types = variable_types(ir);
    let var_names = set_variable_names(ir);
    let text_inputs_vec = text_input_ids(ir);
    let toggles_vec = toggle_ids(ir);
    let text_inputs: BTreeSet<&str> = text_inputs_vec.iter().map(String::as_str).collect();
    let toggles: BTreeSet<&str> = toggles_vec.iter().map(String::as_str).collect();

    // Bare stub when there's nothing wired at all.
    let any_click = bindings.iter().any(|b| b.callback.is_some());
    let any_init = bindings
        .iter()
        .any(|b| matches!(b.trigger, EventTrigger::AppStart) && !b.actions.is_empty());
    if !any_click && !needs_items && !any_init && !want_timer && var_names.is_empty() {
        return r#"use super::MainWindow;

pub fn wire_events(_app: &MainWindow) {
    // No click handlers in this project.
}
"#
        .to_owned();
    }

    let mut body = String::new();
    body.push_str("use super::MainWindow;\n");
    let need_cell = needs_items;
    let need_refcell = needs_calc;
    let need_rc = needs_items || needs_calc;
    match (need_cell, need_refcell) {
        (true, true) => body.push_str("use std::cell::{Cell, RefCell};\n"),
        (true, false) => body.push_str("use std::cell::Cell;\n"),
        (false, true) => body.push_str("use std::cell::RefCell;\n"),
        (false, false) => {}
    }
    if need_rc {
        body.push_str("use std::rc::Rc;\n");
    }
    let mut imports = vec!["ComponentHandle", "SharedString"];
    if needs_items {
        imports.extend_from_slice(&["Model", "ModelRc", "VecModel"]);
    }
    if want_timer {
        imports.extend_from_slice(&["Timer", "TimerMode"]);
    }
    body.push_str(&format!("use slint::{{{}}};\n\n", imports.join(", ")));

    if needs_calc {
        body.push_str(CALC_MODULE);
    }

    body.push_str("pub fn wire_events(app: &MainWindow) {\n");

    // Items list backing store.
    if needs_items {
        body.push_str("    let items: Rc<VecModel<SharedString>> = Rc::new(VecModel::default());\n");
        if needs_items_persistence(ir) {
            body.push_str("    for s in super::storage::load_items() { items.push(SharedString::from(s)); }\n");
        }
        body.push_str("    app.set_items(ModelRc::from(items.clone()));\n");
        body.push_str("    let item_counter: Rc<Cell<u32>> = Rc::new(Cell::new(items.row_count() as u32));\n");
    }

    if needs_calc {
        body.push_str("    let calc_state: Rc<RefCell<calc::CalcState>> = Rc::new(RefCell::new(calc::CalcState::default()));\n");
    }

    // AppStart / init: run inline before the user can interact.
    let init_handlers: Vec<&HandlerBinding> = bindings
        .iter()
        .filter(|b| matches!(b.trigger, EventTrigger::AppStart))
        .collect();
    if !init_handlers.is_empty() || var_persist || pomodoro {
        body.push_str("    {\n        let weak = app.as_weak();\n");
        if needs_items {
            body.push_str("        let items = items.clone();\n");
            body.push_str("        let item_counter = item_counter.clone();\n");
            let _ = items_used_by_init(&init_handlers);
        }
        if needs_calc {
            body.push_str("        let calc_state = calc_state.clone();\n");
        }
        body.push_str("        // Startup wiring (events.on_app_start + persistence hydration).\n");
        body.push_str("        if let Some(app) = weak.upgrade() {\n");
        if var_persist {
            emit_load_vars(&mut body, "            ", &var_types, &text_inputs_vec, &toggles_vec);
        }
        body.push_str("            let _ = app;\n        }\n");
        for h in &init_handlers {
            for action in h.actions {
                emit_action(&mut body, "        ", action, &var_types, &text_inputs, &toggles, false);
            }
        }
        if pomodoro {
            // Initialize the formatted display from seconds_remaining.
            body.push_str("        if let Some(app) = weak.upgrade() {\n");
            body.push_str("            let s = app.get_var_seconds_remaining();\n");
            body.push_str("            app.set_var_display_time(SharedString::from(format_mmss(s)));\n");
            body.push_str("        }\n");
        }
        body.push_str("    }\n\n");
    }

    // Timer scaffolding.
    if want_timer {
        body.push_str("    let timer = Timer::default();\n");
        let timer_handlers: Vec<&HandlerBinding> = bindings
            .iter()
            .filter(|b| matches!(b.trigger, EventTrigger::Timer))
            .collect();
        let interval = timer_handlers
            .first()
            .map(|h| {
                let h_ir = ir.event_handlers.iter().find(|x| x.id == h.handler_id);
                h_ir.map(timer_interval_ms).unwrap_or(1000)
            })
            .unwrap_or(1000);
        body.push_str("    {\n        let weak = app.as_weak();\n");
        if needs_calc {
            body.push_str("        let calc_state = calc_state.clone();\n");
        }
        body.push_str(&format!(
            "        timer.start(TimerMode::Repeated, std::time::Duration::from_millis({interval}), move || {{\n"
        ));
        // Pomodoro-style gating: only tick when var_running == true.
        let gate_running = pomodoro && var_types.get("running") == Some(&VarType::Bool);
        if gate_running {
            body.push_str("            if let Some(app) = weak.upgrade() {\n");
            body.push_str("                if !app.get_var_running() { return; }\n");
            body.push_str("                if app.get_var_seconds_remaining() <= 0 { return; }\n");
            body.push_str("            }\n");
        }
        for h in &timer_handlers {
            for action in h.actions {
                emit_action(&mut body, "            ", action, &var_types, &text_inputs, &toggles, false);
            }
        }
        if pomodoro {
            body.push_str("            if let Some(app) = weak.upgrade() {\n");
            body.push_str("                let s = app.get_var_seconds_remaining();\n");
            body.push_str("                app.set_var_display_time(SharedString::from(format_mmss(s)));\n");
            body.push_str("            }\n");
        }
        body.push_str("        });\n    }\n\n");
        // Keep timer alive for the lifetime of the window.
        body.push_str("    let _timer_keepalive = timer;\n\n");
    }

    // Click handlers — one closure per binding.
    for b in &bindings {
        let Some(callback) = b.callback.clone() else {
            continue;
        };
        body.push_str("    {\n        let weak = app.as_weak();\n");
        if needs_items {
            body.push_str("        let items = items.clone();\n");
            body.push_str("        let item_counter = item_counter.clone();\n");
        }
        if needs_calc {
            body.push_str("        let calc_state = calc_state.clone();\n");
        }
        body.push_str(&format!("        app.on_{callback}(move || {{\n"));

        for action in b.actions {
            emit_action(&mut body, "            ", action, &var_types, &text_inputs, &toggles, false);
        }

        // If this handler touched the items list AND items persistence
        // is wired, snapshot to disk.
        let touched_items = b.actions.iter().any(|a| {
            matches!(
                a.kind.as_str(),
                "state.add_item" | "state.delete_item" | "state.clear_items"
            )
        });
        if touched_items && needs_items_persistence(ir) {
            body.push_str(
                "            {\n                let snap: Vec<String> = (0..items.row_count())\n                    .filter_map(|i| items.row_data(i).map(|s| s.to_string()))\n                    .collect();\n                super::storage::save_items(&snap);\n            }\n",
            );
        }

        // If this handler explicitly does io.save_local_data and we're in
        // var-persist mode, snapshot all vars.
        let touches_save = b.actions.iter().any(|a| a.kind == "io.save_local_data");
        if touches_save && var_persist {
            emit_save_vars(&mut body, "            ", &var_types, &text_inputs_vec, &toggles_vec);
        }

        // If this handler explicitly does io.load_local_data and we're in
        // var-persist mode, hydrate.
        let touches_load = b.actions.iter().any(|a| a.kind == "io.load_local_data");
        if touches_load && var_persist {
            body.push_str("            if let Some(app) = weak.upgrade() {\n");
            emit_load_vars(&mut body, "                ", &var_types, &text_inputs_vec, &toggles_vec);
            body.push_str("                let _ = app;\n            }\n");
        }

        // If pomodoro and the handler touched seconds_remaining, refresh the
        // formatted display so manual reset/start show MM:SS immediately.
        let touches_seconds = b.actions.iter().any(|a| {
            a.kind == "state.set_variable"
                && action_var_name(a) == Some("seconds_remaining")
        });
        if pomodoro && touches_seconds {
            body.push_str(
                "            if let Some(app) = weak.upgrade() {\n                let s = app.get_var_seconds_remaining();\n                app.set_var_display_time(SharedString::from(format_mmss(s)));\n            }\n",
            );
        }

        // Status-text feedback line — preserves visible per-click feedback
        // and emits a stderr breadcrumb for debugging.
        let summary = if b.actions.is_empty() {
            "(no actions)".to_owned()
        } else {
            b.actions
                .iter()
                .map(|a| a.kind.clone())
                .collect::<Vec<_>>()
                .join(", ")
        };
        body.push_str(&format!(
            "            let msg = format!(\"{label} → {actions}\");\n            eprintln!(\"[wf-event] {hid}: {{}}\", msg);\n            if let Some(app) = weak.upgrade() {{\n                app.set_status_text(SharedString::from(msg));\n            }}\n",
            label = escape_str(&b.button_label),
            actions = escape_str(&summary),
            hid = escape_str(b.handler_id),
        ));
        body.push_str("        });\n    }\n");
    }

    body.push_str("}\n");

    // Helper: format seconds → "MM:SS" for the pomodoro display.
    if pomodoro {
        body.push_str("\nfn format_mmss(secs: i32) -> String {\n");
        body.push_str("    let s = secs.max(0);\n");
        body.push_str("    format!(\"{:02}:{:02}\", s / 60, s % 60)\n");
        body.push_str("}\n");
    }

    let _ = want_files;
    body
}

fn items_used_by_init(_init: &[&HandlerBinding]) -> bool {
    // Currently no on_app_start actions touch the items list directly —
    // the io.load_local_data path is handled by the storage::load_items
    // call on the items VecModel, not by an init handler. Reserved for
    // future template patterns.
    false
}

const CALC_MODULE: &str = r#"mod calc {
    /// Minimal four-banger calculator state machine driven by token
    /// strings. Tokens are the visible glyphs the IR carries, so the
    /// frontend doesn't need a separate token vocabulary.
    #[derive(Debug, Default)]
    pub struct CalcState {
        pub display: String,
        pub accumulator: f64,
        pub pending_op: Option<char>,
        pub fresh_input: bool,
    }

    pub fn press(state: &mut CalcState, token: &str) {
        match token {
            "C" => {
                state.display = "0".to_string();
                state.accumulator = 0.0;
                state.pending_op = None;
                state.fresh_input = true;
            }
            "⌫" => {
                if state.display.len() > 1 {
                    state.display.pop();
                } else {
                    state.display = "0".to_string();
                    state.fresh_input = true;
                }
            }
            "." => {
                if state.fresh_input {
                    state.display = "0.".to_string();
                    state.fresh_input = false;
                } else if !state.display.contains('.') {
                    state.display.push('.');
                }
            }
            "=" => {
                let cur: f64 = state.display.parse().unwrap_or(0.0);
                if let Some(op) = state.pending_op {
                    state.accumulator = apply(state.accumulator, op, cur);
                    state.display = format_num(state.accumulator);
                    state.pending_op = None;
                    state.fresh_input = true;
                }
            }
            "+" | "−" | "×" | "÷" => {
                let cur: f64 = state.display.parse().unwrap_or(0.0);
                let op = map_op(token);
                if let Some(prev) = state.pending_op {
                    state.accumulator = apply(state.accumulator, prev, cur);
                } else {
                    state.accumulator = cur;
                }
                state.display = format_num(state.accumulator);
                state.pending_op = Some(op);
                state.fresh_input = true;
            }
            digit if digit.len() == 1 && digit.chars().next().unwrap().is_ascii_digit() => {
                if state.fresh_input || state.display == "0" {
                    state.display = digit.to_string();
                    state.fresh_input = false;
                } else {
                    state.display.push_str(digit);
                }
            }
            _ => {
                // Unknown token — ignore silently. The status-text line
                // already surfaces what the click was meant to do.
            }
        }
    }

    fn map_op(token: &str) -> char {
        match token {
            "+" => '+',
            "−" => '-',
            "×" => '*',
            "÷" => '/',
            _ => '?',
        }
    }

    fn apply(a: f64, op: char, b: f64) -> f64 {
        match op {
            '+' => a + b,
            '-' => a - b,
            '*' => a * b,
            '/' => if b == 0.0 { 0.0 } else { a / b },
            _ => b,
        }
    }

    fn format_num(n: f64) -> String {
        if n.fract() == 0.0 && n.abs() < 1e16 {
            format!("{}", n as i64)
        } else {
            // Trim trailing zeros after the decimal point.
            let s = format!("{:.10}", n);
            let s = s.trim_end_matches('0').trim_end_matches('.').to_string();
            if s.is_empty() { "0".to_string() } else { s }
        }
    }
}

"#;

// =====================================================================
// Slint UI generation.
// =====================================================================

fn component_to_slint(
    component: &ComponentIr,
    button_callbacks: &BTreeMap<String, String>,
) -> String {
    match &component.kind {
        ComponentKind::Text => {
            if let Some(name) = component.props.get("text_ref").and_then(|v| v.as_str()) {
                return format!(
                    "        Text {{ text: root.var_{ident}; horizontal-alignment: center; font-size: 20px; }}",
                    ident = sanitize_ident(name)
                );
            }
            let text = component
                .props
                .get("text")
                .and_then(|v| v.as_str())
                .or(component.label.as_deref())
                .unwrap_or("");
            format!("        Text {{ text: \"{}\"; }}", escape_str(text))
        }
        ComponentKind::Header => {
            let title = component
                .props
                .get("title")
                .and_then(|v| v.as_str())
                .or_else(|| component.props.get("label").and_then(|v| v.as_str()))
                .or(component.label.as_deref())
                .unwrap_or("");
            format!(
                "        Text {{ text: \"{}\"; font-size: 22px; font-weight: 700; }}",
                escape_str(title)
            )
        }
        ComponentKind::Button => {
            let label = component
                .props
                .get("label")
                .and_then(|v| v.as_str())
                .or(component.label.as_deref())
                .unwrap_or("Button");
            let label_escaped = escape_str(label);
            match button_callbacks.get(&component.id) {
                Some(cb) => format!(
                    "        Button {{ text: \"{label_escaped}\"; clicked => {{ root.{cb}(); }} }}"
                ),
                None => format!("        Button {{ text: \"{label_escaped}\"; }}"),
            }
        }
        ComponentKind::Input => {
            let placeholder = component
                .props
                .get("placeholder")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let prop = input_property_name(&component.id);
            format!(
                "        LineEdit {{ placeholder-text: \"{}\"; text <=> root.{prop}; }}",
                escape_str(placeholder)
            )
        }
        ComponentKind::Textarea => {
            let placeholder = component
                .props
                .get("placeholder")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let prop = input_property_name(&component.id);
            format!(
                "        TextEdit {{\n            placeholder-text: \"{}\";\n            text <=> root.{prop};\n            min-height: 96px;\n        }}",
                escape_str(placeholder)
            )
        }
        ComponentKind::Toggle => {
            let label = component
                .props
                .get("label")
                .and_then(|v| v.as_str())
                .or(component.label.as_deref())
                .unwrap_or("");
            let prop = toggle_property_name(&component.id);
            format!(
                "        CheckBox {{ text: \"{}\"; checked <=> root.{prop}; }}",
                escape_str(label)
            )
        }
        ComponentKind::Card => {
            let label = component
                .props
                .get("label")
                .and_then(|v| v.as_str())
                .or(component.label.as_deref())
                .unwrap_or("");
            // A card is a visually-grouped label. Real card content lives
            // in subsequent siblings since we don't yet model parenting.
            format!(
                "        Text {{ text: \"{}\"; font-weight: 600; }}",
                escape_str(label)
            )
        }
        ComponentKind::Select => {
            let label = component
                .props
                .get("label")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            // ComboBox would need typed enum models. Render the label
            // only — good enough for the bundled examples.
            format!(
                "        Text {{ text: \"{}\"; color: #5b6470; }}",
                escape_str(label)
            )
        }
        _ => String::new(),
    }
}

pub fn ui_main_slint(ir: &AppIr) -> String {
    let width = ir.windows.first().map(|w| w.width).unwrap_or(1024);
    let height = ir.windows.first().map(|w| w.height).unwrap_or(768);
    let title = escape_str(&ir.meta.app_name);

    let click_pairs = click_bindings(ir);
    let button_callbacks: BTreeMap<String, String> = click_pairs.into_iter().collect();
    let var_types = variable_types(ir);
    let pomodoro = pomodoro_pattern(ir);

    // Children — render every component once, in IR order. Calculator
    // template emits the digit pad as a top-row + 5x4 grid; we fall back
    // to a flat VerticalLayout for everything else, which is fine for
    // the examples we ship.
    let children: Vec<String> = ir
        .components
        .iter()
        .map(|c| component_to_slint(c, &button_callbacks))
        .filter(|s| !s.is_empty())
        .collect();

    // Calculator-specific layout: 4-wide grid of buttons under the
    // display. Detect by presence of `state.calc_press` actions.
    let body = if needs_calculator(ir) {
        calculator_layout(ir, &button_callbacks)
    } else if children.is_empty() {
        format!("        Text {{ text: \"Welcome to {title}\"; horizontal-alignment: center; }}")
    } else {
        children.join("\n")
    };

    // Property declarations.
    let mut props_decl = String::new();

    // Per-input two-way text bindings.
    for c in &ir.components {
        if matches!(c.kind, ComponentKind::Input | ComponentKind::Textarea) {
            props_decl.push_str(&format!(
                "    in-out property <string> {}: \"\";\n",
                input_property_name(&c.id)
            ));
        }
        if matches!(c.kind, ComponentKind::Toggle) {
            props_decl.push_str(&format!(
                "    in-out property <bool> {}: false;\n",
                toggle_property_name(&c.id)
            ));
        }
    }

    // Per-state-variable typed properties.
    let mut declared: BTreeSet<String> = BTreeSet::new();
    for name in set_variable_names(ir) {
        let ident = sanitize_ident(&name);
        if !declared.insert(ident.clone()) {
            continue;
        }
        let ty = var_types.get(&name).copied().unwrap_or(VarType::String);
        let init = match ty {
            VarType::String => "\"\"".to_string(),
            VarType::Int => "0".to_string(),
            VarType::Bool => "false".to_string(),
        };
        props_decl.push_str(&format!(
            "    in-out property <{ty}> var_{ident}: {init};\n",
            ty = ty.slint_ty(),
        ));
    }

    // Pomodoro derived display var — string MM:SS, written from Rust.
    if pomodoro && !declared.contains("display_time") {
        props_decl.push_str(
            "    in-out property <string> var_display_time: \"\";\n",
        );
    }

    // Items list scaffolding — string array property + visual list.
    let items_section = if needs_items_list(ir) {
        (
            "    in-out property <[string]> items: [];\n",
            r#"        Rectangle {
            background: #f5f7fb;
            border-color: #cdd6e2;
            border-width: 1px;
            border-radius: 4px;
            min-height: 80px;
            VerticalLayout {
                padding: 6px;
                spacing: 4px;
                for item[i] in root.items: Text {
                    text: item;
                    font-size: 13px;
                    color: #1a2333;
                }
            }
        }"#,
        )
    } else {
        ("", "")
    };

    let mut callbacks_decl = String::new();
    for h in &ir.event_handlers {
        if !matches!(h.trigger, EventTrigger::Click | EventTrigger::Submit) {
            continue;
        }
        if h.target.is_some() {
            callbacks_decl.push_str(&format!(
                "    callback evt_{}();\n",
                sanitize_ident(&h.id)
            ));
        }
    }

    let status_footer = "        Text { text: root.status_text; color: gray; font-size: 12px; }";
    let pomodoro_display = if pomodoro {
        // Render an extra Text bound to the formatted display.
        "        Text { text: root.var_display_time; horizontal-alignment: center; font-size: 36px; font-weight: 700; }\n"
    } else {
        ""
    };

    format!(
        r#"import {{ Button, LineEdit, TextEdit, CheckBox }} from "std-widgets.slint";

export component MainWindow inherits Window {{
    width: {width}px;
    height: {height}px;
    title: "{title}";

    in-out property <string> status_text: "";
{items_prop}{props_decl}{callbacks_decl}
    VerticalLayout {{
        padding: 8px;
        spacing: 6px;
{pomodoro_display}{body}
{items_view}
{status_footer}
    }}
}}
"#,
        items_prop = items_section.0,
        items_view = items_section.1,
    )
}

/// Calculator-specific UI: display row + 5×4 grid of operator/digit
/// buttons. We discover buttons from the IR (any `ui.button` whose
/// `state.calc_press` action carries a token), preserve their click
/// callbacks, and lay them out in the standard 5-row layout.
fn calculator_layout(
    ir: &AppIr,
    button_callbacks: &BTreeMap<String, String>,
) -> String {
    // Display lives at the top — find any ui.text with text_ref bound to
    // the calc target variable, fall back to a plain `var_display`.
    let display_row = ir
        .components
        .iter()
        .find(|c| {
            matches!(c.kind, ComponentKind::Text)
                && c.props.contains_key("text_ref")
        })
        .map(|c| component_to_slint(c, button_callbacks))
        .unwrap_or_else(|| {
            "        Text { text: root.var_display; horizontal-alignment: right; font-size: 28px; font-weight: 700; }".to_owned()
        });

    // Discover the buttons in the order their `state.calc_press` actions
    // appear in the IR. Stable across re-runs.
    let mut press_buttons: Vec<(String, String)> = Vec::new();
    for h in &ir.event_handlers {
        if !matches!(h.trigger, EventTrigger::Click) {
            continue;
        }
        let Some(target) = h.target.as_deref() else {
            continue;
        };
        let press = h.actions.iter().find(|a| a.kind == "state.calc_press");
        let Some(press) = press else { continue };
        let token = press
            .args
            .get("value")
            .or_else(|| press.args.get("token"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if token.is_empty() {
            continue;
        }
        press_buttons.push((target.to_owned(), token));
    }

    // Build a map id → label from components for rendering.
    let labels: BTreeMap<String, String> = ir
        .components
        .iter()
        .filter(|c| matches!(c.kind, ComponentKind::Button))
        .map(|c| {
            (
                c.id.clone(),
                c.props
                    .get("label")
                    .and_then(|v| v.as_str())
                    .or(c.label.as_deref())
                    .unwrap_or("?")
                    .to_string(),
            )
        })
        .collect();

    let mut grid = String::new();
    grid.push_str("        GridLayout {\n            spacing: 6px;\n");
    // Slint's GridLayout uses `Row { ... }` blocks: each Row defines one
    // visual row, with children laid out left-to-right. We chunk the
    // press buttons into rows of 4 and emit one Row per chunk.
    for chunk in press_buttons.chunks(4) {
        grid.push_str("            Row {\n");
        for (id, _token) in chunk {
            let label = labels.get(id).cloned().unwrap_or_else(|| id.clone());
            let cb = button_callbacks
                .get(id)
                .cloned()
                .unwrap_or_else(|| format!("evt_{}", sanitize_ident(id)));
            grid.push_str(&format!(
                "                Button {{ text: \"{label}\"; clicked => {{ root.{cb}(); }} }}\n",
                label = escape_str(&label),
            ));
        }
        grid.push_str("            }\n");
    }
    grid.push_str("        }\n");

    format!("{display_row}\n{grid}")
}
