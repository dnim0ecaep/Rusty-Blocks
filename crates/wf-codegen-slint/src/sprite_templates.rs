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
    // Width / height of the rendered sprite. When a costume is loaded
    // these reflect its natural dimensions × sprite.size%; otherwise
    // they fall back to a 40-unit placeholder × sprite.size%.
    width: length,
    height: length,
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
    // Effects. `opacity` derives from the ghost effect (0..100 → 1..0).
    // `brightness-tint-alpha` is the alpha of a white/black overlay used
    // to fake the brightness effect under Slint's declarative renderer
    // (Slint can't apply a colour matrix directly). Positive brightness
    // tints toward white, negative toward black; both routed through
    // `tint-color`.
    opacity: float,
    tint-color: color,
    tint-alpha: float,
    // True when this sprite should draw a small line from its center
    // out toward `direction` — i.e. when rotationStyle is all-around
    // and no costume image is loaded (so the user has a hint of where
    // the sprite is "pointing"). With a costume the rotation transform
    // visualizes orientation already.
    show-direction-tick: bool,
    direction-deg: angle,
    // Dynamic-text overlay set by `scratch_looks_set_text_to`. Drawn
    // upright (no rotation, no effects) on top of the sprite when
    // `has-text` is true. Empty string + has-text false hide the
    // overlay so a sprite with no `set text to` block looks identical
    // to before this property landed.
    text-value: string,
    has-text: bool,
    // Font family for the text overlay, set by
    // `scratch_looks_set_text_with_font`. Empty string falls back to
    // the Slint default font.
    font-family: string,
    // Explicit font size in pixels for the text overlay, set by
    // `scratch_looks_set_text_size_to`. 0 means "no override" — the
    // template falls back to the auto-derive (~32% of sprite height).
    text-size: length,
}}

export struct MonitorEntry {{
    // Display name (variable / list name).
    name: string,
    // Pre-formatted body. For variables: "= 42". For lists: a multi-
    // line breakdown like "1. GitHub\\n2. Mail" — Rust formats this so
    // the .slint side stays simple.
    body: string,
    // True when `body` represents a list — the chip widens & gets a
    // tighter line spacing for the numbered rows.
    is-list: bool,
}}

export component MainWindow inherits Window {{
    width: {width}px;
    height: {height}px;
    title: "{title_escaped}";
    forward-focus: input-scope;

    in property <[SpriteData]> sprites: [];
    in property <[MonitorEntry]> monitors: [];
    // Active stage backdrop (TurboWarp-style). When `has-backdrop` is
    // false the renderer falls back to a plain white background; when
    // true it stretches `backdrop` to fill the stage.
    in property <image> backdrop;
    in property <bool> has-backdrop: false;

    // Ask overlay. The Rust side mirrors `stage.pending_question()` here
    // each frame; non-empty means show the prompt. When the user clicks
    // OK or hits Enter, we forward `submit-answer(answer-text)` to Rust
    // and clear the local input, which will hide the overlay on the next
    // frame after Rust calls `stage.submit_answer()`.
    in property <string> ask-question: "";

    // Routed to Rust: a discrete key press (no auto-repeat).
    callback key-pressed(string);
    // Routed to Rust: the user released a key — needed so `key pressed?`
    // reporters stop returning true once the user stops holding.
    callback key-released(string);
    // Routed to Rust: a mouse-down on the stage. (x, y) are in screen
    // pixels. Rust converts to stage coords, hit-tests, and arms drag
    // bookkeeping.
    callback stage-pressed(float, float);
    // Routed to Rust: a mouse-move while the button is held — drives
    // sprite drag. Fires every move event between press and release.
    callback stage-moved(float, float);
    // Routed to Rust: a mouse-up on the stage. Rust uses press → release
    // delta to decide whether to fire `when this sprite clicked` hats
    // (no drag detected) or just clear drag state (drag completed).
    callback stage-released(float, float);
    // Routed to Rust: the user submitted an answer to the ask overlay.
    callback submit-answer(string);

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
        //
        // The wrapper Rectangle's `opacity` carries the ghost effect.
        // `tint-color` + `tint-alpha` paint a translucent overlay on
        // top of the image to simulate the brightness effect under
        // Slint's declarative renderer (no colour-matrix shaders).
        for sprite in sprites: Rectangle {{
            x: sprite.x;
            y: sprite.y;
            width: sprite.width;
            height: sprite.height;
            visible: sprite.visible;
            opacity: sprite.opacity;
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
            // Brightness overlay. Drawn on top of the costume / placeholder.
            Rectangle {{
                visible: sprite.tint-alpha > 0;
                width: parent.width;
                height: parent.height;
                background: sprite.tint-color;
                opacity: sprite.tint-alpha;
            }}
            // Direction tick (placeholder-only). Slint Rectangles in
            // this version don't expose rotation, so we approximate by
            // drawing a small fixed marker on the right edge — the
            // direction the sprite "faces" by Scratch convention. For
            // sprites with costumes, the costume's transform-rotation
            // already visualizes orientation. A future revision could
            // swap this for a Path that renders an arbitrary angle.
            Rectangle {{
                visible: sprite.show-direction-tick;
                x: parent.width / 2 + 2px;
                y: parent.height / 2 - 1px;
                width: parent.width / 4;
                height: 2px;
                background: #1a2333;
            }}
        }}

        // Dynamic-text overlay (set by `scratch_looks_set_text_to`).
        // Drawn outside the per-sprite Rectangle so it doesn't inherit
        // ghost / brightness / rotation. Sized at ~32% of the sprite's
        // height so a bigger sprite shows bigger text without manual
        // tuning.
        for sprite in sprites: Rectangle {{
            visible: sprite.has-text && sprite.visible;
            x: sprite.x;
            y: sprite.y;
            width: sprite.width;
            height: sprite.height;
            Text {{
                width: parent.width;
                height: parent.height;
                text: sprite.text-value;
                // Explicit size wins; 0 means "no override" → auto.
                font-size: sprite.text-size > 0px
                    ? sprite.text-size
                    : max(12px, parent.height * 0.32);
                font-weight: 700;
                font-family: sprite.font-family;
                color: #1a2333;
                horizontal-alignment: center;
                vertical-alignment: center;
                wrap: word-wrap;
            }}
        }}

        // Speech / thought bubble overlay. Explicit width + height so
        // the Rectangle doesn't auto-expand to fill its parent (an
        // earlier HorizontalLayout-wrapped version did exactly that and
        // covered the sprites).
        for sprite in sprites: Rectangle {{
            visible: sprite.bubble-visible && sprite.visible;
            x: min(parent.width - 220px, max(8px, sprite.x + sprite.width + 6px));
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

        // Variable + list monitors overlay (top-left). One rounded chip
        // per entry, stacked vertically. List bodies are multiline; var
        // bodies are single-line `= value`. Mirrors the studio's chip
        // strip so the same project looks the same in both runtimes.
        VerticalLayout {{
            x: 8px;
            y: 8px;
            spacing: 4px;
            for entry in root.monitors: Rectangle {{
                width: entry.is-list ? 240px : 200px;
                height: entry.is-list ? 28px + 18px * (entry.body == "(empty)" ? 1 : 4) : 26px;
                background: #f3f6fb;
                border-color: #cdd6e2;
                border-width: 1px;
                border-radius: 4px;
                VerticalLayout {{
                    x: 8px;
                    y: 4px;
                    width: parent.width - 16px;
                    height: parent.height - 8px;
                    spacing: 2px;
                    Text {{
                        text: entry.name;
                        font-size: 12px;
                        font-weight: 700;
                        color: #1a2333;
                        height: 14px;
                    }}
                    Text {{
                        text: entry.body;
                        font-size: 12px;
                        color: #1a2333;
                        wrap: word-wrap;
                    }}
                }}
            }}
        }}

        // Captures stage interactions. We forward press / move / release
        // separately so Rust can implement drag semantics (mouse-down on
        // sprite + drag → reposition; mouse-down on sprite + release in
        // place → fire `when this sprite clicked`).
        TouchArea {{
            pointer-event(event) => {{
                if (event.kind == PointerEventKind.down) {{
                    root.stage-pressed(self.mouse-x / 1px, self.mouse-y / 1px);
                }}
                if (event.kind == PointerEventKind.up) {{
                    root.stage-released(self.mouse-x / 1px, self.mouse-y / 1px);
                }}
            }}
            moved => {{
                if (self.pressed) {{
                    root.stage-moved(self.mouse-x / 1px, self.mouse-y / 1px);
                }}
            }}
        }}

        // Ask overlay. Drawn last (on top) so it intercepts clicks while
        // visible. When `ask-question` is the empty string the overlay
        // hides; Rust mirrors `stage.pending_question()` into this prop
        // each frame, so it appears whenever a script parks on
        // AwaitAnswer and disappears when Rust calls `submit_answer`.
        Rectangle {{
            visible: root.ask-question != "";
            width: parent.width;
            height: parent.height;
            // Dim the stage so the prompt reads as modal.
            background: #00000080;
            // The overlay's own TouchArea swallows any clicks that
            // miss the panel — without this, clicks would fall through
            // to the stage-clicked hit-test below.
            TouchArea {{ }}
            // Modal panel.
            panel := Rectangle {{
                width: 360px;
                height: 140px;
                x: (parent.width - self.width) / 2;
                y: (parent.height - self.height) / 2;
                background: #ffffff;
                border-color: #1a2333;
                border-width: 2px;
                border-radius: 8px;
                forward-focus: answer-input;
                Text {{
                    x: 14px;
                    y: 12px;
                    width: parent.width - 28px;
                    height: 36px;
                    text: root.ask-question;
                    font-size: 14px;
                    color: #1a2333;
                    wrap: word-wrap;
                }}
                answer-input := TextInput {{
                    x: 14px;
                    y: 56px;
                    width: parent.width - 28px;
                    height: 28px;
                    font-size: 14px;
                    color: #1a2333;
                    single-line: true;
                    accepted => {{
                        root.submit-answer(self.text);
                        self.text = "";
                    }}
                }}
                // Underline the input for visibility.
                Rectangle {{
                    x: 14px;
                    y: 84px;
                    width: parent.width - 28px;
                    height: 1px;
                    background: #1a2333;
                }}
                // OK button.
                Rectangle {{
                    width: 70px;
                    height: 28px;
                    x: parent.width - self.width - 14px;
                    y: parent.height - self.height - 12px;
                    background: #3a7fd5;
                    border-radius: 4px;
                    Text {{
                        text: "OK";
                        color: #ffffff;
                        font-size: 13px;
                        width: parent.width;
                        height: parent.height;
                        horizontal-alignment: center;
                        vertical-alignment: center;
                    }}
                    TouchArea {{
                        clicked => {{
                            root.submit-answer(answer-input.text);
                            answer-input.text = "";
                        }}
                    }}
                }}
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
use resvg::tiny_skia::{{IntSize, Pixmap, PixmapPaint, Transform}};
use slint::{{Color, ComponentHandle, Image, ModelRc, SharedPixelBuffer, SharedString, VecModel}};
use wf_sprite_runtime::{{model::{{RotationStyle, Sprite, STAGE_HEIGHT as SR_STAGE_H, STAGE_WIDTH as SR_STAGE_W}}, Project, Scheduler, Stage}};

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
    // Two parallel caches per costume:
    //   - `costume_cache` → slint::Image for the on-screen renderer
    //   - `pixmap_cache`  → tiny_skia::Pixmap for the per-tick CPU
    //     rasterization that feeds `scratch_sensing_touching_color`
    let mut costume_cache: HashMap<String, Image> = HashMap::new();
    let mut pixmap_cache: HashMap<String, Pixmap> = HashMap::new();
    for asset in &project.assets {{
        if !matches!(asset.kind, wf_sprite_runtime::model::AssetKind::Costume) {{
            continue;
        }}
        if let Some((img, pm)) = decode_costume_pair(&asset.path) {{
            costume_cache.insert(asset.id.clone(), img);
            pixmap_cache.insert(asset.id.clone(), pm);
        }} else if let Some(img) = decode_costume(&asset.path) {{
            // Image decoded but pixmap didn't — still keep the image so
            // the sprite renders, just won't sample for touching_color.
            costume_cache.insert(asset.id.clone(), img);
        }}
    }}
    let costume_cache = Rc::new(costume_cache);
    let pixmap_cache = Rc::new(pixmap_cache);

    let stage = Rc::new(RefCell::new(Stage::from_state(stage_state)));
    let scheduler = Rc::new(RefCell::new(Scheduler::new()));

    let ui = MainWindow::new()?;
    let model: Rc<VecModel<SpriteData>> = Rc::new(VecModel::default());
    ui.set_sprites(ModelRc::from(model.clone()));

    // Backdrop is resolved each tick from `stage.backdrop_index` so
    // `scratch_looks_switch_backdrop` updates render live. We track the
    // last-applied index to skip redundant `set_backdrop` calls when
    // the index hasn't changed.
    let last_backdrop_idx: Rc<RefCell<i32>> = Rc::new(RefCell::new(i32::MIN));

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

    // Stage interaction: press / move / release tracking. Drag state
    // is the sprite under the cursor at press time + the offset between
    // press point and sprite center. While the mouse moves with the
    // button held, the sprite tracks the cursor. On release, if the
    // mouse hadn't moved beyond `DRAG_SLOP_PX` pixels we treat it as a
    // click and fire `when this sprite clicked` hats; otherwise we
    // just clear the drag without firing.
    struct DragState {{
        sprite_id: String,
        offset_x: f32,
        offset_y: f32,
        press_stage_x: f32,
        press_stage_y: f32,
        moved_far: bool,
    }}
    const DRAG_SLOP_PX: f32 = 4.0;
    let drag: Rc<RefCell<Option<DragState>>> = Rc::new(RefCell::new(None));

    {{
        let stage_for_press = stage.clone();
        let drag_for_press = drag.clone();
        ui.on_stage_pressed(move |x, y| {{
            let stage_x = (x as f32 / RENDER_SCALE) - STAGE_W / 2.0;
            let stage_y = STAGE_H / 2.0 - (y as f32 / RENDER_SCALE);
            let s = stage_for_press.borrow();
            let hit = hit_test_sprite(&s, stage_x, stage_y);
            *drag_for_press.borrow_mut() = hit.and_then(|id| {{
                s.sprite(&id).map(|sp| DragState {{
                    sprite_id: id.clone(),
                    offset_x: sp.x - stage_x,
                    offset_y: sp.y - stage_y,
                    press_stage_x: stage_x,
                    press_stage_y: stage_y,
                    moved_far: false,
                }})
            }});
        }});
    }}

    {{
        let stage_for_move = stage.clone();
        let drag_for_move = drag.clone();
        ui.on_stage_moved(move |x, y| {{
            let stage_x = (x as f32 / RENDER_SCALE) - STAGE_W / 2.0;
            let stage_y = STAGE_H / 2.0 - (y as f32 / RENDER_SCALE);
            let mut drag_ref = drag_for_move.borrow_mut();
            if let Some(d) = drag_ref.as_mut() {{
                let dx = stage_x - d.press_stage_x;
                let dy = stage_y - d.press_stage_y;
                if dx.abs() > DRAG_SLOP_PX || dy.abs() > DRAG_SLOP_PX {{
                    d.moved_far = true;
                }}
                if d.moved_far {{
                    let mut s = stage_for_move.borrow_mut();
                    if let Some(sp) = s.sprite_mut(&d.sprite_id) {{
                        sp.x = stage_x + d.offset_x;
                        sp.y = stage_y + d.offset_y;
                    }}
                }}
            }}
        }});
    }}

    {{
        let stage_for_release = stage.clone();
        let scheduler_for_release = scheduler.clone();
        let drag_for_release = drag.clone();
        ui.on_stage_released(move |_x, _y| {{
            let taken = drag_for_release.borrow_mut().take();
            if let Some(d) = taken {{
                if !d.moved_far {{
                    let s = stage_for_release.borrow();
                    scheduler_for_release
                        .borrow_mut()
                        .fire_sprite_click(&s, &d.sprite_id);
                }}
            }}
        }});
    }}

    // Ask answer: the user typed a reply and hit Enter / OK. Hand it to
    // the runtime, which clears `pending_question` and lets the parked
    // script resume on its next AwaitAnswer poll.
    {{
        let stage_for_answer = stage.clone();
        ui.on_submit_answer(move |answer| {{
            stage_for_answer
                .borrow_mut()
                .submit_answer(answer.to_string());
        }});
    }}

    let timer = slint::Timer::default();
    let stage_for_tick = stage.clone();
    let scheduler_for_tick = scheduler.clone();
    let model_for_tick = model.clone();
    let ui_weak = ui.as_weak();
    let costume_cache_for_tick = costume_cache.clone();
    let last_backdrop_idx_for_tick = last_backdrop_idx.clone();
    let pixmap_cache_for_tick = pixmap_cache.clone();
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
            // Re-resolve the active backdrop if the index has changed since
            // last tick (`scratch_looks_switch_backdrop` updates it).
            {{
                let stage_ref = stage_for_tick.borrow();
                let cur_idx = stage_ref.backdrop_index;
                let mut last = last_backdrop_idx_for_tick.borrow_mut();
                if *last != cur_idx {{
                    *last = cur_idx;
                    let resolved: Option<Image> = if cur_idx >= 0 {{
                        stage_ref
                            .backdrops
                            .get(cur_idx as usize)
                            .and_then(|b| b.asset_id.as_deref())
                            .and_then(|id| costume_cache_for_tick.get(id).cloned())
                    }} else {{
                        None
                    }};
                    if let Some(ui) = ui_weak.upgrade() {{
                        match resolved {{
                            Some(img) => {{
                                ui.set_backdrop(img);
                                ui.set_has_backdrop(true);
                            }}
                            None => {{
                                ui.set_has_backdrop(false);
                            }}
                        }}
                    }}
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
                let scale = s.size / 100.0;
                let cx = (STAGE_W / 2.0 + s.x) * RENDER_SCALE;
                let cy = (STAGE_H / 2.0 - s.y) * RENDER_SCALE;
                let (bubble_text, bubble_visible) = match &s.bubble {{
                    Some(b) => (SharedString::from(&*b.text), true),
                    None => (SharedString::default(), false),
                }};
                // Resolve the active costume's image from the decoded
                // cache, if any. Falls back to placeholder square.
                // Width/height come from the costume's natural size when
                // loaded, so non-square sprites render at their true
                // aspect ratio (matches the studio Stage panel).
                let (costume, has_costume, base_w, base_h) = {{
                    let idx = s.costume_index;
                    if idx >= 0 && (idx as usize) < s.costumes.len() {{
                        let cos = &s.costumes[idx as usize];
                        let asset_id = cos.asset_id.as_deref();
                        match asset_id.and_then(|id| costume_cache_for_tick.get(id)) {{
                            Some(img) => (img.clone(), true, cos.width, cos.height),
                            None => (Image::default(), false, PLACEHOLDER_SIZE, PLACEHOLDER_SIZE),
                        }}
                    }} else {{
                        (Image::default(), false, PLACEHOLDER_SIZE, PLACEHOLDER_SIZE)
                    }}
                }};
                let w_px = base_w * scale * RENDER_SCALE;
                let h_px = base_h * scale * RENDER_SCALE;
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
                // Brightness + ghost — Slint can't do colour matrices
                // declaratively, so brightness becomes a translucent
                // white/black tint overlay (positive → white, negative
                // → black). Ghost becomes wrapper opacity. Mirrors the
                // macroquad host's approximation.
                let (opacity, tint_color, tint_alpha) = compute_effects(s);
                let show_direction_tick = !has_costume
                    && matches!(s.rotation_style, RotationStyle::AllAround);
                let (text_value, has_text) = match &s.text_value {{
                    Some(v) if !v.is_empty() => (SharedString::from(v.as_str()), true),
                    _ => (SharedString::default(), false),
                }};
                let font_family = match &s.font_family {{
                    Some(f) if !f.is_empty() => SharedString::from(f.as_str()),
                    _ => SharedString::default(),
                }};
                // Multiply by RENDER_SCALE so a value the user picks
                // (in stage-coord pixels) lands at the right window-px
                // size, matching the auto-derive path which operates
                // in window-px via parent.height.
                let text_size_px = s.text_size.unwrap_or(0.0) * RENDER_SCALE;
                sprites_out.push(SpriteData {{
                    id: SharedString::from(&*s.id),
                    x: cx - w_px / 2.0,
                    y: cy - h_px / 2.0,
                    width: w_px,
                    height: h_px,
                    color: placeholder_color(&s.id),
                    visible: s.visible,
                    bubble_text,
                    bubble_visible,
                    costume,
                    has_costume,
                    rotation: rotation_deg,
                    opacity,
                    tint_color,
                    tint_alpha,
                    show_direction_tick,
                    direction_deg: s.direction - 90.0,
                    text_value,
                    has_text,
                    font_family,
                    text_size: text_size_px,
                }});
            }}
            model_for_tick.set_vec(sprites_out);

            // Build one MonitorEntry per visible name. Variables show as
            // "= value"; lists render as a numbered breakdown. Per-sprite
            // names fall back through every sprite — first match wins,
            // matching the in-studio MonitorOverlay.
            let mut entries: Vec<MonitorEntry> = Vec::new();
            let mut sorted_names: Vec<&String> = stage_ref.visible_monitors.iter().collect();
            sorted_names.sort();
            for name in sorted_names {{
                if let Some(v) = stage_ref.global_variables.get(name) {{
                    entries.push(MonitorEntry {{
                        name: SharedString::from(name.as_str()),
                        body: SharedString::from(format!("= {{}}", v.as_value().as_string())),
                        is_list: false,
                    }});
                }} else if let Some(list) = stage_ref.global_lists.get(name) {{
                    entries.push(MonitorEntry {{
                        name: SharedString::from(name.as_str()),
                        body: SharedString::from(format_list(list)),
                        is_list: true,
                    }});
                }} else {{
                    let scalar = stage_ref
                        .sprites
                        .iter()
                        .find_map(|sp| sp.variables.get(name).map(|v| v.as_value().as_string()));
                    if let Some(value) = scalar {{
                        entries.push(MonitorEntry {{
                            name: SharedString::from(name.as_str()),
                            body: SharedString::from(format!("= {{}}", value)),
                            is_list: false,
                        }});
                    }} else if let Some(list) = stage_ref
                        .sprites
                        .iter()
                        .find_map(|sp| sp.lists.get(name).cloned())
                    {{
                        entries.push(MonitorEntry {{
                            name: SharedString::from(name.as_str()),
                            body: SharedString::from(format_list(&list)),
                            is_list: true,
                        }});
                    }}
                }}
            }}
            // Mirror any pending ask question into the overlay. Empty
            // string hides the overlay (see Slint template).
            let pending = stage_ref
                .pending_question()
                .map(SharedString::from)
                .unwrap_or_default();
            if let Some(ui) = ui_weak.upgrade() {{
                ui.set_monitors(ModelRc::from(Rc::new(VecModel::from(entries))));
                ui.set_ask_question(pending);
            }}
            // Rasterize the just-rendered stage into a CPU buffer so
            // next tick's `scratch_sensing_touching_color` queries see
            // what the user sees. We resolve the active backdrop's
            // pixmap (if any) and composite sprites on top.
            let backdrop_idx = stage_ref.backdrop_index;
            let backdrop_pixmap = if backdrop_idx >= 0 {{
                stage_ref
                    .backdrops
                    .get(backdrop_idx as usize)
                    .and_then(|b| b.asset_id.as_deref())
                    .and_then(|id| pixmap_cache_for_tick.get(id))
            }} else {{
                None
            }};
            let rendered = rasterize_stage(
                &stage_ref,
                &pixmap_cache_for_tick,
                backdrop_pixmap,
                STAGE_W as u32,
                STAGE_H as u32,
            );
            drop(stage_ref);
            stage_for_tick
                .borrow_mut()
                .set_pixel_buffer(rendered.width(), rendered.height(), rendered.data().to_vec());
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

/// Decode a costume into both display + sampling representations in a
/// single pass. Mirrors `decode_costume` but also produces a tiny_skia
/// Pixmap so the touching_color rasterizer can sample pixels without
/// re-decoding every frame.
fn decode_costume_pair(blob: &str) -> Option<(Image, Pixmap)> {{
    let (mime, encoding, payload) = if let Some(rest) = blob.strip_prefix("data:") {{
        let comma = rest.find(',')?;
        let header = &rest[..comma];
        let payload = &rest[comma + 1..];
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
        url_decode(payload)
    }} else {{
        base64::engine::general_purpose::STANDARD
            .decode(payload)
            .unwrap_or_else(|_| payload.as_bytes().to_vec())
    }};
    let is_svg = mime.eq_ignore_ascii_case("image/svg+xml")
        || mime.eq_ignore_ascii_case("image/svg")
        || sniff_svg(&bytes);
    if is_svg {{
        let opt = resvg::usvg::Options::default();
        let tree = resvg::usvg::Tree::from_data(&bytes, &opt).ok()?;
        let size = tree.size();
        let max_dim: f32 = 1024.0;
        let scale = (max_dim / size.width().max(size.height())).min(1.0);
        let pw = (size.width() * scale).ceil().max(1.0) as u32;
        let ph = (size.height() * scale).ceil().max(1.0) as u32;
        let mut pixmap = Pixmap::new(pw, ph)?;
        let transform = Transform::from_scale(scale, scale);
        resvg::render(&tree, transform, &mut pixmap.as_mut());
        let buffer = SharedPixelBuffer::clone_from_slice(pixmap.data(), pw, ph);
        Some((Image::from_rgba8(buffer), pixmap))
    }} else {{
        let dyn_img = image::load_from_memory(&bytes).ok()?;
        let rgba = dyn_img.to_rgba8();
        let (w, h) = rgba.dimensions();
        let buffer = SharedPixelBuffer::clone_from_slice(rgba.as_raw(), w, h);
        let pixmap = Pixmap::from_vec(rgba.into_raw(), IntSize::from_wh(w, h)?)?;
        Some((Image::from_rgba8(buffer), pixmap))
    }}
}}

/// Rasterize backdrop + visible sprites into a CPU Pixmap so the
/// runtime can sample what `touching_color` would see. Cheap enough at
/// 480×360 to run every tick (~170k pixels). Skips rotation + effects
/// for now — those add fidelity but the simple positioned blit covers
/// every common touching_color use case.
fn rasterize_stage(
    stage: &Stage,
    pixmap_cache: &HashMap<String, Pixmap>,
    backdrop_pixmap: Option<&Pixmap>,
    width: u32,
    height: u32,
) -> Pixmap {{
    let mut pm = Pixmap::new(width, height).expect("nonzero stage pixmap");
    pm.fill(resvg::tiny_skia::Color::WHITE);
    let paint = PixmapPaint::default();
    // Backdrop: stretched to fill the whole stage.
    if let Some(bp) = backdrop_pixmap {{
        let scale_x = width as f32 / bp.width() as f32;
        let scale_y = height as f32 / bp.height() as f32;
        pm.draw_pixmap(0, 0, bp.as_ref(), &paint, Transform::from_scale(scale_x, scale_y), None);
    }}
    // Sprites: layer order, lower first.
    let mut sorted: Vec<&Sprite> = stage.sprites.iter().filter(|s| s.visible).collect();
    sorted.sort_by_key(|s| s.layer);
    for s in sorted {{
        let costume = match s.costumes.get(s.costume_index.max(0) as usize) {{
            Some(c) => c,
            None => continue,
        }};
        let asset_id = match &costume.asset_id {{
            Some(id) => id,
            None => continue,
        }};
        let pixmap = match pixmap_cache.get(asset_id) {{
            Some(p) => p,
            None => continue,
        }};
        // Stage→buffer pixel scale (buffer is at logical stage size, so
        // 1:1 here, but kept explicit so a future high-res buffer works).
        let buf_per_stage_x = width as f32 / SR_STAGE_W;
        let buf_per_stage_y = height as f32 / SR_STAGE_H;
        // Costume natural dimensions × sprite.size%.
        let sprite_scale = s.size / 100.0;
        let scaled_w = costume.width * sprite_scale;
        let scaled_h = costume.height * sprite_scale;
        // Sprite center in buffer pixel coords (origin top-left).
        let cx_px = (SR_STAGE_W / 2.0 + s.x) * buf_per_stage_x;
        let cy_px = (SR_STAGE_H / 2.0 - s.y) * buf_per_stage_y;
        let top_left_x = cx_px - scaled_w * buf_per_stage_x / 2.0;
        let top_left_y = cy_px - scaled_h * buf_per_stage_y / 2.0;
        let total_scale_x = sprite_scale * buf_per_stage_x;
        let total_scale_y = sprite_scale * buf_per_stage_y;
        let transform = Transform::from_scale(total_scale_x, total_scale_y)
            .post_translate(top_left_x, top_left_y);
        pm.draw_pixmap(0, 0, pixmap.as_ref(), &paint, transform, None);
    }}
    pm
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

/// Map a sprite's brightness/ghost effects into the (opacity, tint
/// color, tint alpha) triple the Slint template consumes. Brightness
/// becomes a white overlay (positive) or black overlay (negative) at
/// alpha = |b|/100; ghost becomes wrapper opacity. Other effects are
/// stored on the sprite but not rendered until the offscreen-raster
/// pipeline (P3.12) lands.
fn compute_effects(s: &wf_sprite_runtime::model::Sprite) -> (f32, Color, f32) {{
    let Some(eff) = &s.effects else {{
        return (1.0, Color::from_argb_u8(0, 0, 0, 0), 0.0);
    }};
    let ghost = eff.ghost.unwrap_or(0.0).clamp(0.0, 100.0);
    let opacity = 1.0 - ghost / 100.0;
    let brightness = eff.brightness.unwrap_or(0.0).clamp(-100.0, 100.0);
    let (tint_color, tint_alpha) = if brightness > 0.0 {{
        (Color::from_argb_u8(255, 255, 255, 255), brightness / 100.0)
    }} else if brightness < 0.0 {{
        (Color::from_argb_u8(255, 0, 0, 0), -brightness / 100.0)
    }} else {{
        (Color::from_argb_u8(0, 0, 0, 0), 0.0)
    }};
    (opacity, tint_color, tint_alpha)
}}

/// Pretty-print a list value into the multi-line body shown in the
/// monitor chip. Empty lists render as "(empty)" so the user has visible
/// feedback even before the first add.
fn format_list(list: &[wf_sprite_runtime::model::ScalarJson]) -> String {{
    if list.is_empty() {{
        return "(empty)".to_string();
    }}
    let mut out = String::new();
    for (i, item) in list.iter().enumerate() {{
        if i > 0 {{
            out.push('\n');
        }}
        out.push_str(&format!("{{}}. {{}}", i + 1, item.as_value().as_string()));
    }}
    out
}}

/// Top-most sprite (highest layer) under the given stage coords, or None.
/// Uses the rendered sprite's actual costume dimensions (or the 40-unit
/// placeholder when the sprite has no costume) so the click area matches
/// what the user sees — no more 40×40 hit-box swallowed inside a much
/// larger costume.
fn hit_test_sprite(stage: &Stage, sx: f32, sy: f32) -> Option<String> {{
    let mut indices: Vec<usize> = (0..stage.sprites.len()).collect();
    indices.sort_by(|&a, &b| stage.sprites[b].layer.cmp(&stage.sprites[a].layer));
    for i in indices {{
        let s = &stage.sprites[i];
        if !s.visible {{
            continue;
        }}
        let scale = s.size / 100.0;
        let (base_w, base_h) = {{
            let idx = s.costume_index;
            if idx >= 0 && (idx as usize) < s.costumes.len() {{
                let cos = &s.costumes[idx as usize];
                (cos.width, cos.height)
            }} else {{
                (PLACEHOLDER_SIZE, PLACEHOLDER_SIZE)
            }}
        }};
        let half_w = (base_w * scale) / 2.0;
        let half_h = (base_h * scale) / 2.0;
        if (sx - s.x).abs() <= half_w && (sy - s.y).abs() <= half_h {{
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
