import * as Blockly from "blockly";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { registerScratchPrimitiveBlocks } from "../../blocks/scratchPrimitiveBlocks";
import {
  evaluate,
  normalizeDirection,
  runBlock,
  runWorkspaceOnce,
  type ExecContext,
} from "../scriptInterpreter";
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

function drainBlock(block: Blockly.Block, ctx: ExecContext): void {
  const gen = runBlock(block, ctx);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  while (!gen.next().done) {
    /* drain */
  }
}

describe("scriptInterpreter — Motion blocks", () => {
  let workspace: Blockly.Workspace;

  beforeAll(() => {
    registerScratchPrimitiveBlocks();
  });

  beforeEach(() => {
    workspace = new Blockly.Workspace();
  });

  it("move_steps moves along the current direction", () => {
    const ref = { current: makeSprite({ direction: 90 }) };
    const block = workspace.newBlock("scratch_motion_move_steps");
    block.setFieldValue("10", "STEPS");
    drainBlock(block, makeContext(ref));
    // direction 90 → moves +x by 10
    expect(ref.current.x).toBeCloseTo(10);
    expect(ref.current.y).toBeCloseTo(0);
  });

  it("move_steps with direction 0 moves +y (up in Scratch)", () => {
    const ref = { current: makeSprite({ direction: 0 }) };
    const block = workspace.newBlock("scratch_motion_move_steps");
    block.setFieldValue("5", "STEPS");
    drainBlock(block, makeContext(ref));
    expect(ref.current.x).toBeCloseTo(0);
    expect(ref.current.y).toBeCloseTo(5);
  });

  it("turn_right adds to direction; turn_left subtracts", () => {
    const ref = { current: makeSprite({ direction: 0 }) };
    const right = workspace.newBlock("scratch_motion_turn_right");
    right.setFieldValue("45", "DEGREES");
    drainBlock(right, makeContext(ref));
    expect(ref.current.direction).toBeCloseTo(45);

    const left = workspace.newBlock("scratch_motion_turn_left");
    left.setFieldValue("90", "DEGREES");
    drainBlock(left, makeContext(ref));
    expect(ref.current.direction).toBeCloseTo(-45);
  });

  it("goto_xy and set_x/set_y assign absolute positions", () => {
    const ref = { current: makeSprite() };
    const goto = workspace.newBlock("scratch_motion_goto_xy");
    goto.setFieldValue("12", "X");
    goto.setFieldValue("-7", "Y");
    drainBlock(goto, makeContext(ref));
    expect(ref.current.x).toBe(12);
    expect(ref.current.y).toBe(-7);

    const setX = workspace.newBlock("scratch_motion_set_x");
    setX.setFieldValue("100", "X");
    drainBlock(setX, makeContext(ref));
    expect(ref.current.x).toBe(100);

    const setY = workspace.newBlock("scratch_motion_set_y");
    setY.setFieldValue("-50", "Y");
    drainBlock(setY, makeContext(ref));
    expect(ref.current.y).toBe(-50);
  });

  it("change_x and change_y are deltas", () => {
    const ref = { current: makeSprite({ x: 5, y: 5 }) };
    const cx = workspace.newBlock("scratch_motion_change_x");
    cx.setFieldValue("3", "DX");
    drainBlock(cx, makeContext(ref));
    expect(ref.current.x).toBe(8);

    const cy = workspace.newBlock("scratch_motion_change_y");
    cy.setFieldValue("-10", "DY");
    drainBlock(cy, makeContext(ref));
    expect(ref.current.y).toBe(-5);
  });

  it("if_on_edge_bounce clamps and mirrors direction at the right edge", () => {
    // Sprite well past the right edge moving rightish.
    const ref = { current: makeSprite({ x: 1000, y: 0, direction: 90 }) };
    const block = workspace.newBlock("scratch_motion_if_on_edge_bounce");
    drainBlock(block, makeContext(ref));
    // Clamped to (STAGE_WIDTH/2 - half) = 240 - 20 = 220
    expect(ref.current.x).toBe(220);
    // Direction was 90 → bounce off vertical wall → -90
    expect(ref.current.direction).toBe(-90);
  });

  it("if_on_edge_bounce honors a custom stage size", async () => {
    const { setStageDimensions, DEFAULT_STAGE_WIDTH, DEFAULT_STAGE_HEIGHT } =
      await import("../../types/workspace");
    try {
      // 800-wide stage → right edge sits at +400, sprite of size 100
      // (half 20) clamps to 380.
      setStageDimensions(800, 600);
      const ref = { current: makeSprite({ x: 1000, y: 0, direction: 90 }) };
      drainBlock(
        workspace.newBlock("scratch_motion_if_on_edge_bounce"),
        makeContext(ref),
      );
      expect(ref.current.x).toBe(380);
      expect(ref.current.direction).toBe(-90);
    } finally {
      // Restore defaults so following tests aren't perturbed.
      setStageDimensions(DEFAULT_STAGE_WIDTH, DEFAULT_STAGE_HEIGHT);
    }
  });

  it("set_rotation_style accepts the three Scratch styles", () => {
    const ref = { current: makeSprite() };
    const block = workspace.newBlock("scratch_motion_set_rotation_style");
    block.setFieldValue("left-right", "STYLE");
    drainBlock(block, makeContext(ref));
    expect(ref.current.rotationStyle).toBe("left-right");
    block.setFieldValue("dont-rotate", "STYLE");
    drainBlock(block, makeContext(ref));
    expect(ref.current.rotationStyle).toBe("dont-rotate");
  });

  it("Motion reporters return current sprite values", () => {
    const ref = { current: makeSprite({ x: 12, y: -7, direction: 45 }) };
    const ctx = makeContext(ref);
    expect(evaluate(workspace.newBlock("scratch_motion_x_position"), ctx)).toBe(12);
    expect(evaluate(workspace.newBlock("scratch_motion_y_position"), ctx)).toBe(-7);
    expect(evaluate(workspace.newBlock("scratch_motion_direction"), ctx)).toBe(45);
  });

  it("normalizeDirection wraps to (-180, 180]", () => {
    expect(normalizeDirection(0)).toBe(0);
    expect(normalizeDirection(90)).toBe(90);
    expect(normalizeDirection(-90)).toBe(-90);
    expect(normalizeDirection(180)).toBe(180);
    // 270 wraps to -90.
    expect(normalizeDirection(270)).toBe(-90);
    // 720 + 45 → 45.
    expect(normalizeDirection(720 + 45)).toBe(45);
    // -270 → 90.
    expect(normalizeDirection(-270)).toBe(90);
  });

  it("runWorkspaceOnce drains a connected stack", () => {
    const ref = { current: makeSprite({ direction: 90 }) };
    // Build: turn_right(90) → move_steps(10). After: direction=180, y goes -10 (downward).
    const turn = workspace.newBlock("scratch_motion_turn_right");
    turn.setFieldValue("90", "DEGREES");
    const move = workspace.newBlock("scratch_motion_move_steps");
    move.setFieldValue("10", "STEPS");
    // Connect turn.next → move.previous
    if (turn.nextConnection && move.previousConnection) {
      turn.nextConnection.connect(move.previousConnection);
    }
    runWorkspaceOnce(workspace, makeContext(ref));
    expect(ref.current.direction).toBe(180);
    expect(ref.current.x).toBeCloseTo(0);
    expect(ref.current.y).toBeCloseTo(-10);
  });
});
