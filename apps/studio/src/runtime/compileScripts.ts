/**
 * Pre-compile sprite scripts: walk a Blockly workspace and emit a plain
 * JSON tree the interpreter can step through without Blockly itself.
 *
 * The standalone runtime ships only this JSON form. Blockly is ~2MB and
 * only useful for the live editing experience in the studio; once the
 * project is exported, every `scripts_xml` blob can be turned into a
 * `ScriptNode[]` once and the runtime never sees Blockly again.
 *
 * Both Blockly's `Block` and our `JsonBlock` implement `BlockLike`, so
 * the interpreter signature is reader-agnostic.
 */

import * as Blockly from "blockly";

/** Structural subset of Blockly.Block that the interpreter needs. */
export interface BlockLike {
  /** Block type id, e.g. "scratch_motion_move_steps". */
  readonly type: string;
  /** Stable identifier (debug only). */
  readonly id?: string;
  /** Field value (a literal in a dropdown, text, or number field). */
  getFieldValue(name: string): string | null;
  /** Block plugged into the value/statement input named `name`, or null. */
  getInputTargetBlock(name: string): BlockLike | null;
  /** Next block in the same stack (for statement chains), or null. */
  getNextBlock(): BlockLike | null;
}

/** JSON serialization of a single block. The tree is the script. */
export interface ScriptNode {
  type: string;
  /** May be omitted when empty for compactness. */
  fields?: Record<string, string>;
  /** Value/statement inputs (e.g. "DO" of a forever block). */
  inputs?: Record<string, ScriptNode>;
  /** Next-stack block. */
  next?: ScriptNode;
  /** Optional id, preserved for debugging. */
  id?: string;
}

/**
 * Read-only BlockLike adapter over a `ScriptNode` tree. Cheap to allocate
 * — just wraps the underlying node + a parent reference for `getNextBlock`.
 */
export class JsonBlock implements BlockLike {
  constructor(private readonly node: ScriptNode) {}

  get type(): string {
    return this.node.type;
  }

  get id(): string | undefined {
    return this.node.id;
  }

  getFieldValue(name: string): string | null {
    return this.node.fields?.[name] ?? null;
  }

  getInputTargetBlock(name: string): BlockLike | null {
    const child = this.node.inputs?.[name];
    return child ? new JsonBlock(child) : null;
  }

  getNextBlock(): BlockLike | null {
    return this.node.next ? new JsonBlock(this.node.next) : null;
  }
}

/**
 * Walk one Blockly block (and its `next`-chain + nested inputs) into the
 * JSON form. Returns null for `null` input so callers can pipe a
 * potentially-empty target block straight in.
 */
export function blockToScriptNode(block: Blockly.Block | null): ScriptNode | null {
  if (!block) return null;
  const node: ScriptNode = { type: block.type };
  if (block.id) node.id = block.id;

  // Fields: include every named field. Blockly returns the field value as
  // a string for text/dropdown/number/colour fields.
  const fields: Record<string, string> = {};
  for (const input of block.inputList) {
    for (const fieldRow of input.fieldRow) {
      const name = fieldRow.name;
      if (!name) continue;
      const v = fieldRow.getValue?.();
      if (v == null) continue;
      fields[name] = String(v);
    }
  }
  if (Object.keys(fields).length > 0) node.fields = fields;

  // Inputs: walk every value/statement input that has a connected target.
  const inputs: Record<string, ScriptNode> = {};
  for (const input of block.inputList) {
    if (!input.connection) continue;
    const target = input.connection.targetBlock();
    if (!target) continue;
    const child = blockToScriptNode(target);
    if (child) inputs[input.name] = child;
  }
  if (Object.keys(inputs).length > 0) node.inputs = inputs;

  const next = blockToScriptNode(block.getNextBlock());
  if (next) node.next = next;

  return node;
}

/**
 * Compile every top-level block in a Blockly workspace to a `ScriptNode[]`.
 * Reporter-shaped blocks (those with an `outputConnection`) at the top
 * level are skipped — they aren't scripts, they're stray reporters.
 */
export function compileWorkspaceToNodes(workspace: Blockly.Workspace): ScriptNode[] {
  const tops = workspace.getTopBlocks(true) as Blockly.Block[];
  const out: ScriptNode[] = [];
  for (const top of tops) {
    if (top.outputConnection) continue;
    const node = blockToScriptNode(top);
    if (node) out.push(node);
  }
  return out;
}

/**
 * Wrap a list of compiled `ScriptNode`s as `BlockLike`s — the input the
 * scheduler's `findHats` / `runHat` helpers expect.
 */
export function nodesToBlocks(nodes: ScriptNode[]): BlockLike[] {
  return nodes.map((n) => new JsonBlock(n));
}
