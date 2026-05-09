import { afterEach, describe, expect, it } from "vitest";

import {
  BLOCK_MODULE_SCHEMA_VERSION,
  CUSTOM_BLOCK_TYPE_PREFIX,
  type CustomBlockDef,
  type ModuleSnippet
} from "../blocks/customBlockTypes";
import { useCustomBlocksStore } from "./customBlocksStore";

function makeBlock(overrides: Partial<CustomBlockDef> = {}): CustomBlockDef {
  const now = "2026-01-01T00:00:00Z";
  return {
    type: `${CUSTOM_BLOCK_TYPE_PREFIX}sample`,
    kindKind: "designed",
    label: "sample block",
    tooltip: "",
    category: "Logic",
    color: "logic_blocks",
    fields: [],
    hasPrevious: true,
    hasNext: true,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function makeSnippet(overrides: Partial<ModuleSnippet> = {}): ModuleSnippet {
  return {
    id: "snip_1",
    name: "snippet",
    description: "",
    xml: "<xml><block type='wf_ui_button'/></xml>",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides
  };
}

describe("customBlocksStore", () => {
  afterEach(() => {
    useCustomBlocksStore.getState().clearAll();
  });

  it("upserts blocks by type", () => {
    const store = useCustomBlocksStore.getState();
    store.upsertBlock(makeBlock({ type: "wf_custom_a", label: "A" }));
    store.upsertBlock(makeBlock({ type: "wf_custom_b", label: "B" }));
    expect(useCustomBlocksStore.getState().blocks).toHaveLength(2);

    // Replace by same type
    store.upsertBlock(makeBlock({ type: "wf_custom_a", label: "A2" }));
    expect(useCustomBlocksStore.getState().blocks).toHaveLength(2);
    expect(useCustomBlocksStore.getState().getBlock("wf_custom_a")?.label).toBe("A2");
  });

  it("removes blocks", () => {
    const store = useCustomBlocksStore.getState();
    store.upsertBlock(makeBlock({ type: "wf_custom_a" }));
    store.upsertBlock(makeBlock({ type: "wf_custom_b" }));
    store.removeBlock("wf_custom_a");
    const types = useCustomBlocksStore.getState().blocks.map((b) => b.type);
    expect(types).toEqual(["wf_custom_b"]);
  });

  it("adds and removes snippets", () => {
    const store = useCustomBlocksStore.getState();
    store.addSnippet(makeSnippet({ id: "snip_x" }));
    store.addSnippet(makeSnippet({ id: "snip_y" }));
    expect(useCustomBlocksStore.getState().snippets).toHaveLength(2);
    store.removeSnippet("snip_x");
    expect(useCustomBlocksStore.getState().snippets.map((s) => s.id)).toEqual(["snip_y"]);
  });

  it("exports the current state as a BlockModule", () => {
    const store = useCustomBlocksStore.getState();
    store.upsertBlock(makeBlock({ type: "wf_custom_a" }));
    store.addSnippet(makeSnippet({ id: "snip_a" }));
    const module = store.exportModule({ name: "Test", description: "desc" });
    expect(module.schemaVersion).toBe(BLOCK_MODULE_SCHEMA_VERSION);
    expect(module.name).toBe("Test");
    expect(module.description).toBe("desc");
    expect(module.blocks.map((b) => b.type)).toEqual(["wf_custom_a"]);
    expect(module.snippets.map((s) => s.id)).toEqual(["snip_a"]);
    expect(typeof module.exportedAt).toBe("string");
  });

  it("preserves composite block subgraph XML through export → import round-trip", () => {
    const store = useCustomBlocksStore.getState();
    store.upsertBlock(
      makeBlock({
        type: "wf_custom_login_form",
        kindKind: "composite",
        label: "login form",
        subgraphXml: "<xml><block type='wf_ui_input' id='a'/></xml>",
        subgraphBlockCount: 1
      })
    );
    const exported = store.exportModule({});
    expect(exported.blocks).toHaveLength(1);
    expect(exported.blocks[0].subgraphXml).toBe(
      "<xml><block type='wf_ui_input' id='a'/></xml>"
    );

    // Clear and re-import — the composite metadata should round-trip.
    store.clearAll();
    expect(useCustomBlocksStore.getState().blocks).toHaveLength(0);
    const result = store.importModule(exported);
    expect(result.blocksAdded).toBe(1);
    const reimported = useCustomBlocksStore
      .getState()
      .getBlock("wf_custom_login_form");
    expect(reimported?.kindKind).toBe("composite");
    expect(reimported?.subgraphXml).toBe(
      "<xml><block type='wf_ui_input' id='a'/></xml>"
    );
    expect(reimported?.subgraphBlockCount).toBe(1);
  });

  it("imports merging by type and id, reporting newly added counts", () => {
    const store = useCustomBlocksStore.getState();
    store.upsertBlock(makeBlock({ type: "wf_custom_existing" }));
    store.addSnippet(makeSnippet({ id: "snip_existing" }));

    const result = store.importModule({
      schemaVersion: BLOCK_MODULE_SCHEMA_VERSION,
      name: "incoming",
      description: "",
      blocks: [
        makeBlock({ type: "wf_custom_existing", label: "updated" }),
        makeBlock({ type: "wf_custom_new" })
      ],
      snippets: [
        makeSnippet({ id: "snip_existing", name: "updated" }),
        makeSnippet({ id: "snip_new" })
      ],
      exportedAt: "2026-01-01T00:00:00Z"
    });

    // Existing was updated (incoming wins), new was added.
    expect(useCustomBlocksStore.getState().getBlock("wf_custom_existing")?.label).toBe("updated");
    expect(useCustomBlocksStore.getState().getBlock("wf_custom_new")).toBeTruthy();
    expect(result.blocksAdded).toBe(1);
    expect(result.snippetsAdded).toBe(1);
  });
});
