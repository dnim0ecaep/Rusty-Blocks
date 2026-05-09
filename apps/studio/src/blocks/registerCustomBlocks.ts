import * as Blockly from "blockly";

import type { CustomBlockDef } from "./customBlockTypes";
import { toBlocklyJson } from "./customBlockTypes";
import { useBlockOrgStore } from "../store/blockOrgStore";

/**
 * Register a single custom block definition with Blockly.
 *
 * Safe to call multiple times for the same `type`: it overwrites the existing
 * registration (Blockly allows this). The toolbox category assignment is also
 * updated in blockOrgStore so the toolbox builder picks it up.
 */
export function registerCustomBlock(def: CustomBlockDef): void {
  const json = toBlocklyJson(def);
  // defineBlocksWithJsonArray re-defining a type emits a console warning but
  // still updates the registry, which is what we want during edits.
  Blockly.common.defineBlocksWithJsonArray([json as never]);

  const assignments = useBlockOrgStore.getState().assignments;
  if (assignments[def.type] !== def.category) {
    useBlockOrgStore.getState().moveBlock(def.type, def.category);
  }
}

/** Register every custom block in the given list. Used at app boot. */
export function registerAllCustomBlocks(defs: CustomBlockDef[]): void {
  for (const def of defs) {
    registerCustomBlock(def);
  }
}

/** Unregister a custom block by removing its toolbox assignment. */
export function unregisterCustomBlock(type: string): void {
  // Blockly has no public "delete block type" API; once registered, it stays
  // for the session. We just drop the toolbox assignment so it disappears
  // from the toolbox. The next app load won't re-register it.
  const org = useBlockOrgStore.getState();
  if (org.assignments[type]) {
    // Clearing means moveBlock to a non-existent category, but the cleaner
    // approach is to mutate assignments directly via the store.
    useBlockOrgStore.setState((state) => {
      const next = { ...state.assignments };
      delete next[type];
      return { assignments: next };
    });
  }
}
