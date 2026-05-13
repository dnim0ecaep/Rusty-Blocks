import { describe, expect, it } from "vitest";
import { buildToolboxXml } from "./toolboxBuilder";
import { MY_BLOCKS_CATEGORY } from "../store/blockOrgStore";

describe("buildToolboxXml — orphan handling", () => {
  it("renders blocks under their declared category", () => {
    const xml = buildToolboxXml(
      { wf_window: "Structure", wf_ui_button: "UI" },
      []
    );
    expect(xml).toMatch(/<category name="Structure"/);
    expect(xml).toMatch(/<block type="wf_window"/);
    expect(xml).toMatch(/<category name="UI"/);
    expect(xml).toMatch(/<block type="wf_ui_button"/);
  });

  it("routes orphaned blocks (assigned to a missing category) into My Blocks", () => {
    // Reproduces the wf_custom_menu_matt symptom: the assignment points
    // at a custom category "Menus" that no longer exists, so the block
    // would silently disappear without the fallback.
    const xml = buildToolboxXml(
      { wf_custom_menu_matt: "Menus" },
      [] // no custom categories — "Menus" was deleted
    );
    // The block must appear somewhere; My Blocks is the safe harbor.
    expect(xml).toMatch(/<block type="wf_custom_menu_matt"/);
    // And specifically inside the My Blocks section.
    const myBlocksSection = xml.match(
      new RegExp(`<category name="${MY_BLOCKS_CATEGORY}"[\\s\\S]*?</category>`)
    );
    expect(myBlocksSection).not.toBeNull();
    expect(myBlocksSection![0]).toMatch(/<block type="wf_custom_menu_matt"/);
  });

  it("preserves blocks in real custom categories that still exist", () => {
    const xml = buildToolboxXml(
      { wf_custom_menu_matt: "Menus" },
      [{ name: "Menus", color: "#ff0000" }]
    );
    expect(xml).toMatch(/<category name="Menus"/);
    expect(xml).toMatch(/<block type="wf_custom_menu_matt"/);
    // It should NOT also appear under My Blocks.
    const myBlocksSection = xml.match(
      new RegExp(`<category name="${MY_BLOCKS_CATEGORY}"[\\s\\S]*?</category>`)
    );
    expect(myBlocksSection![0]).not.toMatch(/wf_custom_menu_matt/);
  });
});
