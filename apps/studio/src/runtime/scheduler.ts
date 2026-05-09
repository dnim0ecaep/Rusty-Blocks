import type { BlockLike } from "./compileScripts";
import { runStack, type ExecContext, type StepResult } from "./scriptInterpreter";

/**
 * Cooperative animation-frame scheduler for sprite scripts.
 *
 * Each "script" is a generator yielding `StepResult`s. The scheduler advances
 * every script as far as it can each tick — a generator can yield many times
 * synchronously to chain blocks within one frame; only `{ kind: "yield",
 * reason: "frame" | "wait" }` actually pauses the script.
 *
 * Designed so scripts never starve the main thread:
 * - "frame" yields → resume next animation frame.
 * - "wait" yields with `resumeAt` → resume after that timestamp.
 * - A per-tick block budget cuts off scripts that don't yield voluntarily,
 *   so a misbehaving forever-loop body without a frame yield can't lock up
 *   the studio.
 */

export interface RunningScript {
  id: string;
  spriteId: string;
  /** Optional human-readable label for debugging. */
  label?: string;
  gen: Generator<StepResult, void, void>;
  /** ms timestamp; if set and `now < resumeAt`, the script is sleeping. */
  resumeAt?: number;
  /**
   * Called exactly once when this script is removed from the scheduler
   * (completed, errored, or cleared via stopAll/stopForSprite). Used by
   * callers that materialize transient sprite workspaces — each script
   * holds Blockly.Block refs into a shared workspace, and the workspace
   * can only be disposed once every script using it has ended.
   */
  onEnd?: () => void;
}

interface SchedulerOptions {
  /** Block budget per script per frame. Defaults to a generous 1000 — well
   *  above any realistic synchronous chain — but bounded so an unyielding
   *  loop can't freeze the page. */
  blocksPerFrame?: number;
  /** Replaceable for tests. Defaults to window.requestAnimationFrame. */
  rafProvider?: (cb: FrameRequestCallback) => number;
  cancelRafProvider?: (handle: number) => void;
  /** Replaceable clock; defaults to `performance.now`. */
  now?: () => number;
  /** Initial target tick rate in fps. Defaults to 30 (Scratch standard). */
  targetFps?: number;
}

export class Scheduler {
  private scripts: RunningScript[] = [];
  private rafHandle: number | null = null;
  private isRunning = false;
  private listeners = new Set<(scripts: RunningScript[]) => void>();

  private readonly blocksPerFrame: number;
  private readonly raf: (cb: FrameRequestCallback) => number;
  private readonly cancelRaf: (handle: number) => void;
  private readonly now: () => number;
  /** Target tick interval in milliseconds. 0 means "no gating, tick
   *  every animation frame" (used for "Unlimited" mode). */
  private targetMs: number;
  /** Timestamp of the last accepted tick. Used to gate the next one
   *  against `targetMs`. */
  private lastTickAt = 0;

  constructor(options: SchedulerOptions = {}) {
    this.blocksPerFrame = options.blocksPerFrame ?? 1000;
    this.raf =
      options.rafProvider ??
      (typeof window !== "undefined" && window.requestAnimationFrame
        ? window.requestAnimationFrame.bind(window)
        : ((cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number));
    this.cancelRaf =
      options.cancelRafProvider ??
      (typeof window !== "undefined" && window.cancelAnimationFrame
        ? window.cancelAnimationFrame.bind(window)
        : ((handle) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>)));
    this.now = options.now ?? (() => performance.now());
    this.targetMs = fpsToTargetMs(options.targetFps ?? 30);
  }

  /** Update the target tick rate. `Infinity` disables gating so every
   *  raf advances scripts (TurboWarp's "Unlimited Framerate"). Anything
   *  ≤ 0 falls back to the Scratch default of 30 fps. */
  setTargetFramerate(fps: number): void {
    this.targetMs = fpsToTargetMs(fps);
    // Reset the gate so the next tick can run immediately at the new rate.
    this.lastTickAt = 0;
  }

  /** Register a callback to receive the script list whenever it changes. */
  onChange(listener: (scripts: RunningScript[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Number of scripts currently scheduled (running or sleeping). */
  get size(): number {
    return this.scripts.length;
  }

  get running(): boolean {
    return this.isRunning;
  }

  /** True if any of the given script IDs is still active. Used by
   * broadcast_and_wait to poll for completion of dispatched scripts. */
  hasActiveScripts(ids: ReadonlyArray<string>): boolean {
    if (ids.length === 0) return false;
    const set = new Set(ids);
    for (const s of this.scripts) {
      if (set.has(s.id)) return true;
    }
    return false;
  }

  /** Add a generator to the run queue. Does not auto-start the loop. */
  addScript(script: RunningScript): void {
    this.scripts.push(script);
    this.notify();
  }

  /** Begin (or resume) the animation-frame loop. No-op if already running. */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.scheduleTick();
  }

  /** Stop the loop and discard all scripts. Fires every script's `onEnd`. */
  stopAll(): void {
    if (this.rafHandle !== null) this.cancelRaf(this.rafHandle);
    this.rafHandle = null;
    this.isRunning = false;
    if (this.scripts.length > 0) {
      const ending = this.scripts;
      this.scripts = [];
      for (const s of ending) safeOnEnd(s);
      this.notify();
    }
  }

  /** Stop scripts belonging to a specific sprite. */
  stopForSprite(spriteId: string): void {
    const before = this.scripts.length;
    const ending = this.scripts.filter((s) => s.spriteId === spriteId);
    this.scripts = this.scripts.filter((s) => s.spriteId !== spriteId);
    if (ending.length > 0) {
      for (const s of ending) safeOnEnd(s);
      if (this.scripts.length !== before) this.notify();
    }
    if (this.scripts.length === 0) this.stopAll();
  }

  /**
   * Process exactly one frame. Tests call this directly to avoid raf timing.
   * Production goes through `start` which schedules `tickOnce` via raf.
   */
  tickOnce(): void {
    const t = this.now();
    const remaining: RunningScript[] = [];
    const ending: RunningScript[] = [];
    for (const s of this.scripts) {
      if (s.resumeAt !== undefined && t < s.resumeAt) {
        remaining.push(s);
        continue;
      }
      s.resumeAt = undefined;
      const stillRunning = this.advanceScript(s);
      if (stillRunning) remaining.push(s);
      else ending.push(s);
    }
    if (remaining.length !== this.scripts.length) {
      this.scripts = remaining;
      for (const s of ending) safeOnEnd(s);
      this.notify();
    }
  }

  /** Advance one script as far as it can go. Returns true if it should remain. */
  private advanceScript(script: RunningScript): boolean {
    let blocks = 0;
    while (blocks < this.blocksPerFrame) {
      let result: IteratorResult<StepResult, void>;
      try {
        result = script.gen.next();
      } catch {
        // Script threw — drop it.
        return false;
      }
      if (result.done) return false;
      const r = result.value;
      if (r.kind === "block") {
        blocks += 1;
        continue;
      }
      if (r.kind === "stop") {
        if (r.mode === "all") {
          // Drop everything (including this script). Fire onEnd for every
          // co-running script so transient workspaces get released.
          const ending = this.scripts.filter((s) => s.id !== script.id);
          this.scripts = [];
          for (const s of ending) safeOnEnd(s);
          this.notify();
          return false;
        }
        if (r.mode === "this-script") {
          return false;
        }
        // "other-scripts" — drop every other script on the same sprite,
        // then keep stepping the current one.
        const before = this.scripts.length;
        const dropped = this.scripts.filter(
          (s) => s.id !== script.id && s.spriteId === script.spriteId
        );
        this.scripts = this.scripts.filter(
          (s) => s.id === script.id || s.spriteId !== script.spriteId
        );
        if (this.scripts.length !== before) {
          for (const s of dropped) safeOnEnd(s);
          this.notify();
        }
        blocks += 1;
        continue;
      }
      // r.kind === "yield"
      if (r.reason === "frame") return true;
      if (r.reason === "wait" && r.resumeAt !== undefined) {
        script.resumeAt = r.resumeAt;
        return true;
      }
      // Other yield reasons (broadcast, etc.) — keep alive for now.
      return true;
    }
    // Hit per-frame budget without yielding. Force a frame yield.
    return true;
  }

  private scheduleTick(): void {
    this.rafHandle = this.raf(() => {
      this.rafHandle = null;
      if (!this.isRunning) return;
      // Framerate gate: skip this raf if not enough time has elapsed
      // since the last accepted tick. The raf still runs, so we re-arm
      // the next one to keep checking. `targetMs === 0` (Unlimited) and
      // the very first tick (`lastTickAt === 0`) bypass the gate.
      const t = this.now();
      const due = this.targetMs === 0 || this.lastTickAt === 0
        ? true
        : t - this.lastTickAt >= this.targetMs;
      if (due) {
        this.lastTickAt = t;
        this.tickOnce();
      }
      if (this.scripts.length > 0 && this.isRunning) {
        this.scheduleTick();
      } else {
        this.isRunning = false;
      }
    });
  }

  private notify(): void {
    const snapshot = [...this.scripts];
    for (const fn of this.listeners) fn(snapshot);
  }
}

function safeOnEnd(script: RunningScript): void {
  if (!script.onEnd) return;
  try {
    script.onEnd();
  } catch {
    // Owner-side cleanup failures shouldn't break the scheduler tick.
  }
  script.onEnd = undefined;
}

/**
 * Pull every block of `hatType` from a top-level block list. Accepts a
 * Blockly.Workspace (studio) or a pre-compiled `BlockLike[]` (standalone)
 * — anything with a `getTopBlocks` method, or a raw array, works.
 *
 * The returned blocks are the hats themselves; their script body is
 * `hat.getNextBlock()` (which may be null for an empty hat).
 */
export function findHats(
  source: { getTopBlocks(ordered?: boolean): unknown[] } | ReadonlyArray<BlockLike>,
  hatType: string
): BlockLike[] {
  const tops: BlockLike[] = Array.isArray(source)
    ? (source as BlockLike[])
    : ((source as { getTopBlocks(o?: boolean): unknown[] }).getTopBlocks(false) as BlockLike[]);
  return tops.filter((b) => b.type === hatType);
}

/**
 * Build a generator that runs the body attached to `hat`. Returns a
 * generator that immediately completes when the hat has no body.
 */
export function* runHat(hat: BlockLike, ctx: ExecContext): Generator<StepResult, void, void> {
  const body = hat.getNextBlock();
  if (!body) return;
  yield* runStack(body, ctx);
}

/** Convert an fps value to the per-tick interval in milliseconds.
 *  `Infinity` (or anything ≥ 1000fps) collapses to 0 = "no gating".
 *  Values ≤ 0 fall back to Scratch's 30fps default. */
function fpsToTargetMs(fps: number): number {
  if (!Number.isFinite(fps) || fps >= 1000) return 0;
  if (fps <= 0) return 1000 / 30;
  return 1000 / fps;
}

/**
 * Project-wide scheduler singleton. Centralizing here means the green flag
 * button, the stop button, and (later) keyboard/click event hats all push
 * scripts into the same loop.
 */
export const sharedScheduler = new Scheduler();
