import * as Blockly from "blockly";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { registerScratchPrimitiveBlocks } from "../../blocks/scratchPrimitiveBlocks";
import { evaluate, runBlock, type ExecContext } from "../scriptInterpreter";
import type { Costume, Sprite } from "../../types/workspace";

function costume(name: string): Costume {
  return { id: name, name, centerX: 0, centerY: 0, width: 0, height: 0 };
}

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
    costumeIndex: 0,
    costumes: [costume("a"), costume("b"), costume("c")],
    sounds: [],
    scripts_xml: "",
    variables: {},
    lists: {},
    layer: 1,
    ...overrides,
  };
}

function makeContext(ref: { current: Sprite }, all?: Sprite[]): ExecContext {
  return {
    spriteId: ref.current.id,
    getSprite: () => ref.current,
    patchSprite: (patch) => {
      ref.current = { ...ref.current, ...patch };
    },
    getSprites: () => all ?? [ref.current],
  };
}

function drainBlock(block: Blockly.Block, ctx: ExecContext): void {
  const gen = runBlock(block, ctx);
  while (!gen.next().done) {
    /* drain */
  }
}

describe("scriptInterpreter — Looks", () => {
  let workspace: Blockly.Workspace;

  beforeAll(() => {
    registerScratchPrimitiveBlocks();
  });

  beforeEach(() => {
    workspace = new Blockly.Workspace();
  });

  it("say sets a 'say' bubble; empty say clears it", () => {
    const ref = { current: makeSprite() };
    const block = workspace.newBlock("scratch_looks_say");
    block.setFieldValue("Hi!", "MESSAGE");
    drainBlock(block, makeContext(ref));
    expect(ref.current.bubble).toEqual({ kind: "say", text: "Hi!" });

    block.setFieldValue("", "MESSAGE");
    drainBlock(block, makeContext(ref));
    expect(ref.current.bubble).toBeUndefined();
  });

  it("think sets a 'think' bubble", () => {
    const ref = { current: makeSprite() };
    const block = workspace.newBlock("scratch_looks_think");
    block.setFieldValue("...", "MESSAGE");
    drainBlock(block, makeContext(ref));
    expect(ref.current.bubble).toEqual({ kind: "think", text: "..." });
  });

  it("show / hide toggle visibility", () => {
    const ref = { current: makeSprite({ visible: false }) };
    drainBlock(workspace.newBlock("scratch_looks_show"), makeContext(ref));
    expect(ref.current.visible).toBe(true);
    drainBlock(workspace.newBlock("scratch_looks_hide"), makeContext(ref));
    expect(ref.current.visible).toBe(false);
  });

  it("change_size adds; set_size assigns; size reporter reads back", () => {
    const ref = { current: makeSprite({ size: 100 }) };
    const change = workspace.newBlock("scratch_looks_change_size");
    change.setFieldValue("25", "DSIZE");
    drainBlock(change, makeContext(ref));
    expect(ref.current.size).toBe(125);

    const setBlk = workspace.newBlock("scratch_looks_set_size");
    setBlk.setFieldValue("50", "SIZE");
    drainBlock(setBlk, makeContext(ref));
    expect(ref.current.size).toBe(50);

    expect(evaluate(workspace.newBlock("scratch_looks_size"), makeContext(ref))).toBe(50);
  });

  it("size cannot drop below zero", () => {
    const ref = { current: makeSprite({ size: 10 }) };
    const change = workspace.newBlock("scratch_looks_change_size");
    change.setFieldValue("-100", "DSIZE");
    drainBlock(change, makeContext(ref));
    expect(ref.current.size).toBe(0);
  });

  it("next_costume cycles through the costume list", () => {
    const ref = { current: makeSprite({ costumeIndex: 0 }) };
    const next = workspace.newBlock("scratch_looks_next_costume");
    drainBlock(next, makeContext(ref));
    expect(ref.current.costumeIndex).toBe(1);
    drainBlock(next, makeContext(ref));
    expect(ref.current.costumeIndex).toBe(2);
    drainBlock(next, makeContext(ref));
    // wraps
    expect(ref.current.costumeIndex).toBe(0);
  });

  it("switch_costume by name picks the matching index", () => {
    const ref = { current: makeSprite({ costumeIndex: 0 }) };
    const sw = workspace.newBlock("scratch_looks_switch_costume");
    sw.setFieldValue("c", "COSTUME");
    drainBlock(sw, makeContext(ref));
    expect(ref.current.costumeIndex).toBe(2);

    // Unknown name leaves the index unchanged.
    sw.setFieldValue("nope", "COSTUME");
    drainBlock(sw, makeContext(ref));
    expect(ref.current.costumeIndex).toBe(2);
  });

  it("costume_number reporter returns 1-indexed costume", () => {
    const ref = { current: makeSprite({ costumeIndex: 1 }) };
    expect(
      evaluate(workspace.newBlock("scratch_looks_costume_number"), makeContext(ref))
    ).toBe(2);
  });

  it("go_to_layer front bumps above all sprites; back drops below", () => {
    const a = makeSprite({ id: "a", layer: 1 });
    const b = makeSprite({ id: "b", layer: 5 });
    const c = makeSprite({ id: "c", layer: 3 });
    const ref = { current: c };
    const all = [a, b, c];
    const front = workspace.newBlock("scratch_looks_go_to_layer");
    front.setFieldValue("front", "LAYER");
    drainBlock(front, makeContext(ref, all));
    expect(ref.current.layer).toBe(6); // max(5)+1

    const back = workspace.newBlock("scratch_looks_go_to_layer");
    back.setFieldValue("back", "LAYER");
    drainBlock(back, makeContext(ref, all));
    expect(ref.current.layer).toBe(0); // min(1)-1
  });

  it("clear_effects removes the effects field", () => {
    const ref = { current: makeSprite({ effects: { brightness: 50, ghost: 25 } }) };
    drainBlock(workspace.newBlock("scratch_looks_clear_effects"), makeContext(ref));
    expect(ref.current.effects).toBeUndefined();
  });

  it("set_effect_to writes a clamped value onto the sprite's effects", () => {
    const ref = { current: makeSprite() };

    const setBrightness = workspace.newBlock("scratch_looks_set_effect_to");
    setBrightness.setFieldValue("brightness", "EFFECT");
    setBrightness.setFieldValue("250", "VALUE");
    drainBlock(setBrightness, makeContext(ref));
    // brightness is clamped to [-100, 100]
    expect(ref.current.effects?.brightness).toBe(100);

    const setGhost = workspace.newBlock("scratch_looks_set_effect_to");
    setGhost.setFieldValue("ghost", "EFFECT");
    setGhost.setFieldValue("-30", "VALUE");
    drainBlock(setGhost, makeContext(ref));
    // ghost is clamped to [0, 100]
    expect(ref.current.effects?.ghost).toBe(0);
    // brightness preserved across the second set
    expect(ref.current.effects?.brightness).toBe(100);

    const setColor = workspace.newBlock("scratch_looks_set_effect_to");
    setColor.setFieldValue("color", "EFFECT");
    setColor.setFieldValue("250", "VALUE");
    drainBlock(setColor, makeContext(ref));
    // color wraps mod 200 — 250 → 50
    expect(ref.current.effects?.color).toBe(50);
  });

  it("change_effect_by adds to the existing value, then clamps/wraps", () => {
    const ref = {
      current: makeSprite({ effects: { brightness: 80, color: 180 } }),
    };

    const dBrightness = workspace.newBlock("scratch_looks_change_effect_by");
    dBrightness.setFieldValue("brightness", "EFFECT");
    dBrightness.setFieldValue("50", "VALUE");
    drainBlock(dBrightness, makeContext(ref));
    expect(ref.current.effects?.brightness).toBe(100); // 80 + 50 → clamp 100

    const dColor = workspace.newBlock("scratch_looks_change_effect_by");
    dColor.setFieldValue("color", "EFFECT");
    dColor.setFieldValue("40", "VALUE");
    drainBlock(dColor, makeContext(ref));
    expect(ref.current.effects?.color).toBe(20); // 180 + 40 = 220 → 20

    const dFisheye = workspace.newBlock("scratch_looks_change_effect_by");
    dFisheye.setFieldValue("fisheye", "EFFECT");
    dFisheye.setFieldValue("75", "VALUE");
    drainBlock(dFisheye, makeContext(ref));
    // fisheye is unrendered but stored as-is
    expect(ref.current.effects?.fisheye).toBe(75);
  });
});
