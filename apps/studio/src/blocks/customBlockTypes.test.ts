import { describe, expect, it } from "vitest";

import {
  CUSTOM_BLOCK_TYPE_PREFIX,
  type CustomBlockDef,
  isCustomBlockType,
  toBlocklyJson
} from "./customBlockTypes";

function base(): CustomBlockDef {
  return {
    type: `${CUSTOM_BLOCK_TYPE_PREFIX}t`,
    kindKind: "designed",
    label: "do thing",
    tooltip: "tip",
    category: "Logic",
    color: "logic_blocks",
    fields: [],
    hasPrevious: true,
    hasNext: true,
    createdAt: "x",
    updatedAt: "x"
  };
}

describe("isCustomBlockType", () => {
  it("recognizes the wf_custom_ prefix", () => {
    expect(isCustomBlockType("wf_custom_foo")).toBe(true);
    expect(isCustomBlockType("wf_ui_button")).toBe(false);
    expect(isCustomBlockType("foo")).toBe(false);
  });
});

describe("toBlocklyJson", () => {
  it("emits a Blockly definition with style for non-hex colors", () => {
    const json = toBlocklyJson(base());
    expect(json.type).toBe("wf_custom_t");
    expect(json.style).toBe("logic_blocks");
    expect(json.colour).toBeUndefined();
    expect(json.previousStatement).toBeNull();
    expect(json.nextStatement).toBeNull();
  });

  it("uses colour for hex values instead of style", () => {
    const json = toBlocklyJson({ ...base(), color: "#abc123" });
    expect(json.colour).toBe("#abc123");
    expect(json.style).toBeUndefined();
  });

  it("omits previous/next when not requested", () => {
    const json = toBlocklyJson({ ...base(), hasPrevious: false, hasNext: false });
    expect(json.previousStatement).toBeUndefined();
    expect(json.nextStatement).toBeUndefined();
  });

  it("renders a composite block as a single labelled opaque block (no fields)", () => {
    const def: CustomBlockDef = {
      ...base(),
      kindKind: "composite",
      label: "login form",
      // Composite never uses fields even if present in def
      fields: [
        { type: "field_input", name: "IGNORED", label: "ignored", defaultValue: "x" }
      ],
      subgraphXml: "<xml><block type='wf_ui_input'/></xml>",
      subgraphBlockCount: 4
    };
    const json = toBlocklyJson(def) as {
      type: string;
      message0: string;
      args0: unknown[];
      previousStatement?: unknown;
      nextStatement?: unknown;
    };
    expect(json.type).toBe("wf_custom_t");
    expect(json.message0).toBe("📦 login form");
    expect(json.args0).toEqual([]);
    expect(json.previousStatement).toBeNull();
    expect(json.nextStatement).toBeNull();
  });

  it("translates fields into args0 with correct shape per type", () => {
    const def = base();
    def.fields = [
      { type: "field_input", name: "NAME", label: "name", defaultValue: "foo" },
      { type: "field_number", name: "COUNT", label: "count", defaultValue: 42 },
      {
        type: "field_dropdown",
        name: "MODE",
        label: "mode",
        defaultValue: "a",
        options: [
          ["A", "a"],
          ["B", "b"]
        ]
      },
      { type: "field_checkbox", name: "ENABLED", label: "enabled", defaultValue: true }
    ];
    const json = toBlocklyJson(def) as {
      message0: string;
      args0: Array<Record<string, unknown>>;
    };
    expect(json.message0).toBe("do thing name %1 count %2 mode %3 enabled %4");
    expect(json.args0).toHaveLength(4);
    expect(json.args0[0]).toEqual({ type: "field_input", name: "NAME", text: "foo" });
    expect(json.args0[1]).toEqual({ type: "field_number", name: "COUNT", value: 42 });
    expect(json.args0[2]).toMatchObject({
      type: "field_dropdown",
      name: "MODE",
      options: [
        ["A", "a"],
        ["B", "b"]
      ]
    });
    expect(json.args0[3]).toEqual({
      type: "field_checkbox",
      name: "ENABLED",
      checked: true
    });
  });
});
