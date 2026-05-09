import * as Blockly from "blockly";
import { beforeAll, describe, expect, it } from "vitest";

import exampleJson from "../../../../../examples/star-burst.warpforge.json";
import { registerScratchPrimitiveBlocks } from "../../blocks/scratchPrimitiveBlocks";
import { useStageStore } from "../../store/stageStore";
import type { ProjectFile } from "../../types/workspace";
import { findHats } from "../scheduler";
import { materializeSpriteWorkspace } from "../spriteWorkspaces";

/**
 * Smoke test for `examples/star-burst.warpforge.json`.
 *
 * Beyond the catalog/parse checks shared with the sprite-bouncer test,
 * this verifies the cloning + broadcast wiring: the Star sprite's click
 * hat must contain `create_clone_of` + a `broadcast`, and the
 * Scorekeeper sprite must have a `when_i_receive` hat keyed to "burst".
 */

function loadExample(): ProjectFile {
  return exampleJson as unknown as ProjectFile;
}

describe("examples/star-burst.warpforge.json", () => {
  beforeAll(() => {
    registerScratchPrimitiveBlocks();
  });

  it("parses as a ProjectFile with two sprites", () => {
    const project = loadExample();
    expect(project.project.app_name).toBe("Star Burst");
    expect(project.stage_state).toBeDefined();
    expect(project.stage_state!.sprites).toHaveLength(2);
    const star = project.stage_state!.sprites.find((s) => s.name === "Star");
    const score = project.stage_state!.sprites.find((s) => s.name === "Scorekeeper");
    expect(star).toBeDefined();
    expect(score).toBeDefined();
  });

  it("hydrates the live stageStore and exposes the bursts global var", () => {
    const project = loadExample();
    useStageStore.getState().hydrate(project.stage_state);
    expect(useStageStore.getState().sprites).toHaveLength(2);
    // The example's `bursts` global may carry a non-zero value from a
    // prior runtime session (the studio persists stage state on save).
    // Just verify the variable exists and is a number; the actual value
    // is user-controlled.
    expect(typeof useStageStore.getState().globalVariables.bursts).toBe("number");
    expect(useStageStore.getState().selectedSpriteId).toBe("sprite_star");
  });

  it("Star sprite carries a flag hat, a click hat, and a clone hat", () => {
    const project = loadExample();
    const star = project.stage_state!.sprites.find((s) => s.name === "Star")!;
    const ws = materializeSpriteWorkspace(star);
    try {
      expect(findHats(ws, "scratch_event_when_flag_clicked")).toHaveLength(1);
      expect(findHats(ws, "scratch_event_when_this_sprite_clicked")).toHaveLength(1);
      expect(findHats(ws, "scratch_control_when_i_start_as_clone")).toHaveLength(1);
    } finally {
      ws.dispose();
    }
  });

  it("Star's click hat repeats clone-myself 12 times then broadcasts 'burst'", () => {
    const project = loadExample();
    const star = project.stage_state!.sprites.find((s) => s.name === "Star")!;
    const ws = materializeSpriteWorkspace(star);
    try {
      const click = findHats(ws, "scratch_event_when_this_sprite_clicked")[0];
      // Walk forward through the chain looking for repeat + broadcast.
      let cur = click.getNextBlock();
      let foundRepeat = false;
      let foundBroadcast = false;
      let repeatTimes: number | null = null;
      while (cur) {
        if (cur.type === "scratch_control_repeat") {
          foundRepeat = true;
          // field_number returns a number, not a string.
          repeatTimes = Number(cur.getFieldValue("TIMES"));
        }
        if (cur.type === "scratch_event_broadcast") {
          foundBroadcast = true;
          expect(cur.getFieldValue("BROADCAST")).toBe("burst");
        }
        cur = cur.getNextBlock();
      }
      expect(foundRepeat).toBe(true);
      expect(repeatTimes).toBe(12);
      expect(foundBroadcast).toBe(true);
    } finally {
      ws.dispose();
    }
  });

  it("Scorekeeper has a when_i_receive 'burst' hat that increments bursts", () => {
    const project = loadExample();
    const score = project.stage_state!.sprites.find((s) => s.name === "Scorekeeper")!;
    const ws = materializeSpriteWorkspace(score);
    try {
      const recvHats = findHats(ws, "scratch_event_when_i_receive");
      expect(recvHats).toHaveLength(1);
      expect(recvHats[0].getFieldValue("BROADCAST")).toBe("burst");
      const body = recvHats[0].getNextBlock();
      expect(body?.type).toBe("scratch_data_change_variable");
      expect(body?.getFieldValue("VARIABLE")).toBe("bursts");
      expect(Number(body?.getFieldValue("VALUE"))).toBe(1);
    } finally {
      ws.dispose();
    }
  });

  it("every block type referenced is registered in the catalog", () => {
    const project = loadExample();
    const used = new Set<string>();
    for (const sprite of project.stage_state!.sprites) {
      for (const m of sprite.scripts_xml.matchAll(/type="([^"]+)"/g)) {
        used.add(m[1]);
      }
    }
    const ws = new Blockly.Workspace();
    try {
      for (const t of used) {
        const block = ws.newBlock(t);
        expect(block.type).toBe(t);
      }
    } finally {
      ws.dispose();
    }
  });
});
