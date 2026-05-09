import { describe, expect, it } from "vitest";

import { toolboxXml } from "./toolboxCatalog";
import {
  TURBOWARP_MODULES,
  TURBOWARP_MODULE_SNAPSHOT_DATE,
  turboWarpModuleBlockType,
  turboWarpModuleIdFromBlockType
} from "./turbowarpModules";

describe("TurboWarp module registry", () => {
  it("contains the full snapshot set", () => {
    expect(TURBOWARP_MODULE_SNAPSHOT_DATE).toBe("2026-03-02");
    expect(TURBOWARP_MODULES).toHaveLength(100);
  });

  it("has unique ids", () => {
    const ids = TURBOWARP_MODULES.map((module) => module.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("builds reversible block type names", () => {
    const sample = TURBOWARP_MODULES.find((module) => module.id === "files");
    expect(sample).toBeDefined();
    const blockType = turboWarpModuleBlockType(sample!.id);
    expect(blockType).toBe("wf_tw_mod_files");
    expect(turboWarpModuleIdFromBlockType(blockType)).toBe("files");
    expect(turboWarpModuleIdFromBlockType("wf_ui_button")).toBeNull();
  });

  it("injects module blocks into toolbox xml", () => {
    expect(toolboxXml).toContain('category name="TurboWarp Modules"');
    expect(toolboxXml).toContain('<block type="wf_tw_mod_files"></block>');
    expect(toolboxXml).toContain('<block type="wf_tw_mod_pen_plus_v7"></block>');
  });
});
