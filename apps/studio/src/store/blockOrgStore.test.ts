import { afterEach, describe, expect, it } from "vitest";

import {
  LAYOUT_PRESET_SCHEMA_VERSION,
  type LayoutPreset,
  BUILTIN_CATEGORY_NAMES,
  displayCategoryName,
  orderCategoryNames,
  useBlockOrgStore,
} from "./blockOrgStore";

describe("blockOrgStore layout presets", () => {
  afterEach(() => {
    // Reset live state and presets so tests don't leak
    useBlockOrgStore.getState().resetToDefaults();
    const names = Object.keys(useBlockOrgStore.getState().presets);
    for (const n of names) {
      useBlockOrgStore.getState().deletePreset(n);
    }
  });

  it("savePreset captures the current assignments and custom categories", () => {
    const store = useBlockOrgStore.getState();
    store.moveBlock("wf_window", "Logic"); // tweak the live state
    store.addCategory("ScratchSpace");

    const preset = store.savePreset("My Layout");

    expect(preset.schemaVersion).toBe(LAYOUT_PRESET_SCHEMA_VERSION);
    expect(preset.name).toBe("My Layout");
    expect(preset.assignments.wf_window).toBe("Logic");
    expect(preset.customCategories.map((c) => c.name)).toContain("ScratchSpace");

    const stored = useBlockOrgStore.getState().getPreset("My Layout");
    expect(stored).toBeDefined();
    expect(stored?.assignments.wf_window).toBe("Logic");
  });

  it("loadPreset restores assignments and custom categories", () => {
    const store = useBlockOrgStore.getState();
    store.moveBlock("wf_window", "Logic");
    store.addCategory("Saved");
    store.savePreset("Snapshot");

    // Mutate after saving
    store.moveBlock("wf_window", "UI");
    store.removeCategory("Saved");
    expect(useBlockOrgStore.getState().assignments.wf_window).toBe("UI");
    expect(useBlockOrgStore.getState().customCategories.find((c) => c.name === "Saved"))
      .toBeUndefined();

    store.loadPreset("Snapshot");
    expect(useBlockOrgStore.getState().assignments.wf_window).toBe("Logic");
    expect(
      useBlockOrgStore.getState().customCategories.find((c) => c.name === "Saved")
    ).toBeTruthy();
  });

  it("savePreset overwrites an existing preset of the same name", () => {
    const store = useBlockOrgStore.getState();
    store.moveBlock("wf_window", "Logic");
    store.savePreset("v1");
    store.moveBlock("wf_window", "Network");
    store.savePreset("v1");
    const stored = useBlockOrgStore.getState().getPreset("v1");
    expect(stored?.assignments.wf_window).toBe("Network");
    expect(useBlockOrgStore.getState().listPresets()).toEqual(["v1"]);
  });

  it("deletePreset removes a preset by name", () => {
    const store = useBlockOrgStore.getState();
    store.savePreset("a");
    store.savePreset("b");
    expect(useBlockOrgStore.getState().listPresets()).toEqual(["a", "b"]);
    store.deletePreset("a");
    expect(useBlockOrgStore.getState().listPresets()).toEqual(["b"]);
  });

  it("savePreset rejects empty/whitespace names", () => {
    const store = useBlockOrgStore.getState();
    expect(() => store.savePreset("   ")).toThrow();
    expect(() => store.savePreset("")).toThrow();
  });

  it("exportPreset returns a JSON-serializable copy and importPreset round-trips it", () => {
    const store = useBlockOrgStore.getState();
    store.moveBlock("wf_window", "Logic");
    store.savePreset("trip");

    const exported = store.exportPreset("trip");
    expect(exported).toBeTruthy();

    // Round-trip via JSON
    const wireFormat = JSON.parse(JSON.stringify(exported)) as LayoutPreset;

    store.deletePreset("trip");
    expect(useBlockOrgStore.getState().getPreset("trip")).toBeUndefined();

    const imported = store.importPreset(wireFormat);
    expect(imported.name).toBe("trip");
    expect(useBlockOrgStore.getState().getPreset("trip")?.assignments.wf_window).toBe(
      "Logic"
    );
  });

  it("importPreset overwrites by name", () => {
    const store = useBlockOrgStore.getState();
    store.moveBlock("wf_window", "Logic");
    store.savePreset("dup");

    const incoming: LayoutPreset = {
      schemaVersion: LAYOUT_PRESET_SCHEMA_VERSION,
      name: "dup",
      assignments: { wf_window: "AI" },
      customCategories: [],
      savedAt: "2026-01-01T00:00:00Z",
    };
    store.importPreset(incoming);
    expect(useBlockOrgStore.getState().getPreset("dup")?.assignments.wf_window).toBe(
      "AI"
    );
  });

  it("importPreset rejects payloads missing a name", () => {
    const store = useBlockOrgStore.getState();
    expect(() =>
      store.importPreset({
        schemaVersion: 1,
        name: "",
        assignments: {},
        customCategories: [],
        savedAt: "x",
      })
    ).toThrow();
  });

  it("listPresets returns names sorted alphabetically", () => {
    const store = useBlockOrgStore.getState();
    store.savePreset("zebra");
    store.savePreset("alpha");
    store.savePreset("mango");
    expect(useBlockOrgStore.getState().listPresets()).toEqual(["alpha", "mango", "zebra"]);
  });
});

describe("blockOrgStore default assignments", () => {
  afterEach(() => {
    useBlockOrgStore.getState().resetToDefaults();
  });

  it("seeds Blockly's standard built-in blocks into the eight Scratch categories", () => {
    const { assignments } = useBlockOrgStore.getState();
    // Spot-check one block per Scratch bucket so a regression is loud.
    expect(assignments.controls_if).toBe("Control");
    expect(assignments.controls_repeat_ext).toBe("Control");
    expect(assignments.logic_compare).toBe("Operators");
    expect(assignments.math_arithmetic).toBe("Operators");
    expect(assignments.text_join).toBe("Operators");
    expect(assignments.text_print).toBe("Looks");
    expect(assignments.text_prompt_ext).toBe("Sensing");
    expect(assignments.variables_get).toBe("Variables");
    expect(assignments.lists_create_with).toBe("Variables");
    expect(assignments.procedures_defnoreturn).toBe("Variables");
  });

  it("seeds Scratch primitive blocks into their corresponding Scratch categories", () => {
    const { assignments } = useBlockOrgStore.getState();
    // Spot-check one primitive per Scratch bucket.
    expect(assignments.scratch_motion_move_steps).toBe("Motion");
    expect(assignments.scratch_motion_turn_right).toBe("Motion");
    expect(assignments.scratch_looks_say).toBe("Looks");
    expect(assignments.scratch_sound_play).toBe("Sound");
    expect(assignments.scratch_event_when_flag_clicked).toBe("Events");
    expect(assignments.scratch_control_repeat).toBe("Control");
    expect(assignments.scratch_sensing_touching).toBe("Sensing");
    expect(assignments.scratch_op_add).toBe("Operators");
    expect(assignments.scratch_data_set_variable).toBe("Variables");
  });
});

describe("blockOrgStore renameCategory", () => {
  afterEach(() => {
    useBlockOrgStore.getState().resetToDefaults();
  });

  it("renames a built-in category without disturbing assignments", () => {
    const store = useBlockOrgStore.getState();
    const error = store.renameCategory("Motion", "Movement");
    expect(error).toBeNull();
    const state = useBlockOrgStore.getState();
    expect(state.categoryRenames.Motion).toBe("Movement");
    // Assignments still keyed by canonical name.
    expect(state.assignments.wf_tw_mod_stretch).toBe("Motion");
    expect(displayCategoryName("Motion", state.categoryRenames)).toBe("Movement");
  });

  it("renames a custom category", () => {
    const store = useBlockOrgStore.getState();
    store.addCategory("Scratch");
    const error = store.renameCategory("Scratch", "Sandbox");
    expect(error).toBeNull();
    const state = useBlockOrgStore.getState();
    expect(displayCategoryName("Scratch", state.categoryRenames)).toBe("Sandbox");
  });

  it("rejects a rename that collides with another category's display name", () => {
    const store = useBlockOrgStore.getState();
    const error = store.renameCategory("Motion", "Looks");
    expect(error).toMatch(/already exists/);
    expect(useBlockOrgStore.getState().categoryRenames.Motion).toBeUndefined();
  });

  it("rejects a rename for a non-existent category", () => {
    const store = useBlockOrgStore.getState();
    const error = store.renameCategory("DoesNotExist", "X");
    expect(error).toMatch(/does not exist/);
  });

  it("clears a rename when the new name equals the canonical or is empty", () => {
    const store = useBlockOrgStore.getState();
    store.renameCategory("Motion", "Movement");
    expect(useBlockOrgStore.getState().categoryRenames.Motion).toBe("Movement");
    store.renameCategory("Motion", "Motion");
    expect(useBlockOrgStore.getState().categoryRenames.Motion).toBeUndefined();
    store.renameCategory("Motion", "Movement");
    store.renameCategory("Motion", "   ");
    expect(useBlockOrgStore.getState().categoryRenames.Motion).toBeUndefined();
  });

  it("removeCategory also drops any rename entry for it", () => {
    const store = useBlockOrgStore.getState();
    store.addCategory("Tmp");
    store.renameCategory("Tmp", "Sandbox");
    expect(useBlockOrgStore.getState().categoryRenames.Tmp).toBe("Sandbox");
    store.removeCategory("Tmp");
    expect(useBlockOrgStore.getState().categoryRenames.Tmp).toBeUndefined();
  });

  it("savePreset/loadPreset round-trips categoryRenames", () => {
    const store = useBlockOrgStore.getState();
    store.renameCategory("Looks", "Visuals");
    store.savePreset("with-renames");

    store.renameCategory("Looks", "Looks"); // clear
    expect(useBlockOrgStore.getState().categoryRenames.Looks).toBeUndefined();

    store.loadPreset("with-renames");
    expect(useBlockOrgStore.getState().categoryRenames.Looks).toBe("Visuals");
    store.deletePreset("with-renames");
  });

  it("resetToDefaults clears renames", () => {
    const store = useBlockOrgStore.getState();
    store.renameCategory("Sound", "Audio");
    expect(useBlockOrgStore.getState().categoryRenames.Sound).toBe("Audio");
    store.resetToDefaults();
    expect(useBlockOrgStore.getState().categoryRenames).toEqual({});
  });
});

describe("blockOrgStore category ordering", () => {
  afterEach(() => {
    useBlockOrgStore.getState().resetToDefaults();
  });

  it("orderCategoryNames puts saved order first then appends remaining names", () => {
    const ordered = orderCategoryNames(["A", "B", "C", "D"], ["C", "A"]);
    expect(ordered).toEqual(["C", "A", "B", "D"]);
  });

  it("orderCategoryNames drops names not present in the natural list", () => {
    const ordered = orderCategoryNames(["A", "B"], ["X", "B", "Y"]);
    expect(ordered).toEqual(["B", "A"]);
  });

  it("moveCategoryUp / moveCategoryDown swap adjacent categories", () => {
    const store = useBlockOrgStore.getState();
    // Start from natural order: Project is at index 0, Structure at 1.
    expect(BUILTIN_CATEGORY_NAMES[0]).toBe("Project");
    expect(BUILTIN_CATEGORY_NAMES[1]).toBe("Structure");

    store.moveCategoryDown("Project");
    let order = useBlockOrgStore.getState().categoryOrder;
    expect(order.slice(0, 2)).toEqual(["Structure", "Project"]);

    store.moveCategoryUp("Project");
    order = useBlockOrgStore.getState().categoryOrder;
    expect(order.slice(0, 2)).toEqual(["Project", "Structure"]);
  });

  it("moveCategoryUp on the first category is a no-op", () => {
    const store = useBlockOrgStore.getState();
    const first = BUILTIN_CATEGORY_NAMES[0];
    store.moveCategoryUp(first);
    const order = useBlockOrgStore.getState().categoryOrder;
    // Either the order is empty (untouched) or first is still first.
    if (order.length > 0) {
      expect(order[0]).toBe(first);
    }
  });

  it("removeCategory drops the category from the order list", () => {
    const store = useBlockOrgStore.getState();
    store.addCategory("Tmp");
    // Force "Tmp" into the order.
    store.moveCategoryUp("Tmp");
    expect(useBlockOrgStore.getState().categoryOrder).toContain("Tmp");
    store.removeCategory("Tmp");
    expect(useBlockOrgStore.getState().categoryOrder).not.toContain("Tmp");
  });

  it("setCategoryIndex moves a category to an absolute position", () => {
    const store = useBlockOrgStore.getState();
    const first = BUILTIN_CATEGORY_NAMES[0];
    const third = BUILTIN_CATEGORY_NAMES[2];
    // Move the first category to position index 2.
    store.setCategoryIndex(first, 2);
    const order = useBlockOrgStore.getState().categoryOrder;
    // First should now be at index 2; third should have shifted up to 1.
    expect(order[2]).toBe(first);
    expect(order[1]).toBe(third);
  });

  it("setCategoryIndex clamps out-of-range indices to a valid position", () => {
    const store = useBlockOrgStore.getState();
    const first = BUILTIN_CATEGORY_NAMES[0];
    store.setCategoryIndex(first, 9999);
    const order = useBlockOrgStore.getState().categoryOrder;
    // Clamped to last; must end up at the final index of the ordered list.
    expect(order[order.length - 1]).toBe(first);

    store.setCategoryIndex(first, -5);
    const order2 = useBlockOrgStore.getState().categoryOrder;
    expect(order2[0]).toBe(first);
  });

  it("setCategoryIndex is a no-op for an unknown category", () => {
    const store = useBlockOrgStore.getState();
    const before = [...useBlockOrgStore.getState().categoryOrder];
    store.setCategoryIndex("DoesNotExist", 0);
    expect(useBlockOrgStore.getState().categoryOrder).toEqual(before);
  });

  it("setCategoryColor sets and clears a hex override", () => {
    const store = useBlockOrgStore.getState();
    store.setCategoryColor("Motion", "#ff00aa");
    expect(useBlockOrgStore.getState().categoryColors.Motion).toBe("#ff00aa");
    // Setting null clears.
    store.setCategoryColor("Motion", null);
    expect(useBlockOrgStore.getState().categoryColors.Motion).toBeUndefined();
  });

  it("setCategoryColor normalizes input (lowercase + leading #)", () => {
    const store = useBlockOrgStore.getState();
    store.setCategoryColor("Looks", "AABBCC");
    expect(useBlockOrgStore.getState().categoryColors.Looks).toBe("#aabbcc");
    store.setCategoryColor("Looks", "#DDEEFF");
    expect(useBlockOrgStore.getState().categoryColors.Looks).toBe("#ddeeff");
  });

  it("removeCategory drops the color override too", () => {
    const store = useBlockOrgStore.getState();
    store.addCategory("ColorTmp");
    store.setCategoryColor("ColorTmp", "#123456");
    expect(useBlockOrgStore.getState().categoryColors.ColorTmp).toBe("#123456");
    store.removeCategory("ColorTmp");
    expect(useBlockOrgStore.getState().categoryColors.ColorTmp).toBeUndefined();
  });

  it("resetToDefaults clears categoryColors", () => {
    const store = useBlockOrgStore.getState();
    store.setCategoryColor("Sound", "#abcabc");
    expect(useBlockOrgStore.getState().categoryColors.Sound).toBe("#abcabc");
    store.resetToDefaults();
    expect(useBlockOrgStore.getState().categoryColors).toEqual({});
  });

  it("savePreset / loadPreset round-trip categoryColors", () => {
    const store = useBlockOrgStore.getState();
    store.setCategoryColor("Operators", "#112233");
    store.savePreset("with-colors");
    store.resetToDefaults();
    expect(useBlockOrgStore.getState().categoryColors.Operators).toBeUndefined();
    store.loadPreset("with-colors");
    expect(useBlockOrgStore.getState().categoryColors.Operators).toBe("#112233");
    store.deletePreset("with-colors");
  });

  it("savePreset / loadPreset round-trip categoryOrder", () => {
    const store = useBlockOrgStore.getState();
    store.moveCategoryDown("Project");
    const savedOrder = [...useBlockOrgStore.getState().categoryOrder];
    store.savePreset("with-order");

    store.resetToDefaults();
    expect(useBlockOrgStore.getState().categoryOrder).toEqual([]);

    store.loadPreset("with-order");
    expect(useBlockOrgStore.getState().categoryOrder).toEqual(savedOrder);
    store.deletePreset("with-order");
  });
});

describe("blockOrgStore removeCategory migration", () => {
  afterEach(() => {
    useBlockOrgStore.getState().resetToDefaults();
  });

  it("reassigns blocks from a deleted category back to My Blocks", () => {
    const store = useBlockOrgStore.getState();
    store.addCategory("Menus");
    store.moveBlock("wf_custom_menu_matt", "Menus");
    expect(useBlockOrgStore.getState().assignments["wf_custom_menu_matt"]).toBe("Menus");

    store.removeCategory("Menus");

    const after = useBlockOrgStore.getState();
    expect(after.customCategories.find((c) => c.name === "Menus")).toBeUndefined();
    // The block keeps its assignment, but the assignment now points at
    // a still-existing category so the toolbox builder renders it.
    expect(after.assignments["wf_custom_menu_matt"]).toBe("My Blocks");
  });

  it("leaves unrelated assignments untouched on removeCategory", () => {
    const store = useBlockOrgStore.getState();
    store.addCategory("Menus");
    store.addCategory("Forms");
    store.moveBlock("wf_custom_a", "Menus");
    store.moveBlock("wf_custom_b", "Forms");

    store.removeCategory("Menus");

    const after = useBlockOrgStore.getState();
    expect(after.assignments["wf_custom_a"]).toBe("My Blocks");
    expect(after.assignments["wf_custom_b"]).toBe("Forms");
  });
});
