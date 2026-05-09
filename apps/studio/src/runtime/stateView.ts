/**
 * Engine ↔ host state contract.
 *
 * Every runtime module (audio, stageInput, costumeImageCache, runFlow,
 * scriptInterpreter via ExecContext) reads and writes stage state through
 * a `StageStateView`. The studio installs a zustand-backed view; the
 * standalone player installs a plain-object view. Decoupling here is what
 * lets the same engine ship in both.
 *
 * Modules call `currentView()` to get the active view. Tests that only
 * exercise pure interpreter logic don't need to install a view at all —
 * the relevant `ExecContext` methods are optional.
 */

import type { AssetRecord, Sprite } from "../types/workspace";

export interface StageStateView {
  // ── Sprite reads ──────────────────────────────────────────────────
  getSprites(): readonly Sprite[];
  getSprite(id: string): Sprite | undefined;

  // ── Sprite writes ─────────────────────────────────────────────────
  patchSprite(id: string, patch: Partial<Sprite>): void;
  /** Append a fresh sprite (used by `cloneSprite`). The view is
   *  responsible for layer-management; callers pass the sprite as-is. */
  addSprite(sprite: Sprite): void;
  removeSprite(id: string): void;

  // ── Stage-scope variables / lists ─────────────────────────────────
  getGlobalVariables(): Readonly<Record<string, number | string>>;
  getGlobalLists(): Readonly<Record<string, ReadonlyArray<number | string>>>;
  setGlobalVariable(name: string, value: number | string): void;
  setGlobalList(name: string, list: Array<number | string>): void;

  // ── Monitor visibility ────────────────────────────────────────────
  setMonitorVisible(name: string, visible: boolean): void;

  // ── Asset lookup (costumes/sounds/icons live here) ────────────────
  getAsset(assetId: string): AssetRecord | undefined;

  // ── Cloning helpers ───────────────────────────────────────────────
  /** Total number of clones currently on the stage — used to enforce
   *  the global cap (Scratch convention: 300). */
  cloneCount(): number;
  /** Allocate a fresh sprite id. Centralized so the studio and the
   *  standalone don't have to agree on a generator. */
  newSpriteId(): string;
  /** Allocate the next layer integer for a newly-added sprite. */
  nextLayer(): number;
}

let installed: StageStateView | null = null;

/** Install the active view. Call once during host startup. Idempotent if
 *  the same instance is reinstalled; replacing with a different instance
 *  drops any prior runtime state from the engine's perspective. */
export function setCurrentView(view: StageStateView | null): void {
  installed = view;
}

/** Read the active view. Throws if no view is installed — engine modules
 *  should never reach this from a context that hasn't booted. */
export function currentView(): StageStateView {
  if (!installed) {
    throw new Error(
      "No StageStateView installed. Call setCurrentView() during host startup."
    );
  }
  return installed;
}

/** Best-effort accessor — returns null if no view is installed. Used by
 *  modules that need to no-op cleanly when run outside a host (e.g. a
 *  unit test that imports stageInput but never installs a view). */
export function maybeCurrentView(): StageStateView | null {
  return installed;
}
