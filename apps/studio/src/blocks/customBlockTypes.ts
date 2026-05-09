/**
 * Data model for user-defined custom blocks and snippets that can be
 * exported and imported as .warpforge-blocks.json modules.
 */

export type CustomFieldType =
  | "field_input"
  | "field_number"
  | "field_checkbox"
  | "field_dropdown"
  | "field_multilinetext";

export interface CustomBlockField {
  /** Field type from Blockly's field library. */
  type: CustomFieldType;
  /** Uppercase identifier (e.g., "NAME"). */
  name: string;
  /** Display label shown to the left of the field. */
  label: string;
  /** Default value (string for text/dropdown, number for number, boolean for checkbox). */
  defaultValue: string | number | boolean;
  /** Dropdown options as [display, value] pairs. Only used for field_dropdown. */
  options?: Array<[string, string]>;
}

export type CustomBlockKindKind = "designed" | "code_import" | "composite";

export interface CustomBlockDef {
  /** Block type identifier — must be unique. Convention: "wf_custom_<slug>". */
  type: string;
  /** What flavour of block this is — affects how the Designer treats it on edit. */
  kindKind: CustomBlockKindKind;
  /** Display label shown in toolbox / inspector summary. */
  label: string;
  /** Tooltip shown on hover in Blockly. */
  tooltip: string;
  /** Toolbox category name (must exist in CATEGORY_DEFS or customCategories). */
  category: string;
  /** Color: either a Blockly style name (e.g., "rust_blocks") or a hex string ("#ce422b"). */
  color: string;
  /** Field list (in order shown). For code_import, this is a single multiline SOURCE field. */
  fields: CustomBlockField[];
  /** Whether the block has prev/next statement connectors (default true). */
  hasPrevious: boolean;
  hasNext: boolean;
  /** ISO timestamp of creation. */
  createdAt: string;
  /** ISO timestamp of last edit. */
  updatedAt: string;
  /**
   * For composite kind only: serialized Blockly XML of the wrapped subgraph.
   * The composite block renders as a single opaque block; the saved subgraph
   * is materialized only when the user invokes "Expand here" on the block.
   */
  subgraphXml?: string;
  /**
   * For composite kind only: count of source blocks in the captured subgraph.
   * Used by the Modules manager UI for a quick sense of size.
   */
  subgraphBlockCount?: number;
}

/** A reusable subgraph saved from the workspace and re-insertable as a unit. */
export interface ModuleSnippet {
  id: string;
  name: string;
  description: string;
  /** Serialized Blockly XML of the saved blocks. */
  xml: string;
  createdAt: string;
}

/** A .warpforge-blocks.json file. */
export interface BlockModule {
  schemaVersion: number;
  name: string;
  description: string;
  blocks: CustomBlockDef[];
  snippets: ModuleSnippet[];
  exportedAt: string;
}

export const BLOCK_MODULE_SCHEMA_VERSION = 1;
export const CUSTOM_BLOCK_TYPE_PREFIX = "wf_custom_";

export function isCustomBlockType(type: string): boolean {
  return type.startsWith(CUSTOM_BLOCK_TYPE_PREFIX);
}

/**
 * Produce a Blockly JSON block definition from a CustomBlockDef so it can be
 * passed to Blockly.common.defineBlocksWithJsonArray.
 *
 * The "color" field can be either a Blockly style name (registered in the
 * theme) or a hex string. We detect hex by leading "#".
 */
export function toBlocklyJson(def: CustomBlockDef): Record<string, unknown> {
  // Composite blocks render as a single opaque labelled block. Their actual
  // contents live in subgraphXml and are materialized only via "Expand here".
  if (def.kindKind === "composite") {
    const json: Record<string, unknown> = {
      type: def.type,
      message0: `📦 ${def.label}`,
      args0: [],
      tooltip: def.tooltip || "Composite module — right-click to expand",
      helpUrl: ""
    };
    if (def.hasPrevious) json.previousStatement = null;
    if (def.hasNext) json.nextStatement = null;
    if (def.color.startsWith("#")) {
      json.colour = def.color;
    } else {
      json.style = def.color;
    }
    return json;
  }

  const messageParts: string[] = [def.label];
  const args0: Array<Record<string, unknown>> = [];

  def.fields.forEach((field, index) => {
    messageParts.push(`${field.label} %${index + 1}`);
    const arg: Record<string, unknown> = {
      type: field.type,
      name: field.name
    };

    if (field.type === "field_dropdown") {
      arg.options = field.options ?? [["option", "option"]];
    } else if (field.type === "field_checkbox") {
      arg.checked = Boolean(field.defaultValue);
    } else if (field.type === "field_number") {
      arg.value =
        typeof field.defaultValue === "number"
          ? field.defaultValue
          : Number(field.defaultValue) || 0;
    } else {
      arg.text = String(field.defaultValue ?? "");
    }

    args0.push(arg);
  });

  const json: Record<string, unknown> = {
    type: def.type,
    message0: messageParts.join(" "),
    args0,
    tooltip: def.tooltip,
    helpUrl: ""
  };

  if (def.hasPrevious) json.previousStatement = null;
  if (def.hasNext) json.nextStatement = null;

  if (def.color.startsWith("#")) {
    json.colour = def.color;
  } else {
    json.style = def.color;
  }

  return json;
}
