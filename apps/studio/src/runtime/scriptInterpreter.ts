import { ask, getLastAnswer, isAnswered } from "./ask";
import { isPlaying, playSound, stopAllSounds, volumeOf } from "./audio";
import type { BlockLike } from "./compileScripts";
import {
  isKeyPressed,
  resetTimer as stageResetTimer,
  resolveSensingTarget,
  snapshot as stageInputSnapshot,
  timerSeconds,
} from "./stageInput";
import { STAGE_HEIGHT, STAGE_WIDTH, type Sprite } from "../types/workspace";

/**
 * Generator-based interpreter for Scratch primitive blocks.
 *
 * `runStack` yields a `StepResult` after every block (or every iteration of a
 * loop body, in Phase 4). Phase 2 only implements Motion blocks and treats
 * yields as scheduler hints — `runWorkspaceOnce` drains generators
 * synchronously since none of the Motion blocks actually need to wait.
 *
 * The scheduler in Phase 3 will respect the yield points so blocks like
 * `glide`, `wait`, `repeat`, and `forever` cooperate with the animation
 * loop instead of blocking.
 */

// Placeholder used for edge bouncing until Phase 8 brings real costume sizes.
const SPRITE_PLACEHOLDER_SIZE = 40;

export interface ExecContext {
  /** ID of the sprite the script is executing on behalf of. */
  spriteId: string;
  /** Always returns the latest sprite snapshot from the store. */
  getSprite(): Sprite | undefined;
  /** Apply a patch to the sprite in the store. */
  patchSprite(patch: Partial<Sprite>): void;
  /**
   * Optional: list of every sprite on the stage. Used by sensing reporters
   * (`touching`, `distance to`) to look up other sprites by name. Tests can
   * leave this undefined; the live runtime supplies it from the stage store.
   */
  getSprites?(): Sprite[];
  /**
   * Optional: dispatch a broadcast by name. Returns the ids of the queued
   * scripts so a caller (broadcast_and_wait) can poll for completion.
   * Tests can omit this; the live runtime hooks it through to the
   * scheduler + sprite-workspace materializer.
   */
  dispatchBroadcast?(name: string): string[];
  /** Optional: report whether any of `ids` is still scheduled. */
  hasActiveScripts?(ids: ReadonlyArray<string>): boolean;
  /**
   * Variable + list accessors. Implementations resolve scope: per-sprite
   * first, falling back to stage-scope. Writes target whichever scope
   * already holds the name; creates it per-sprite when neither does.
   * Tests can omit these to skip exercising data blocks.
   */
  getVariable?(name: string): number | string;
  setVariable?(name: string, value: number | string): void;
  getList?(name: string): Array<number | string>;
  setList?(name: string, list: Array<number | string>): void;
  /** Toggle a stage-overlay monitor for a variable or list by name. */
  setMonitorVisible?(name: string, visible: boolean): void;
  /**
   * Cloning hooks (Phase 9). `cloneSprite("myself")` clones the current
   * sprite; passing another sprite's name clones that one. Returns the
   * id of the new clone, or `undefined` if the cap was hit / target
   * missing. `deleteThisClone` removes the current sprite from the stage
   * and stops every script for it; the calling script should yield
   * `{kind: "stop", mode: "this-script"}` immediately after.
   */
  cloneSprite?(target: string): string | undefined;
  deleteThisClone?(): void;
}

export type StepResult =
  | { kind: "block" } // Just executed a block; scheduler may keep stepping.
  | { kind: "yield"; reason: "frame" | "wait" | "broadcast"; resumeAt?: number }
  | { kind: "stop"; mode: "all" | "this-script" | "other-scripts" };

/** JS-style truthiness for Scratch values. Empty string and "0"/"false" are falsy. */
export function isTruthy(value: number | string | boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0 && !Number.isNaN(value);
  if (value.length === 0) return false;
  if (value === "0" || value === "false") return false;
  return true;
}

/** Coerce a Scratch value to a number for arithmetic. NaN-safe — non-numeric strings → 0. */
export function asNumber(value: number | string | boolean): number {
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Coerce a value to the storage shape used by variables/lists (no booleans). */
function asScalar(value: number | string | boolean): number | string {
  if (typeof value === "boolean") return value ? "true" : "false";
  return value;
}

function readNumber(block: BlockLike, fieldName: string, fallback = 0): number {
  const raw = block.getFieldValue(fieldName);
  if (raw == null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function readString(block: BlockLike, fieldName: string, fallback = ""): string {
  const raw = block.getFieldValue(fieldName);
  return (raw == null ? fallback : String(raw));
}

type EffectName =
  | "color"
  | "fisheye"
  | "whirl"
  | "pixelate"
  | "mosaic"
  | "brightness"
  | "ghost";

const EFFECT_NAMES: ReadonlySet<EffectName> = new Set([
  "color",
  "fisheye",
  "whirl",
  "pixelate",
  "mosaic",
  "brightness",
  "ghost",
]);

function readEffectName(block: BlockLike): EffectName | null {
  const raw = readString(block, "EFFECT").toLowerCase();
  return EFFECT_NAMES.has(raw as EffectName) ? (raw as EffectName) : null;
}

/** Clamp / wrap an effect value the way Scratch does. Color wraps mod 200
 *  (full hue cycle); ghost is 0..100; brightness is -100..100; the
 *  unrendered effects accept any value but pass through unchanged. */
function clampEffect(name: EffectName, value: number): number {
  if (!Number.isFinite(value)) return 0;
  switch (name) {
    case "color":
      return ((value % 200) + 200) % 200;
    case "ghost":
      return Math.max(0, Math.min(100, value));
    case "brightness":
      return Math.max(-100, Math.min(100, value));
    default:
      return value;
  }
}

/**
 * Wrap a direction angle into the canonical (-180, 180] range so display
 * and arithmetic stay stable across many turns.
 */
export function normalizeDirection(d: number): number {
  let r = ((d + 180) % 360 + 360) % 360 - 180;
  // (-180, 180] — the wrap above can yield -180; bump to 180.
  if (r === -180) r = 180;
  return r;
}

function spriteHalfSize(s: Sprite): number {
  return (SPRITE_PLACEHOLDER_SIZE * s.size) / 200;
}

/** Run every block in a top-level stack. Yields between blocks. */
export function* runStack(
  root: BlockLike,
  ctx: ExecContext
): Generator<StepResult, void, void> {
  let cur: BlockLike | null = root;
  while (cur) {
    yield* runBlock(cur, ctx);
    cur = cur.getNextBlock();
  }
}

/** Execute a single block. Yields "block" once it has applied its effect. */
export function* runBlock(
  block: BlockLike,
  ctx: ExecContext
): Generator<StepResult, void, void> {
  const sprite = ctx.getSprite();
  if (!sprite) return;

  switch (block.type) {
    // ── Motion ──────────────────────────────────────────────────────────
    case "scratch_motion_move_steps": {
      const steps = readNumber(block, "STEPS", 10);
      // Scratch direction: 0 = up, 90 = right.
      // dx = steps * sin(d), dy = steps * cos(d), with +y up in stage coords.
      const rad = (sprite.direction * Math.PI) / 180;
      ctx.patchSprite({
        x: sprite.x + steps * Math.sin(rad),
        y: sprite.y + steps * Math.cos(rad),
      });
      break;
    }
    case "scratch_motion_turn_right": {
      const deg = readNumber(block, "DEGREES", 15);
      ctx.patchSprite({ direction: normalizeDirection(sprite.direction + deg) });
      break;
    }
    case "scratch_motion_turn_left": {
      const deg = readNumber(block, "DEGREES", 15);
      ctx.patchSprite({ direction: normalizeDirection(sprite.direction - deg) });
      break;
    }
    case "scratch_motion_goto_xy": {
      ctx.patchSprite({
        x: readNumber(block, "X", 0),
        y: readNumber(block, "Y", 0),
      });
      break;
    }
    case "scratch_motion_glide_xy": {
      const secs = Math.max(0, readNumber(block, "SECS", 1));
      const targetX = readNumber(block, "X", 0);
      const targetY = readNumber(block, "Y", 0);
      const startX = sprite.x;
      const startY = sprite.y;
      const startTime = performance.now();
      const endTime = startTime + secs * 1000;
      // Yield a frame between updates so the scheduler can paint and other
      // scripts can interleave. Snap immediately if secs <= 0.
      if (secs <= 0) {
        ctx.patchSprite({ x: targetX, y: targetY });
        break;
      }
      while (true) {
        const now = performance.now();
        const t = Math.min(1, (now - startTime) / (endTime - startTime));
        ctx.patchSprite({
          x: startX + (targetX - startX) * t,
          y: startY + (targetY - startY) * t,
        });
        if (t >= 1) break;
        yield { kind: "yield", reason: "frame" };
      }
      break;
    }
    case "scratch_motion_point_in_direction": {
      ctx.patchSprite({
        direction: normalizeDirection(readNumber(block, "DIRECTION", 90)),
      });
      break;
    }
    case "scratch_motion_change_x": {
      ctx.patchSprite({ x: sprite.x + readNumber(block, "DX", 10) });
      break;
    }
    case "scratch_motion_set_x": {
      ctx.patchSprite({ x: readNumber(block, "X", 0) });
      break;
    }
    case "scratch_motion_change_y": {
      ctx.patchSprite({ y: sprite.y + readNumber(block, "DY", 10) });
      break;
    }
    case "scratch_motion_set_y": {
      ctx.patchSprite({ y: readNumber(block, "Y", 0) });
      break;
    }
    case "scratch_motion_if_on_edge_bounce": {
      const half = spriteHalfSize(sprite);
      const minX = -STAGE_WIDTH / 2 + half;
      const maxX = STAGE_WIDTH / 2 - half;
      const minY = -STAGE_HEIGHT / 2 + half;
      const maxY = STAGE_HEIGHT / 2 - half;
      let x = sprite.x;
      let y = sprite.y;
      let dir = sprite.direction;
      let bounced = false;
      if (x < minX) {
        x = minX;
        dir = -dir;
        bounced = true;
      } else if (x > maxX) {
        x = maxX;
        dir = -dir;
        bounced = true;
      }
      if (y > maxY) {
        y = maxY;
        dir = 180 - dir;
        bounced = true;
      } else if (y < minY) {
        y = minY;
        dir = 180 - dir;
        bounced = true;
      }
      if (bounced) {
        ctx.patchSprite({ x, y, direction: normalizeDirection(dir) });
      }
      break;
    }
    case "scratch_motion_set_rotation_style": {
      const style = readString(block, "STYLE", "all-around");
      const valid: Sprite["rotationStyle"] =
        style === "left-right" || style === "dont-rotate" || style === "all-around"
          ? (style as Sprite["rotationStyle"])
          : "all-around";
      ctx.patchSprite({ rotationStyle: valid });
      break;
    }

    // ── Control ─────────────────────────────────────────────────────────
    case "scratch_control_wait": {
      const secs = Math.max(0, readNumber(block, "SECS", 0));
      if (secs > 0) {
        yield { kind: "yield", reason: "wait", resumeAt: performance.now() + secs * 1000 };
      }
      break;
    }
    case "scratch_control_repeat": {
      const times = Math.max(0, Math.trunc(readNumber(block, "TIMES", 10)));
      const body = block.getInputTargetBlock("DO");
      for (let i = 0; i < times; i++) {
        if (body) yield* runStack(body, ctx);
        // End-of-iteration frame yield so the script can't busy-loop the page
        // and other scripts get a chance to run.
        yield { kind: "yield", reason: "frame" };
      }
      break;
    }
    case "scratch_control_forever": {
      const body = block.getInputTargetBlock("DO");
      while (true) {
        if (body) yield* runStack(body, ctx);
        yield { kind: "yield", reason: "frame" };
      }
    }
    case "scratch_control_if": {
      const cond = block.getInputTargetBlock("CONDITION");
      if (cond && isTruthy(evaluate(cond, ctx))) {
        const body = block.getInputTargetBlock("DO");
        if (body) yield* runStack(body, ctx);
      }
      break;
    }
    case "scratch_control_if_else": {
      const cond = block.getInputTargetBlock("CONDITION");
      const truthy = cond ? isTruthy(evaluate(cond, ctx)) : false;
      const body = block.getInputTargetBlock(truthy ? "DO" : "ELSE");
      if (body) yield* runStack(body, ctx);
      break;
    }
    case "scratch_control_wait_until": {
      const cond = block.getInputTargetBlock("CONDITION");
      while (true) {
        if (cond && isTruthy(evaluate(cond, ctx))) break;
        if (!cond) break; // empty socket → already satisfied (matches Scratch)
        yield { kind: "yield", reason: "frame" };
      }
      break;
    }
    case "scratch_control_repeat_until": {
      const cond = block.getInputTargetBlock("CONDITION");
      const body = block.getInputTargetBlock("DO");
      while (true) {
        if (cond && isTruthy(evaluate(cond, ctx))) break;
        if (body) yield* runStack(body, ctx);
        yield { kind: "yield", reason: "frame" };
      }
      break;
    }
    case "scratch_control_stop": {
      const mode = readString(block, "STOP_OPTION", "all");
      if (mode === "all") {
        yield { kind: "stop", mode: "all" };
        return;
      }
      if (mode === "this-script" || mode === "this script") {
        yield { kind: "stop", mode: "this-script" };
        return;
      }
      // "other-scripts" — current keeps going after the stop signal.
      yield { kind: "stop", mode: "other-scripts" };
      break;
    }
    case "scratch_control_create_clone_of": {
      const target = readString(block, "TARGET", "myself");
      ctx.cloneSprite?.(target);
      break;
    }
    case "scratch_control_delete_this_clone":
      ctx.deleteThisClone?.();
      // Whether or not the clone hook was wired, stop the current script
      // — Scratch's delete_this_clone is terminal for the running stack.
      yield { kind: "stop", mode: "this-script" };
      return;

    // ── Looks (statements) ──────────────────────────────────────────────
    case "scratch_looks_say":
    case "scratch_looks_think": {
      const message = String(readArg(block, "MESSAGE", ctx));
      const kind: "say" | "think" = block.type === "scratch_looks_think" ? "think" : "say";
      ctx.patchSprite({ bubble: message ? { kind, text: message } : undefined });
      break;
    }
    case "scratch_looks_say_for_secs":
    case "scratch_looks_think_for_secs": {
      const message = String(readArg(block, "MESSAGE", ctx));
      const secs = Math.max(0, asNumber(readArg(block, "SECS", ctx)));
      const kind: "say" | "think" = block.type === "scratch_looks_think_for_secs" ? "think" : "say";
      ctx.patchSprite({ bubble: message ? { kind, text: message } : undefined });
      if (secs > 0) {
        yield { kind: "yield", reason: "wait", resumeAt: performance.now() + secs * 1000 };
      }
      ctx.patchSprite({ bubble: undefined });
      break;
    }
    case "scratch_looks_show":
      ctx.patchSprite({ visible: true });
      break;
    case "scratch_looks_hide":
      ctx.patchSprite({ visible: false });
      break;
    case "scratch_looks_change_size": {
      const d = asNumber(readArg(block, "DSIZE", ctx));
      ctx.patchSprite({ size: Math.max(0, sprite.size + d) });
      break;
    }
    case "scratch_looks_set_size": {
      const v = asNumber(readArg(block, "SIZE", ctx));
      ctx.patchSprite({ size: Math.max(0, v) });
      break;
    }
    case "scratch_looks_switch_costume": {
      const target = String(readArg(block, "COSTUME", ctx));
      const idx = sprite.costumes.findIndex((c) => c.name === target);
      if (idx >= 0) ctx.patchSprite({ costumeIndex: idx });
      break;
    }
    case "scratch_looks_next_costume": {
      if (sprite.costumes.length === 0) break;
      const next = (sprite.costumeIndex + 1) % sprite.costumes.length;
      ctx.patchSprite({ costumeIndex: next });
      break;
    }
    case "scratch_looks_switch_backdrop":
      // Backdrops are a stage-scope concept — Phase 8 wires them to
      // assets. For now, advance the stage's backdropIndex via the
      // patchSprite hook only when applicable. No-op safely.
      break;
    case "scratch_looks_change_effect_by": {
      const name = readEffectName(block);
      if (!name) break;
      const delta = asNumber(readArg(block, "VALUE", ctx));
      const current = sprite.effects?.[name] ?? 0;
      ctx.patchSprite({
        effects: { ...sprite.effects, [name]: clampEffect(name, current + delta) },
      });
      break;
    }
    case "scratch_looks_set_effect_to": {
      const name = readEffectName(block);
      if (!name) break;
      const value = asNumber(readArg(block, "VALUE", ctx));
      ctx.patchSprite({
        effects: { ...sprite.effects, [name]: clampEffect(name, value) },
      });
      break;
    }
    case "scratch_looks_clear_effects":
      ctx.patchSprite({ effects: undefined });
      break;

    // ── Sound ───────────────────────────────────────────────────────────
    case "scratch_sound_play": {
      const name = String(readArg(block, "SOUND", ctx));
      if (name) playSound(sprite, name);
      break;
    }
    case "scratch_sound_play_until_done": {
      const name = String(readArg(block, "SOUND", ctx));
      if (!name) break;
      const token = playSound(sprite, name);
      // Token 0 means playback couldn't start (no AudioContext, missing
      // sound, or test environment) — don't block on it forever.
      if (token === 0) break;
      // Per-frame poll: cheap (Map.has), and matches Scratch's "tick
      // until done" semantics. The `onended` callback in audio.ts
      // removes the token, so this loop exits on its own.
      while (isPlaying(token)) {
        yield { kind: "yield", reason: "frame" };
      }
      break;
    }
    case "scratch_sound_stop_all":
      stopAllSounds();
      break;
    case "scratch_sound_change_volume": {
      const d = asNumber(readArg(block, "DVOLUME", ctx));
      const v = Math.max(0, Math.min(100, volumeOf(sprite) + d));
      ctx.patchSprite({ volume: v });
      break;
    }
    case "scratch_sound_set_volume": {
      const v = Math.max(0, Math.min(100, asNumber(readArg(block, "VOLUME", ctx))));
      ctx.patchSprite({ volume: v });
      break;
    }
    case "scratch_looks_go_to_layer": {
      // Re-stack so the sprite is at front (highest layer) or back (lowest).
      const allSprites = ctx.getSprites?.() ?? [sprite];
      const slot = String(block.getFieldValue("LAYER") ?? "front");
      if (slot === "front") {
        const max = allSprites.reduce(
          (m, s) => Math.max(m, s.layer),
          Number.NEGATIVE_INFINITY
        );
        ctx.patchSprite({ layer: (Number.isFinite(max) ? max : 0) + 1 });
      } else {
        const min = allSprites.reduce(
          (m, s) => Math.min(m, s.layer),
          Number.POSITIVE_INFINITY
        );
        ctx.patchSprite({ layer: (Number.isFinite(min) ? min : 0) - 1 });
      }
      break;
    }

    // ── Variables / Lists (statements) ──────────────────────────────────
    case "scratch_data_set_variable": {
      const name = readString(block, "VARIABLE", "");
      const value = readArg(block, "VALUE", ctx);
      if (name && ctx.setVariable) ctx.setVariable(name, asScalar(value));
      break;
    }
    case "scratch_data_change_variable": {
      const name = readString(block, "VARIABLE", "");
      const delta = asNumber(readArg(block, "VALUE", ctx));
      if (name && ctx.setVariable && ctx.getVariable) {
        ctx.setVariable(name, asNumber(ctx.getVariable(name)) + delta);
      }
      break;
    }
    case "scratch_data_show_variable":
    case "scratch_data_hide_variable": {
      const name = readString(block, "VARIABLE", "");
      const visible = block.type === "scratch_data_show_variable";
      if (name && ctx.setMonitorVisible) ctx.setMonitorVisible(name, visible);
      break;
    }
    case "scratch_data_add_to_list": {
      const item = asScalar(readArg(block, "ITEM", ctx));
      const name = readString(block, "LIST", "");
      if (!name || !ctx.getList || !ctx.setList) break;
      const next = [...ctx.getList(name), item];
      ctx.setList(name, next);
      break;
    }
    case "scratch_data_delete_from_list": {
      const idx = Math.floor(asNumber(readArg(block, "INDEX", ctx)));
      const name = readString(block, "LIST", "");
      if (!name || !ctx.getList || !ctx.setList) break;
      const list = ctx.getList(name);
      if (idx < 1 || idx > list.length) break;
      const next = list.slice();
      next.splice(idx - 1, 1);
      ctx.setList(name, next);
      break;
    }
    case "scratch_data_replace_in_list": {
      const idx = Math.floor(asNumber(readArg(block, "INDEX", ctx)));
      const name = readString(block, "LIST", "");
      const item = asScalar(readArg(block, "ITEM", ctx));
      if (!name || !ctx.getList || !ctx.setList) break;
      const list = ctx.getList(name);
      if (idx < 1 || idx > list.length) break;
      const next = list.slice();
      next[idx - 1] = item;
      ctx.setList(name, next);
      break;
    }

    // ── Sensing (statement) ─────────────────────────────────────────────
    case "scratch_sensing_reset_timer":
      stageResetTimer();
      break;
    case "scratch_sensing_ask_and_wait": {
      const question = String(readArg(block, "QUESTION", ctx));
      ask(ctx.spriteId, question);
      while (!isAnswered()) {
        yield { kind: "yield", reason: "frame" };
      }
      break;
    }

    // ── External side-effects ──────────────────────────────────────────
    case "scratch_io_open_url": {
      const url = readString(block, "URL", "").trim();
      if (url && typeof window !== "undefined") {
        // Studio in-tab runtime: open the URL in a new browser tab.
        // The native (Slint/macroquad) hosts handle this differently —
        // they emit a step result that the host drains and passes to
        // the platform's shell opener.
        try {
          window.open(url, "_blank", "noopener,noreferrer");
        } catch {
          // Popup blocker / sandbox — silently ignore.
        }
      }
      break;
    }

    // ── Events (statements) ─────────────────────────────────────────────
    case "scratch_event_broadcast": {
      const name = readString(block, "BROADCAST", "");
      if (name && ctx.dispatchBroadcast) ctx.dispatchBroadcast(name);
      break;
    }
    case "scratch_event_broadcast_and_wait": {
      const name = readString(block, "BROADCAST", "");
      if (!name || !ctx.dispatchBroadcast) break;
      const fired = ctx.dispatchBroadcast(name);
      if (fired.length === 0 || !ctx.hasActiveScripts) break;
      // Yield a frame at a time until every dispatched script finishes.
      // The receivers are co-scheduled, so the wait completes within a
      // single Scratch "tick" in the common case.
      while (ctx.hasActiveScripts(fired)) {
        yield { kind: "yield", reason: "frame" };
      }
      break;
    }

    // ── Events (Phase 3: hat blocks are no-ops when reached in a stack;
    //    they're entry points the scheduler picks up via `findHats`.) ──
    case "scratch_event_when_flag_clicked":
    case "scratch_event_when_key_pressed":
    case "scratch_event_when_this_sprite_clicked":
    case "scratch_event_when_backdrop_switches":
    case "scratch_event_when_i_receive":
    case "scratch_control_when_i_start_as_clone":
      break;

    default:
      // Unimplemented (other categories arrive in later phases). Skip silently.
      break;
  }

  yield { kind: "block" };
}

/**
 * Read a reporter/value argument from `block.<name>`. Prefers a connected
 * input socket; falls back to a field value (which Scratch's primitive
 * blocks use for simple shadow inputs like the random low/high or join's
 * literals).
 */
function readArg(
  block: BlockLike,
  name: string,
  ctx: ExecContext
): number | string | boolean {
  const inputBlock = block.getInputTargetBlock(name);
  if (inputBlock) return evaluate(inputBlock, ctx);
  const raw = block.getFieldValue(name);
  if (raw == null) return 0;
  return raw;
}

const MATH_OPS: Record<string, (n: number) => number> = {
  abs: (n) => Math.abs(n),
  floor: (n) => Math.floor(n),
  ceiling: (n) => Math.ceil(n),
  sqrt: (n) => Math.sqrt(n),
  sin: (n) => Math.sin((n * Math.PI) / 180),
  cos: (n) => Math.cos((n * Math.PI) / 180),
  tan: (n) => Math.tan((n * Math.PI) / 180),
  ln: (n) => Math.log(n),
  log: (n) => Math.log10(n),
  "e^": (n) => Math.exp(n),
  "10^": (n) => Math.pow(10, n),
};

/**
 * Scratch equality: numeric-string equivalence first (so `"3" = 3` is true),
 * falling back to case-insensitive string comparison.
 */
function scratchEquals(a: number | string | boolean, b: number | string | boolean): boolean {
  const an = typeof a === "string" ? Number(a) : asNumber(a);
  const bn = typeof b === "string" ? Number(b) : asNumber(b);
  if (Number.isFinite(an) && Number.isFinite(bn)) return an === bn;
  return String(a).toLowerCase() === String(b).toLowerCase();
}

/**
 * Evaluate a reporter (output-shaped) block to a primitive value.
 * Handles Motion reporters, Operators, and Sensing reporters. Unknown
 * blocks return 0 — keeps the interpreter forgiving while categories
 * fill in.
 */
export function evaluate(block: BlockLike, ctx: ExecContext): number | string | boolean {
  const sprite = ctx.getSprite();
  if (!sprite) return 0;
  switch (block.type) {
    // ── Motion reporters ────────────────────────────────────────────────
    case "scratch_motion_x_position":
      return sprite.x;
    case "scratch_motion_y_position":
      return sprite.y;
    case "scratch_motion_direction":
      return sprite.direction;

    // ── Looks reporters ─────────────────────────────────────────────────
    case "scratch_looks_size":
      return sprite.size;
    case "scratch_looks_costume_number":
      return sprite.costumeIndex + 1; // Scratch is 1-indexed.

    // ── Sound reporter ──────────────────────────────────────────────────
    case "scratch_sound_volume":
      return volumeOf(sprite);

    // ── Variables / Lists reporters ─────────────────────────────────────
    case "scratch_data_variables_get": {
      const name = readString(block, "VARIABLE", "");
      if (!name || !ctx.getVariable) return 0;
      return ctx.getVariable(name);
    }
    case "scratch_data_item_of_list": {
      const idx = Math.floor(asNumber(readArg(block, "INDEX", ctx)));
      const name = readString(block, "LIST", "");
      if (!name || !ctx.getList) return "";
      const list = ctx.getList(name);
      if (idx < 1 || idx > list.length) return "";
      return list[idx - 1];
    }
    case "scratch_data_length_of_list": {
      const name = readString(block, "LIST", "");
      if (!name || !ctx.getList) return 0;
      return ctx.getList(name).length;
    }
    case "scratch_data_list_contains": {
      const name = readString(block, "LIST", "");
      const item = readArg(block, "ITEM", ctx);
      if (!name || !ctx.getList) return false;
      const itemS = String(item).toLowerCase();
      return ctx.getList(name).some((v) => String(v).toLowerCase() === itemS);
    }

    // ── Operators ───────────────────────────────────────────────────────
    case "scratch_op_add":
      return asNumber(readArg(block, "A", ctx)) + asNumber(readArg(block, "B", ctx));
    case "scratch_op_subtract":
      return asNumber(readArg(block, "A", ctx)) - asNumber(readArg(block, "B", ctx));
    case "scratch_op_multiply":
      return asNumber(readArg(block, "A", ctx)) * asNumber(readArg(block, "B", ctx));
    case "scratch_op_divide": {
      const b = asNumber(readArg(block, "B", ctx));
      if (b === 0) return Infinity; // Scratch returns Infinity here; fine for now.
      return asNumber(readArg(block, "A", ctx)) / b;
    }
    case "scratch_op_random": {
      const lo = asNumber(readArg(block, "FROM", ctx));
      const hi = asNumber(readArg(block, "TO", ctx));
      const min = Math.min(lo, hi);
      const max = Math.max(lo, hi);
      // Scratch: integer randomness when both endpoints are integers.
      if (Number.isInteger(lo) && Number.isInteger(hi)) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
      }
      return Math.random() * (max - min) + min;
    }
    case "scratch_op_lt":
      return asNumber(readArg(block, "A", ctx)) < asNumber(readArg(block, "B", ctx));
    case "scratch_op_gt":
      return asNumber(readArg(block, "A", ctx)) > asNumber(readArg(block, "B", ctx));
    case "scratch_op_eq":
      return scratchEquals(readArg(block, "A", ctx), readArg(block, "B", ctx));
    case "scratch_op_and":
      return isTruthy(readArg(block, "A", ctx)) && isTruthy(readArg(block, "B", ctx));
    case "scratch_op_or":
      return isTruthy(readArg(block, "A", ctx)) || isTruthy(readArg(block, "B", ctx));
    case "scratch_op_not":
      return !isTruthy(readArg(block, "A", ctx));
    case "scratch_op_join":
      return String(readArg(block, "A", ctx)) + String(readArg(block, "B", ctx));
    case "scratch_op_letter_of": {
      const idx = Math.floor(asNumber(readArg(block, "INDEX", ctx)));
      const s = String(readArg(block, "STRING", ctx));
      if (idx < 1 || idx > s.length) return "";
      return s[idx - 1];
    }
    case "scratch_op_length_of":
      return String(readArg(block, "STRING", ctx)).length;
    case "scratch_op_contains": {
      const haystack = String(readArg(block, "STRING", ctx)).toLowerCase();
      const needle = String(readArg(block, "SUBSTRING", ctx)).toLowerCase();
      return haystack.includes(needle);
    }
    case "scratch_op_mod": {
      const a = asNumber(readArg(block, "A", ctx));
      const b = asNumber(readArg(block, "B", ctx));
      if (b === 0) return NaN;
      // Scratch mod returns a result with the sign of the divisor (Python-style).
      const r = a - Math.floor(a / b) * b;
      return r;
    }
    case "scratch_op_round":
      return Math.round(asNumber(readArg(block, "VALUE", ctx)));
    case "scratch_op_math_op": {
      const op = String(block.getFieldValue("OP") ?? "abs");
      const fn = MATH_OPS[op];
      const v = asNumber(readArg(block, "VALUE", ctx));
      return fn ? fn(v) : v;
    }

    // ── Sensing reporters ───────────────────────────────────────────────
    case "scratch_sensing_timer":
      return timerSeconds();
    case "scratch_sensing_answer":
      return getLastAnswer();
    case "scratch_sensing_mouse_x":
      return stageInputSnapshot().mouseX;
    case "scratch_sensing_mouse_y":
      return stageInputSnapshot().mouseY;
    case "scratch_sensing_mouse_down":
      return stageInputSnapshot().mouseDown;
    case "scratch_sensing_key_pressed": {
      const key = String(block.getFieldValue("KEY") ?? "space");
      return isKeyPressed(key);
    }
    case "scratch_sensing_distance_to": {
      const target = String(readArg(block, "TARGET", ctx));
      const point = resolveSensingTarget(target, sprite.id);
      if (!point) return 10000;
      const dx = point.x - sprite.x;
      const dy = point.y - sprite.y;
      return Math.sqrt(dx * dx + dy * dy);
    }
    case "scratch_sensing_touching": {
      const target = String(readArg(block, "TARGET", ctx));
      // "edge" — within half a placeholder size of the stage edge.
      if (target === "edge") {
        const half = (40 * sprite.size) / 200;
        return (
          sprite.x - half <= -STAGE_WIDTH / 2 ||
          sprite.x + half >= STAGE_WIDTH / 2 ||
          sprite.y - half <= -STAGE_HEIGHT / 2 ||
          sprite.y + half >= STAGE_HEIGHT / 2
        );
      }
      const point = resolveSensingTarget(target, sprite.id);
      if (!point) return false;
      // Coarse AABB hit-test using placeholder size — Phase 8 will use real
      // costume bounds once costume images are loaded.
      const halfA = (40 * sprite.size) / 200;
      const halfB = 20;
      return (
        Math.abs(point.x - sprite.x) <= halfA + halfB &&
        Math.abs(point.y - sprite.y) <= halfA + halfB
      );
    }

    default:
      return 0;
  }
}

/**
 * Run every top-level statement stack in the workspace once against `ctx`.
 *
 * Synchronous: drains each generator immediately, ignoring yield reasons.
 * That's fine for Phase 2 because Motion blocks all complete synchronously;
 * Phase 3's scheduler will respect "yield" properly.
 *
 * Pure value reporters at the top level (no `next`/`prev` connectors) are
 * skipped so they don't accidentally execute as statements.
 */
export function runWorkspaceOnce(
  workspace: { getTopBlocks(ordered?: boolean): unknown[] },
  ctx: ExecContext
): void {
  const tops = workspace.getTopBlocks(true) as Array<
    BlockLike & { outputConnection?: unknown }
  >;
  for (const top of tops) {
    if (top.outputConnection) continue; // reporter at top level → skip
    const gen = runStack(top, ctx);
    while (true) {
      const result = gen.next();
      if (result.done) break;
    }
  }
}
