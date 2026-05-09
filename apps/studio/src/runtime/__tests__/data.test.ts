import * as Blockly from "blockly";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { registerScratchPrimitiveBlocks } from "../../blocks/scratchPrimitiveBlocks";
import { evaluate, runBlock, type ExecContext } from "../scriptInterpreter";
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

/**
 * Build an ExecContext backed by simple in-memory maps. Captures monitor
 * toggles so tests can assert on them.
 */
function makeDataContext(sprite: Sprite) {
  const ref = { current: sprite };
  const stage = {
    vars: {} as Record<string, number | string>,
    lists: {} as Record<string, Array<number | string>>,
    monitors: new Set<string>(),
  };
  const ctx: ExecContext = {
    spriteId: sprite.id,
    getSprite: () => ref.current,
    patchSprite: (patch) => {
      ref.current = { ...ref.current, ...patch };
    },
    getVariable(name) {
      if (Object.prototype.hasOwnProperty.call(ref.current.variables, name)) {
        return ref.current.variables[name];
      }
      if (Object.prototype.hasOwnProperty.call(stage.vars, name)) return stage.vars[name];
      return 0;
    },
    setVariable(name, value) {
      if (Object.prototype.hasOwnProperty.call(ref.current.variables, name)) {
        ref.current = {
          ...ref.current,
          variables: { ...ref.current.variables, [name]: value },
        };
      } else if (Object.prototype.hasOwnProperty.call(stage.vars, name)) {
        stage.vars[name] = value;
      } else {
        ref.current = {
          ...ref.current,
          variables: { ...ref.current.variables, [name]: value },
        };
      }
    },
    getList(name) {
      if (Object.prototype.hasOwnProperty.call(ref.current.lists, name)) {
        return ref.current.lists[name];
      }
      if (Object.prototype.hasOwnProperty.call(stage.lists, name)) return stage.lists[name];
      return [];
    },
    setList(name, list) {
      if (Object.prototype.hasOwnProperty.call(ref.current.lists, name)) {
        ref.current = { ...ref.current, lists: { ...ref.current.lists, [name]: list } };
      } else if (Object.prototype.hasOwnProperty.call(stage.lists, name)) {
        stage.lists[name] = list;
      } else {
        ref.current = { ...ref.current, lists: { ...ref.current.lists, [name]: list } };
      }
    },
    setMonitorVisible(name, visible) {
      if (visible) stage.monitors.add(name);
      else stage.monitors.delete(name);
    },
  };
  return { ctx, stage, ref };
}

function drainBlock(block: Blockly.Block, ctx: ExecContext): void {
  const gen = runBlock(block, ctx);
  while (!gen.next().done) {
    /* drain */
  }
}

describe("scriptInterpreter — Variables / Lists", () => {
  let workspace: Blockly.Workspace;

  beforeAll(() => {
    registerScratchPrimitiveBlocks();
  });

  beforeEach(() => {
    workspace = new Blockly.Workspace();
  });

  it("set + get round-trips through per-sprite scope", () => {
    const { ctx, ref } = makeDataContext(makeSprite());
    const set = workspace.newBlock("scratch_data_set_variable");
    set.setFieldValue("score", "VARIABLE");
    set.setFieldValue("42", "VALUE");
    drainBlock(set, ctx);
    expect(ref.current.variables.score).toBe("42");

    const get = workspace.newBlock("scratch_data_variables_get");
    get.setFieldValue("score", "VARIABLE");
    expect(evaluate(get, ctx)).toBe("42");
  });

  it("change adds to numeric value (with string coercion)", () => {
    const { ctx, ref } = makeDataContext(makeSprite({ variables: { count: 5 } }));
    const change = workspace.newBlock("scratch_data_change_variable");
    change.setFieldValue("count", "VARIABLE");
    change.setFieldValue("3", "VALUE");
    drainBlock(change, ctx);
    expect(ref.current.variables.count).toBe(8);

    // Unset variable starts at 0.
    change.setFieldValue("missing", "VARIABLE");
    change.setFieldValue("7", "VALUE");
    drainBlock(change, ctx);
    expect(ref.current.variables.missing).toBe(7);
  });

  it("show / hide toggle monitor state", () => {
    const { ctx, stage } = makeDataContext(makeSprite());
    const show = workspace.newBlock("scratch_data_show_variable");
    show.setFieldValue("score", "VARIABLE");
    drainBlock(show, ctx);
    expect(stage.monitors.has("score")).toBe(true);

    const hide = workspace.newBlock("scratch_data_hide_variable");
    hide.setFieldValue("score", "VARIABLE");
    drainBlock(hide, ctx);
    expect(stage.monitors.has("score")).toBe(false);
  });

  it("add / delete / replace mutate lists by 1-based index", () => {
    const { ctx, ref } = makeDataContext(
      makeSprite({ lists: { items: ["a", "b"] } })
    );

    const add = workspace.newBlock("scratch_data_add_to_list");
    add.setFieldValue("c", "ITEM");
    add.setFieldValue("items", "LIST");
    drainBlock(add, ctx);
    expect(ref.current.lists.items).toEqual(["a", "b", "c"]);

    const replace = workspace.newBlock("scratch_data_replace_in_list");
    replace.setFieldValue("2", "INDEX");
    replace.setFieldValue("items", "LIST");
    replace.setFieldValue("B", "ITEM");
    drainBlock(replace, ctx);
    expect(ref.current.lists.items).toEqual(["a", "B", "c"]);

    const del = workspace.newBlock("scratch_data_delete_from_list");
    del.setFieldValue("1", "INDEX");
    del.setFieldValue("items", "LIST");
    drainBlock(del, ctx);
    expect(ref.current.lists.items).toEqual(["B", "c"]);

    // Out-of-range delete is a no-op.
    del.setFieldValue("99", "INDEX");
    drainBlock(del, ctx);
    expect(ref.current.lists.items).toEqual(["B", "c"]);
  });

  it("item_of / length / contains reporters resolve through the list", () => {
    const { ctx } = makeDataContext(
      makeSprite({ lists: { items: ["foo", "bar", 42] } })
    );

    const item = workspace.newBlock("scratch_data_item_of_list");
    item.setFieldValue("2", "INDEX");
    item.setFieldValue("items", "LIST");
    expect(evaluate(item, ctx)).toBe("bar");

    const len = workspace.newBlock("scratch_data_length_of_list");
    len.setFieldValue("items", "LIST");
    expect(evaluate(len, ctx)).toBe(3);

    const contains = workspace.newBlock("scratch_data_list_contains");
    contains.setFieldValue("items", "LIST");
    contains.setFieldValue("BAR", "ITEM"); // case-insensitive
    expect(evaluate(contains, ctx)).toBe(true);
  });

  it("out-of-range item_of returns empty string", () => {
    const { ctx } = makeDataContext(makeSprite({ lists: { items: ["x"] } }));
    const item = workspace.newBlock("scratch_data_item_of_list");
    item.setFieldValue("99", "INDEX");
    item.setFieldValue("items", "LIST");
    expect(evaluate(item, ctx)).toBe("");
  });
});
