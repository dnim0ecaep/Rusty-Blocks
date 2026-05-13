//! Live runtime state for the stage.
//!
//! Owns every sprite, stage-scope variables/lists, monitor visibility,
//! input state (keyboard + mouse), and the timer baseline. The scheduler
//! and interpreter both read/write through this single struct so there's
//! no scattered global state.

use std::collections::{HashMap, HashSet};

use crate::model::{Costume, ScalarJson, Sprite, StageState, Value};

pub struct Stage {
    pub sprites: Vec<Sprite>,
    pub global_variables: HashMap<String, ScalarJson>,
    pub global_lists: HashMap<String, Vec<ScalarJson>>,
    pub visible_monitors: HashSet<String>,
    pub backdrop_index: i32,
    /// Available backdrop costumes — the active one is `backdrops[backdrop_index]`
    /// when the index is in-range. Stored so `scratch_looks_switch_backdrop`
    /// can resolve by name and the host can re-render on index change.
    pub backdrops: Vec<Costume>,

    // Live input state.
    pressed_keys: HashSet<String>,
    mouse_x: f32,
    mouse_y: f32,
    mouse_down: bool,

    // Timer baseline (process-relative, ms).
    timer_baseline_ms: f64,
    /// Last sampled clock value — set by the host each tick so the
    /// interpreter sees a consistent time within one frame.
    clock_ms: f64,

    /// Scratch ids that are still scheduled — used by `BroadcastWait`.
    /// The scheduler updates this each tick.
    pub active_script_ids: HashSet<u64>,

    /// URLs pending shell-open. `scratch_io_open_url` blocks push here;
    /// the host (Slint codegen main, macroquad app) drains via
    /// `take_pending_url_opens()` after each tick.
    pending_url_opens: Vec<String>,

    /// Currently-displayed ask prompt. `scratch_sensing_ask_and_wait`
    /// sets this; `submit_answer` clears it. The host watches this
    /// each frame and shows / hides its ask overlay accordingly.
    pending_question: Option<String>,
    /// Last submitted answer. `scratch_sensing_answer` reporter reads this.
    last_answer: String,

    /// CPU-side rasterized snapshot of the previous frame, used by
    /// `scratch_sensing_touching_color` to sample what the user actually
    /// sees. The host (Slint codegen main.rs) rasterizes backdrop +
    /// sprites into a Pixmap each tick and hands the RGBA bytes here
    /// via `set_pixel_buffer`. Layout: tightly-packed RGBA8.
    pixel_buffer_width: u32,
    pixel_buffer_height: u32,
    pixel_buffer: Vec<u8>,

    /// Allocator for fresh sprite ids when cloning.
    next_id: u64,
    /// Next layer for newly-added sprites.
    next_layer: i32,
}

impl Stage {
    pub fn from_state(state: StageState) -> Self {
        let next_layer = state.sprites.iter().map(|s| s.layer).max().unwrap_or(0) + 1;
        Self {
            sprites: state.sprites,
            global_variables: state.global_variables,
            global_lists: state.global_lists,
            visible_monitors: HashSet::new(),
            backdrop_index: state.backdrop_index,
            backdrops: state.backdrops,
            pressed_keys: HashSet::new(),
            mouse_x: 0.0,
            mouse_y: 0.0,
            mouse_down: false,
            timer_baseline_ms: 0.0,
            clock_ms: 0.0,
            active_script_ids: HashSet::new(),
            pending_url_opens: Vec::new(),
            pending_question: None,
            last_answer: String::new(),
            pixel_buffer_width: 0,
            pixel_buffer_height: 0,
            pixel_buffer: Vec::new(),
            next_id: 1,
            next_layer,
        }
    }

    // ── Time ──────────────────────────────────────────────────────────
    pub fn set_clock(&mut self, ms: f64) { self.clock_ms = ms; }
    pub fn clock_ms(&self) -> f64 { self.clock_ms }
    pub fn timer_seconds(&self) -> f64 { (self.clock_ms - self.timer_baseline_ms) / 1000.0 }
    pub fn reset_timer(&mut self) { self.timer_baseline_ms = self.clock_ms; }

    // ── Input ─────────────────────────────────────────────────────────
    pub fn press_key(&mut self, name: String) { self.pressed_keys.insert(name); }
    pub fn release_key(&mut self, name: &str) { self.pressed_keys.remove(name); }
    pub fn clear_keys(&mut self) { self.pressed_keys.clear(); }
    pub fn is_key_pressed(&self, name: &str) -> bool {
        if name == "any" { !self.pressed_keys.is_empty() } else { self.pressed_keys.contains(name) }
    }
    pub fn set_mouse(&mut self, x: f32, y: f32) { self.mouse_x = x; self.mouse_y = y; }
    pub fn set_mouse_down(&mut self, down: bool) { self.mouse_down = down; }
    pub fn mouse_x(&self) -> f32 { self.mouse_x }
    pub fn mouse_y(&self) -> f32 { self.mouse_y }
    pub fn mouse_down(&self) -> bool { self.mouse_down }

    // ── Sprite access ────────────────────────────────────────────────
    pub fn sprite(&self, id: &str) -> Option<&Sprite> {
        self.sprites.iter().find(|s| s.id == id)
    }
    pub fn sprite_mut(&mut self, id: &str) -> Option<&mut Sprite> {
        self.sprites.iter_mut().find(|s| s.id == id)
    }
    pub fn sprite_by_name(&self, name: &str) -> Option<&Sprite> {
        let lower = name.to_lowercase();
        self.sprites.iter().find(|s| s.name.to_lowercase() == lower)
    }
    pub fn add_sprite(&mut self, sprite: Sprite) {
        self.sprites.push(sprite);
    }
    pub fn remove_sprite(&mut self, id: &str) {
        self.sprites.retain(|s| s.id != id);
    }
    pub fn clone_count(&self) -> usize {
        self.sprites.iter().filter(|s| s.is_clone).count()
    }
    pub fn allocate_sprite_id(&mut self) -> String {
        let id = self.next_id;
        self.next_id += 1;
        format!("sprite_clone_{id}")
    }
    pub fn allocate_layer(&mut self) -> i32 {
        let l = self.next_layer;
        self.next_layer += 1;
        l
    }

    // ── Variables (scope: per-sprite first, then stage) ──────────────
    pub fn get_variable(&self, sprite_id: &str, name: &str) -> Value {
        if let Some(s) = self.sprite(sprite_id) {
            if let Some(v) = s.variables.get(name) { return v.as_value(); }
        }
        if let Some(v) = self.global_variables.get(name) { return v.as_value(); }
        Value::Number(0.0)
    }
    pub fn set_variable(&mut self, sprite_id: &str, name: &str, value: Value) {
        let in_sprite = self.sprite(sprite_id).map(|s| s.variables.contains_key(name)).unwrap_or(false);
        let in_global = self.global_variables.contains_key(name);
        if in_sprite {
            if let Some(s) = self.sprite_mut(sprite_id) {
                s.variables.insert(name.to_string(), ScalarJson::from_value(&value));
            }
        } else if in_global {
            self.global_variables.insert(name.to_string(), ScalarJson::from_value(&value));
        } else if let Some(s) = self.sprite_mut(sprite_id) {
            s.variables.insert(name.to_string(), ScalarJson::from_value(&value));
        }
    }
    pub fn get_list(&self, sprite_id: &str, name: &str) -> Vec<ScalarJson> {
        if let Some(s) = self.sprite(sprite_id) {
            if let Some(l) = s.lists.get(name) { return l.clone(); }
        }
        if let Some(l) = self.global_lists.get(name) { return l.clone(); }
        Vec::new()
    }
    pub fn set_list(&mut self, sprite_id: &str, name: &str, list: Vec<ScalarJson>) {
        let in_sprite = self.sprite(sprite_id).map(|s| s.lists.contains_key(name)).unwrap_or(false);
        let in_global = self.global_lists.contains_key(name);
        if in_sprite {
            if let Some(s) = self.sprite_mut(sprite_id) { s.lists.insert(name.to_string(), list); }
        } else if in_global {
            self.global_lists.insert(name.to_string(), list);
        } else if let Some(s) = self.sprite_mut(sprite_id) {
            s.lists.insert(name.to_string(), list);
        }
    }
    pub fn set_monitor_visible(&mut self, name: &str, visible: bool) {
        if visible { self.visible_monitors.insert(name.to_string()); }
        else { self.visible_monitors.remove(name); }
    }

    pub fn any_script_active(&self, ids: &[u64]) -> bool {
        ids.iter().any(|id| self.active_script_ids.contains(id))
    }

    /// Queue a URL for the host to shell-open after the current tick.
    /// Called by the scheduler when handling StepResult::OpenUrl.
    pub fn queue_url_open(&mut self, url: String) {
        self.pending_url_opens.push(url);
    }

    /// Drain pending URL opens. Hosts call this after each scheduler
    /// tick and pass the results to opener::open (or equivalent).
    /// Returns owned Strings since the host typically forwards them
    /// to a system call that may outlive the next tick's mutation.
    pub fn take_pending_url_opens(&mut self) -> Vec<String> {
        std::mem::take(&mut self.pending_url_opens)
    }

    // ── Ask / answer ──────────────────────────────────────────────────
    /// Currently-displayed prompt, if any. Hosts mirror this into their
    /// ask-overlay UI each frame (visible when Some, hidden when None).
    pub fn pending_question(&self) -> Option<&str> {
        self.pending_question.as_deref()
    }
    /// Set the prompt text — called by `scratch_sensing_ask_and_wait`.
    /// Multiple asks while one is pending overwrite (last one wins);
    /// in practice scripts park on AwaitAnswer between asks so this
    /// is rare. The simplification matches Scratch's "one ask at a time"
    /// behavior closely enough for this runtime's scope.
    pub fn set_pending_question(&mut self, q: String) {
        self.pending_question = Some(q);
    }
    /// The most recently submitted answer. `scratch_sensing_answer`
    /// reads this. Defaults to empty string before any answer.
    pub fn last_answer(&self) -> &str {
        &self.last_answer
    }
    /// Host calls this when the user submits the prompt. Stores the
    /// answer for `scratch_sensing_answer` and clears the prompt so
    /// any AwaitAnswer-parked scripts can resume.
    pub fn submit_answer(&mut self, answer: String) {
        self.last_answer = answer;
        self.pending_question = None;
    }

    // ── Pixel buffer (touching_color) ─────────────────────────────────
    /// Hand the host's just-rendered stage raster to the runtime.
    /// `data` is RGBA8, `width * height * 4` bytes.
    pub fn set_pixel_buffer(&mut self, width: u32, height: u32, data: Vec<u8>) {
        self.pixel_buffer_width = width;
        self.pixel_buffer_height = height;
        self.pixel_buffer = data;
    }

    /// Sample the rendered stage at Scratch coords. Returns RGB if the
    /// host has uploaded a buffer and the coords are in-range, else
    /// None. The runtime uses this to fulfil `touching_color`.
    pub fn stage_pixel(&self, x: f32, y: f32) -> Option<(u8, u8, u8)> {
        if self.pixel_buffer.is_empty() || self.pixel_buffer_width == 0 {
            return None;
        }
        // Scratch coords (origin centered, +y up) → pixel coords (origin
        // top-left, +y down). Map via the runtime's logical stage size,
        // not the buffer's, so the buffer can be at any resolution and
        // we still hit the right logical pixel.
        use crate::model::{STAGE_HEIGHT, STAGE_WIDTH};
        let buf_w = self.pixel_buffer_width as f32;
        let buf_h = self.pixel_buffer_height as f32;
        let px = ((x + STAGE_WIDTH / 2.0) * buf_w / STAGE_WIDTH).round() as i32;
        let py = ((STAGE_HEIGHT / 2.0 - y) * buf_h / STAGE_HEIGHT).round() as i32;
        if px < 0 || py < 0 || px >= self.pixel_buffer_width as i32
            || py >= self.pixel_buffer_height as i32
        {
            return None;
        }
        let idx = ((py as u32 * self.pixel_buffer_width + px as u32) * 4) as usize;
        let buf = &self.pixel_buffer;
        if idx + 2 >= buf.len() {
            return None;
        }
        Some((buf[idx], buf[idx + 1], buf[idx + 2]))
    }
}
