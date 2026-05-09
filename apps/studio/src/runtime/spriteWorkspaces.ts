import * as Blockly from "blockly";

import type { Sprite } from "../types/workspace";

/**
 * Build a transient (non-svg) Blockly Workspace from a sprite's `scripts_xml`.
 *
 * Used when the runtime needs to enumerate scripts on every sprite — we
 * can't ask the on-screen workspace because it only holds the *currently
 * selected* sprite's scripts. Caller is responsible for disposing the
 * returned workspace via `workspace.dispose()`.
 *
 * Empty / malformed XML produces an empty workspace rather than throwing,
 * so a single bad sprite can't break the green-flag run.
 */
export function materializeSpriteWorkspace(sprite: Sprite): Blockly.Workspace {
  const ws = new Blockly.Workspace();
  if (!sprite.scripts_xml) return ws;
  try {
    const dom = Blockly.utils.xml.textToDom(sprite.scripts_xml);
    Blockly.Xml.domToWorkspace(dom, ws);
  } catch {
    // Leave the workspace empty.
  }
  return ws;
}

/**
 * Run `fn` against a freshly materialized workspace for `sprite`, then
 * dispose the workspace. Returns the function's result.
 *
 * Callers that want to keep blocks alive (e.g. to advance a generator that
 * holds Blockly.Block references) should use `materializeSpriteWorkspace`
 * directly — disposing while a generator still references blocks would
 * crash on the next step.
 */
export function withSpriteWorkspace<T>(sprite: Sprite, fn: (ws: Blockly.Workspace) => T): T {
  const ws = materializeSpriteWorkspace(sprite);
  try {
    return fn(ws);
  } finally {
    ws.dispose();
  }
}

/**
 * Wrap a workspace with a refcount so multiple scripts can share it and
 * disposal happens exactly once, after the last script ends. Each `addRef`
 * must be paired with a `release`.
 */
export interface SharedWorkspace {
  workspace: Blockly.Workspace;
  addRef(): void;
  release(): void;
}

export function makeSharedWorkspace(ws: Blockly.Workspace): SharedWorkspace {
  let refs = 0;
  let disposed = false;
  return {
    workspace: ws,
    addRef() {
      if (disposed) return;
      refs += 1;
    },
    release() {
      refs -= 1;
      if (refs <= 0 && !disposed) {
        disposed = true;
        ws.dispose();
      }
    },
  };
}
