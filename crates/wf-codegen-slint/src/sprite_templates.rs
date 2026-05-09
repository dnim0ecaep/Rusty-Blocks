//! Sprite-aware codegen templates.
//!
//! When `ir.sprite_stage` is `Some`, the generator routes through these
//! templates instead of the default Slint UI/main. The result is a Slint
//! window whose body is a sprite stage driven by `wf-sprite-runtime`.
//!
//! The generated app loads its sprite definitions + compiled scripts
//! from an embedded `project.json` (via `include_str!`), ticks the
//! scheduler on a `slint::Timer`, and syncs sprite positions/colors
//! into a Slint `Model<SpriteData>` each frame.

use std::path::Path;

use serde_json::{Map, Value as JsonValue};
use wf_ir::{AppIr, SpriteStageIr};

use crate::format::stable_format;

/// Sanitize a project name to a Rust crate identifier.
fn crate_name(input: &str) -> String {
    let mut out = String::new();
    for c in input.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if c == ' ' || c == '-' || c == '_' {
            if !out.ends_with('_') && !out.is_empty() {
                out.push('_');
            }
        }
    }
    while out.ends_with('_') {
        out.pop();
    }
    if out.is_empty() {
        out.push_str("sprite_app");
    }
    if out
        .chars()
        .next()
        .map(|c| c.is_ascii_digit())
        .unwrap_or(false)
    {
        out.insert(0, '_');
    }
    out
}

/// Cargo.toml that includes wf-sprite-runtime + slint deps. The
/// runtime path is embedded as an absolute string so the generated
/// project (which lives outside the workspace) can find it.
pub fn cargo_toml(ir: &AppIr, sprite_runtime_path: &Path) -> String {
    let runtime_path = sprite_runtime_path.display();
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
# Image + base64: decode costume blobs (data URLs or raw base64) into
# slint::Image at startup. Caches by assetId so we don't re-decode.
image = {{ version = "0.25", default-features = false, features = ["png", "jpeg", "gif"] }}
base64 = "0.22"
# resvg rasterizes SVG costumes/backdrops at startup. The studio's
# vector editor and built-in sprite/backdrop library both emit
# `data:image/svg+xml;base64,…` URLs, which the raster `image` crate
# can't decode. Without resvg, every vector costume becomes a
# placeholder square and every default backdrop disappears.
resvg = "0.45"
# Cross-platform shell opener — used to fulfill `scratch_io_open_url`
# blocks (xdg-open / open / start). Tiny, no transitive deps.
opener = "0.7"
# Headless dep — only the engine, no macroquad. The Slint window drives
# rendering and input.
wf-sprite-runtime = {{ path = "{runtime_path}", default-features = false }}

[build-dependencies]
slint-build = "1"

[workspace]
"#,
        name = crate_name(&ir.meta.app_name),
        version = ir.meta.version,
    )
}

/// Slint UI: a window whose only content is the sprite stage.
pub fn ui_main_slint(stage: &SpriteStageIr) -> String {
    let title = stage_title(stage);
    let title_escaped = title.replace('\\', "\\\\").replace('"', "\\\"");
    // SpriteStageIr.width / height are *logical* stage dims (Scratch
    // coords). The Slint window upscales by main_rs's RENDER_SCALE
    // (2.0) — keep the two in sync so a click at the window's center
    // maps back to (0, 0) in stage coords.
    let render_scale: u32 = 2;
    let width = stage.width * render_scale;
    let height = stage.height * render_scale;
    format!(
        r#"export struct SpriteData {{
    id: string,
    x: length,
    y: length,
    size: length,
    color: color,
    visible: bool,
    bubble-text: string,
    bubble-visible: bool,
    // Costume image — populated when the sprite's costumeIndex points
    // at a loaded costume asset. Rust decodes the asset's base64 blob
    // once at startup and caches by assetId.
    costume: image,
    has-costume: bool,
    // Rotation applied to the costume image. Computed in Rust to honor
    // Scratch's `rotationStyle` modes (all-around / left-right / dont-rotate).
    rotation: angle,
}}

export component MainWindow inherits Window {{
    width: {width}px;
    height: {height}px;
    title: "{title_escaped}";
    forward-focus: input-scope;

    in property <[SpriteData]> sprites: [];
    in property <string> monitor-text: "";
    // Active stage backdrop (TurboWarp-style). When `has-backdrop` is
    // false the renderer falls back to a plain white background; when
    // true it stretches `backdrop` to fill the stage.
    in property <image> backdrop;
    in property <bool> has-backdrop: false;

    // Routed to Rust: a discrete key press (no auto-repeat).
    callback key-pressed(string);
    // Routed to Rust: the user released a key — needed so `key pressed?`
    // reporters stop returning true once the user stops holding.
    callback key-released(string);
    // Routed to Rust: a stage click. (x, y) are in screen pixels
    // relative to the window — Rust converts to stage coords.
    callback stage-clicked(float, float);

    Rectangle {{
        background: white;

        // Stage backdrop: stretched to fill when has-backdrop is true.
        Image {{
            visible: root.has-backdrop;
            width: parent.width;
            height: parent.height;
            source: root.backdrop;
            image-fit: fill;
        }}

        // Light center crosshair so the origin is visible. Hidden when
        // a backdrop is active so it doesn't compete with the artwork.
        Rectangle {{
            visible: !root.has-backdrop;
            x: parent.width / 2 - 0.5px;
            y: 0;
            width: 1px;
            height: parent.height;
            background: #cdd6e2;
        }}
        Rectangle {{
            visible: !root.has-backdrop;
            x: 0;
            y: parent.height / 2 - 0.5px;
            width: parent.width;
            height: 1px;
            background: #cdd6e2;
        }}

        // Sprite body: real costume image if loaded, else placeholder
        // colored square. Both share the same hit-test bounds so click
        // logic stays consistent.
        for sprite in sprites: Rectangle {{
            x: sprite.x;
            y: sprite.y;
            width: sprite.size;
            height: sprite.size;
            visible: sprite.visible;
            // Placeholder square — visible only when no costume.
            Rectangle {{
                visible: !sprite.has-costume;
                width: parent.width;
                height: parent.height;
                background: sprite.color;
                border-color: #203048;
                border-width: 1px;
            }}
            // Costume image — preserves the sprite's own aspect ratio
            // and rotates around its center to track sprite.direction.
            Image {{
                visible: sprite.has-costume;
                width: parent.width;
                height: parent.height;
                source: sprite.costume;
                image-fit: contain;
                transform-rotation: sprite.rotation;
            }}
        }}

        // Speech / thought bubble overlay. Explicit width + height so
        // the Rectangle doesn't auto-expand to fill its parent (an
        // earlier HorizontalLayout-wrapped version did exactly that and
        // covered the sprites).
        for sprite in sprites: Rectangle {{
            visible: sprite.bubble-visible && sprite.visible;
            x: min(parent.width - 220px, max(8px, sprite.x + sprite.size + 6px));
            y: max(8px, sprite.y - 36px);
            width: 220px;
            height: 28px;
            background: #ffffe0;
            border-color: #888;
            border-width: 1px;
            border-radius: 6px;
            Text {{
                x: 8px;
                y: 0;
                width: parent.width - 16px;
                height: parent.height;
                text: sprite.bubble-text;
                font-size: 13px;
                color: #1a2333;
                vertical-alignment: center;
            }}
        }}

        // Variable monitors overlay (top-left). Explicit dimensions —
        // no Layout wrapper — so the background Rectangle stays small
        // and the sprites underneath remain visible.
        Rectangle {{
            visible: root.monitor-text != "";
            x: 8px;
            y: 8px;
            width: 220px;
            height: 26px;
            background: #f3f6fb;
            border-color: #cdd6e2;
            border-width: 1px;
            border-radius: 4px;
            Text {{
                x: 8px;
                y: 0;
                width: parent.width - 16px;
                height: parent.height;
                text: root.monitor-text;
                font-size: 13px;
                color: #1a2333;
                vertical-alignment: center;
            }}
        }}

        // Captures clicks anywhere on the stage. Sits below the sprite
        // overlay so clicks reach the user; we read absolute mouse pos
        // and let Rust hit-test against sprite bounds.
        TouchArea {{
            clicked => {{
                root.stage-clicked(self.mouse-x / 1px, self.mouse-y / 1px);
            }}
        }}
    }}

    // FocusScope captures key events for the whole window. The `text`
    // field is a SharedString of either the typed character (" ", "a")
    // or a Slint Key constant in the Unicode private-use area.
    input-scope := FocusScope {{
        key-pressed(event) => {{
            root.key-pressed(event.text);
            EventResult.accept
        }}
        key-released(event) => {{
            root.key-released(event.text);
            EventResult.accept
        }}
    }}
}}
"#
    )
}

fn stage_title(_stage: &SpriteStageIr) -> String {
    // Title comes from app meta; fallback only — the caller passes IR.
    "Sprite Stage".to_string()
}

/// `src/main.rs` — wires the sprite-runtime engine into the Slint window.
///
/// The body is intentionally one chunk because Slint's `slint::include_modules!`
/// macro generates types in the same module, and the `Timer` callback
/// needs the model + stage in scope. Rc<RefCell<...>> sharing is the
/// idiomatic Slint pattern for mutating world state from a timer.
pub fn main_rs(ir: &AppIr) -> String {
    // Read the logical stage dimensions from the IR when present, falling
    // back to Scratch defaults so the non-sprite codegen path (where IR
    // has no sprite_stage) still compiles. Always emit `f.0` so Rust
    // parses these as float literals rather than integers — bare
    // `format!("{}", 480.0_f32)` drops the decimal and breaks parsing.
    let (stage_w_val, stage_h_val) = ir
        .sprite_stage
        .as_ref()
        .map(|s| (s.width, s.height))
        .unwrap_or((480, 360));
    let stage_w = format!("{stage_w_val}.0");
    let stage_h = format!("{stage_h_val}.0");
    format!(
        r##"//! Generated by WarpForge Studio (sprite-runtime mode).
//!
//! Loads the project's `stage_state` (embedded as project.json) into the
//! sprite-runtime engine and renders into a Slint window.

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;
use std::time::Instant;

use base64::Engine as _;
use slint::{{Color, ComponentHandle, Image, ModelRc, SharedPixelBuffer, SharedString, VecModel}};
use wf_sprite_runtime::{{model::RotationStyle, Project, Scheduler, Stage}};

slint::include_modules!();

const PROJECT_JSON: &str = include_str!("../project.json");

const STAGE_W: f32 = {stage_w};
const STAGE_H: f32 = {stage_h};
const RENDER_SCALE: f32 = 2.0;
const PLACEHOLDER_SIZE: f32 = 40.0;

fn main() -> Result<(), slint::PlatformError> {{
    let project = Project::from_json(PROJECT_JSON).expect("invalid project.json");
    let stage_state = project.stage_state.expect("project has no stage_state");

    // Decode every costume asset once up front. Cache by assetId so the
    // per-frame model sync just clones a slint::Image (cheap — internally
    // a refcounted handle).
    let mut costume_cache: HashMap<String, Image> = HashMap::new();
    for asset in &project.assets {{
        if !matches!(asset.kind, wf_sprite_runtime::model::AssetKind::Costume) {{
            continue;
        }}
        if let Some(img) = decode_costume(&asset.path) {{
            costume_cache.insert(asset.id.clone(), img);
        }}
    }}
    let costume_cache = Rc::new(costume_cache);

    // Resolve the active backdrop image once at startup. (Backdrop
    // switching at runtime would re-set this property — not yet wired,
    // since no block changes backdropIndex through the runtime.)
    let active_backdrop: Option<Image> = stage_state
        .backdrops
        .get(stage_state.backdrop_index.max(0) as usize)
        .filter(|_| stage_state.backdrop_index >= 0)
        .and_then(|b| b.asset_id.as_deref())
        .and_then(|id| costume_cache.get(id).cloned());

    let stage = Rc::new(RefCell::new(Stage::from_state(stage_state)));
    let scheduler = Rc::new(RefCell::new(Scheduler::new()));

    let ui = MainWindow::new()?;
    let model: Rc<VecModel<SpriteData>> = Rc::new(VecModel::default());
    ui.set_sprites(ModelRc::from(model.clone()));

    // Apply the resolved backdrop. The Slint UI auto-falls-back to a
    // plain white background when has-backdrop is false.
    if let Some(img) = active_backdrop {{
        ui.set_backdrop(img);
        ui.set_has_backdrop(true);
    }}

    // Auto-fire green flag on startup so the binary is immediately fun.
    scheduler.borrow_mut().fire_green_flag(&stage.borrow());

    // Keyboard input: Slint sends a SharedString with either the typed
    // character or a Slint Key constant. We translate to the Scratch
    // key names the interpreter expects, then both update the held-keys
    // bus (so `key pressed?` reporters see it) and fire any matching
    // `when key pressed` hat scripts.
    {{
        let stage_for_key = stage.clone();
        let scheduler_for_key = scheduler.clone();
        ui.on_key_pressed(move |text| {{
            let Some(key) = scratch_key_from_text(text.as_str()) else {{ return; }};
            stage_for_key.borrow_mut().press_key(key.clone());
            scheduler_for_key
                .borrow_mut()
                .fire_key_press(&stage_for_key.borrow(), &key);
        }});
    }}
    // Released: just clear the held-key bit — the engine has no
    // edge-triggered "key released" hat (Scratch doesn't either).
    {{
        let stage_for_key = stage.clone();
        ui.on_key_released(move |text| {{
            let Some(key) = scratch_key_from_text(text.as_str()) else {{ return; }};
            stage_for_key.borrow_mut().release_key(&key);
        }});
    }}

    // Click input: `mouse_x` / `mouse_y` are window-pixel coords. Convert
    // to stage coords (centered, +y up), hit-test top-most sprite, fire.
    {{
        let stage_for_click = stage.clone();
        let scheduler_for_click = scheduler.clone();
        ui.on_stage_clicked(move |x, y| {{
            let stage_x = (x as f32 / RENDER_SCALE) - STAGE_W / 2.0;
            let stage_y = STAGE_H / 2.0 - (y as f32 / RENDER_SCALE);
            let s = stage_for_click.borrow();
            if let Some(id) = hit_test_sprite(&s, stage_x, stage_y) {{
                scheduler_for_click
                    .borrow_mut()
                    .fire_sprite_click(&s, &id);
            }}
        }});
    }}

    let timer = slint::Timer::default();
    let stage_for_tick = stage.clone();
    let scheduler_for_tick = scheduler.clone();
    let model_for_tick = model.clone();
    let ui_weak = ui.as_weak();
    let costume_cache_for_tick = costume_cache.clone();
    let start = Instant::now();
    timer.start(
        slint::TimerMode::Repeated,
        std::time::Duration::from_millis(16),
        move || {{
            // Step the sprite-runtime engine by one frame.
            let now_ms = start.elapsed().as_secs_f64() * 1000.0;
            let pending_opens: Vec<String> = {{
                let mut stage_mut = stage_for_tick.borrow_mut();
                stage_mut.set_clock(now_ms);
                scheduler_for_tick.borrow_mut().tick(&mut stage_mut);
                stage_mut.take_pending_url_opens()
            }};
            // Hand each URL to the platform's shell opener. Failure is
            // non-fatal — we log to stderr so a sandbox-blocked open
            // doesn't kill the app.
            for url in pending_opens {{
                if let Err(e) = opener::open(&url) {{
                    eprintln!("[sprite-app] open url '{{}}' failed: {{e}}", url);
                }}
            }}
            // Sync engine state into the Slint model.
            let stage_ref = stage_for_tick.borrow();
            let mut sprites_out: Vec<SpriteData> = Vec::with_capacity(stage_ref.sprites.len());
            // Layer order: lower draws first.
            let mut indices: Vec<usize> = (0..stage_ref.sprites.len()).collect();
            indices.sort_by_key(|&i| stage_ref.sprites[i].layer);
            for i in indices {{
                let s = &stage_ref.sprites[i];
                let size_px = (PLACEHOLDER_SIZE * s.size / 100.0) * RENDER_SCALE;
                let cx = (STAGE_W / 2.0 + s.x) * RENDER_SCALE;
                let cy = (STAGE_H / 2.0 - s.y) * RENDER_SCALE;
                let (bubble_text, bubble_visible) = match &s.bubble {{
                    Some(b) => (SharedString::from(&*b.text), true),
                    None => (SharedString::default(), false),
                }};
                // Resolve the active costume's image from the decoded
                // cache, if any. Falls back to placeholder square.
                let (costume, has_costume) = {{
                    let idx = s.costume_index;
                    if idx >= 0 && (idx as usize) < s.costumes.len() {{
                        let asset_id = s.costumes[idx as usize].asset_id.as_deref();
                        match asset_id.and_then(|id| costume_cache_for_tick.get(id)) {{
                            Some(img) => (img.clone(), true),
                            None => (Image::default(), false),
                        }}
                    }} else {{
                        (Image::default(), false)
                    }}
                }};
                // Honor Scratch's rotationStyle. Costumes are drawn
                // facing right by convention, so a sprite with direction=90
                // (right) needs zero rotation; direction=0 (up) rotates -90°.
                let rotation_deg = match s.rotation_style {{
                    RotationStyle::AllAround => s.direction - 90.0,
                    // left-right + dont-rotate: don't rotate the bitmap.
                    // (Slint's Image lacks horizontal flip without a
                    // transform, so left-right falls back to no-op.)
                    _ => 0.0,
                }};
                sprites_out.push(SpriteData {{
                    id: SharedString::from(&*s.id),
                    x: cx - size_px / 2.0,
                    y: cy - size_px / 2.0,
                    size: size_px,
                    color: placeholder_color(&s.id),
                    visible: s.visible,
                    bubble_text,
                    bubble_visible,
                    costume,
                    has_costume,
                    rotation: rotation_deg,
                }});
            }}
            model_for_tick.set_vec(sprites_out);

            // Refresh monitor text.
            let mut monitor = String::new();
            let names: Vec<&String> = stage_ref.visible_monitors.iter().collect();
            let mut sorted_names = names.clone();
            sorted_names.sort();
            for name in sorted_names {{
                let value = stage_ref
                    .global_variables
                    .get(name)
                    .map(|v| v.as_value().as_string())
                    .or_else(|| {{
                        stage_ref
                            .sprites
                            .iter()
                            .find_map(|sp| sp.variables.get(name).map(|v| v.as_value().as_string()))
                    }})
                    .unwrap_or_default();
                monitor.push_str(&format!("{{}} = {{}}\n", name, value));
            }}
            if let Some(ui) = ui_weak.upgrade() {{
                ui.set_monitor_text(SharedString::from(monitor));
            }}
        }},
    );

    ui.run()
}}

/// Decode a costume asset blob into a slint::Image. Handles both raster
/// formats (PNG/JPEG/GIF, via the `image` crate) and SVG (via resvg).
///
/// Inputs we expect:
///   - `data:image/png;base64,…`  → raster path
///   - `data:image/jpeg;base64,…` → raster path
///   - `data:image/svg+xml;base64,…` → SVG path
///   - `data:image/svg+xml,<urlencoded svg>` → SVG path (rare)
///   - bare base64 (legacy) → sniffed
///
/// Returns None on any decode failure so the runtime falls back to the
/// placeholder square instead of crashing.
fn decode_costume(blob: &str) -> Option<Image> {{
    // Pull the data URL mime + payload apart so we can route to the
    // right decoder. For non-data-URL blobs we treat the whole thing
    // as base64 raster bytes.
    let (mime, encoding, payload) = if let Some(rest) = blob.strip_prefix("data:") {{
        let comma = rest.find(',')?;
        let header = &rest[..comma];
        let payload = &rest[comma + 1..];
        // header looks like "image/svg+xml;base64" or "image/png;base64"
        // or "image/svg+xml" (then ;utf8 / no encoding -> URL-encoded text)
        let (mime, encoding) = match header.split_once(';') {{
            Some((m, e)) => (m, e),
            None => (header, ""),
        }};
        (mime, encoding, payload)
    }} else {{
        ("", "base64", blob)
    }};

    let bytes: Vec<u8> = if encoding.eq_ignore_ascii_case("base64") {{
        base64::engine::general_purpose::STANDARD.decode(payload).ok()?
    }} else if encoding.is_empty() || encoding.eq_ignore_ascii_case("utf8") {{
        // Plain text after the comma. URL-decode quickly: only `%xx`
        // pairs need translation; the rest is ASCII / UTF-8 already.
        url_decode(payload)
    }} else {{
        // Unknown encoding (e.g. "charset=utf-8") — try base64 first, then raw.
        base64::engine::general_purpose::STANDARD
            .decode(payload)
            .unwrap_or_else(|_| payload.as_bytes().to_vec())
    }};

    // SVG dispatch: trust the mime when present, else sniff the bytes.
    let is_svg = mime.eq_ignore_ascii_case("image/svg+xml")
        || mime.eq_ignore_ascii_case("image/svg")
        || sniff_svg(&bytes);

    if is_svg {{
        decode_svg(&bytes)
    }} else {{
        decode_raster(&bytes)
    }}
}}

fn decode_raster(bytes: &[u8]) -> Option<Image> {{
    let dyn_img = image::load_from_memory(bytes).ok()?;
    let rgba = dyn_img.to_rgba8();
    let (w, h) = rgba.dimensions();
    let buffer = SharedPixelBuffer::clone_from_slice(rgba.as_raw(), w, h);
    Some(Image::from_rgba8(buffer))
}}

/// Rasterize an SVG document into a slint::Image. resvg picks the size
/// from the SVG's intrinsic viewBox when present; we cap it at 1024px on
/// the longer side so a giant artboard doesn't blow up the costume cache.
fn decode_svg(bytes: &[u8]) -> Option<Image> {{
    let opt = resvg::usvg::Options::default();
    let tree = resvg::usvg::Tree::from_data(bytes, &opt).ok()?;
    let size = tree.size();
    let max_dim: f32 = 1024.0;
    let scale = (max_dim / size.width().max(size.height())).min(1.0);
    let pw = (size.width() * scale).ceil().max(1.0) as u32;
    let ph = (size.height() * scale).ceil().max(1.0) as u32;
    let mut pixmap = resvg::tiny_skia::Pixmap::new(pw, ph)?;
    let transform = resvg::tiny_skia::Transform::from_scale(scale, scale);
    resvg::render(&tree, transform, &mut pixmap.as_mut());
    let buffer = SharedPixelBuffer::clone_from_slice(pixmap.data(), pw, ph);
    Some(Image::from_rgba8(buffer))
}}

/// Quick byte sniff: scan the first 512 bytes for `<svg`. Lets the
/// fallback path (no mime hint) still recognize SVG payloads written
/// as raw base64 of the SVG XML.
fn sniff_svg(bytes: &[u8]) -> bool {{
    let head = &bytes[..bytes.len().min(512)];
    head.windows(4).any(|w| w.eq_ignore_ascii_case(b"<svg"))
}}

/// Tiny URL decoder for `data:image/svg+xml,<urlencoded>` payloads.
/// Decodes `%xx` pairs into bytes; everything else passes through.
fn url_decode(input: &str) -> Vec<u8> {{
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {{
        if bytes[i] == b'%' && i + 2 < bytes.len() {{
            let hi = (bytes[i + 1] as char).to_digit(16);
            let lo = (bytes[i + 2] as char).to_digit(16);
            if let (Some(h), Some(l)) = (hi, lo) {{
                out.push((h * 16 + l) as u8);
                i += 3;
                continue;
            }}
        }}
        if bytes[i] == b'+' {{
            // SVG data URLs don't typically use `+` for space, but a few
            // form-encoded payloads do — accept it for resilience.
            out.push(b' ');
        }} else {{
            out.push(bytes[i]);
        }}
        i += 1;
    }}
    out
}}

/// Map Slint's KeyEvent.text to a Scratch key name. Returns None for
/// keys we don't recognize (modifiers, function keys, composed input).
/// Slint encodes special keys (arrows, etc.) as private-use Unicode chars.
fn scratch_key_from_text(text: &str) -> Option<String> {{
    let mut chars = text.chars();
    let first = chars.next()?;
    // Multi-codepoint input (composed characters, IME) doesn't map to a
    // single discrete key — skip.
    if chars.next().is_some() {{
        return None;
    }}
    match first {{
        ' ' => Some("space".into()),
        '\u{{f700}}' => Some("up".into()),
        '\u{{f701}}' => Some("down".into()),
        '\u{{f702}}' => Some("left".into()),
        '\u{{f703}}' => Some("right".into()),
        '\n' | '\r' => Some("enter".into()),
        c if c.is_ascii_alphabetic() => Some(c.to_ascii_lowercase().to_string()),
        c if c.is_ascii_digit() => Some(c.to_string()),
        _ => None,
    }}
}}

/// Top-most sprite (highest layer) under the given stage coords, or None.
/// Uses placeholder bounds (40px × size%) — same hit-test the macroquad
/// player uses, ensures click semantics match across both runtimes.
fn hit_test_sprite(stage: &Stage, sx: f32, sy: f32) -> Option<String> {{
    let mut indices: Vec<usize> = (0..stage.sprites.len()).collect();
    indices.sort_by(|&a, &b| stage.sprites[b].layer.cmp(&stage.sprites[a].layer));
    for i in indices {{
        let s = &stage.sprites[i];
        if !s.visible {{
            continue;
        }}
        let half = (PLACEHOLDER_SIZE * s.size) / 200.0;
        if (sx - s.x).abs() <= half && (sy - s.y).abs() <= half {{
            return Some(s.id.clone());
        }}
    }}
    None
}}

/// Deterministic placeholder color for a sprite id (HSL → RGB).
fn placeholder_color(id: &str) -> Color {{
    let mut h: u32 = 0;
    for b in id.bytes() {{
        h = h.wrapping_mul(31).wrapping_add(b as u32);
    }}
    let hue = (h % 360) as f32;
    let (r, g, b) = hsl_to_rgb(hue / 360.0, 0.7, 0.6);
    Color::from_rgb_u8((r * 255.0) as u8, (g * 255.0) as u8, (b * 255.0) as u8)
}}

fn hsl_to_rgb(h: f32, s: f32, l: f32) -> (f32, f32, f32) {{
    let c = (1.0 - (2.0 * l - 1.0).abs()) * s;
    let h6 = h * 6.0;
    let x = c * (1.0 - ((h6 % 2.0) - 1.0).abs());
    let (r1, g1, b1) = match h6 as i32 {{
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    }};
    let m = l - c / 2.0;
    (r1 + m, g1 + m, b1 + m)
}}
"##
    )
}

/// Build the `project.json` blob the generated binary embeds via
/// `include_str!`. Walks every sprite in `stage.stage_state.sprites`,
/// transcompiles its `scripts_xml` into a `compiledScripts` array, and
/// writes the result back into the JSON.
pub fn project_json(stage: &SpriteStageIr) -> String {
    // Build a top-level wrapper matching what the runtime's Project
    // expects: { project: { app_name }, assets: [], stage_state: {...} }
    let mut wrapper = Map::new();
    let mut project = Map::new();
    project.insert("id".into(), JsonValue::String("generated".into()));
    project.insert(
        "app_name".into(),
        JsonValue::String("Sprite App".into()),
    );
    project.insert("version".into(), JsonValue::String("0.1".into()));
    project.insert("description".into(), JsonValue::String(String::new()));
    wrapper.insert("project".into(), JsonValue::Object(project));
    // Pass the project's assets through verbatim so the runtime can
    // decode costume / sound blobs at startup.
    wrapper.insert("assets".into(), stage.assets.clone());

    // Compile each sprite's scripts_xml into compiledScripts.
    let mut stage_state = stage.stage_state.clone();
    if let Some(sprites) = stage_state
        .get_mut("sprites")
        .and_then(|v| v.as_array_mut())
    {
        for sprite in sprites {
            let xml = sprite
                .get("scripts_xml")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let nodes = if xml.trim().is_empty() {
                Vec::new()
            } else {
                wf_sprite_codegen::parse_xml_to_nodes(&xml).unwrap_or_default()
            };
            if let Some(obj) = sprite.as_object_mut() {
                obj.insert(
                    "compiledScripts".into(),
                    serde_json::to_value(&nodes).unwrap_or(JsonValue::Array(Vec::new())),
                );
            }
        }
    }
    wrapper.insert("stage_state".into(), stage_state);

    stable_format(&serde_json::to_string_pretty(&JsonValue::Object(wrapper)).unwrap())
}

/// Minimal build.rs that runs `slint-build` against the generated UI.
pub fn build_rs() -> String {
    crate::templates::build_rs()
}

/// Minimal README that explains how to build the sprite app.
pub fn readme(ir: &AppIr) -> String {
    format!(
        "# {}\n\nGenerated sprite app — built by WarpForge Studio.\n\n## Build\n\n```bash\ncargo build --release\n```\n\nRun the binary from `target/release/`. The window auto-starts the sprite scripts (green flag).\n",
        ir.meta.app_name
    )
}
