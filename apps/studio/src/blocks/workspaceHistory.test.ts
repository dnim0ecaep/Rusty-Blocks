/**
 * Drives the workspaceHistory facade against fake Blockly workspaces.
 * We don't import real Blockly here — its WorkspaceSvg is DOM-heavy
 * and not happy under jsdom — so we mock just the shape the facade
 * touches (`undo(redo: boolean)` and the stack accessors).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canRedo,
  canUndo,
  redo,
  registerActiveWorkspace,
  subscribe,
  undo,
} from "./workspaceHistory";

/** Minimal Blockly.WorkspaceSvg stand-in. */
function makeFakeWorkspace(opts?: { undoLen?: number; redoLen?: number }) {
  const calls: Array<{ redo: boolean }> = [];
  return {
    undoStack: Array(opts?.undoLen ?? 0).fill(null),
    redoStack: Array(opts?.redoLen ?? 0).fill(null),
    undo(isRedo: boolean) {
      calls.push({ redo: isRedo });
      if (isRedo) {
        this.redoStack.pop();
        this.undoStack.push(null);
      } else {
        this.undoStack.pop();
        this.redoStack.push(null);
      }
    },
    getUndoStack() {
      return this.undoStack;
    },
    getRedoStack() {
      return this.redoStack;
    },
    calls,
  };
}

afterEach(() => {
  registerActiveWorkspace(null);
});

describe("workspaceHistory", () => {
  it("undo / redo no-op when no workspace is registered", () => {
    expect(undo()).toBe(false);
    expect(redo()).toBe(false);
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(false);
  });

  it("undo calls workspace.undo(false)", () => {
    const ws = makeFakeWorkspace({ undoLen: 2 });
    registerActiveWorkspace(ws as never);
    expect(undo()).toBe(true);
    expect(ws.calls).toEqual([{ redo: false }]);
    expect(ws.undoStack.length).toBe(1);
    expect(ws.redoStack.length).toBe(1);
  });

  it("redo calls workspace.undo(true)", () => {
    const ws = makeFakeWorkspace({ redoLen: 1 });
    registerActiveWorkspace(ws as never);
    expect(redo()).toBe(true);
    expect(ws.calls).toEqual([{ redo: true }]);
    expect(ws.redoStack.length).toBe(0);
    expect(ws.undoStack.length).toBe(1);
  });

  it("undo returns false when the stack is empty (doesn't call Blockly)", () => {
    const ws = makeFakeWorkspace({ undoLen: 0 });
    registerActiveWorkspace(ws as never);
    expect(undo()).toBe(false);
    expect(ws.calls.length).toBe(0);
  });

  it("redo returns false when the stack is empty", () => {
    const ws = makeFakeWorkspace({ redoLen: 0 });
    registerActiveWorkspace(ws as never);
    expect(redo()).toBe(false);
    expect(ws.calls.length).toBe(0);
  });

  it("canUndo / canRedo reflect the stacks", () => {
    const ws = makeFakeWorkspace({ undoLen: 0, redoLen: 0 });
    registerActiveWorkspace(ws as never);
    expect(canUndo()).toBe(false);
    expect(canRedo()).toBe(false);
    ws.undoStack.push(null, null);
    expect(canUndo()).toBe(true);
    ws.redoStack.push(null);
    expect(canRedo()).toBe(true);
  });

  it("subscribers fire on undo / redo / register", () => {
    const listener = vi.fn();
    const off = subscribe(listener);
    expect(listener).not.toHaveBeenCalled();
    registerActiveWorkspace(makeFakeWorkspace({ undoLen: 1 }) as never);
    expect(listener).toHaveBeenCalledTimes(1);
    undo();
    expect(listener).toHaveBeenCalledTimes(2);
    registerActiveWorkspace(null);
    expect(listener).toHaveBeenCalledTimes(3);
    off();
    registerActiveWorkspace(makeFakeWorkspace() as never);
    // Off; no further calls.
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("a throwing subscriber doesn't break notification of others", () => {
    const a = vi.fn();
    const b = vi.fn(() => {
      throw new Error("subscriber crashed");
    });
    const c = vi.fn();
    subscribe(a);
    subscribe(b);
    subscribe(c);
    registerActiveWorkspace(makeFakeWorkspace() as never);
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
    expect(c).toHaveBeenCalled();
  });
});
