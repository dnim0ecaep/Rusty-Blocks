import * as Blockly from "blockly";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { registerScratchPrimitiveBlocks } from "../../blocks/scratchPrimitiveBlocks";
import { Scheduler, runHat } from "../scheduler";
import { runStack, type ExecContext, type StepResult } from "../scriptInterpreter";
import type { Sprite } from "../../types/workspace";

/**
 * End-to-end-style tests that build a small Blockly stack, run it through
 * a deterministic scheduler (no rAF, no real clock), and assert the
 * resulting sprite state. These exercise the interaction between
 * interpreter (yields) and scheduler (frame budgeting + wait timing).
 */

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

function connect(prev: Blockly.Block, next: Blockly.Block): void {
  if (prev.nextConnection && next.previousConnection) {
    prev.nextConnection.connect(next.previousConnection);
  }
}

/** Test scheduler with controllable virtual time. */
function makeTestScheduler(): { sched: Scheduler; advance: (ms: number) => void } {
  let now = 0;
  const sched = new Scheduler({
    blocksPerFrame: 10000,
    rafProvider: () => 0,
    cancelRafProvider: () => {},
    now: () => now,
  });
  return {
    sched,
    advance(ms: number) {
      const target = now + ms;
      while (now < target) {
        // Step in 16ms chunks so wait yields wake up at frame-ish granularity.
        const step = Math.min(16, target - now);
        now += step;
        sched.tickOnce();
      }
    },
  };
}

describe("scriptInterpreter — end-to-end script snapshots", () => {
  let workspace: Blockly.Workspace;

  beforeAll(() => {
    registerScratchPrimitiveBlocks();
  });

  beforeEach(() => {
    workspace = new Blockly.Workspace();
  });

  it("repeat 5 { move 10 } moves 50 along direction", () => {
    const ref = { current: makeSprite({ direction: 90 }) };
    const repeat = workspace.newBlock("scratch_control_repeat");
    repeat.setFieldValue("5", "TIMES");
    const move = workspace.newBlock("scratch_motion_move_steps");
    move.setFieldValue("10", "STEPS");
    repeat.getInput("DO")!.connection!.connect(move.previousConnection!);

    const { sched, advance } = makeTestScheduler();
    sched.addScript({
      id: "test1",
      spriteId: ref.current.id,
      gen: runStack(repeat, makeContext(ref)),
    });
    sched.start();
    // Each iteration yields a frame, so 5 iterations need ~80ms in the
    // 16ms-step scheduler.
    advance(200);
    expect(ref.current.x).toBeCloseTo(50);
    expect(ref.current.y).toBeCloseTo(0);
  });

  it("forever { move 5 } gets frame-budgeted but doesn't lock up", () => {
    const ref = { current: makeSprite({ direction: 90 }) };
    const forever = workspace.newBlock("scratch_control_forever");
    const move = workspace.newBlock("scratch_motion_move_steps");
    move.setFieldValue("5", "STEPS");
    forever.getInput("DO")!.connection!.connect(move.previousConnection!);

    const { sched, advance } = makeTestScheduler();
    sched.addScript({
      id: "forever",
      spriteId: ref.current.id,
      gen: runStack(forever, makeContext(ref)),
    });
    sched.start();
    advance(48); // ~3 ticks
    // After 3 frame-yields the script has executed move at least 3 times.
    expect(ref.current.x).toBeGreaterThanOrEqual(15);
    expect(sched.size).toBe(1); // still scheduled
  });

  it("wait yields with reason 'wait' and a future resumeAt", () => {
    // The wait block uses performance.now() for its timer, so end-to-end
    // timing under a virtual-clock scheduler isn't meaningful here. We
    // assert the yield shape directly — the scheduler-side resume logic
    // is covered by scheduler.test.ts.
    const ref = { current: makeSprite() };
    const wait = workspace.newBlock("scratch_control_wait");
    wait.setFieldValue("0.05", "SECS");

    const ctx = makeContext(ref);
    const gen = runStack(wait, ctx);
    const r = gen.next();
    expect(r.done).toBe(false);
    expect(r.value).toMatchObject({ kind: "yield", reason: "wait" });
    expect((r.value as { resumeAt: number }).resumeAt).toBeGreaterThan(0);
  });

  it("if (1=1) move 10 — operator-driven condition fires the body", () => {
    const ref = { current: makeSprite({ direction: 90 }) };
    const ifBlk = workspace.newBlock("scratch_control_if");
    const eq = workspace.newBlock("scratch_op_eq");
    // both sides equal "x"
    const len1 = workspace.newBlock("scratch_op_length_of");
    len1.setFieldValue("ab", "STRING");
    const len2 = workspace.newBlock("scratch_op_length_of");
    len2.setFieldValue("xy", "STRING");
    eq.getInput("A")!.connection!.connect(len1.outputConnection!);
    eq.getInput("B")!.connection!.connect(len2.outputConnection!);
    ifBlk.getInput("CONDITION")!.connection!.connect(eq.outputConnection!);
    const move = workspace.newBlock("scratch_motion_move_steps");
    move.setFieldValue("10", "STEPS");
    ifBlk.getInput("DO")!.connection!.connect(move.previousConnection!);

    const ctx = makeContext(ref);
    const gen = runStack(ifBlk, ctx);
    const out: StepResult[] = [];
    while (true) {
      const r = gen.next();
      if (r.done) break;
      out.push(r.value);
    }
    expect(ref.current.x).toBeCloseTo(10);
  });

  it("repeat with set_variable + change_variable accumulates", () => {
    const ref = { current: makeSprite({ variables: { count: 0 } }) };
    const localVars = { count: 0 } as Record<string, number | string>;
    const ctx: ExecContext = {
      ...makeContext(ref),
      getVariable: (name) => localVars[name] ?? 0,
      setVariable: (name, value) => {
        localVars[name] = value;
      },
    };

    const repeat = workspace.newBlock("scratch_control_repeat");
    repeat.setFieldValue("4", "TIMES");
    const change = workspace.newBlock("scratch_data_change_variable");
    change.setFieldValue("count", "VARIABLE");
    change.setFieldValue("3", "VALUE");
    repeat.getInput("DO")!.connection!.connect(change.previousConnection!);

    const { sched, advance } = makeTestScheduler();
    sched.addScript({
      id: "rep",
      spriteId: ref.current.id,
      gen: runStack(repeat, ctx),
    });
    sched.start();
    advance(200);
    expect(localVars.count).toBe(12); // 4 × 3
  });

  it("runHat skips an empty hat without yielding", () => {
    const ref = { current: makeSprite() };
    const hat = workspace.newBlock("scratch_event_when_flag_clicked");
    const gen = runHat(hat, makeContext(ref));
    expect(gen.next().done).toBe(true);
  });
});
