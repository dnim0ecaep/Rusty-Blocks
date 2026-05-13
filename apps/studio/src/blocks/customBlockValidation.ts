/**
 * Pure helpers for the BlockDesignerDialog: slugify a label, build a
 * default block def, and validate a draft def at submit time.
 *
 * Extracted from the React component so the rules can be unit-tested
 * without mounting the dialog.
 */

import {
  CUSTOM_BLOCK_TYPE_PREFIX,
  type CustomBlockDef,
  type CustomBlockField,
} from "./customBlockTypes";
import { MY_BLOCKS_CATEGORY } from "../store/blockOrgStore";

/** Stable label → identifier slug. Empty / non-alphanum input → "block". */
export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "block";
}

/** Type derived from a label, with the standard custom-block prefix. */
export function typeFromLabel(label: string): string {
  return `${CUSTOM_BLOCK_TYPE_PREFIX}${slugify(label)}`;
}

/**
 * The placeholder label shown when the dialog opens for a fresh block.
 * `defaultDef` keeps the label and type consistent — `typeFromLabel` of
 * this string equals the placeholder type — so an unedited submit
 * doesn't produce an inconsistent name/type pair the way the previous
 * hard-coded type ("wf_custom_new_block") + label ("my block") did.
 */
export const DEFAULT_NEW_BLOCK_LABEL = "new block";

export function defaultDef(): CustomBlockDef {
  const now = new Date().toISOString();
  const label = DEFAULT_NEW_BLOCK_LABEL;
  return {
    type: typeFromLabel(label),
    kindKind: "designed",
    label,
    tooltip: "",
    category: MY_BLOCKS_CATEGORY,
    color: "my_blocks",
    fields: [],
    hasPrevious: true,
    hasNext: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function defaultDefFromCode(): CustomBlockDef {
  const base = defaultDef();
  return {
    ...base,
    kindKind: "code_import",
    label: "rust snippet",
    type: typeFromLabel("rust snippet"),
    fields: [
      {
        type: "field_multilinetext",
        name: "SOURCE",
        label: "source",
        defaultValue: "// paste Rust code here",
      },
    ],
  };
}

export interface ValidateOptions {
  /** Existing block types in the system. Used for duplicate checks. */
  existingTypes: ReadonlySet<string>;
  /**
   * True when editing an existing block (the dialog's `initial` prop
   * is set). Skips the placeholder-label check (the user already
   * named this block once) and the type re-derive (the type is locked
   * for stability).
   */
  isEditing: boolean;
}

/**
 * Run every field-level rule on the draft and return either the
 * normalized def to save, or a human-readable error message to show
 * back to the user.
 *
 * Rules:
 *   1. Label is required.
 *   2. For new blocks (not editing), the label must differ from the
 *      placeholder ("new block") — placeholder-named blocks are useless
 *      identifiers that collide on the second creation.
 *   3. Type must start with the custom-block prefix.
 *   4. Type must not already exist.
 *   5. For new blocks, the saved type is re-derived from the current
 *      label as a safety net so a user who pasted a label (skipping
 *      the React onChange that updates the type) still gets a matching
 *      type. Editing keeps the locked type.
 *   6. Each field name must be UPPER_SNAKE_CASE.
 *   7. Each dropdown field must declare at least one option.
 */
export function validateAndNormalize(
  draft: CustomBlockDef,
  opts: ValidateOptions
): { ok: true; def: CustomBlockDef } | { ok: false; error: string } {
  const label = draft.label.trim();
  if (!label) {
    return { ok: false, error: "Label is required." };
  }

  if (
    !opts.isEditing &&
    label.toLowerCase() === DEFAULT_NEW_BLOCK_LABEL
  ) {
    return {
      ok: false,
      error:
        `Give your block a more specific name than "${DEFAULT_NEW_BLOCK_LABEL}" so you can find it later.`,
    };
  }

  let type = draft.type;
  if (!opts.isEditing) {
    // Re-derive type from label so we don't ship a mismatch even if
    // some flow updated the label without going through onChange.
    type = typeFromLabel(label);
  }

  if (!type.startsWith(CUSTOM_BLOCK_TYPE_PREFIX)) {
    return {
      ok: false,
      error: `Block type must start with "${CUSTOM_BLOCK_TYPE_PREFIX}".`,
    };
  }
  if (opts.existingTypes.has(type)) {
    return {
      ok: false,
      error: `A block with type "${type}" already exists. Change the label.`,
    };
  }

  for (const field of draft.fields) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(field.name)) {
      return {
        ok: false,
        error: `Field name "${field.name}" must be UPPERCASE with underscores.`,
      };
    }
    if (
      field.type === "field_dropdown" &&
      (!field.options || field.options.length === 0)
    ) {
      return {
        ok: false,
        error: `Dropdown field "${field.name}" needs at least one option.`,
      };
    }
  }

  const normalized: CustomBlockDef = {
    ...draft,
    label,
    type,
    fields: draft.fields.map((f): CustomBlockField => ({ ...f })),
  };
  return { ok: true, def: normalized };
}
