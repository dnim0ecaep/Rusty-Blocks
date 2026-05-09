import * as Blockly from "blockly";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { registerScratchPrimitiveBlocks } from "../../blocks/scratchPrimitiveBlocks";
import { Scheduler } from "../scheduler";
import { runStack, type ExecContext, type StepResult } from "../scriptInterpreter";
import type { Sprite } from "../../types/workspace";

/**
 * Coverage tests for control-flow blocks that previously had zero
 * direct test coverage:
 *   - scratch_control_if_else
 *   - scratch_control_repeat_until
 *   - scratch_control_wait_until
 *   - scratch_control_stop (all three modes)
 *   - scratch_event_broadcast_and_wait
 *
 * Style mirrors snapshots.test.ts — small Blockly stack, deterministic
 * scheduler, assert sprite state and scheduler population.
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
        const step = Math.min(16, target - now);
        now += step;
        sched.tickOnce();
      }
    },
  };
}

describe("scriptInterpreter — control flow", () => {
  let workspace: Blockly.Workspace;

  beforeAll(() => {
    registerScratchPrimitiveBlocks();
  });

  beforeEach(() => {
    workspace = new Blockly.Workspace();
  });

  // ── if / else ────────────────────────────────────────────────────────

  it("if_else routes to DO when the condition is true", () => {
    const ref = { current: makeSprite({ direction: 90 }) };
    const ifElse = workspace.newBlock("scratch_control_if_else");
    // 2 == 2 → true
    const eq = workspace.newBlock("scratch_op_eq");
    const a = workspace.newBlock("scratch_op_length_of");
    a.setFieldValue("ab", "STRING");
    const b = workspace.newBlock("scratch_op_length_of");
    b.setFieldValue("xy", "STRING");
    eq.getInput("A")!.connection!.connect(a.outputConnection!);
    eq.getInput("B")!.connection!.connect(b.outputConnection!);
    ifElse.getInput("CONDITION")!.connection!.connect(eq.outputConnection!);

    const moveDo = workspace.newBlock("scratch_motion_move_steps");
    moveDo.setFieldValue("10", "STEPS");
    ifElse.getInput("DO")!.connection!.connect(moveDo.previousConnection!);
    const moveElse = workspace.newBlock("scratch_motion_move_steps");
    moveElse.setFieldValue("100", "STEPS");
    ifElse.getInput("ELSE")!.connection!.connect(moveElse.previousConnection!);

    const gen = runStack(ifElse, makeContext(ref));
    while (!gen.next().done) {
      /* drain */
    }
    expect(ref.current.x).toBeCloseTo(10);
  });

  it("if_else routes to ELSE when the condition is false", () => {
    const ref = { current: makeSprite({ direction: 90 }) };
    const ifElse = workspace.newBlock("scratch_control_if_else");
    // 2 == 5 → false
    const eq = workspace.newBlock("scratch_op_eq");
    const a = workspace.newBlock("scratch_op_length_of");
    a.setFieldValue("ab", "STRING");
    const b = workspace.newBlock("scratch_op_length_of");
    b.setFieldValue("abcde", "STRING");
    eq.getInput("A")!.connection!.connect(a.outputConnection!);
    eq.getInput("B")!.connection!.connect(b.outputConnection!);
    ifElse.getInput("CONDITION")!.connection!.connect(eq.outputConnection!);

    const moveDo = workspace.newBlock("scratch_motion_move_steps");
    moveDo.setFieldValue("100", "STEPS");
    ifElse.getInput("DO")!.connection!.connect(moveDo.previousConnection!);
    const moveElse = workspace.newBlock("scratch_motion_move_steps");
    moveElse.setFieldValue("7", "STEPS");
    ifElse.getInput("ELSE")!.connection!.connect(moveElse.previousConnection!);

    const gen = runStack(ifElse, makeContext(ref));
    while (!gen.next().done) {
      /* drain */
    }
    expect(ref.current.x).toBeCloseTo(7);
  });

  // ── repeat_until ─────────────────────────────────────────────────────

  it("repeat_until runs the body until the condition becomes true", () => {
    const ref = {
      current: makeSprite({ direction: 90, variables: { counter: 0 } }),
    };
    const ru = workspace.newBlock("scratch_control_repeat_until");
    // condition: counter > 3
    const gt = workspace.newBlock("scratch_op_gt");
    const get = workspace.newBlock("scratch_data_variables_get");
    get.setFieldValue("counter", "VARIABLE");
    const three = workspace.newBlock("scratch_op_length_of");
    three.setFieldValue("abc", "STRING"); // length 3
    gt.getInput("A")!.connection!.connect(get.outputConnection!);
    gt.getInput("B")!.connection!.connect(three.outputConnection!);
    ru.getInput("CONDITION")!.connection!.connect(gt.outputConnection!);

    // body: increment counter
    const change = workspace.newBlock("scratch_data_change_variable");
    change.setFieldValue("counter", "VARIABLE");
    change.setFieldValue("1", "VALUE");
    ru.getInput("DO")!.connection!.connect(change.previousConnection!);

    const sprite = ref.current;
    const ctx: ExecContext = {
      spriteId: sprite.id,
      getSprite: () => ref.current,
      patchSprite: (patch) => {
        ref.current = { ...ref.current, ...patch };
      },
      getVariable: (name) => (ref.current.variables[name] ?? 0) as number,
      setVariable: (name, value) => {
        ref.current = {
          ...ref.current,
          variables: { ...ref.current.variables, [name]: value },
        };
      },
    };

    const { sched, advance } = makeTestScheduler();
    sched.addScript({ id: "ru", spriteId: sprite.id, gen: runStack(ru, ctx) });
    sched.start();
    advance(200); // plenty of frames to cross the threshold
    expect(ref.current.variables.counter).toBe(4);
    expect(sched.size).toBe(0); // script terminated
  });

  // ── wait_until ───────────────────────────────────────────────────────

  it("wait_until yields frames while the condition is false", () => {
    const ref = { current: makeSprite() };
    const wu = workspace.newBlock("scratch_control_wait_until");
    // Always-false condition: 5 > 5
    const gt = workspace.newBlock("scratch_op_gt");
    const a = workspace.newBlock("scratch_op_length_of");
    a.setFieldValue("abcde", "STRING");
    const b = workspace.newBlock("scratch_op_length_of");
    b.setFieldValue("abcde", "STRING");
    gt.getInput("A")!.connection!.connect(a.outputConnection!);
    gt.getInput("B")!.connection!.connect(b.outputConnection!);
    wu.getInput("CONDITION")!.connection!.connect(gt.outputConnection!);

    const gen = runStack(wu, makeContext(ref));
    // Should yield frame, frame, frame… and never complete.
    for (let i = 0; i < 5; i++) {
      const r = gen.next();
      expect(r.done).toBe(false);
      expect(r.value).toMatchObject({ kind: "yield", reason: "frame" });
    }
  });

  // ── stop ─────────────────────────────────────────────────────────────

  it("stop 'all' yields a stop result and terminates the script", () => {
    const ref = { current: makeSprite() };
    const stop = workspace.newBlock("scratch_control_stop");
    stop.setFieldValue("all", "STOP_OPTION");

    const gen = runStack(stop, makeContext(ref));
    const r = gen.next();
    expect(r.done).toBe(false);
    expect(r.value).toMatchObject({ kind: "stop", mode: "all" });
    // After yielding stop, the generator is done.
    expect(gen.next().done).toBe(true);
  });

  it("stop 'this script' terminates only the current script", () => {
    const ref = { current: makeSprite() };
    const stop = workspace.newBlock("scratch_control_stop");
    stop.setFieldValue("this-script", "STOP_OPTION");

    const gen = runStack(stop, makeContext(ref));
    const r = gen.next();
    expect(r.value).toMatchObject({ kind: "stop", mode: "this-script" });
    expect(gen.next().done).toBe(true);
  });

  it("stop 'other-scripts' yields the signal without terminating the generator", () => {
    // `scratch_control_stop` is a cap block in Blockly (no
    // nextConnection), so we can't realistically chain a follow-on
    // block in a workspace-built stack. The "other-scripts" semantic —
    // current script keeps running — is enforced by the scheduler's
    // handling of `{kind:"stop",mode:"other-scripts"}` (see
    // scheduler.ts and scheduler.test.ts). What we assert here is the
    // interpreter's contract: it yields the right signal and *doesn't*
    // unwind the current generator (unlike "all" / "this-script",
    // which return immediately after yielding).
    const ref = { current: makeSprite() };
    const stop = workspace.newBlock("scratch_control_stop");
    stop.setFieldValue("other-scripts", "STOP_OPTION");

    const gen = runStack(stop, makeContext(ref));
    const r = gen.next();
    expect(r.value).toMatchObject({ kind: "stop", mode: "other-scripts" });
    expect(r.done).toBe(false);
    // Crucial: a second tick still produces a value (the "block"
    // post-yield emitted by runBlock when its case used `break;`).
    // For "all" / "this-script" the case `return`s, so the second
    // tick would be `done: true` instead — that's the contrast that
    // makes "other-scripts" semantically different.
    const r2 = gen.next();
    expect(r2.value).toMatchObject({ kind: "block" });
    expect(r2.done).toBe(false);
    // No further blocks chained → next tick completes.
    expect(gen.next().done).toBe(true);
  });

  // ── broadcast_and_wait ──────────────────────────────────────────────

  it("broadcast_and_wait blocks until dispatched scripts finish", () => {
    const ref = { current: makeSprite() };
    const bcast = workspace.newBlock("scratch_event_broadcast_and_wait");
    bcast.setFieldValue("go", "BROADCAST");

    let active = ["script-a", "script-b"];
    const ctx: ExecContext = {
      spriteId: ref.current.id,
      getSprite: () => ref.current,
      patchSprite: () => {},
      dispatchBroadcast: () => active.slice(),
      hasActiveScripts: (ids) => ids.some((id) => active.includes(id)),
    };

    const gen = runStack(bcast, ctx);
    // First few ticks: dispatched scripts still active → keep yielding.
    for (let i = 0; i < 3; i++) {
      const r = gen.next();
      expect(r.done).toBe(false);
      expect(r.value).toMatchObject({ kind: "yield", reason: "frame" });
    }

    // Mark the dispatched scripts as finished. The next tick should
    // observe `hasActiveScripts === false` and complete.
    active = [];
    while (!gen.next().done) {
      /* drain — should be just one frame to detect completion */
    }
  });
});
