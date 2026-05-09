import * as Blockly from "blockly";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { registerScratchPrimitiveBlocks } from "../../blocks/scratchPrimitiveBlocks";
import { runBlock, type ExecContext, type StepResult } from "../scriptInterpreter";
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

function drainAll(gen: Generator<StepResult, void, void>): StepResult[] {
  const out: StepResult[] = [];
  while (true) {
    const r = gen.next();
    if (r.done) break;
    out.push(r.value);
  }
  return out;
}

describe("scriptInterpreter — Cloning", () => {
  let workspace: Blockly.Workspace;

  beforeAll(() => {
    registerScratchPrimitiveBlocks();
  });

  beforeEach(() => {
    workspace = new Blockly.Workspace();
  });

  it("create_clone_of calls ctx.cloneSprite with the TARGET field", () => {
    const sprite = makeSprite();
    const cloneSprite = vi.fn(() => "clone-id");
    const ctx: ExecContext = {
      spriteId: sprite.id,
      getSprite: () => sprite,
      patchSprite: () => {},
      cloneSprite,
    };
    const block = workspace.newBlock("scratch_control_create_clone_of");
    block.setFieldValue("OtherSprite", "TARGET");
    drainAll(runBlock(block, ctx));
    expect(cloneSprite).toHaveBeenCalledWith("OtherSprite");
  });

  it("create_clone_of with no target defaults to 'myself'", () => {
    const sprite = makeSprite();
    const cloneSprite = vi.fn(() => "clone-id");
    const ctx: ExecContext = {
      spriteId: sprite.id,
      getSprite: () => sprite,
      patchSprite: () => {},
      cloneSprite,
    };
    const block = workspace.newBlock("scratch_control_create_clone_of");
    drainAll(runBlock(block, ctx));
    expect(cloneSprite).toHaveBeenCalledWith("myself");
  });

  it("delete_this_clone calls deleteThisClone and yields stop:this-script", () => {
    const sprite = makeSprite({ isClone: true, parentSpriteId: "p" });
    const deleteThisClone = vi.fn();
    const ctx: ExecContext = {
      spriteId: sprite.id,
      getSprite: () => sprite,
      patchSprite: () => {},
      deleteThisClone,
    };
    const block = workspace.newBlock("scratch_control_delete_this_clone");
    const results = drainAll(runBlock(block, ctx));
    expect(deleteThisClone).toHaveBeenCalled();
    expect(results.at(-1)).toEqual({ kind: "stop", mode: "this-script" });
  });

  it("delete_this_clone is safe to call even when ctx hook is missing", () => {
    const sprite = makeSprite({ isClone: true });
    const ctx: ExecContext = {
      spriteId: sprite.id,
      getSprite: () => sprite,
      patchSprite: () => {},
    };
    const block = workspace.newBlock("scratch_control_delete_this_clone");
    const results = drainAll(runBlock(block, ctx));
    // Still terminates the script even without the hook.
    expect(results.at(-1)).toEqual({ kind: "stop", mode: "this-script" });
  });
});
