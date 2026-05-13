/**
 * Thin facade over Blockly's per-workspace undo/redo so the rest of
 * the studio can call `undo()` / `redo()` without holding a workspace
 * reference itself.
 *
 * Blockly maintains separate undo and redo stacks on every
 * `Blockly.WorkspaceSvg`. The studio only renders one active editor
 * workspace at a time (the user is either editing project blocks OR
 * one sprite's scripts via `CenterWorkspace`), so we expose a single
 * registration slot — whichever component owns the workspace mounts
 * it here, and toolbar buttons / keyboard shortcuts route their calls
 * through.
 *
 * The change listener that already syncs `scripts_xml` to the store
 * (CenterWorkspace.tsx) fires for every undo / redo event too,
 * because Blockly synthesizes real BlockMove / BlockChange events
 * during stack replay (not UI events). So undo automatically also
 * restores the persisted scripts_xml — no extra wiring needed here.
 */

import type * as Blockly from "blockly";

let active: Blockly.WorkspaceSvg | null = null;
// Each subscriber is notified after every undo / redo so toolbar
// menus can update their `disabled` state based on whether the
// stacks are non-empty.
const subscribers = new Set<() => void>();

export function registerActiveWorkspace(ws: Blockly.WorkspaceSvg | null): void {
  active = ws;
  notify();
}

export function getActiveWorkspace(): Blockly.WorkspaceSvg | null {
  return active;
}

/**
 * Subscribe to "history-state-changed" pings. Returns the unsubscribe
 * function. Useful for React components that render the undo / redo
 * buttons with disabled state.
 */
export function subscribe(fn: () => void): () => void {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function notify(): void {
  for (const s of subscribers) {
    try {
      s();
    } catch {
      // Listener crashed — don't take everyone else down.
    }
  }
}

/**
 * Pop one action off the undo stack of the active workspace. Returns
 * `true` if anything happened (an action existed and was undone),
 * `false` if the stack was empty.
 */
export function undo(): boolean {
  if (!active) return false;
  const before = canUndo();
  if (!before) return false;
  active.undo(false);
  notify();
  return true;
}

/**
 * Pop one action off the redo stack of the active workspace. Returns
 * `true` if anything happened.
 */
export function redo(): boolean {
  if (!active) return false;
  const before = canRedo();
  if (!before) return false;
  active.undo(true);
  notify();
  return true;
}

export function canUndo(): boolean {
  if (!active) return false;
  // Blockly's WorkspaceSvg exposes an `undoStack_` and `redoStack_`
  // private array. The public `getUndoStack()` helper landed in
  // Blockly 9 but isn't typed in the d.ts shipped with our version,
  // so we read the private name through a typed shim. Falls back to
  // `false` if neither shape is available — buttons stay enabled
  // (safer than silently disabled).
  const a = active as unknown as {
    getUndoStack?: () => unknown[];
    undoStack_?: unknown[];
  };
  if (typeof a.getUndoStack === "function") return a.getUndoStack().length > 0;
  if (Array.isArray(a.undoStack_)) return a.undoStack_.length > 0;
  return true;
}

export function canRedo(): boolean {
  if (!active) return false;
  const a = active as unknown as {
    getRedoStack?: () => unknown[];
    redoStack_?: unknown[];
  };
  if (typeof a.getRedoStack === "function") return a.getRedoStack().length > 0;
  if (Array.isArray(a.redoStack_)) return a.redoStack_.length > 0;
  return true;
}
