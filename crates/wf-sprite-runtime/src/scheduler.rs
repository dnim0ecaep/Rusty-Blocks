//! Cooperative scheduler — Rust port of `apps/studio/src/runtime/scheduler.ts`.
//!
//! Per tick: walk every running `Script`, advance each as far as it'll go
//! within a per-frame block budget, handle StepResults that involve other
//! scripts (broadcasts, clones), and drop completed scripts.

use std::sync::Arc;

use crate::interpreter::{Frame, Script, StepResult};
use crate::model::{ScriptNode, Sprite};
use crate::stage::Stage;

/// Maximum blocks one script may execute synchronously per frame before
/// the scheduler forces a yield. Prevents an unyielding `forever` loop
/// from freezing the renderer.
const BLOCKS_PER_FRAME: u32 = 1000;

/// Hard cap on simultaneously-living clones across the whole stage.
const CLONE_CAP: usize = 300;

pub struct Scheduler {
    pub scripts: Vec<Script>,
    next_script_id: u64,
}

impl Scheduler {
    pub fn new() -> Self {
        Self { scripts: Vec::new(), next_script_id: 1 }
    }

    pub fn allocate_id(&mut self) -> u64 {
        let id = self.next_script_id;
        self.next_script_id += 1;
        id
    }

    pub fn add(&mut self, script: Script) {
        self.scripts.push(script);
    }

    pub fn stop_all(&mut self) {
        self.scripts.clear();
    }

    pub fn stop_for_sprite(&mut self, sprite_id: &str) {
        self.scripts.retain(|s| s.sprite_id != sprite_id);
    }

    pub fn active_count(&self) -> usize { self.scripts.len() }

    /// Advance every script for one frame. Updates `stage.active_script_ids`
    /// after the tick so `BroadcastWait` frames see a current snapshot.
    pub fn tick(&mut self, stage: &mut Stage) {
        // Consume pending side-effects from previous tick's results, then step.
        let n = self.scripts.len();
        let mut i = 0;
        while i < n.min(self.scripts.len()) {
            self.step_one(i, stage);
            i += 1;
        }
        // Drop completed scripts, refresh the active id set.
        self.scripts.retain(|s| !s.is_done());
        stage.active_script_ids = self.scripts.iter().map(|s| s.id).collect();
    }

    /// Step the script at `idx` until it yields, dies, or hits the budget.
    /// Side-effects (broadcasts, clones) are applied inline.
    fn step_one(&mut self, idx: usize, stage: &mut Stage) {
        let mut budget = BLOCKS_PER_FRAME;
        loop {
            // Honor wait-resume.
            if let Some(resume) = self.scripts[idx].resume_at_ms {
                if stage.clock_ms() < resume {
                    return;
                }
                self.scripts[idx].resume_at_ms = None;
            }

            let result = self.scripts[idx].step(stage);
            match result {
                StepResult::Continue => {
                    if budget == 0 { return; }
                    budget -= 1;
                }
                StepResult::YieldFrame => return,
                StepResult::YieldUntil(t) => {
                    self.scripts[idx].resume_at_ms = Some(t);
                    return;
                }
                StepResult::Done => {
                    self.scripts[idx].frames.clear();
                    return;
                }
                StepResult::StopAll => {
                    self.scripts.clear();
                    return;
                }
                StepResult::StopOtherScripts => {
                    let me = self.scripts[idx].id;
                    let sprite = self.scripts[idx].sprite_id.clone();
                    self.scripts.retain(|s| s.id == me || s.sprite_id != sprite);
                    if budget == 0 { return; }
                    budget -= 1;
                }
                StepResult::BroadcastFire(name) => {
                    self.dispatch_broadcast(&name, stage);
                    if budget == 0 { return; }
                    budget -= 1;
                }
                StepResult::BroadcastAndWait(name) => {
                    let fired = self.dispatch_broadcast(&name, stage);
                    self.scripts[idx].frames.push(Frame::BroadcastWait { fired_ids: fired });
                    return;
                }
                StepResult::SpawnClone(target) => {
                    self.spawn_clone(idx, &target, stage);
                    if budget == 0 { return; }
                    budget -= 1;
                }
                StepResult::DeleteThisClone => {
                    let sprite_id = self.scripts[idx].sprite_id.clone();
                    let is_clone = stage.sprite(&sprite_id).map(|s| s.is_clone).unwrap_or(false);
                    if is_clone {
                        stage.remove_sprite(&sprite_id);
                        self.scripts.retain(|s| s.sprite_id != sprite_id);
                    }
                    return;
                }
                StepResult::PlaySound(_) | StepResult::PlaySoundUntilDone(_) | StepResult::StopAllSounds => {
                    // Audio is wired through a separate channel (audio.rs);
                    // this scheduler tick just ignores the request when
                    // audio isn't available (tests, headless feature).
                    if budget == 0 { return; }
                    budget -= 1;
                }
                StepResult::OpenUrl(url) => {
                    // Push onto the stage queue; the host drains after
                    // this tick and calls the platform's shell opener.
                    stage.queue_url_open(url);
                    if budget == 0 { return; }
                    budget -= 1;
                }
            }
            if self.scripts[idx].is_done() { return; }
        }
    }

    /// Dispatch broadcast `name` to every sprite, queuing one script per
    /// matching `when_i_receive` hat. Returns the spawned script ids.
    fn dispatch_broadcast(&mut self, name: &str, stage: &Stage) -> Vec<u64> {
        let target = name.trim().to_lowercase();
        if target.is_empty() { return Vec::new(); }
        let mut fired = Vec::new();
        for sprite in &stage.sprites {
            for hat in find_hats(&sprite.compiled_scripts, "scratch_event_when_i_receive") {
                let key = hat.field("BROADCAST").map(|s| s.trim().to_lowercase()).unwrap_or_default();
                if key != target { continue; }
                if let Some(body) = &hat.next {
                    let id = self.allocate_id();
                    fired.push(id);
                    self.scripts.push(Script::from_root(
                        id,
                        sprite.id.clone(),
                        format!("recv {} → {}", name, sprite.name),
                        Arc::new((**body).clone()),
                    ));
                }
            }
        }
        fired
    }

    /// Clone a sprite (target name "myself" or another sprite's name) and
    /// fire its `when_i_start_as_clone` hats against the new clone.
    fn spawn_clone(&mut self, owning_idx: usize, target: &str, stage: &mut Stage) {
        let lower = target.trim().to_lowercase();
        let owning_sprite_id = self.scripts[owning_idx].sprite_id.clone();
        let parent: Sprite = if lower == "myself" || lower.is_empty() {
            match stage.sprite(&owning_sprite_id).cloned() {
                Some(p) => p, None => return,
            }
        } else {
            match stage.sprite_by_name(&lower).cloned() {
                Some(p) => p, None => return,
            }
        };
        // Clones can't be parents — fall back to the original.
        let source_id = if parent.is_clone {
            parent.parent_sprite_id.clone().unwrap_or_else(|| parent.id.clone())
        } else {
            parent.id.clone()
        };
        let source = match stage.sprite(&source_id).cloned() {
            Some(s) => s, None => return,
        };
        if stage.clone_count() >= CLONE_CAP { return; }

        let mut clone = source.clone();
        clone.id = stage.allocate_sprite_id();
        clone.layer = stage.allocate_layer();
        clone.is_clone = true;
        clone.parent_sprite_id = Some(source_id);
        let clone_id = clone.id.clone();
        // Fresh per-clone variable scope.
        let clone_compiled = clone.compiled_scripts.clone();
        stage.add_sprite(clone);

        for hat in find_hats(&clone_compiled, "scratch_control_when_i_start_as_clone") {
            if let Some(body) = &hat.next {
                let id = self.allocate_id();
                self.scripts.push(Script::from_root(
                    id,
                    clone_id.clone(),
                    format!("clone:{}", clone_id),
                    Arc::new((**body).clone()),
                ));
            }
        }
    }

    /// Fire a `when_flag_clicked` hat across every sprite. Called by the
    /// host on user-initiated start.
    pub fn fire_green_flag(&mut self, stage: &Stage) {
        self.fire_hats_across(stage, "scratch_event_when_flag_clicked", |_| true, "flag");
    }

    /// Fire a `when_key_pressed` hat for every sprite whose KEY matches.
    pub fn fire_key_press(&mut self, stage: &Stage, scratch_key: &str) {
        let key = scratch_key.to_string();
        self.fire_hats_across(stage, "scratch_event_when_key_pressed",
            move |hat| {
                let slot = hat.field("KEY").unwrap_or("any");
                slot == "any" || slot == key
            },
            &format!("key:{}", scratch_key),
        );
    }

    /// Fire a `when_this_sprite_clicked` hat for one specific sprite.
    pub fn fire_sprite_click(&mut self, stage: &Stage, sprite_id: &str) {
        if let Some(sprite) = stage.sprite(sprite_id) {
            self.fire_hats_for_sprite(sprite, "scratch_event_when_this_sprite_clicked",
                |_| true, &format!("click:{}", sprite.name));
        }
    }

    fn fire_hats_across(
        &mut self,
        stage: &Stage,
        hat_type: &str,
        predicate: impl Fn(&ScriptNode) -> bool,
        label_prefix: &str,
    ) {
        for sprite in &stage.sprites {
            self.fire_hats_for_sprite(sprite, hat_type, &predicate, label_prefix);
        }
    }

    fn fire_hats_for_sprite(
        &mut self,
        sprite: &Sprite,
        hat_type: &str,
        predicate: impl Fn(&ScriptNode) -> bool,
        label_prefix: &str,
    ) {
        for hat in find_hats(&sprite.compiled_scripts, hat_type) {
            if !predicate(hat) { continue; }
            if let Some(body) = &hat.next {
                let id = self.allocate_id();
                self.scripts.push(Script::from_root(
                    id,
                    sprite.id.clone(),
                    format!("{} → {}", label_prefix, sprite.name),
                    Arc::new((**body).clone()),
                ));
            }
        }
    }
}

/// Find every top-level block in `nodes` matching `hat_type`.
pub fn find_hats<'a>(nodes: &'a [ScriptNode], hat_type: &str) -> Vec<&'a ScriptNode> {
    nodes.iter().filter(|n| n.r#type == hat_type).collect()
}
