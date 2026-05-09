import type { GraphEdge, GraphNode, NormalizedGraph } from "../types/workspace";
import { BLOCK_REGISTRY } from "./blockRegistry";

/**
 * Inverse map of BLOCK_REGISTRY: kind → block type.
 * Built once at module load.
 */
const KIND_TO_BLOCK_TYPE: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const meta of BLOCK_REGISTRY) {
    map[meta.kind] = meta.type;
  }
  return map;
})();

/**
 * Per-block-type list of field names to emit (in declared order).
 * Field names match what `rustBlockDefinitions.ts` and `blockDefinitions.ts`
 * define. The graph stores props in lowercase; we uppercase to find each field.
 *
 * Block types not in this map fall back to "emit all string/number/bool props
 * with key uppercased" — works for the existing wf_* blocks since their field
 * names already follow that convention.
 */
const BLOCK_FIELDS: Record<string, string[]> = {
  wf_rust_fn: ["VIS", "NAME", "SIGNATURE"],
  wf_rust_struct: ["VIS", "NAME", "FIELDS_TEXT"],
  wf_rust_enum: ["VIS", "NAME", "VARIANTS_TEXT"],
  wf_rust_use: ["VIS", "PATH"],
  wf_rust_const: ["VIS", "NAME", "TY_TEXT", "VALUE_TEXT"],
  wf_rust_static: ["VIS", "MUTABLE", "NAME", "TY_TEXT", "VALUE_TEXT"],
  wf_rust_mod: ["VIS", "NAME", "INLINE", "BODY_TEXT"],
  wf_rust_impl: ["TRAIT_TEXT", "SELF_TY_TEXT", "BODY_TEXT"],
  wf_rust_trait: ["VIS", "NAME", "BODY_TEXT"],
  wf_rust_unknown: ["SOURCE"],
  wf_rust_let: ["PATTERN_TEXT", "VALUE_TEXT"],
  wf_rust_expr_stmt: ["EXPR_TEXT"],
  wf_rust_expr_tail: ["EXPR_TEXT"],
  wf_rust_macro_stmt: ["MACRO_TEXT"]
};

/** Block types that expose a `<statement name="BODY">` input for child edges. */
const STATEMENT_INPUT_NAME: Record<string, string> = {
  wf_rust_fn: "BODY"
};

const ROOT_X_OFFSET = 24;
const ROOT_Y_OFFSET = 24;
const ROOT_Y_GAP = 64;

/**
 * Convert a NormalizedGraph into Blockly workspace XML so it can be loaded
 * into the workspace via `Blockly.Xml.clearWorkspaceAndLoadFromXml`.
 *
 * Edges drive nesting:
 *   - `flow`  → emitted as `<next>` chain
 *   - `child` → emitted as a `<statement name="BODY">` (only for blocks that
 *               declare a BODY input; otherwise treated like a flow chain)
 *   - `data` and `event` are ignored at this stage — Blockly XML cannot model
 *     non-tree graph relationships natively.
 *
 * Nodes whose `kind` has no entry in BLOCK_REGISTRY fall back to a
 * `wf_rust_unknown` placeholder carrying the original kind in `SOURCE`.
 */
export function graphToBlocklyXml(graph: NormalizedGraph): string {
  const nodesById = new Map<string, GraphNode>();
  for (const node of graph.nodes) {
    nodesById.set(node.id, node);
  }

  const flowNext = new Map<string, string>(); // from → to (flow)
  const childFirst = new Map<string, string>(); // from → to (child)
  const incoming = new Set<string>(); // any incoming flow or child edge

  for (const edge of graph.edges) {
    if (edge.edge_type === "flow") {
      // First flow-out edge wins (graph should not have multiple).
      if (!flowNext.has(edge.from)) flowNext.set(edge.from, edge.to);
      incoming.add(edge.to);
    } else if (edge.edge_type === "child") {
      if (!childFirst.has(edge.from)) childFirst.set(edge.from, edge.to);
      incoming.add(edge.to);
    }
  }

  // Roots: nodes with no incoming flow/child edge. Sorted for determinism.
  const roots = graph.nodes
    .filter((n) => !incoming.has(n.id))
    .map((n) => n.id)
    .sort();

  let y = ROOT_Y_OFFSET;
  const rootXml = roots.map((rootId) => {
    const xml = renderBlock(rootId, nodesById, flowNext, childFirst, {
      x: ROOT_X_OFFSET,
      y
    });
    y += ROOT_Y_GAP;
    return xml;
  });

  return `<xml xmlns="https://developers.google.com/blockly/xml">\n${rootXml.join("\n")}\n</xml>`;
}

function renderBlock(
  id: string,
  nodesById: Map<string, GraphNode>,
  flowNext: Map<string, string>,
  childFirst: Map<string, string>,
  position?: { x: number; y: number }
): string {
  const node = nodesById.get(id);
  if (!node) return "";

  const blockType = KIND_TO_BLOCK_TYPE[node.kind] ?? "wf_rust_unknown";
  const fields = renderFields(blockType, node);

  let body = fields;

  // Statement-input children (e.g., wf_rust_fn body)
  const statementName = STATEMENT_INPUT_NAME[blockType];
  const childId = childFirst.get(id);
  if (statementName && childId) {
    body += `<statement name="${statementName}">${renderBlock(
      childId,
      nodesById,
      flowNext,
      childFirst
    )}</statement>`;
  } else if (childId) {
    // Block has a child edge but no statement input registered — chain as flow.
    body += `<next>${renderBlock(childId, nodesById, flowNext, childFirst)}</next>`;
  }

  // Flow next sibling
  const nextId = flowNext.get(id);
  if (nextId) {
    body += `<next>${renderBlock(nextId, nodesById, flowNext, childFirst)}</next>`;
  }

  const positionAttr = position ? ` x="${position.x}" y="${position.y}"` : "";
  return `<block type="${blockType}" id="${escapeAttr(id)}"${positionAttr}>${body}</block>`;
}

function renderFields(blockType: string, node: GraphNode): string {
  const declared = BLOCK_FIELDS[blockType];
  const out: string[] = [];

  if (declared) {
    for (const fieldName of declared) {
      const propKey = fieldName.toLowerCase();
      const value = node.props[propKey];
      if (value === undefined || value === null) continue;
      out.push(`<field name="${fieldName}">${escapeXml(stringifyFieldValue(value))}</field>`);
    }
  } else {
    // Generic fallback: emit every primitive prop with key uppercased.
    for (const [key, value] of Object.entries(node.props)) {
      if (value === undefined || value === null) continue;
      if (
        typeof value !== "string" &&
        typeof value !== "number" &&
        typeof value !== "boolean"
      ) {
        continue;
      }
      out.push(
        `<field name="${key.toUpperCase()}">${escapeXml(stringifyFieldValue(value))}</field>`
      );
    }
  }

  return out.join("");
}

function stringifyFieldValue(value: unknown): string {
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeAttr(s: string): string {
  return escapeXml(s);
}

// Re-export the edge type keys for callers that want to reason about them.
export type SupportedEdgeType = GraphEdge["edge_type"];
