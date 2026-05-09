import * as Blockly from "blockly";
import { beforeAll, describe, expect, it } from "vitest";

import exampleJson from "../../../../../examples/sprite-bouncer.warpforge.json";
import { registerScratchPrimitiveBlocks } from "../../blocks/scratchPrimitiveBlocks";
import { useStageStore } from "../../store/stageStore";
import type { ProjectFile } from "../../types/workspace";
import { findHats } from "../scheduler";
import { materializeSpriteWorkspace } from "../spriteWorkspaces";

/**
 * Smoke test for the bundled `examples/sprite-bouncer.warpforge.json`.
 *
 * Catches regressions where:
 *   - The example file's JSON shape drifts from the ProjectFile schema.
 *   - A sprite's `scripts_xml` contains a block type the catalog doesn't
 *     register (Blockly logs a warning and skips it — that would mean
 *     the green flag silently does nothing).
 *   - The expected hat blocks aren't reachable as top-level blocks.
 *
 * The JSON is imported via TS's `resolveJsonModule` — that keeps the
 * test browser-safe (no `node:fs`) and pins the example as a build-time
 * dependency, so renaming the file fails the build instead of the test.
 */
function loadExample(): ProjectFile {
  return exampleJson as unknown as ProjectFile;
}

describe("examples/sprite-bouncer.warpforge.json", () => {
  beforeAll(() => {
    registerScratchPrimitiveBlocks();
  });

  it("parses as a ProjectFile with sprite stage_state", () => {
    const project = loadExample();
    expect(project.project.app_name).toBe("Sprite Bouncer");
    expect(project.stage_state).toBeDefined();
    expect(project.stage_state!.sprites).toHaveLength(2);
    const friend = project.stage_state!.sprites.find((s) => s.name === "Friend");
    const counter = project.stage_state!.sprites.find((s) => s.name === "Counter");
    expect(friend).toBeDefined();
    expect(counter).toBeDefined();
  });

  it("hydrates the live stageStore without error", () => {
    const project = loadExample();
    useStageStore.getState().hydrate(project.stage_state);
    const sprites = useStageStore.getState().sprites;
    expect(sprites.map((s) => s.name).sort()).toEqual(["Counter", "Friend"]);
    expect(useStageStore.getState().globalVariables.score).toBe(0);
  });

  it("Friend's scripts_xml parses and exposes the expected hats", () => {
    const project = loadExample();
    const friend = project.stage_state!.sprites.find((s) => s.name === "Friend")!;
    const ws = materializeSpriteWorkspace(friend);
    try {
      // Three hats: flag, key=space, sprite-clicked.
      const flagHats = findHats(ws, "scratch_event_when_flag_clicked");
      const keyHats = findHats(ws, "scratch_event_when_key_pressed");
      const clickHats = findHats(ws, "scratch_event_when_this_sprite_clicked");
      expect(flagHats).toHaveLength(1);
      expect(keyHats).toHaveLength(1);
      expect(keyHats[0].getFieldValue("KEY")).toBe("space");
      expect(clickHats).toHaveLength(1);

      // Flag-hat body must lead to a forever loop (the bounce).
      const body = flagHats[0].getNextBlock();
      expect(body).not.toBeNull();
      // Walk the chain looking for the forever block.
      let cur = body;
      let foundForever = false;
      while (cur) {
        if (cur.type === "scratch_control_forever") {
          foundForever = true;
          break;
        }
        cur = cur.getNextBlock();
      }
      expect(foundForever).toBe(true);
    } finally {
      ws.dispose();
    }
  });

  it("Counter's scripts_xml parses with three key hats and one flag hat", () => {
    const project = loadExample();
    const counter = project.stage_state!.sprites.find((s) => s.name === "Counter")!;
    const ws = materializeSpriteWorkspace(counter);
    try {
      const flagHats = findHats(ws, "scratch_event_when_flag_clicked");
      const keyHats = findHats(ws, "scratch_event_when_key_pressed");
      expect(flagHats).toHaveLength(1);
      expect(keyHats).toHaveLength(3);
      const keys = keyHats.map((h) => h.getFieldValue("KEY")).sort();
      expect(keys).toEqual(["a", "b", "c"]);
    } finally {
      ws.dispose();
    }
  });

  it("every block type referenced is registered in the Scratch primitive catalog", () => {
    const project = loadExample();
    const used = new Set<string>();
    for (const sprite of project.stage_state!.sprites) {
      // Cheap regex scan — we only care about block type tokens.
      for (const m of sprite.scripts_xml.matchAll(/type="([^"]+)"/g)) {
        used.add(m[1]);
      }
    }
    // Every used type should construct cleanly via Blockly.
    const ws = new Blockly.Workspace();
    try {
      for (const t of used) {
        // Will throw if the block type wasn't registered.
        const block = ws.newBlock(t);
        expect(block.type).toBe(t);
      }
    } finally {
      ws.dispose();
    }
  });
});
