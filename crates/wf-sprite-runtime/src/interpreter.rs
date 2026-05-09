//! Block interpreter — Rust port of `apps/studio/src/runtime/scriptInterpreter.ts`.
//!
//! Design: each running script is a `Script` holding a stack of
//! `Frame`s. Each tick, the scheduler calls `Script::step(stage)` which
//! pops/processes the top frame and returns a `StepResult` telling the
//! scheduler what happened (continue, yield, broadcast, stop, …).
//!
//! Rust doesn't have stable generators, so the interpreter is a manual
//! stack-of-continuations rather than a translation of the TS generator
//! style. The semantics are identical — every yield in the TS code maps
//! to a `StepResult::Yield*` here, and every nested `runStack` call maps
//! to pushing a `Step` frame for the body.
//!
//! Block coverage matches the TS interpreter for everything the
//! sprite-bouncer example exercises: motion, control flow, looks
//! (say/show/hide/size/costume), variables, events (broadcasts and key
//! hats are dispatched by the scheduler, not here). Operators + sensing
//! reporters work via `evaluate`. Sound, glide, cloning are wired but
//! audio decoding lives in `audio.rs` (currently a stub on Linux).

use std::sync::Arc;

use crate::model::{
    Bubble, BubbleKind, RotationStyle, ScalarJson, ScriptNode, Value,
    STAGE_HEIGHT, STAGE_WIDTH,
};
use crate::stage::Stage;

/// Frame on a script's continuation stack. Top of stack is what runs next.
#[derive(Debug, Clone)]
pub enum Frame {
    /// Execute `node`, then continue the chain via `node.next`.
    Step(Arc<ScriptNode>),
    /// Re-push body each iteration.
    Forever { body: Arc<ScriptNode> },
    /// Run `body` `remaining` more times.
    Repeat { body: Arc<ScriptNode>, remaining: u32 },
    /// Loop until cond truthy.
    RepeatUntil { cond: Arc<ScriptNode>, body: Arc<ScriptNode> },
    /// Yield until cond truthy.
    WaitUntil { cond: Arc<ScriptNode> },
    /// Yield until clock >= resume_at_ms.
    Wait { resume_at_ms: f64 },
    /// Interpolate sprite from start to target between start_ms and end_ms.
    /// `start_ms` is captured when the glide begins so the lerp is a true
    /// linear function of elapsed time, not an approximation.
    Glide {
        start_x: f32, start_y: f32,
        target_x: f32, target_y: f32,
        start_ms: f64,
        end_ms: f64,
    },
    /// Yield until none of `fired_ids` is still in the scheduler.
    BroadcastWait { fired_ids: Vec<u64> },
    /// Same speech bubble as `say`, but auto-clears after timer.
    SayClear,
}

/// Result of one `Script::step` call. The scheduler interprets these.
#[derive(Debug, Clone)]
pub enum StepResult {
    /// Ran a block; scheduler may keep stepping (subject to per-frame budget).
    Continue,
    /// Pause until the next animation frame.
    YieldFrame,
    /// Pause until the wall clock reaches `until_ms`.
    YieldUntil(f64),
    /// Script finished cleanly.
    Done,
    /// Stop every script on the stage.
    StopAll,
    /// Stop other scripts on this sprite, but keep going.
    StopOtherScripts,
    /// Schedule broadcast receivers and continue.
    BroadcastFire(String),
    /// Schedule broadcast receivers, then push a BroadcastWait frame
    /// holding the resulting script ids. The scheduler does both halves.
    BroadcastAndWait(String),
    /// Clone the named target ("myself" or another sprite name) and fire
    /// its `when_i_start_as_clone` hats.
    SpawnClone(String),
    /// Remove this clone from the stage and stop its scripts.
    DeleteThisClone,
    /// Play a sound by name (fire-and-forget); ignored if no asset.
    PlaySound(String),
    /// Play a sound by name; the scheduler should push the appropriate
    /// wait frame (modeled as YieldUntil for now since rodio isn't async).
    PlaySoundUntilDone(String),
    /// Stop every active sound.
    StopAllSounds,
    /// Hand a URL (or file path) to the host so it can call the
    /// platform's shell opener. The runtime crate stays opener-free;
    /// hosts (Slint codegen, macroquad app) drain Stage::take_pending_url_opens
    /// and call opener::open themselves.
    OpenUrl(String),
}

/// One running script. The scheduler owns a Vec of these.
pub struct Script {
    pub id: u64,
    pub sprite_id: String,
    pub label: String,
    pub frames: Vec<Frame>,
    pub resume_at_ms: Option<f64>,
}

impl Script {
    /// Build a new script that will start by running `head` (typically the
    /// body of a hat block).
    pub fn from_root(id: u64, sprite_id: String, label: String, head: Arc<ScriptNode>) -> Self {
        Self {
            id,
            sprite_id,
            label,
            frames: vec![Frame::Step(head)],
            resume_at_ms: None,
        }
    }

    /// True if the script has nothing left to run.
    pub fn is_done(&self) -> bool {
        self.frames.is_empty()
    }

    /// Advance one step. May produce a yield (caller pauses), or continue
    /// (caller may step again under its budget).
    pub fn step(&mut self, stage: &mut Stage) -> StepResult {
        let Some(frame) = self.frames.pop() else {
            return StepResult::Done;
        };
        match frame {
            Frame::Step(node) => self.step_block(node, stage),
            Frame::Forever { body } => {
                // Re-push self so the loop re-enters next tick, then push
                // the body (so it runs first), then yield a frame.
                self.frames.push(Frame::Forever { body: body.clone() });
                self.frames.push(Frame::Step(body));
                StepResult::YieldFrame
            }
            Frame::Repeat { body, remaining } => {
                if remaining == 0 {
                    StepResult::Continue
                } else {
                    self.frames.push(Frame::Repeat {
                        body: body.clone(),
                        remaining: remaining - 1,
                    });
                    self.frames.push(Frame::Step(body));
                    StepResult::YieldFrame
                }
            }
            Frame::RepeatUntil { cond, body } => {
                let v = evaluate(&cond, stage, &self.sprite_id);
                if v.truthy() {
                    StepResult::Continue
                } else {
                    self.frames.push(Frame::RepeatUntil { cond, body: body.clone() });
                    self.frames.push(Frame::Step(body));
                    StepResult::YieldFrame
                }
            }
            Frame::WaitUntil { cond } => {
                let v = evaluate(&cond, stage, &self.sprite_id);
                if v.truthy() {
                    StepResult::Continue
                } else {
                    self.frames.push(Frame::WaitUntil { cond });
                    StepResult::YieldFrame
                }
            }
            Frame::Wait { resume_at_ms } => {
                let now = stage.clock_ms();
                if now >= resume_at_ms {
                    StepResult::Continue
                } else {
                    self.resume_at_ms = Some(resume_at_ms);
                    self.frames.push(Frame::Wait { resume_at_ms });
                    StepResult::YieldUntil(resume_at_ms)
                }
            }
            Frame::Glide { start_x, start_y, target_x, target_y, start_ms, end_ms } => {
                let now = stage.clock_ms();
                if now >= end_ms || end_ms <= start_ms {
                    if let Some(s) = stage.sprite_mut(&self.sprite_id) {
                        s.x = target_x;
                        s.y = target_y;
                    }
                    StepResult::Continue
                } else {
                    // True linear interpolation: t in [0, 1] proportional
                    // to elapsed wall-clock time vs the requested duration.
                    let t = ((now - start_ms) / (end_ms - start_ms))
                        .clamp(0.0, 1.0) as f32;
                    if let Some(s) = stage.sprite_mut(&self.sprite_id) {
                        s.x = start_x + (target_x - start_x) * t;
                        s.y = start_y + (target_y - start_y) * t;
                    }
                    self.frames.push(Frame::Glide {
                        start_x, start_y, target_x, target_y, start_ms, end_ms,
                    });
                    StepResult::YieldFrame
                }
            }
            Frame::BroadcastWait { fired_ids } => {
                if stage.any_script_active(&fired_ids) {
                    self.frames.push(Frame::BroadcastWait { fired_ids });
                    StepResult::YieldFrame
                } else {
                    StepResult::Continue
                }
            }
            Frame::SayClear => {
                if let Some(s) = stage.sprite_mut(&self.sprite_id) {
                    s.bubble = None;
                }
                StepResult::Continue
            }
        }
    }

    /// Execute one statement block. Returns the StepResult and may push
    /// new frames onto the script's stack.
    fn step_block(&mut self, node: Arc<ScriptNode>, stage: &mut Stage) -> StepResult {
        // Schedule the chain continuation BEFORE handling this block, so
        // control-block frames pushed below run on top and the chain
        // resumes after they pop.
        if let Some(next) = &node.next {
            self.frames.push(Frame::Step(Arc::new((**next).clone())));
        }

        let sprite_id = self.sprite_id.clone();

        match node.r#type.as_str() {
            // ── Motion ──────────────────────────────────────────────────
            "scratch_motion_move_steps" => {
                let steps = read_arg(&node, "STEPS", stage, &sprite_id).as_number();
                if let Some(s) = stage.sprite_mut(&sprite_id) {
                    let rad = (s.direction as f64) * std::f64::consts::PI / 180.0;
                    s.x += (steps * rad.sin()) as f32;
                    s.y += (steps * rad.cos()) as f32;
                }
                StepResult::Continue
            }
            "scratch_motion_turn_right" => {
                let deg = read_arg(&node, "DEGREES", stage, &sprite_id).as_number() as f32;
                if let Some(s) = stage.sprite_mut(&sprite_id) {
                    s.direction = normalize_direction(s.direction + deg);
                }
                StepResult::Continue
            }
            "scratch_motion_turn_left" => {
                let deg = read_arg(&node, "DEGREES", stage, &sprite_id).as_number() as f32;
                if let Some(s) = stage.sprite_mut(&sprite_id) {
                    s.direction = normalize_direction(s.direction - deg);
                }
                StepResult::Continue
            }
            "scratch_motion_goto_xy" => {
                let x = read_arg(&node, "X", stage, &sprite_id).as_number() as f32;
                let y = read_arg(&node, "Y", stage, &sprite_id).as_number() as f32;
                if let Some(s) = stage.sprite_mut(&sprite_id) {
                    s.x = x; s.y = y;
                }
                StepResult::Continue
            }
            "scratch_motion_point_in_direction" => {
                let d = read_arg(&node, "DIRECTION", stage, &sprite_id).as_number() as f32;
                if let Some(s) = stage.sprite_mut(&sprite_id) {
                    s.direction = normalize_direction(d);
                }
                StepResult::Continue
            }
            "scratch_motion_change_x" => {
                let dx = read_arg(&node, "DX", stage, &sprite_id).as_number() as f32;
                if let Some(s) = stage.sprite_mut(&sprite_id) { s.x += dx; }
                StepResult::Continue
            }
            "scratch_motion_change_y" => {
                let dy = read_arg(&node, "DY", stage, &sprite_id).as_number() as f32;
                if let Some(s) = stage.sprite_mut(&sprite_id) { s.y += dy; }
                StepResult::Continue
            }
            "scratch_motion_set_x" => {
                let x = read_arg(&node, "X", stage, &sprite_id).as_number() as f32;
                if let Some(s) = stage.sprite_mut(&sprite_id) { s.x = x; }
                StepResult::Continue
            }
            "scratch_motion_set_y" => {
                let y = read_arg(&node, "Y", stage, &sprite_id).as_number() as f32;
                if let Some(s) = stage.sprite_mut(&sprite_id) { s.y = y; }
                StepResult::Continue
            }
            "scratch_motion_if_on_edge_bounce" => {
                if let Some(s) = stage.sprite_mut(&sprite_id) {
                    let half = (40.0 * s.size) / 200.0;
                    let min_x = -STAGE_WIDTH / 2.0 + half;
                    let max_x = STAGE_WIDTH / 2.0 - half;
                    let min_y = -STAGE_HEIGHT / 2.0 + half;
                    let max_y = STAGE_HEIGHT / 2.0 - half;
                    let mut bounced = false;
                    if s.x < min_x { s.x = min_x; s.direction = -s.direction; bounced = true; }
                    else if s.x > max_x { s.x = max_x; s.direction = -s.direction; bounced = true; }
                    if s.y > max_y { s.y = max_y; s.direction = 180.0 - s.direction; bounced = true; }
                    else if s.y < min_y { s.y = min_y; s.direction = 180.0 - s.direction; bounced = true; }
                    if bounced { s.direction = normalize_direction(s.direction); }
                }
                StepResult::Continue
            }
            "scratch_motion_set_rotation_style" => {
                let style = node.field_string("STYLE", "all-around");
                let rs = match style.as_str() {
                    "left-right" => RotationStyle::LeftRight,
                    "dont-rotate" => RotationStyle::DontRotate,
                    _ => RotationStyle::AllAround,
                };
                if let Some(s) = stage.sprite_mut(&sprite_id) { s.rotation_style = rs; }
                StepResult::Continue
            }
            "scratch_motion_glide_xy" => {
                let secs = read_arg(&node, "SECS", stage, &sprite_id).as_number().max(0.0);
                let target_x = read_arg(&node, "X", stage, &sprite_id).as_number() as f32;
                let target_y = read_arg(&node, "Y", stage, &sprite_id).as_number() as f32;
                let (sx, sy) = stage.sprite(&sprite_id).map(|s| (s.x, s.y)).unwrap_or((0.0, 0.0));
                if secs <= 0.0 {
                    if let Some(s) = stage.sprite_mut(&sprite_id) { s.x = target_x; s.y = target_y; }
                    return StepResult::Continue;
                }
                let start_ms = stage.clock_ms();
                let end_ms = start_ms + secs * 1000.0;
                self.frames.push(Frame::Glide {
                    start_x: sx, start_y: sy, target_x, target_y, start_ms, end_ms,
                });
                StepResult::YieldFrame
            }

            // ── Looks ──────────────────────────────────────────────────
            "scratch_looks_say" | "scratch_looks_think" => {
                let msg = read_arg(&node, "MESSAGE", stage, &sprite_id).as_string();
                let kind = if node.r#type == "scratch_looks_think" { BubbleKind::Think } else { BubbleKind::Say };
                if let Some(s) = stage.sprite_mut(&sprite_id) {
                    s.bubble = if msg.is_empty() { None } else { Some(Bubble { kind, text: msg }) };
                }
                StepResult::Continue
            }
            "scratch_looks_say_for_secs" | "scratch_looks_think_for_secs" => {
                let msg = read_arg(&node, "MESSAGE", stage, &sprite_id).as_string();
                let secs = read_arg(&node, "SECS", stage, &sprite_id).as_number().max(0.0);
                let kind = if node.r#type == "scratch_looks_think_for_secs" { BubbleKind::Think } else { BubbleKind::Say };
                if let Some(s) = stage.sprite_mut(&sprite_id) {
                    s.bubble = if msg.is_empty() { None } else { Some(Bubble { kind, text: msg }) };
                }
                if secs > 0.0 {
                    // Push the clear frame, then a wait. The wait runs first
                    // (top of stack), then the clear.
                    self.frames.push(Frame::SayClear);
                    self.frames.push(Frame::Wait { resume_at_ms: stage.clock_ms() + secs * 1000.0 });
                } else if let Some(s) = stage.sprite_mut(&sprite_id) {
                    s.bubble = None;
                }
                StepResult::Continue
            }
            "scratch_looks_show" => {
                if let Some(s) = stage.sprite_mut(&sprite_id) { s.visible = true; }
                StepResult::Continue
            }
            "scratch_looks_hide" => {
                if let Some(s) = stage.sprite_mut(&sprite_id) { s.visible = false; }
                StepResult::Continue
            }
            "scratch_looks_change_size" => {
                let d = read_arg(&node, "DSIZE", stage, &sprite_id).as_number() as f32;
                if let Some(s) = stage.sprite_mut(&sprite_id) {
                    s.size = (s.size + d).max(0.0);
                }
                StepResult::Continue
            }
            "scratch_looks_set_size" => {
                let v = read_arg(&node, "SIZE", stage, &sprite_id).as_number() as f32;
                if let Some(s) = stage.sprite_mut(&sprite_id) {
                    s.size = v.max(0.0);
                }
                StepResult::Continue
            }
            "scratch_looks_switch_costume" => {
                let target = read_arg(&node, "COSTUME", stage, &sprite_id).as_string();
                if let Some(s) = stage.sprite_mut(&sprite_id) {
                    if let Some(idx) = s.costumes.iter().position(|c| c.name == target) {
                        s.costume_index = idx as i32;
                    }
                }
                StepResult::Continue
            }
            "scratch_looks_next_costume" => {
                if let Some(s) = stage.sprite_mut(&sprite_id) {
                    if !s.costumes.is_empty() {
                        let len = s.costumes.len() as i32;
                        s.costume_index = ((s.costume_index + 1).rem_euclid(len)).max(0);
                    }
                }
                StepResult::Continue
            }
            "scratch_looks_clear_effects" => {
                if let Some(s) = stage.sprite_mut(&sprite_id) { s.effects = None; }
                StepResult::Continue
            }
            "scratch_looks_go_to_layer" => {
                let to_front = node.field_string("LAYER", "front") == "front";
                let new_layer = if to_front {
                    stage.sprites.iter().map(|s| s.layer).max().unwrap_or(0) + 1
                } else {
                    stage.sprites.iter().map(|s| s.layer).min().unwrap_or(0) - 1
                };
                if let Some(s) = stage.sprite_mut(&sprite_id) { s.layer = new_layer; }
                StepResult::Continue
            }

            // ── Control ────────────────────────────────────────────────
            "scratch_control_wait" => {
                let secs = read_arg(&node, "SECS", stage, &sprite_id).as_number().max(0.0);
                if secs > 0.0 {
                    self.frames.push(Frame::Wait { resume_at_ms: stage.clock_ms() + secs * 1000.0 });
                }
                StepResult::Continue
            }
            "scratch_control_repeat" => {
                let times = read_arg(&node, "TIMES", stage, &sprite_id).as_number().max(0.0) as u32;
                if let Some(body) = node.input("DO") {
                    self.frames.push(Frame::Repeat { body: Arc::new(body.clone()), remaining: times });
                }
                StepResult::Continue
            }
            "scratch_control_forever" => {
                if let Some(body) = node.input("DO") {
                    self.frames.push(Frame::Forever { body: Arc::new(body.clone()) });
                }
                StepResult::Continue
            }
            "scratch_control_if" => {
                let truthy = node.input("CONDITION")
                    .map(|c| evaluate(c, stage, &sprite_id).truthy())
                    .unwrap_or(false);
                if truthy {
                    if let Some(body) = node.input("DO") {
                        self.frames.push(Frame::Step(Arc::new(body.clone())));
                    }
                }
                StepResult::Continue
            }
            "scratch_control_if_else" => {
                let truthy = node.input("CONDITION")
                    .map(|c| evaluate(c, stage, &sprite_id).truthy())
                    .unwrap_or(false);
                let branch = if truthy { node.input("DO") } else { node.input("ELSE") };
                if let Some(body) = branch {
                    self.frames.push(Frame::Step(Arc::new(body.clone())));
                }
                StepResult::Continue
            }
            "scratch_control_wait_until" => {
                if let Some(c) = node.input("CONDITION") {
                    self.frames.push(Frame::WaitUntil { cond: Arc::new(c.clone()) });
                }
                StepResult::Continue
            }
            "scratch_control_repeat_until" => {
                if let (Some(c), Some(b)) = (node.input("CONDITION"), node.input("DO")) {
                    self.frames.push(Frame::RepeatUntil {
                        cond: Arc::new(c.clone()),
                        body: Arc::new(b.clone()),
                    });
                }
                StepResult::Continue
            }
            "scratch_control_stop" => {
                let mode = node.field_string("STOP_OPTION", "all");
                self.frames.clear();
                match mode.as_str() {
                    "all" => StepResult::StopAll,
                    "this-script" | "this script" => StepResult::Done,
                    _ => StepResult::StopOtherScripts,
                }
            }
            "scratch_control_create_clone_of" => {
                let target = node.field_string("TARGET", "myself");
                StepResult::SpawnClone(target)
            }
            "scratch_control_delete_this_clone" => {
                self.frames.clear();
                StepResult::DeleteThisClone
            }

            // ── Sensing (statement) ────────────────────────────────────
            "scratch_sensing_reset_timer" => {
                stage.reset_timer();
                StepResult::Continue
            }

            // ── Events (statements) ────────────────────────────────────
            "scratch_event_broadcast" => {
                let name = node.field_string("BROADCAST", "");
                if name.is_empty() { StepResult::Continue }
                else { StepResult::BroadcastFire(name) }
            }
            "scratch_event_broadcast_and_wait" => {
                let name = node.field_string("BROADCAST", "");
                if name.is_empty() { StepResult::Continue }
                else { StepResult::BroadcastAndWait(name) }
            }

            // ── Variables / Lists ──────────────────────────────────────
            "scratch_data_set_variable" => {
                let name = node.field_string("VARIABLE", "");
                let value = read_arg(&node, "VALUE", stage, &sprite_id);
                if !name.is_empty() {
                    stage.set_variable(&sprite_id, &name, value);
                }
                StepResult::Continue
            }
            "scratch_data_change_variable" => {
                let name = node.field_string("VARIABLE", "");
                let delta = read_arg(&node, "VALUE", stage, &sprite_id).as_number();
                if !name.is_empty() {
                    let cur = stage.get_variable(&sprite_id, &name).as_number();
                    stage.set_variable(&sprite_id, &name, Value::Number(cur + delta));
                }
                StepResult::Continue
            }
            "scratch_data_show_variable" => {
                let name = node.field_string("VARIABLE", "");
                if !name.is_empty() { stage.set_monitor_visible(&name, true); }
                StepResult::Continue
            }
            "scratch_data_hide_variable" => {
                let name = node.field_string("VARIABLE", "");
                if !name.is_empty() { stage.set_monitor_visible(&name, false); }
                StepResult::Continue
            }
            "scratch_data_add_to_list" => {
                let item = read_arg(&node, "ITEM", stage, &sprite_id);
                let name = node.field_string("LIST", "");
                if !name.is_empty() {
                    let mut list = stage.get_list(&sprite_id, &name);
                    list.push(ScalarJson::from_value(&item));
                    stage.set_list(&sprite_id, &name, list);
                }
                StepResult::Continue
            }
            "scratch_data_delete_from_list" => {
                let idx = read_arg(&node, "INDEX", stage, &sprite_id).as_number() as i64;
                let name = node.field_string("LIST", "");
                if !name.is_empty() {
                    let mut list = stage.get_list(&sprite_id, &name);
                    let i = (idx - 1) as usize;
                    if i < list.len() {
                        list.remove(i);
                        stage.set_list(&sprite_id, &name, list);
                    }
                }
                StepResult::Continue
            }
            "scratch_data_replace_in_list" => {
                let idx = read_arg(&node, "INDEX", stage, &sprite_id).as_number() as i64;
                let name = node.field_string("LIST", "");
                let item = read_arg(&node, "ITEM", stage, &sprite_id);
                if !name.is_empty() {
                    let mut list = stage.get_list(&sprite_id, &name);
                    let i = (idx - 1) as usize;
                    if i < list.len() {
                        list[i] = ScalarJson::from_value(&item);
                        stage.set_list(&sprite_id, &name, list);
                    }
                }
                StepResult::Continue
            }

            // ── Sound ──────────────────────────────────────────────────
            "scratch_sound_play" => {
                let name = read_arg(&node, "SOUND", stage, &sprite_id).as_string();
                if name.is_empty() { StepResult::Continue }
                else { StepResult::PlaySound(name) }
            }
            "scratch_sound_play_until_done" => {
                let name = read_arg(&node, "SOUND", stage, &sprite_id).as_string();
                if name.is_empty() { StepResult::Continue }
                else { StepResult::PlaySoundUntilDone(name) }
            }
            "scratch_sound_stop_all" => StepResult::StopAllSounds,

            // ── External side-effects ─────────────────────────────────
            "scratch_io_open_url" => {
                let url = read_arg(&node, "URL", stage, &sprite_id).as_string();
                let trimmed = url.trim();
                if trimmed.is_empty() {
                    StepResult::Continue
                } else {
                    StepResult::OpenUrl(trimmed.to_string())
                }
            }
            "scratch_sound_set_volume" => {
                let v = read_arg(&node, "VOLUME", stage, &sprite_id).as_number() as f32;
                if let Some(s) = stage.sprite_mut(&sprite_id) {
                    s.volume = Some(v.clamp(0.0, 100.0));
                }
                StepResult::Continue
            }
            "scratch_sound_change_volume" => {
                let d = read_arg(&node, "DVOLUME", stage, &sprite_id).as_number() as f32;
                if let Some(s) = stage.sprite_mut(&sprite_id) {
                    let cur = s.volume.unwrap_or(100.0);
                    s.volume = Some((cur + d).clamp(0.0, 100.0));
                }
                StepResult::Continue
            }

            // ── Hat blocks reached as statements: no-op, the scheduler
            //    fires them via dispatchers.
            "scratch_event_when_flag_clicked"
            | "scratch_event_when_key_pressed"
            | "scratch_event_when_this_sprite_clicked"
            | "scratch_event_when_backdrop_switches"
            | "scratch_event_when_i_receive"
            | "scratch_control_when_i_start_as_clone" => StepResult::Continue,

            // Unknown / unimplemented blocks — silently no-op so the
            // example keeps running even if a new block sneaks into the
            // catalog without a handler here.
            _ => StepResult::Continue,
        }
    }
}

/// Wrap a direction angle into the canonical (-180, 180] range.
pub fn normalize_direction(d: f32) -> f32 {
    let mut r = ((d + 180.0) % 360.0 + 360.0) % 360.0 - 180.0;
    if r == -180.0 { r = 180.0; }
    r
}

/// Read a value from an input socket if present, else from the field of
/// the same name. Mirrors `readArg` in the TS interpreter.
pub fn read_arg(node: &ScriptNode, name: &str, stage: &Stage, sprite_id: &str) -> Value {
    if let Some(child) = node.input(name) {
        return evaluate(child, stage, sprite_id);
    }
    match node.field(name) {
        Some(s) => {
            if let Ok(n) = s.parse::<f64>() { Value::Number(n) }
            else { Value::Text(s.to_string()) }
        }
        None => Value::Number(0.0),
    }
}

/// Evaluate a reporter (output-shaped) block to a Value. Mirrors the
/// `evaluate` switch in the TS interpreter.
pub fn evaluate(node: &ScriptNode, stage: &Stage, sprite_id: &str) -> Value {
    match node.r#type.as_str() {
        // Motion reporters
        "scratch_motion_x_position" => Value::Number(stage.sprite(sprite_id).map(|s| s.x as f64).unwrap_or(0.0)),
        "scratch_motion_y_position" => Value::Number(stage.sprite(sprite_id).map(|s| s.y as f64).unwrap_or(0.0)),
        "scratch_motion_direction" => Value::Number(stage.sprite(sprite_id).map(|s| s.direction as f64).unwrap_or(90.0)),

        // Looks reporters
        "scratch_looks_size" => Value::Number(stage.sprite(sprite_id).map(|s| s.size as f64).unwrap_or(100.0)),
        "scratch_looks_costume_number" => Value::Number(stage.sprite(sprite_id).map(|s| (s.costume_index + 1) as f64).unwrap_or(1.0)),

        // Operators
        "scratch_op_add" => num_op(node, stage, sprite_id, |a, b| a + b),
        "scratch_op_subtract" => num_op(node, stage, sprite_id, |a, b| a - b),
        "scratch_op_multiply" => num_op(node, stage, sprite_id, |a, b| a * b),
        "scratch_op_divide" => {
            let b = read_arg(node, "B", stage, sprite_id).as_number();
            if b == 0.0 { Value::Number(f64::INFINITY) }
            else { Value::Number(read_arg(node, "A", stage, sprite_id).as_number() / b) }
        }
        "scratch_op_random" => {
            // Cheap LCG so we don't pull in `rand`; deterministic-ish per process.
            let lo = read_arg(node, "FROM", stage, sprite_id).as_number();
            let hi = read_arg(node, "TO", stage, sprite_id).as_number();
            let (min, max) = if lo <= hi { (lo, hi) } else { (hi, lo) };
            let r = pseudo_random();
            if lo.fract() == 0.0 && hi.fract() == 0.0 {
                Value::Number((min + (r * (max - min + 1.0)).floor()).min(max))
            } else {
                Value::Number(min + r * (max - min))
            }
        }
        "scratch_op_lt" => Value::Bool(
            read_arg(node, "A", stage, sprite_id).as_number() < read_arg(node, "B", stage, sprite_id).as_number()
        ),
        "scratch_op_gt" => Value::Bool(
            read_arg(node, "A", stage, sprite_id).as_number() > read_arg(node, "B", stage, sprite_id).as_number()
        ),
        "scratch_op_eq" => {
            let a = read_arg(node, "A", stage, sprite_id);
            let b = read_arg(node, "B", stage, sprite_id);
            Value::Bool(scratch_equals(&a, &b))
        }
        "scratch_op_and" => Value::Bool(
            read_arg(node, "A", stage, sprite_id).truthy() && read_arg(node, "B", stage, sprite_id).truthy()
        ),
        "scratch_op_or" => Value::Bool(
            read_arg(node, "A", stage, sprite_id).truthy() || read_arg(node, "B", stage, sprite_id).truthy()
        ),
        "scratch_op_not" => Value::Bool(!read_arg(node, "A", stage, sprite_id).truthy()),
        "scratch_op_join" => Value::Text(
            read_arg(node, "A", stage, sprite_id).as_string() + &read_arg(node, "B", stage, sprite_id).as_string()
        ),
        "scratch_op_length_of" => Value::Number(
            read_arg(node, "STRING", stage, sprite_id).as_string().chars().count() as f64
        ),
        "scratch_op_contains" => {
            let h = read_arg(node, "STRING", stage, sprite_id).as_string().to_lowercase();
            let n = read_arg(node, "SUBSTRING", stage, sprite_id).as_string().to_lowercase();
            Value::Bool(h.contains(&n))
        }
        "scratch_op_letter_of" => {
            let i = read_arg(node, "INDEX", stage, sprite_id).as_number().floor() as isize;
            let s = read_arg(node, "STRING", stage, sprite_id).as_string();
            if i < 1 || (i as usize) > s.chars().count() { Value::Text(String::new()) }
            else { Value::Text(s.chars().nth((i - 1) as usize).unwrap().to_string()) }
        }
        "scratch_op_mod" => {
            let a = read_arg(node, "A", stage, sprite_id).as_number();
            let b = read_arg(node, "B", stage, sprite_id).as_number();
            if b == 0.0 { Value::Number(f64::NAN) }
            else { Value::Number(a - (a / b).floor() * b) }
        }
        "scratch_op_round" => Value::Number(read_arg(node, "VALUE", stage, sprite_id).as_number().round()),
        "scratch_op_math_op" => {
            let op = node.field_string("OP", "abs");
            let v = read_arg(node, "VALUE", stage, sprite_id).as_number();
            let r = match op.as_str() {
                "abs" => v.abs(),
                "floor" => v.floor(),
                "ceiling" => v.ceil(),
                "sqrt" => v.sqrt(),
                "sin" => (v.to_radians()).sin(),
                "cos" => (v.to_radians()).cos(),
                "tan" => (v.to_radians()).tan(),
                "ln" => v.ln(),
                "log" => v.log10(),
                "e^" => v.exp(),
                "10^" => 10f64.powf(v),
                _ => v,
            };
            Value::Number(r)
        }

        // Sensing reporters
        "scratch_sensing_timer" => Value::Number(stage.timer_seconds()),
        "scratch_sensing_mouse_x" => Value::Number(stage.mouse_x() as f64),
        "scratch_sensing_mouse_y" => Value::Number(stage.mouse_y() as f64),
        "scratch_sensing_mouse_down" => Value::Bool(stage.mouse_down()),
        "scratch_sensing_key_pressed" => {
            let key = node.field_string("KEY", "space");
            Value::Bool(stage.is_key_pressed(&key))
        }

        // Variables / lists
        "scratch_data_variables_get" => {
            let name = node.field_string("VARIABLE", "");
            stage.get_variable(sprite_id, &name)
        }
        "scratch_data_item_of_list" => {
            let idx = read_arg(node, "INDEX", stage, sprite_id).as_number().floor() as isize;
            let name = node.field_string("LIST", "");
            let list = stage.get_list(sprite_id, &name);
            if idx < 1 || (idx as usize) > list.len() { Value::Text(String::new()) }
            else { list[(idx - 1) as usize].as_value() }
        }
        "scratch_data_length_of_list" => {
            let name = node.field_string("LIST", "");
            Value::Number(stage.get_list(sprite_id, &name).len() as f64)
        }
        "scratch_data_list_contains" => {
            let name = node.field_string("LIST", "");
            let item = read_arg(node, "ITEM", stage, sprite_id).as_string().to_lowercase();
            let list = stage.get_list(sprite_id, &name);
            Value::Bool(list.iter().any(|v| v.as_value().as_string().to_lowercase() == item))
        }

        _ => Value::Number(0.0),
    }
}

fn num_op(node: &ScriptNode, stage: &Stage, sprite_id: &str, f: fn(f64, f64) -> f64) -> Value {
    let a = read_arg(node, "A", stage, sprite_id).as_number();
    let b = read_arg(node, "B", stage, sprite_id).as_number();
    Value::Number(f(a, b))
}

fn scratch_equals(a: &Value, b: &Value) -> bool {
    let an = a.as_number();
    let bn = b.as_number();
    if an.is_finite() && bn.is_finite() && (matches!(a, Value::Number(_)) || a.as_string().parse::<f64>().is_ok())
        && (matches!(b, Value::Number(_)) || b.as_string().parse::<f64>().is_ok()) {
        return an == bn;
    }
    a.as_string().to_lowercase() == b.as_string().to_lowercase()
}

/// Tiny LCG so the runtime doesn't need `rand`. Seeded from the system
/// time on first call. Fine for cosmetic randomness.
fn pseudo_random() -> f64 {
    use std::sync::atomic::{AtomicU64, Ordering};
    static STATE: AtomicU64 = AtomicU64::new(0);
    let mut s = STATE.load(Ordering::Relaxed);
    if s == 0 {
        s = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(1)
            | 1;
    }
    s = s.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
    STATE.store(s, Ordering::Relaxed);
    ((s >> 11) as f64) / ((1u64 << 53) as f64)
}
