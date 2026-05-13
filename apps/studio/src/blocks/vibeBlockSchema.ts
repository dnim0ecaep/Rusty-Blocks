/**
 * Per-block-type field schema for the Vibe validator.
 *
 * Source of truth for "what fields does block X need, and what values
 * count as valid?". Mirrors the prose `BLOCK_REFERENCE` in
 * `VibeDialog.tsx` but in a form the validator can mechanically check.
 *
 * Why this lives here, not in `blockDefinitions.ts`: the Blockly block
 * defs declare *display* rules (field types, dropdowns, message strings)
 * but don't tell the runtime which fields are *required* or which values
 * are semantically valid. The Vibe validator needs the latter.
 *
 * Adding a new block: add an entry. Updating a field: edit the entry.
 * The validator reports "schema unknown" for blocks the AI emits that
 * aren't in this map — that path is already covered by
 * `findUnknownBlockTypes`, so a missing schema only suppresses
 * field-level checks, not the unknown-block error.
 */

export type FieldRule =
  | {
      kind: "string";
      required: boolean;
      /** Reject empty/whitespace-only values when required. */
      nonEmpty?: boolean;
      /** Optional regex the value must match — describe pattern in message. */
      pattern?: { regex: RegExp; description: string };
    }
  | {
      kind: "number";
      required: boolean;
      min?: number;
      max?: number;
      /** Allow integer-only (e.g. ROWS, TIMES, INTERVAL_MS). */
      integer?: boolean;
    }
  | {
      kind: "enum";
      required: boolean;
      values: readonly string[];
      /** Compare case-insensitive (matches `wf_ui_checkbox.CHECKED` accepting `true`/`TRUE`). */
      caseInsensitive?: boolean;
    }
  | {
      kind: "boolean";
      required: boolean;
    };

export interface BlockSchema {
  fields: Record<string, FieldRule>;
}

const route: FieldRule = {
  kind: "string",
  required: true,
  nonEmpty: true,
  pattern: {
    regex: /^\/[A-Za-z0-9/_\-:.]*$/,
    description: 'must start with "/" and use only letters/digits/-_/:.',
  },
};

const ident: FieldRule = {
  kind: "string",
  required: true,
  nonEmpty: true,
  pattern: {
    regex: /^[A-Za-z_][A-Za-z0-9_]*$/,
    description: "must be a valid identifier (letters, digits, underscore; not starting with a digit)",
  },
};

export const VIBE_BLOCK_SCHEMA: Record<string, BlockSchema> = {
  // ── PROJECT ──────────────────────────────────────────────────────────
  wf_project_meta: {
    fields: {
      APP_NAME: { kind: "string", required: true, nonEmpty: true },
      PACKAGE_ID: {
        kind: "string",
        required: true,
        nonEmpty: true,
        pattern: {
          regex: /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/,
          description: 'reverse-DNS form, e.g. "com.example.myapp"',
        },
      },
      VERSION: {
        kind: "string",
        required: true,
        nonEmpty: true,
        pattern: {
          regex: /^\d+\.\d+(\.\d+)?$/,
          description: 'semver form, e.g. "0.1.0"',
        },
      },
    },
  },
  wf_project_theme: {
    fields: {
      THEME: { kind: "enum", required: true, values: ["auto", "light", "dark", "custom"] },
    },
  },

  // ── STRUCTURE ────────────────────────────────────────────────────────
  wf_window: {
    fields: {
      TITLE: { kind: "string", required: true, nonEmpty: true },
      WIDTH: { kind: "number", required: true, integer: true, min: 100, max: 4000 },
      HEIGHT: { kind: "number", required: true, integer: true, min: 100, max: 4000 },
    },
  },
  wf_screen: {
    fields: {
      NAME: { ...ident },
      ROUTE: route,
    },
  },
  wf_route: {
    fields: { ROUTE: route },
  },
  wf_component: {
    fields: {
      ID: ident,
      KIND: {
        kind: "enum",
        required: true,
        values: ["ui.button", "ui.text", "ui.input", "ui.list", "ui.table"],
      },
    },
  },

  // ── UI ───────────────────────────────────────────────────────────────
  wf_ui_button: { fields: { LABEL: { kind: "string", required: true, nonEmpty: true } } },
  wf_ui_text: { fields: { TEXT: { kind: "string", required: true, nonEmpty: true } } },
  wf_ui_input: { fields: { PLACEHOLDER: { kind: "string", required: true, nonEmpty: true } } },
  wf_ui_textarea: {
    fields: {
      PLACEHOLDER: { kind: "string", required: true, nonEmpty: true },
      ROWS: { kind: "number", required: true, integer: true, min: 1, max: 100 },
    },
  },
  wf_ui_select: {
    fields: {
      OPTIONS: {
        kind: "string",
        required: true,
        nonEmpty: true,
        pattern: {
          regex: /^[^,]+(,[^,]+)*$/,
          description: "comma-separated, at least one option",
        },
      },
    },
  },
  wf_ui_checkbox: {
    fields: {
      LABEL: { kind: "string", required: true, nonEmpty: true },
      CHECKED: { kind: "enum", required: true, values: ["TRUE", "FALSE"], caseInsensitive: true },
    },
  },
  wf_ui_toggle: { fields: { LABEL: { kind: "string", required: true, nonEmpty: true } } },
  wf_ui_icon: {
    fields: {
      NAME: { kind: "string", required: true, nonEmpty: true },
      SIZE: { kind: "number", required: true, integer: true, min: 8, max: 256 },
    },
  },
  wf_ui_card: { fields: { TITLE: { kind: "string", required: true, nonEmpty: true } } },
  wf_ui_list: { fields: { COLLECTION: ident } },
  wf_ui_table: { fields: { COLLECTION: ident } },
  wf_ui_tabs: { fields: { TABS: { kind: "string", required: true, nonEmpty: true } } },
  wf_ui_sidebar: { fields: { ITEMS: { kind: "string", required: true, nonEmpty: true } } },
  wf_ui_header: { fields: { TITLE: { kind: "string", required: true, nonEmpty: true } } },
  wf_ui_footer: { fields: { TEXT: { kind: "string", required: true, nonEmpty: true } } },
  wf_ui_modal: { fields: { TITLE: { kind: "string", required: true, nonEmpty: true } } },

  // ── LOGIC ────────────────────────────────────────────────────────────
  wf_if_else: { fields: {} },
  wf_match: { fields: {} },
  wf_repeat: {
    fields: { TIMES: { kind: "number", required: true, integer: true, min: 0, max: 10000 } },
  },
  wf_for_each: { fields: { COLLECTION: ident } },
  wf_while: { fields: {} },
  wf_boolean_ops: {
    fields: { OP: { kind: "enum", required: true, values: ["AND", "OR", "NOT"] } },
  },
  wf_string_ops: {
    fields: {
      OP: {
        kind: "enum",
        required: true,
        values: ["concat", "trim", "upper", "lower", "contains", "replace"],
      },
    },
  },

  // ── STATE ────────────────────────────────────────────────────────────
  wf_define_variable: {
    fields: {
      NAME: ident,
      TYPE: {
        kind: "enum",
        required: true,
        values: ["string", "number", "bool", "list", "map"],
      },
      VALUE: { kind: "string", required: true },
    },
  },
  wf_set_variable: {
    fields: {
      NAME: ident,
      VALUE: { kind: "string", required: true },
    },
  },
  wf_define_collection: {
    fields: {
      NAME: ident,
      ITEM_TYPE: { kind: "enum", required: true, values: ["string", "number", "object"] },
    },
  },
  wf_add_item: {
    fields: {
      COLLECTION: ident,
      VALUE: { kind: "string", required: true },
    },
  },
  wf_define_object: {
    fields: {
      NAME: ident,
      FIELDS: { kind: "string", required: true, nonEmpty: true },
    },
  },
  wf_define_enum: {
    fields: {
      NAME: ident,
      VARIANTS: { kind: "string", required: true, nonEmpty: true },
    },
  },
  wf_optional_value: {
    fields: { TYPE: { kind: "string", required: true, nonEmpty: true } },
  },
  wf_result_value: {
    fields: {
      OK_TYPE: { kind: "string", required: true, nonEmpty: true },
      ERR_TYPE: { kind: "string", required: true, nonEmpty: true },
    },
  },

  // ── EVENTS ───────────────────────────────────────────────────────────
  wf_on_app_start: { fields: {} },
  wf_on_click: { fields: { TARGET: ident } },
  wf_on_change: { fields: { TARGET: ident } },
  wf_on_submit: { fields: { FORM: ident } },
  wf_on_timer: {
    fields: { INTERVAL_MS: { kind: "number", required: true, integer: true, min: 1, max: 86_400_000 } },
  },
  wf_on_navigation: { fields: { ROUTE: route } },
  wf_on_event_received: { fields: { EVENT: ident } },
  wf_emit_event: { fields: { EVENT: ident } },

  // ── IO ───────────────────────────────────────────────────────────────
  wf_read_file: { fields: { PATH: { kind: "string", required: true, nonEmpty: true } } },
  wf_write_file: {
    fields: {
      PATH: { kind: "string", required: true, nonEmpty: true },
      CONTENT: { kind: "string", required: true },
    },
  },
  wf_save_local: {
    fields: {
      KEY: { kind: "string", required: true, nonEmpty: true },
      VALUE: { kind: "string", required: true },
    },
  },
  wf_load_local: { fields: { KEY: { kind: "string", required: true, nonEmpty: true } } },
  wf_parse_json: { fields: { INPUT: { kind: "string", required: true, nonEmpty: true } } },
  wf_serialize_json: { fields: { INPUT: { kind: "string", required: true, nonEmpty: true } } },

  // ── NETWORK ──────────────────────────────────────────────────────────
  wf_get_request: {
    fields: {
      URL: {
        kind: "string",
        required: true,
        nonEmpty: true,
        pattern: {
          regex: /^https?:\/\//,
          description: 'must start with "http://" or "https://"',
        },
      },
    },
  },
  wf_post_request: {
    fields: {
      URL: {
        kind: "string",
        required: true,
        nonEmpty: true,
        pattern: {
          regex: /^https?:\/\//,
          description: 'must start with "http://" or "https://"',
        },
      },
      BODY: { kind: "string", required: true },
    },
  },
  wf_network_error_handler: { fields: {} },
  wf_network_timeout: {
    fields: { MS: { kind: "number", required: true, integer: true, min: 1, max: 600_000 } },
  },
  wf_network_retry: {
    fields: { ATTEMPTS: { kind: "number", required: true, integer: true, min: 0, max: 20 } },
  },

  // ── AI ───────────────────────────────────────────────────────────────
  wf_ai_generate_image: { fields: { PROMPT: { kind: "string", required: true, nonEmpty: true } } },
  wf_ai_generate_icon: {
    fields: {
      DESCRIPTION: { kind: "string", required: true, nonEmpty: true },
      STYLE: { kind: "enum", required: true, values: ["flat", "outline", "filled"] },
    },
  },
  wf_ai_rewrite_text: { fields: { TEXT: { kind: "string", required: true, nonEmpty: true } } },
  wf_ai_generate_onboarding: {
    fields: { STEPS: { kind: "number", required: true, integer: true, min: 1, max: 50 } },
  },
  wf_ai_suggest_layout: { fields: { SCREEN: ident } },
  wf_ai_recommend_settings: { fields: { FEATURE: { kind: "string", required: true, nonEmpty: true } } },
  wf_ai_summarize_text: { fields: { TEXT: { kind: "string", required: true, nonEmpty: true } } },
  wf_ai_create_mock_data: {
    fields: {
      TYPE: { kind: "string", required: true, nonEmpty: true },
      COUNT: { kind: "number", required: true, integer: true, min: 1, max: 10_000 },
    },
  },
  wf_ai_explain_selection: { fields: {} },
  wf_ai_improve_prompt: { fields: { PROMPT: { kind: "string", required: true, nonEmpty: true } } },

  // ── EXPORT ───────────────────────────────────────────────────────────
  wf_validate: { fields: {} },
  wf_generate_source: { fields: { OUTPUT_DIR: { kind: "string", required: true, nonEmpty: true } } },
  wf_export_bundle: { fields: { OUTPUT_DIR: { kind: "string", required: true, nonEmpty: true } } },
};

/**
 * Render the schema into a structured per-block field reference suitable
 * for inlining into the AI system prompt. The current `BLOCK_REFERENCE`
 * is freeform prose; this is the same data formatted as a strict spec
 * the AI can follow without inferring constraints.
 */
export function schemaPromptReference(): string {
  const lines: string[] = [];
  lines.push("Field rules (use exactly these field names, types, and value constraints):");
  for (const [type, schema] of Object.entries(VIBE_BLOCK_SCHEMA)) {
    const fieldNames = Object.keys(schema.fields);
    if (fieldNames.length === 0) {
      lines.push(`- ${type}: (no fields)`);
      continue;
    }
    const parts = fieldNames.map((name) => {
      const rule = schema.fields[name]!;
      switch (rule.kind) {
        case "string":
          return `${name}=string${rule.nonEmpty ? "(non-empty)" : ""}${
            rule.pattern ? ` [${rule.pattern.description}]` : ""
          }`;
        case "number": {
          const range =
            rule.min !== undefined || rule.max !== undefined
              ? `[${rule.min ?? "−∞"}..${rule.max ?? "+∞"}]`
              : "";
          return `${name}=${rule.integer ? "int" : "number"}${range}`;
        }
        case "enum":
          return `${name}=${rule.values.join("|")}`;
        case "boolean":
          return `${name}=bool`;
      }
    });
    lines.push(`- ${type}: ${parts.join(", ")}`);
  }
  return lines.join("\n");
}
