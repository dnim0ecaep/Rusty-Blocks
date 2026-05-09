import * as Blockly from "blockly";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { registerScratchPrimitiveBlocks } from "../../blocks/scratchPrimitiveBlocks";
import { findHats, runHat, Scheduler } from "../scheduler";
import { runStack, type ExecContext, type StepResult } from "../scriptInterpreter";
import type { Sprite } from "../../types/workspace";

function makeSprite(overrides: Partial<Sprite> = {}): Sprite {
  return {
    id: "s1",
    name: "S",
    x: 0,
    y: 0,
    direction: 90,
    size: 100,
    visible: true,
    rotationStyle: "all-around",
    costumeIndex: -1,
    costumes: [],
    sounds: [],
    scripts_xml: "",
    variables: {},
    lists: {},
    layer: 1,
    ...overrides,
  };
}

function makeContext(ref: { current: Sprite }): ExecContext {
  return {
    spriteId: ref.current.id,
    getSprite: () => ref.current,
    patchSprite: (patch) => {
      ref.current = { ...ref.current, ...patch };
    },
  };
}

/** Test scheduler with a programmable clock and immediate raf execution. */
function makeTestScheduler(opts?: { initialNow?: number }) {
  let now = opts?.initialNow ?? 0;
  const pendingRafs: Array<{ id: number; cb: FrameRequestCallback }> = [];
  let nextId = 1;
  const scheduler = new Scheduler({
    rafProvider: (cb) => {
      const id = nextId++;
      pendingRafs.push({ id, cb });
      return id;
    },
    cancelRafProvider: (handle) => {
      const idx = pendingRafs.findIndex((p) => p.id === handle);
      if (idx >= 0) pendingRafs.splice(idx, 1);
    },
    now: () => now,
  });
  return {
    scheduler,
    setNow(t: number) {
      now = t;
    },
    advanceTime(deltaMs: number) {
      now += deltaMs;
    },
    /** Run all currently-scheduled raf callbacks. */
    flushRaf() {
      const batch = pendingRafs.splice(0, pendingRafs.length);
      for (const p of batch) p.cb(now);
    },
    pendingCount() {
      return pendingRafs.length;
    },
  };
}

describe("Scheduler", () => {
  let workspace: Blockly.Workspace;

  beforeAll(() => {
    registerScratchPrimitiveBlocks();
  });

  beforeEach(() => {
    workspace = new Blockly.Workspace();
  });

  it("ticks a script to completion and removes it", () => {
    const { scheduler } = makeTestScheduler();
    const ref = { current: makeSprite() };
    const move = workspace.newBlock("scratch_motion_move_steps");
    move.setFieldValue("10", "STEPS");
    scheduler.addScript({
      id: "s",
      spriteId: ref.current.id,
      gen: runStack(move, makeContext(ref)),
    });
    scheduler.tickOnce();
    expect(scheduler.size).toBe(0);
    expect(ref.current.x).toBeCloseTo(10);
  });

  it("respects 'wait' yields by sleeping until resumeAt", () => {
    const { scheduler, advanceTime } = makeTestScheduler({ initialNow: 1000 });
    const ref = { current: makeSprite() };

    // Compose: move(10), wait(0.5s), move(10).  The wait reads performance.now() at
    // execution time, but our scheduler still resumes based on its `now` clock —
    // we just need to confirm the script doesn't finish before we advance time.
    function* script(): Generator<StepResult, void, void> {
      yield { kind: "yield", reason: "wait", resumeAt: 1500 };
      ref.current = { ...ref.current, x: 99 };
      yield { kind: "block" };
    }

    scheduler.addScript({ id: "w", spriteId: ref.current.id, gen: script() });
    scheduler.tickOnce();
    // Still asleep — x not yet set.
    expect(ref.current.x).toBe(0);
    expect(scheduler.size).toBe(1);

    advanceTime(200); // now=1200; still < resumeAt=1500
    scheduler.tickOnce();
    expect(ref.current.x).toBe(0);

    advanceTime(400); // now=1600; past resumeAt
    scheduler.tickOnce();
    expect(ref.current.x).toBe(99);
    expect(scheduler.size).toBe(0);
  });

  it("yields a frame between glide steps so the script stays scheduled", () => {
    const { scheduler } = makeTestScheduler();
    const ref = { current: makeSprite({ x: 0, y: 0 }) };
    const glide = workspace.newBlock("scratch_motion_glide_xy");
    glide.setFieldValue("1", "SECS");
    glide.setFieldValue("100", "X");
    glide.setFieldValue("0", "Y");
    scheduler.addScript({
      id: "g",
      spriteId: ref.current.id,
      gen: runStack(glide, makeContext(ref)),
    });
    scheduler.tickOnce();
    // Glide writes once per iteration, then yields. After one tick, the glide
    // is still in flight (since real perf.now() only just started).
    expect(scheduler.size).toBe(1);
  });

  it("stopAll clears every script", () => {
    const { scheduler } = makeTestScheduler();
    const ref = { current: makeSprite() };
    const move = workspace.newBlock("scratch_motion_move_steps");
    move.setFieldValue("10", "STEPS");
    for (let i = 0; i < 3; i++) {
      scheduler.addScript({
        id: `s${i}`,
        spriteId: ref.current.id,
        gen: runStack(move, makeContext(ref)),
      });
    }
    expect(scheduler.size).toBe(3);
    scheduler.stopAll();
    expect(scheduler.size).toBe(0);
  });

  it("stopForSprite only clears matching scripts", () => {
    const { scheduler } = makeTestScheduler();
    const refA = { current: makeSprite({ id: "A" }) };
    const refB = { current: makeSprite({ id: "B" }) };
    const m1 = workspace.newBlock("scratch_motion_move_steps");
    const m2 = workspace.newBlock("scratch_motion_move_steps");
    m1.setFieldValue("10", "STEPS");
    m2.setFieldValue("10", "STEPS");
    // Wrap each generator so it yields a "frame" first; that way it stays
    // scheduled long enough for `stopForSprite` to inspect it.
    function* withFrame(gen: Generator<StepResult, void, void>): Generator<StepResult, void, void> {
      yield { kind: "yield", reason: "frame" };
      yield* gen;
    }
    scheduler.addScript({
      id: "a",
      spriteId: "A",
      gen: withFrame(runStack(m1, makeContext(refA))),
    });
    scheduler.addScript({
      id: "b",
      spriteId: "B",
      gen: withFrame(runStack(m2, makeContext(refB))),
    });
    scheduler.tickOnce();
    expect(scheduler.size).toBe(2);
    scheduler.stopForSprite("A");
    expect(scheduler.size).toBe(1);
  });

  it("onChange fires when scripts are added or removed", () => {
    const { scheduler } = makeTestScheduler();
    const ref = { current: makeSprite() };
    const sizes: number[] = [];
    scheduler.onChange((scripts) => sizes.push(scripts.length));
    const m = workspace.newBlock("scratch_motion_move_steps");
    m.setFieldValue("5", "STEPS");
    scheduler.addScript({ id: "x", spriteId: ref.current.id, gen: runStack(m, makeContext(ref)) });
    scheduler.tickOnce();
    expect(sizes).toContain(1);
    expect(sizes).toContain(0);
  });

  it("budget protects against an infinite loop without frame yields", () => {
    const { scheduler } = makeTestScheduler();
    function* infinite(): Generator<StepResult, void, void> {
      // Yields "block" forever; never "frame". The budget should kick in.
      while (true) yield { kind: "block" };
    }
    scheduler.addScript({ id: "loop", spriteId: "x", gen: infinite() });
    const start = Date.now();
    scheduler.tickOnce();
    const elapsed = Date.now() - start;
    // Should return quickly thanks to the budget.
    expect(elapsed).toBeLessThan(500);
    expect(scheduler.size).toBe(1);
  });

  it("findHats picks blocks of the specified type", () => {
    const flag1 = workspace.newBlock("scratch_event_when_flag_clicked");
    const flag2 = workspace.newBlock("scratch_event_when_flag_clicked");
    const otherHat = workspace.newBlock("scratch_event_when_key_pressed");
    expect(findHats(workspace, "scratch_event_when_flag_clicked")).toHaveLength(2);
    expect(findHats(workspace, "scratch_event_when_key_pressed")).toHaveLength(1);
    // Use ids to silence unused-variable lints.
    expect([flag1.id, flag2.id, otherHat.id].length).toBe(3);
  });

  it("runHat skips empty hats and runs the body when present", () => {
    const ref = { current: makeSprite({ direction: 90 }) };
    const hat = workspace.newBlock("scratch_event_when_flag_clicked");
    const move = workspace.newBlock("scratch_motion_move_steps");
    move.setFieldValue("10", "STEPS");
    if (hat.nextConnection && move.previousConnection) {
      hat.nextConnection.connect(move.previousConnection);
    }
    const gen = runHat(hat, makeContext(ref));
    while (!gen.next().done) {
      // drain
    }
    expect(ref.current.x).toBeCloseTo(10);
  });

  it("starts and stops the raf loop", () => {
    const { scheduler, flushRaf, pendingCount } = makeTestScheduler();
    const ref = { current: makeSprite() };
    function* spinThenDone(): Generator<StepResult, void, void> {
      yield { kind: "yield", reason: "frame" };
      yield { kind: "yield", reason: "frame" };
    }
    scheduler.addScript({ id: "s", spriteId: ref.current.id, gen: spinThenDone() });
    scheduler.start();
    expect(pendingCount()).toBe(1);
    flushRaf(); // tick 1 — script yields frame, stays
    expect(scheduler.size).toBe(1);
    expect(pendingCount()).toBe(1);
    flushRaf(); // tick 2 — script yields frame, stays
    expect(scheduler.size).toBe(1);
    flushRaf(); // tick 3 — script returns done
    expect(scheduler.size).toBe(0);
    expect(scheduler.running).toBe(false);
    expect(pendingCount()).toBe(0);
  });

  it("setTargetFramerate gates raf ticks by elapsed time", () => {
    const { scheduler, flushRaf, advanceTime } = makeTestScheduler({
      initialNow: 1000,
    });
    const ref = { current: makeSprite() };
    let ticks = 0;
    function* counter(): Generator<StepResult, void, void> {
      while (true) {
        ticks += 1;
        yield { kind: "yield", reason: "frame" };
      }
    }
    scheduler.addScript({ id: "s", spriteId: ref.current.id, gen: counter() });
    scheduler.setTargetFramerate(30); // 1000/30 ≈ 33.33ms

    scheduler.start();
    flushRaf(); // first tick is always accepted (lastTickAt === 0)
    expect(ticks).toBe(1);

    // 10ms later — below the 33.33ms gate, so the raf fires but the
    // script doesn't advance.
    advanceTime(10);
    flushRaf();
    expect(ticks).toBe(1);

    // 25ms more (35ms cumulative since the accepted tick) — over the
    // gate, so the script advances again.
    advanceTime(25);
    flushRaf();
    expect(ticks).toBe(2);

    // Switch to "Unlimited" — every raf advances regardless of timing.
    scheduler.setTargetFramerate(Infinity);
    flushRaf();
    flushRaf();
    expect(ticks).toBe(4);

    scheduler.stopAll();
  });
});
