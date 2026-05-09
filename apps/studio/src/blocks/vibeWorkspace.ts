import type * as Blockly from "blockly";

let activeWorkspace: Blockly.WorkspaceSvg | null = null;

export function setVibeWorkspace(ws: Blockly.WorkspaceSvg | null): void {
  activeWorkspace = ws;
}

export function getVibeWorkspace(): Blockly.WorkspaceSvg | null {
  return activeWorkspace;
}
