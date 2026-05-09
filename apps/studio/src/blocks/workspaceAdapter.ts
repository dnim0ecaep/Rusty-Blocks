import * as Blockly from "blockly";

import type { NormalizedGraph, GraphNode, GraphEdge } from "../types/workspace";
import { turboWarpModuleIdFromBlockType } from "./turbowarpModules";
import { getCategoryForBlock, getKindForBlock } from "./blockRegistry";

function resolveCategory(blockType: string): string {
  // Check TurboWarp modules first
  if (turboWarpModuleIdFromBlockType(blockType)) {
    return "turbowarp_module";
  }

  // Use centralized block registry
  return getCategoryForBlock(blockType);
}

function resolveKind(blockType: string): string {
  // Check TurboWarp modules first
  const moduleId = turboWarpModuleIdFromBlockType(blockType);
  if (moduleId) {
    return `turbowarp.module.${moduleId}`;
  }

  // Use centralized block registry
  return getKindForBlock(blockType);
}

export function workspaceToNormalizedGraph(workspace: Blockly.WorkspaceSvg): NormalizedGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const blocks = workspace.getAllBlocks(false);

  for (const block of blocks) {
    const fields: Record<string, unknown> = {};
    for (const input of block.inputList) {
      for (const field of input.fieldRow) {
        if (field.name) {
          fields[field.name.toLowerCase()] = field.getValue();
        }
      }
    }

    nodes.push({
      id: block.id,
      kind: resolveKind(block.type),
      category: resolveCategory(block.type),
      props: fields
    });

    const next = block.getNextBlock();
    if (next) {
      edges.push({
        id: `edge-${block.id}-${next.id}`,
        from: block.id,
        to: next.id,
        edge_type: "flow"
      });
    }
  }

  nodes.sort((a, b) => a.id.localeCompare(b.id));
  edges.sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`));

  return { nodes, edges };
}
