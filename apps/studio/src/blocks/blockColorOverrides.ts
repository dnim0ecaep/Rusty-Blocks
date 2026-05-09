import * as Blockly from "blockly";

import { useBlockOrgStore } from "../store/blockOrgStore";

/**
 * Per-category color overrides for blocks.
 *
 * Strategy: after every block has been registered, patch each block-type's
 * `init` to apply the user's category color override after the original
 * init runs. This handles BOTH the workspace and the toolbox flyout, since
 * the flyout creates fresh block instances each time it opens, all running
 * the (patched) init.
 *
 * For blocks already on the workspace, `applyCategoryColorsToWorkspace`
 * walks the existing instances and re-applies / restores colors.
 */

interface InitableBlockClass {
  init: (this: Blockly.Block) => void;
}

interface BlockClassWithFlag extends InitableBlockClass {
  __wfCategoryColorPatched?: boolean;
}

/** Originals captured the first time a given block-type's init runs. */
const ORIGINAL_STYLE = new Map<string, string>();
const ORIGINAL_COLOUR = new Map<string, string | number>();

function categoryOverrideFor(blockType: string): string | undefined {
  const state = useBlockOrgStore.getState();
  const cat = state.assignments[blockType];
  if (!cat) return undefined;
  return state.categoryColors[cat];
}

function applyOverrideToBlock(block: Blockly.Block): void {
  const override = categoryOverrideFor(block.type);
  if (override) {
    try {
      block.setColour(override);
    } catch {
      // Some block types reject hex colors; ignore silently.
    }
    return;
  }
  // Restore to whichever original we captured.
  const origStyle = ORIGINAL_STYLE.get(block.type);
  if (origStyle) {
    try {
      block.setStyle(origStyle);
      return;
    } catch {
      // Fall through to colour restoration.
    }
  }
  const origColour = ORIGINAL_COLOUR.get(block.type);
  if (origColour !== undefined) {
    try {
      block.setColour(origColour as string);
    } catch {
      // Nothing to do.
    }
  }
}

/**
 * Patch every currently-registered Blockly block type so its init() applies
 * any category color override after the original init runs. Idempotent —
 * patched classes are tagged so a second call is a no-op.
 *
 * Call this after all blocks are registered (i.e., after
 * `registerWarpforgeBlocks`, `registerRustBlocks`, and
 * `registerAllCustomBlocks`).
 */
export function installCategoryColorOverrides(): void {
  for (const type of Object.keys(Blockly.Blocks)) {
    const blockClass = (Blockly.Blocks as Record<string, BlockClassWithFlag>)[type];
    if (!blockClass || typeof blockClass.init !== "function") continue;
    if (blockClass.__wfCategoryColorPatched) continue;
    const originalInit = blockClass.init;
    blockClass.init = function patchedInit(this: Blockly.Block) {
      originalInit.call(this);
      // Capture originals on the first init for this block type so we can
      // restore them when the user clears an override.
      if (!ORIGINAL_STYLE.has(type)) {
        const styleName = (this as unknown as { styleName_?: string }).styleName_;
        if (typeof styleName === "string" && styleName) {
          ORIGINAL_STYLE.set(type, styleName);
        }
      }
      if (!ORIGINAL_COLOUR.has(type)) {
        const colour = (this as unknown as { colour_?: string }).colour_;
        if (typeof colour === "string" && colour) {
          ORIGINAL_COLOUR.set(type, colour);
        }
      }
      applyOverrideToBlock(this);
    };
    blockClass.__wfCategoryColorPatched = true;
  }
}

/**
 * Walk the workspace and re-apply color overrides (or restore originals) on
 * every existing block instance. Call this whenever `categoryColors` or
 * `assignments` change so already-rendered blocks pick up the change.
 */
export function applyCategoryColorsToWorkspace(workspace: Blockly.WorkspaceSvg | null): void {
  if (!workspace) return;
  const blocks = workspace.getAllBlocks(false);
  for (const block of blocks) {
    applyOverrideToBlock(block);
  }
}
