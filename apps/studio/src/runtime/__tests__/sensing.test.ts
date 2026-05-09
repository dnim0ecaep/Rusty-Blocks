import * as Blockly from "blockly";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { registerScratchPrimitiveBlocks } from "../../blocks/scratchPrimitiveBlocks";
import {
  _resetForTesting as resetAsk,
  getPending as getPendingAsk,
  submit as submitAsk,
} from "../ask";
import { evaluate, runBlock, type ExecContext } from "../scriptInterpreter";
import {
  pressKey,
  releaseKey,
  resetTimer,
  setMouse,
  setMouseDown,
} from "../stageInput";
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

function ctxFor(sprite: Sprite): ExecContext {
  return {
    spriteId: sprite.id,
    getSprite: () => sprite,
    patchSprite: () => {},
  };
}

describe("scriptInterpreter — Sensing", () => {
  let workspace: Blockly.Workspace;

  beforeAll(() => {
    registerScratchPrimitiveBlocks();
  });

  beforeEach(() => {
    workspace = new Blockly.Workspace();
    setMouse(0, 0);
    setMouseDown(false);
  });

  it("mouse_x and mouse_y read the live mouse position", () => {
    const ctx = ctxFor(makeSprite());
    setMouse(42, -17);
    expect(evaluate(workspace.newBlock("scratch_sensing_mouse_x"), ctx)).toBe(42);
    expect(evaluate(workspace.newBlock("scratch_sensing_mouse_y"), ctx)).toBe(-17);
  });

  it("mouse_down reflects the mouse-button state", () => {
    const ctx = ctxFor(makeSprite());
    expect(evaluate(workspace.newBlock("scratch_sensing_mouse_down"), ctx)).toBe(false);
    setMouseDown(true);
    expect(evaluate(workspace.newBlock("scratch_sensing_mouse_down"), ctx)).toBe(true);
    setMouseDown(false);
  });

  it("key_pressed reads from the pressed-keys set", () => {
    const ctx = ctxFor(makeSprite());
    const block = workspace.newBlock("scratch_sensing_key_pressed");
    block.setFieldValue("space", "KEY");
    expect(evaluate(block, ctx)).toBe(false);
    pressKey("space");
    expect(evaluate(block, ctx)).toBe(true);
    releaseKey("space");
    expect(evaluate(block, ctx)).toBe(false);

    // "any" matches as long as anything is pressed.
    block.setFieldValue("any", "KEY");
    expect(evaluate(block, ctx)).toBe(false);
    pressKey("a");
    expect(evaluate(block, ctx)).toBe(true);
    releaseKey("a");
  });

  it("timer increases monotonically and reset_timer rebases it", async () => {
    const sprite = makeSprite();
    const ctx = ctxFor(sprite);
    resetTimer();
    const t0 = evaluate(workspace.newBlock("scratch_sensing_timer"), ctx) as number;
    expect(t0).toBeGreaterThanOrEqual(0);
    expect(t0).toBeLessThan(0.05); // brand new

    await new Promise((r) => setTimeout(r, 30));
    const t1 = evaluate(workspace.newBlock("scratch_sensing_timer"), ctx) as number;
    expect(t1).toBeGreaterThan(t0);

    // reset_timer is a statement: drain runBlock once.
    const reset = workspace.newBlock("scratch_sensing_reset_timer");
    const gen = runBlock(reset, ctx);
    while (!gen.next().done) {
      /* drain */
    }
    const t2 = evaluate(workspace.newBlock("scratch_sensing_timer"), ctx) as number;
    expect(t2).toBeLessThan(t1);
  });

  it("touching edge respects sprite size", () => {
    const ctx = ctxFor(makeSprite({ x: 240, y: 0, size: 100 }));
    // Stage half-width = 240; sprite half = 20 → touches edge.
    const block = workspace.newBlock("scratch_sensing_touching");
    block.setFieldValue("edge", "TARGET");
    expect(evaluate(block, ctx)).toBe(true);
  });

  describe("ask / answer", () => {
    beforeEach(() => {
      resetAsk();
    });

    it("ask_and_wait registers a pending question and yields until submit", () => {
      const ctx = ctxFor(makeSprite());
      const block = workspace.newBlock("scratch_sensing_ask_and_wait");
      block.setFieldValue("What's your name?", "QUESTION");

      const gen = runBlock(block, ctx);

      // First step: ask is registered, generator yields a frame.
      const step1 = gen.next();
      expect(step1.done).toBe(false);
      expect(getPendingAsk()).toEqual({
        spriteId: "s1",
        question: "What's your name?",
      });

      // Subsequent ticks keep yielding while the question is pending.
      gen.next();
      expect(getPendingAsk()).not.toBeNull();

      // Submit an answer; the next tick of the interpreter should finish.
      submitAsk("Ada");
      expect(getPendingAsk()).toBeNull();

      // Drain.
      while (!gen.next().done) {
        /* spin to completion */
      }

      // The reporter should now read back the submitted answer.
      const ans = workspace.newBlock("scratch_sensing_answer");
      expect(evaluate(ans, ctx)).toBe("Ada");
    });
  });
});
