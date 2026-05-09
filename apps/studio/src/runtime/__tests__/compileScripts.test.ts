import * as Blockly from "blockly";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import exampleJson from "../../../../../examples/sprite-bouncer.warpforge.json";
import { registerScratchPrimitiveBlocks } from "../../blocks/scratchPrimitiveBlocks";
import {
  blockToScriptNode,
  compileWorkspaceToNodes,
  JsonBlock,
  nodesToBlocks,
  type ScriptNode,
} from "../compileScripts";
import { findHats, runHat } from "../scheduler";
import { runStack, type ExecContext, type StepResult } from "../scriptInterpreter";
import { materializeSpriteWorkspace } from "../spriteWorkspaces";
import type { ProjectFile, Sprite } from "../../types/workspace";

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

function drainAll(gen: Generator<StepResult, void, void>): void {
  while (!gen.next().done) {
    /* drain */
  }
}

describe("compileScripts — round-trip Blockly ↔ JSON", () => {
  let workspace: Blockly.Workspace;

  beforeAll(() => {
    registerScratchPrimitiveBlocks();
  });

  beforeEach(() => {
    workspace = new Blockly.Workspace();
  });

  it("blockToScriptNode preserves type, fields, inputs, and next chain", () => {
    // Build: turn_right(90) → move_steps(10)
    const turn = workspace.newBlock("scratch_motion_turn_right");
    turn.setFieldValue("90", "DEGREES");
    const move = workspace.newBlock("scratch_motion_move_steps");
    move.setFieldValue("10", "STEPS");
    turn.nextConnection!.connect(move.previousConnection!);

    const node = blockToScriptNode(turn)!;
    expect(node.type).toBe("scratch_motion_turn_right");
    expect(node.fields).toEqual({ DEGREES: "90" });
    expect(node.next).toBeDefined();
    expect(node.next!.type).toBe("scratch_motion_move_steps");
    expect(node.next!.fields).toEqual({ STEPS: "10" });
    expect(node.next!.next).toBeUndefined();
  });

  it("preserves nested input blocks (forever → move)", () => {
    const forever = workspace.newBlock("scratch_control_forever");
    const move = workspace.newBlock("scratch_motion_move_steps");
    move.setFieldValue("3", "STEPS");
    forever.getInput("DO")!.connection!.connect(move.previousConnection!);

    const node = blockToScriptNode(forever)!;
    expect(node.type).toBe("scratch_control_forever");
    expect(node.inputs).toBeDefined();
    expect(node.inputs!.DO.type).toBe("scratch_motion_move_steps");
    expect(node.inputs!.DO.fields).toEqual({ STEPS: "3" });
  });

  it("running a JSON-compiled stack produces the same sprite state as Blockly", () => {
    // Build: turn_right(45) → move_steps(10) — direction 90+45=135, sprite moves SE.
    const turn = workspace.newBlock("scratch_motion_turn_right");
    turn.setFieldValue("45", "DEGREES");
    const move = workspace.newBlock("scratch_motion_move_steps");
    move.setFieldValue("10", "STEPS");
    turn.nextConnection!.connect(move.previousConnection!);

    // Path A: native Blockly
    const refA = { current: makeSprite() };
    drainAll(runStack(turn, makeContext(refA)));

    // Path B: compile to JSON, re-run through JsonBlock
    const node = blockToScriptNode(turn)!;
    const refB = { current: makeSprite() };
    drainAll(runStack(new JsonBlock(node), makeContext(refB)));

    expect(refA.current.x).toBeCloseTo(refB.current.x);
    expect(refA.current.y).toBeCloseTo(refB.current.y);
    expect(refA.current.direction).toBeCloseTo(refB.current.direction);
  });

  it("compileWorkspaceToNodes returns one node per top-level statement", () => {
    // Two separate stacks: a green-flag hat + a key-press hat.
    const flag = workspace.newBlock("scratch_event_when_flag_clicked");
    const move = workspace.newBlock("scratch_motion_move_steps");
    move.setFieldValue("5", "STEPS");
    flag.nextConnection!.connect(move.previousConnection!);

    const key = workspace.newBlock("scratch_event_when_key_pressed");
    key.setFieldValue("space", "KEY");

    // A stray reporter — should be skipped.
    workspace.newBlock("scratch_motion_x_position");

    const nodes = compileWorkspaceToNodes(workspace);
    expect(nodes).toHaveLength(2);
    const types = nodes.map((n) => n.type).sort();
    expect(types).toEqual([
      "scratch_event_when_flag_clicked",
      "scratch_event_when_key_pressed",
    ]);
  });

  it("findHats works on both Blockly workspaces and BlockLike[]", () => {
    const flag = workspace.newBlock("scratch_event_when_flag_clicked");
    const move = workspace.newBlock("scratch_motion_move_steps");
    move.setFieldValue("7", "STEPS");
    flag.nextConnection!.connect(move.previousConnection!);

    // Studio path: pass workspace.
    const wsHats = findHats(workspace, "scratch_event_when_flag_clicked");
    expect(wsHats).toHaveLength(1);

    // Standalone path: compile to JSON, wrap, pass list.
    const nodes = compileWorkspaceToNodes(workspace);
    const blocks = nodesToBlocks(nodes);
    const jsonHats = findHats(blocks, "scratch_event_when_flag_clicked");
    expect(jsonHats).toHaveLength(1);

    // Both hats produce the same sprite state when run.
    const refA = { current: makeSprite() };
    drainAll(runHat(wsHats[0], makeContext(refA)));

    const refB = { current: makeSprite() };
    drainAll(runHat(jsonHats[0], makeContext(refB)));

    expect(refA.current.x).toBeCloseTo(refB.current.x);
    expect(refA.current.y).toBeCloseTo(refB.current.y);
  });

  it("sprite-bouncer's compiled JSON exposes the same hat counts as the live workspace", () => {
    const project = exampleJson as unknown as ProjectFile;
    for (const sprite of project.stage_state!.sprites) {
      const ws = materializeSpriteWorkspace(sprite);
      try {
        const nodes = compileWorkspaceToNodes(ws);
        const wsFlag = findHats(ws, "scratch_event_when_flag_clicked").length;
        const jsonFlag = findHats(
          nodesToBlocks(nodes),
          "scratch_event_when_flag_clicked"
        ).length;
        expect(jsonFlag).toBe(wsFlag);

        const wsKey = findHats(ws, "scratch_event_when_key_pressed").length;
        const jsonKey = findHats(
          nodesToBlocks(nodes),
          "scratch_event_when_key_pressed"
        ).length;
        expect(jsonKey).toBe(wsKey);
      } finally {
        ws.dispose();
      }
    }
  });

  it("ScriptNode JSON survives JSON.stringify/parse round-trip", () => {
    const flag = workspace.newBlock("scratch_event_when_flag_clicked");
    const wait = workspace.newBlock("scratch_control_wait");
    wait.setFieldValue("0.05", "SECS");
    flag.nextConnection!.connect(wait.previousConnection!);

    const original = blockToScriptNode(flag)!;
    const reparsed = JSON.parse(JSON.stringify(original)) as ScriptNode;

    // Run both — yields and effect must match.
    const refA = { current: makeSprite() };
    drainAll(runStack(new JsonBlock(original), makeContext(refA)));

    const refB = { current: makeSprite() };
    drainAll(runStack(new JsonBlock(reparsed), makeContext(refB)));

    expect(refA.current).toEqual(refB.current);
  });
});
