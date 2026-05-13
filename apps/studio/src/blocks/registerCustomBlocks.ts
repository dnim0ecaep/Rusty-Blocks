import * as Blockly from "blockly";

import type { CustomBlockDef } from "./customBlockTypes";
import { toBlocklyJson } from "./customBlockTypes";
import {
  BUILTIN_CATEGORY_NAMES,
  MY_BLOCKS_CATEGORY,
  useBlockOrgStore,
} from "../store/blockOrgStore";

/**
 * Register a single custom block definition with Blockly.
 *
 * Safe to call multiple times for the same `type`: it overwrites the existing
 * registration (Blockly allows this). The toolbox category assignment is also
 * updated in blockOrgStore so the toolbox builder picks it up.
 *
 * If `def.category` references a category that doesn't exist (deleted or
 * never created), the block falls back to "My Blocks" instead of being
 * filed under a missing name where the toolbox builder would drop it.
 */
export function registerCustomBlock(def: CustomBlockDef): void {
  const json = toBlocklyJson(def);
  // defineBlocksWithJsonArray re-defining a type emits a console warning but
  // still updates the registry, which is what we want during edits.
  Blockly.common.defineBlocksWithJsonArray([json as never]);

  const orgState = useBlockOrgStore.getState();
  const knownCategories = new Set<string>([
    ...BUILTIN_CATEGORY_NAMES,
    ...orgState.customCategories.map((c) => c.name),
  ]);
  const targetCategory = knownCategories.has(def.category)
    ? def.category
    : MY_BLOCKS_CATEGORY;
  if (orgState.assignments[def.type] !== targetCategory) {
    orgState.moveBlock(def.type, targetCategory);
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
