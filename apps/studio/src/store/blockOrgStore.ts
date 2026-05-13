import { create } from "zustand";
import { persist } from "zustand/middleware";

import { TURBOWARP_MODULES, turboWarpModuleBlockType } from "../blocks/turbowarpModules";
import { SCRATCH_PRIMITIVES } from "../blocks/scratchPrimitiveBlocks";

/** Built-in category display name → Blockly categorystyle */
export const CATEGORY_DEFS: { name: string; style: string }[] = [
  { name: "Project", style: "project_blocks" },
  { name: "Structure", style: "structure_blocks" },
  { name: "UI", style: "ui_blocks" },
  { name: "Logic", style: "logic_blocks" },
  { name: "State/Data", style: "state_blocks" },
  { name: "Events", style: "events_blocks" },
  { name: "IO / Storage", style: "io_blocks" },
  { name: "Network", style: "network_blocks" },
  { name: "AI", style: "ai_blocks" },
  { name: "Export", style: "export_blocks" },
  { name: "TurboWarp Modules", style: "tw_modules_blocks" },
  { name: "Motion", style: "motion_blocks" },
  { name: "Looks", style: "looks_blocks" },
  { name: "Sound", style: "sound_blocks" },
  { name: "Control", style: "control_blocks" },
  { name: "Sensing", style: "sensing_blocks" },
  { name: "Operators", style: "operators_blocks" },
  { name: "Variables", style: "variables_blocks" },
  { name: "Rust", style: "rust_blocks" },
  { name: "My Blocks", style: "my_blocks" },
];

/** Default category for blocks the user creates (Designer, save-as-composite, promote-snippet). */
export const MY_BLOCKS_CATEGORY = "My Blocks";

export const BUILTIN_CATEGORY_NAMES = CATEGORY_DEFS.map((c) => c.name);

/** Cycling palette of hex colours for user-created categories */
export const CUSTOM_CATEGORY_COLORS = [
  "#e91e63", "#9c27b0", "#3f51b5", "#009688",
  "#ff5722", "#795548", "#607d8b", "#f44336",
  "#00bcd4", "#8bc34a",
];

/** Human-readable label for built-in Blockly blocks not in blockRegistry. Covers Blockly's standard library: control, logic, math, text, lists, variables, procedures. */
export const BUILTIN_BLOCK_LABELS: Record<string, string> = {
  // Control / loops
  controls_if: "If",
  controls_repeat_ext: "Repeat N times",
  controls_whileUntil: "While / Until",
  controls_for: "For (count)",
  controls_forEach: "For each",
  controls_flow_statements: "Break / Continue",
  // Logic
  logic_compare: "Compare",
  logic_operation: "And / Or",
  logic_negate: "Not",
  logic_boolean: "True / False",
  logic_null: "Null",
  logic_ternary: "Ternary (if-then-else value)",
  // Math
  math_number: "Number",
  math_arithmetic: "Arithmetic",
  math_single: "Math single (sqrt, abs, …)",
  math_trig: "Trigonometry",
  math_constant: "Constant (π, e, …)",
  math_number_property: "Number property (even, odd, prime…)",
  math_round: "Round",
  math_modulo: "Modulo",
  math_constrain: "Constrain",
  math_random_int: "Random integer",
  math_random_float: "Random fraction",
  math_on_list: "Math on list",
  math_change: "Change variable by",
  // Text
  text: "Text literal",
  text_join: "Join text",
  text_append: "Append to text",
  text_length: "Length of text",
  text_isEmpty: "Text is empty",
  text_indexOf: "Index of",
  text_charAt: "Character at",
  text_getSubstring: "Substring",
  text_changeCase: "Change case",
  text_trim: "Trim text",
  text_print: "Print",
  text_prompt_ext: "Ask for input",
  // Lists
  lists_create_with: "Create list with",
  lists_repeat: "Create list of N copies",
  lists_length: "List length",
  lists_isEmpty: "List is empty",
  lists_indexOf: "List index of",
  lists_getIndex: "Get from list",
  lists_setIndex: "Set in list",
  lists_getSublist: "Sublist",
  lists_split: "Split text into list",
  lists_sort: "Sort list",
  // Variables
  variables_get: "Get variable",
  variables_set: "Set variable",
  // Procedures
  procedures_defnoreturn: "Define procedure",
  procedures_defreturn: "Define procedure (with return)",
  procedures_callnoreturn: "Call procedure",
  procedures_callreturn: "Call procedure (with return)",
  procedures_ifreturn: "If-return",
};

const DEFAULT_ASSIGNMENTS: Record<string, string> = {
  wf_project_meta: "Project",
  wf_project_theme: "Project",
  wf_window: "Structure",
  wf_screen: "Structure",
  wf_route: "Structure",
  wf_component: "Structure",
  wf_ui_button: "UI",
  wf_ui_text: "UI",
  wf_ui_input: "UI",
  wf_ui_textarea: "UI",
  wf_ui_select: "UI",
  wf_ui_checkbox: "UI",
  wf_ui_toggle: "UI",
  wf_ui_icon: "UI",
  wf_ui_card: "UI",
  wf_ui_list: "UI",
  wf_ui_table: "UI",
  wf_ui_tabs: "UI",
  wf_ui_sidebar: "UI",
  wf_ui_header: "UI",
  wf_ui_footer: "UI",
  wf_ui_modal: "UI",
  wf_if_else: "Logic",
  wf_match: "Logic",
  wf_repeat: "Logic",
  wf_for_each: "Logic",
  wf_while: "Logic",
  wf_boolean_ops: "Logic",
  wf_string_ops: "Logic",
  wf_define_variable: "State/Data",
  wf_set_variable: "State/Data",
  wf_define_collection: "State/Data",
  wf_add_item: "State/Data",
  wf_define_object: "State/Data",
  wf_define_enum: "State/Data",
  wf_optional_value: "State/Data",
  wf_result_value: "State/Data",
  wf_on_app_start: "Events",
  wf_on_click: "Events",
  wf_on_change: "Events",
  wf_on_submit: "Events",
  wf_on_timer: "Events",
  wf_on_navigation: "Events",
  wf_on_event_received: "Events",
  wf_emit_event: "Events",
  wf_read_file: "IO / Storage",
  wf_write_file: "IO / Storage",
  wf_save_local: "IO / Storage",
  wf_load_local: "IO / Storage",
  wf_parse_json: "IO / Storage",
  wf_serialize_json: "IO / Storage",
  wf_get_request: "Network",
  wf_post_request: "Network",
  wf_network_error_handler: "Network",
  wf_network_timeout: "Network",
  wf_network_retry: "Network",
  wf_ai_generate_image: "AI",
  wf_ai_generate_icon: "AI",
  wf_ai_rewrite_text: "AI",
  wf_ai_generate_onboarding: "AI",
  wf_ai_suggest_layout: "AI",
  wf_ai_recommend_settings: "AI",
  wf_ai_summarize_text: "AI",
  wf_ai_create_mock_data: "AI",
  wf_ai_explain_selection: "AI",
  wf_ai_improve_prompt: "AI",
  wf_validate: "Export",
  wf_generate_source: "Export",
  wf_export_bundle: "Export",
  wf_rust_fn: "Rust",
  wf_rust_struct: "Rust",
  wf_rust_enum: "Rust",
  wf_rust_use: "Rust",
  wf_rust_const: "Rust",
  wf_rust_static: "Rust",
  wf_rust_mod: "Rust",
  wf_rust_impl: "Rust",
  wf_rust_trait: "Rust",
  wf_rust_unknown: "Rust",
  wf_rust_let: "Rust",
  wf_rust_expr_stmt: "Rust",
  wf_rust_expr_tail: "Rust",
  wf_rust_macro_stmt: "Rust",
};

// Seed TurboWarp module assignments dynamically so the toolbox + organizer
// see them as first-class entries. Each module is bucketed into one of the
// eight Scratch-style categories (Motion, Looks, Sound, Events, Control,
// Sensing, Operators, Variables); users can move them via the organizer.
const TURBOWARP_MODULE_CATEGORIES: Record<string, string> = {
  // Motion
  stretch: "Motion",
  more_motion: "Motion",
  tween: "Motion",
  box2d_physics: "Motion",
  // Looks
  animated_text: "Looks",
  skins: "Looks",
  looks_plus: "Looks",
  pen_plus_v7: "Looks",
  pen_plus_v5_old: "Looks",
  simple_3d: "Looks",
  clipping_and_blending: "Looks",
  canvas_effects: "Looks",
  rgb_channels: "Looks",
  custom_styles: "Looks",
  color_picker: "Looks",
  mouse_cursor: "Looks",
  window_controls: "Looks",
  browser_fullscreen: "Looks",
  screen_resolution: "Looks",
  font_manager: "Looks",
  camera_v1: "Looks",
  camera_v2: "Looks",
  images: "Looks",
  graphics_2d: "Looks",
  video: "Looks",
  iframe: "Looks",
  augmented_reality: "Looks",
  // Sound
  sound_expanded: "Sound",
  url_playback: "Sound",
  vibration: "Sound",
  // Events
  more_events: "Events",
  turbohook: "Events",
  notifications: "Events",
  ask_before_closing_tab: "Events",
  ping_cloud_data: "Events",
  // Control
  clones_plus: "Control",
  control_controls: "Control",
  runtime_options: "Control",
  wake_lock: "Control",
  pointerlock: "Control",
  shovelutils: "Control",
  // Sensing
  face_sensing: "Sensing",
  sensing_plus: "Sensing",
  gamepad: "Sensing",
  navigator: "Sensing",
  battery: "Sensing",
  mobile_keyboard: "Sensing",
  key_simulation: "Sensing",
  delta_time: "Sensing",
  more_timers: "Sensing",
  time: "Sensing",
  search_params: "Sensing",
  clipboard: "Sensing",
  nfcwarp: "Sensing",
  fetch: "Sensing",
  http: "Sensing",
  websocket: "Sensing",
  network: "Sensing",
  cloudlink_v4: "Sensing",
  steamworks: "Sensing",
  itch_io: "Sensing",
  game_jolt: "Sensing",
  newgrounds: "Sensing",
  // Operators
  math: "Operators",
  regexp: "Operators",
  format_numbers: "Operators",
  bitwise: "Operators",
  bigint: "Operators",
  cast: "Operators",
  encoding: "Operators",
  html_encode: "Operators",
  numerical_encoding_v1: "Operators",
  numerical_encoding_v2: "Operators",
  more_comparisons: "Operators",
  base: "Operators",
  text: "Operators",
  json: "Operators",
  xml: "Operators",
  lz_compress: "Operators",
  zip: "Operators",
  // Variables
  temporary_variables: "Variables",
  variable_and_list: "Variables",
  dictionaries: "Variables",
  list_tools: "Variables",
  local_storage: "Variables",
  files: "Variables",
  rxfs: "Variables",
  asset_manager: "Variables",
  s_grab: "Variables",
  data_analysis: "Variables",
  lily_s_toolbox: "Variables",
  rixxyx: "Variables",
  utilities: "Variables",
  mcutils: "Variables",
  all_menus: "Variables",
  hidden_block_collection: "Variables",
  consoles: "Variables",
  couplers: "Variables",
  comment_blocks: "Variables",
  longman_dictionary: "Variables",
};

for (const m of TURBOWARP_MODULES) {
  DEFAULT_ASSIGNMENTS[turboWarpModuleBlockType(m.id)] =
    TURBOWARP_MODULE_CATEGORIES[m.id] ?? "TurboWarp Modules";
}

// Seed Blockly's standard built-in blocks into the eight Scratch-style
// categories. These are the blocks that ship with Blockly itself (control
// flow, logic, math, text, lists, variables, procedures). They become
// visible in the toolbox and Block Organizer alongside everything else.
const BLOCKLY_BUILTIN_CATEGORIES: Record<string, string> = {
  // Control
  controls_if: "Control",
  controls_repeat_ext: "Control",
  controls_whileUntil: "Control",
  controls_for: "Control",
  controls_forEach: "Control",
  controls_flow_statements: "Control",
  // Operators (logic + math + immutable text/string ops)
  logic_compare: "Operators",
  logic_operation: "Operators",
  logic_negate: "Operators",
  logic_boolean: "Operators",
  logic_null: "Operators",
  logic_ternary: "Operators",
  math_number: "Operators",
  math_arithmetic: "Operators",
  math_single: "Operators",
  math_trig: "Operators",
  math_constant: "Operators",
  math_number_property: "Operators",
  math_round: "Operators",
  math_modulo: "Operators",
  math_constrain: "Operators",
  math_random_int: "Operators",
  math_random_float: "Operators",
  math_on_list: "Operators",
  text: "Operators",
  text_join: "Operators",
  text_length: "Operators",
  text_isEmpty: "Operators",
  text_indexOf: "Operators",
  text_charAt: "Operators",
  text_getSubstring: "Operators",
  text_changeCase: "Operators",
  text_trim: "Operators",
  // Looks (output)
  text_print: "Looks",
  // Sensing (input)
  text_prompt_ext: "Sensing",
  // Variables (variable bindings, lists, procedures, mutating text)
  variables_get: "Variables",
  variables_set: "Variables",
  math_change: "Variables",
  text_append: "Variables",
  lists_create_with: "Variables",
  lists_repeat: "Variables",
  lists_length: "Variables",
  lists_isEmpty: "Variables",
  lists_indexOf: "Variables",
  lists_getIndex: "Variables",
  lists_setIndex: "Variables",
  lists_getSublist: "Variables",
  lists_split: "Variables",
  lists_sort: "Variables",
  procedures_defnoreturn: "Variables",
  procedures_defreturn: "Variables",
  procedures_callnoreturn: "Variables",
  procedures_callreturn: "Variables",
  procedures_ifreturn: "Variables",
};

for (const [type, category] of Object.entries(BLOCKLY_BUILTIN_CATEGORIES)) {
  DEFAULT_ASSIGNMENTS[type] = category;
}

// Seed Scratch primitive blocks (move N steps, when ⚑ clicked, say Hello!,
// etc.) into their declared Scratch categories.
for (const p of SCRATCH_PRIMITIVES) {
  DEFAULT_ASSIGNMENTS[p.type] = p.category;
}

export interface CustomCategory {
  name: string;
  color: string;
}

export const LAYOUT_PRESET_SCHEMA_VERSION = 1;

/** Snapshot of an organization layout that can be saved and restored. */
export interface LayoutPreset {
  schemaVersion: number;
  name: string;
  assignments: Record<string, string>;
  customCategories: CustomCategory[];
  /** canonical category name → user-chosen display name */
  categoryRenames?: Record<string, string>;
  /** Canonical category names in the user's preferred display order. Names not in this list are appended in their natural order. */
  categoryOrder?: string[];
  /** canonical category name → user-chosen hex color (#rrggbb). Recolors every block currently assigned to that category. */
  categoryColors?: Record<string, string>;
  savedAt: string;
}

/** Resolve a canonical category name to the user's chosen display name (or the canonical if unrenamed). */
export function displayCategoryName(
  canonical: string,
  renames: Record<string, string>
): string {
  const renamed = renames[canonical];
  return renamed && renamed.trim().length > 0 ? renamed : canonical;
}

/**
 * Apply the user's saved order to a list of canonical category names.
 *
 * - Names appearing in `order` come first, in that order (entries not in
 *   `naturalNames` are dropped, so a deleted category is forgotten).
 * - Any remaining `naturalNames` (newly-added categories the user hasn't
 *   sorted yet) are appended in their original order.
 */
export function orderCategoryNames(naturalNames: string[], order: string[]): string[] {
  const present = new Set(naturalNames);
  const result: string[] = [];
  const seen = new Set<string>();
  for (const name of order) {
    if (present.has(name) && !seen.has(name)) {
      result.push(name);
      seen.add(name);
    }
  }
  for (const name of naturalNames) {
    if (!seen.has(name)) {
      result.push(name);
      seen.add(name);
    }
  }
  return result;
}

interface BlockOrgStore {
  assignments: Record<string, string>;
  customCategories: CustomCategory[];
  /** canonical category name → user display name. Built-ins and customs are both keyed by their canonical name (the value used in `assignments`). */
  categoryRenames: Record<string, string>;
  /** Canonical category names in display order. Categories not present here render after, in natural order. */
  categoryOrder: string[];
  /** canonical category name → user-chosen hex color. Affects every block currently assigned to that category. */
  categoryColors: Record<string, string>;
  presets: Record<string, LayoutPreset>;
  moveBlock(blockType: string, toCategory: string): void;
  addCategory(name: string): void;
  removeCategory(name: string): void;
  /** Rename a category (built-in or custom). `canonical` is the key used in `assignments`. Pass `newName` equal to canonical (or empty) to clear an existing rename. Returns null on success, or an error message string. */
  renameCategory(canonical: string, newName: string): string | null;
  /** Replace the order list outright. Names not present in the current natural list are dropped on next render. */
  setCategoryOrder(order: string[]): void;
  /** Move a category one step earlier in display order. No-op if already first. */
  moveCategoryUp(canonical: string): void;
  /** Move a category one step later in display order. No-op if already last. */
  moveCategoryDown(canonical: string): void;
  /** Move a category to an absolute zero-based index in the display order. The index is clamped to a valid range; non-existent categories are ignored. */
  setCategoryIndex(canonical: string, index: number): void;
  /** Set or clear the hex color override for a category. Pass `null` to remove the override and restore the category's blocks to their original colors. */
  setCategoryColor(canonical: string, hex: string | null): void;
  resetToDefaults(): void;

  /** Capture the current assignments + customCategories under `name`. Overwrites if the name already exists. */
  savePreset(name: string): LayoutPreset;
  /** Apply a saved preset to the live state. */
  loadPreset(name: string): void;
  /** Remove a preset by name. */
  deletePreset(name: string): void;
  /** Get a preset by name (or undefined). */
  getPreset(name: string): LayoutPreset | undefined;
  /** Return all preset names sorted alphabetically. */
  listPresets(): string[];
  /** Build a serializable form of a preset for export. Returns null if name not found. */
  exportPreset(name: string): LayoutPreset | null;
  /** Import a serialized preset. Overwrites if same name exists. Returns the imported preset. */
  importPreset(payload: LayoutPreset): LayoutPreset;
}

export const useBlockOrgStore = create<BlockOrgStore>()(
  persist(
    (set, get) => ({
      assignments: { ...DEFAULT_ASSIGNMENTS },
      customCategories: [],
      categoryRenames: {},
      categoryOrder: [],
      categoryColors: {},
      presets: {},

      moveBlock(blockType, toCategory) {
        set((state) => ({
          assignments: { ...state.assignments, [blockType]: toCategory },
        }));
      },

      addCategory(name) {
        const trimmed = name.trim();
        if (!trimmed) return;
        const existing = [
          ...BUILTIN_CATEGORY_NAMES,
          ...get().customCategories.map((c) => c.name),
        ];
        if (existing.some((n) => n.toLowerCase() === trimmed.toLowerCase())) return;
        const idx = get().customCategories.length % CUSTOM_CATEGORY_COLORS.length;
        set((state) => ({
          customCategories: [
            ...state.customCategories,
            { name: trimmed, color: CUSTOM_CATEGORY_COLORS[idx] },
          ],
        }));
      },

      removeCategory(name) {
        set((state) => {
          const nextRenames = { ...state.categoryRenames };
          delete nextRenames[name];
          const nextColors = { ...state.categoryColors };
          delete nextColors[name];
          // Migrate any blocks that were filed under `name` to "My Blocks"
          // so they remain visible in the toolbox. Without this, user-
          // created blocks vanish when their category is deleted.
          const nextAssignments: Record<string, string> = {};
          for (const [blockType, cat] of Object.entries(state.assignments)) {
            nextAssignments[blockType] = cat === name ? MY_BLOCKS_CATEGORY : cat;
          }
          return {
            customCategories: state.customCategories.filter((c) => c.name !== name),
            categoryRenames: nextRenames,
            categoryOrder: state.categoryOrder.filter((n) => n !== name),
            categoryColors: nextColors,
            assignments: nextAssignments,
          };
        });
      },

      renameCategory(canonical, newName) {
        const trimmed = newName.trim();
        const state = get();

        // Identify all canonical category names currently in the system.
        const canonicalCats = [
          ...BUILTIN_CATEGORY_NAMES,
          ...state.customCategories.map((c) => c.name),
        ];
        if (!canonicalCats.includes(canonical)) {
          return `Category "${canonical}" does not exist.`;
        }

        // Empty / same as canonical → clear any rename.
        if (!trimmed || trimmed === canonical) {
          if (!(canonical in state.categoryRenames)) return null;
          const nextRenames = { ...state.categoryRenames };
          delete nextRenames[canonical];
          set({ categoryRenames: nextRenames });
          return null;
        }

        // Reject collision with any other category's current display name.
        const lower = trimmed.toLowerCase();
        for (const c of canonicalCats) {
          if (c === canonical) continue;
          const display = displayCategoryName(c, state.categoryRenames);
          if (display.toLowerCase() === lower) {
            return `A category named "${trimmed}" already exists.`;
          }
        }

        set({
          categoryRenames: { ...state.categoryRenames, [canonical]: trimmed },
        });
        return null;
      },

      setCategoryOrder(order) {
        set({ categoryOrder: [...order] });
      },

      moveCategoryUp(canonical) {
        set((state) => {
          const all = [
            ...BUILTIN_CATEGORY_NAMES,
            ...state.customCategories.map((c) => c.name),
          ];
          const ordered = orderCategoryNames(all, state.categoryOrder);
          const idx = ordered.indexOf(canonical);
          if (idx <= 0) return state;
          const next = [...ordered];
          [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
          return { categoryOrder: next };
        });
      },

      moveCategoryDown(canonical) {
        set((state) => {
          const all = [
            ...BUILTIN_CATEGORY_NAMES,
            ...state.customCategories.map((c) => c.name),
          ];
          const ordered = orderCategoryNames(all, state.categoryOrder);
          const idx = ordered.indexOf(canonical);
          if (idx < 0 || idx >= ordered.length - 1) return state;
          const next = [...ordered];
          [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
          return { categoryOrder: next };
        });
      },

      setCategoryColor(canonical, hex) {
        set((state) => {
          const next = { ...state.categoryColors };
          if (hex === null || !hex.trim()) {
            if (!(canonical in next)) return state;
            delete next[canonical];
          } else {
            // Normalize: lowercase, ensure leading "#".
            const trimmed = hex.trim().toLowerCase();
            const normalized = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
            if (next[canonical] === normalized) return state;
            next[canonical] = normalized;
          }
          return { categoryColors: next };
        });
      },

      setCategoryIndex(canonical, index) {
        set((state) => {
          const all = [
            ...BUILTIN_CATEGORY_NAMES,
            ...state.customCategories.map((c) => c.name),
          ];
          const ordered = orderCategoryNames(all, state.categoryOrder);
          const oldIdx = ordered.indexOf(canonical);
          if (oldIdx < 0) return state;
          const target = Math.max(0, Math.min(ordered.length - 1, Math.trunc(index)));
          if (target === oldIdx) return state;
          const next = [...ordered];
          next.splice(oldIdx, 1);
          next.splice(target, 0, canonical);
          return { categoryOrder: next };
        });
      },

      resetToDefaults() {
        set({
          assignments: { ...DEFAULT_ASSIGNMENTS },
          customCategories: [],
          categoryRenames: {},
          categoryOrder: [],
          categoryColors: {},
        });
      },

      savePreset(name) {
        const trimmed = name.trim();
        if (!trimmed) {
          throw new Error("Preset name cannot be empty.");
        }
        const state = get();
        const preset: LayoutPreset = {
          schemaVersion: LAYOUT_PRESET_SCHEMA_VERSION,
          name: trimmed,
          assignments: { ...state.assignments },
          customCategories: state.customCategories.map((c) => ({ ...c })),
          categoryRenames: { ...state.categoryRenames },
          categoryOrder: [...state.categoryOrder],
          categoryColors: { ...state.categoryColors },
          savedAt: new Date().toISOString(),
        };
        set({ presets: { ...state.presets, [trimmed]: preset } });
        return preset;
      },

      loadPreset(name) {
        const preset = get().presets[name];
        if (!preset) return;
        set({
          assignments: { ...preset.assignments },
          customCategories: preset.customCategories.map((c) => ({ ...c })),
          categoryRenames: { ...(preset.categoryRenames ?? {}) },
          categoryOrder: [...(preset.categoryOrder ?? [])],
          categoryColors: { ...(preset.categoryColors ?? {}) },
        });
      },

      deletePreset(name) {
        set((state) => {
          const next = { ...state.presets };
          delete next[name];
          return { presets: next };
        });
      },

      getPreset(name) {
        return get().presets[name];
      },

      listPresets() {
        return Object.keys(get().presets).sort((a, b) => a.localeCompare(b));
      },

      exportPreset(name) {
        const preset = get().presets[name];
        return preset ? { ...preset } : null;
      },

      importPreset(payload) {
        if (!payload || typeof payload !== "object") {
          throw new Error("Invalid preset payload.");
        }
        if (!payload.name) {
          throw new Error("Preset is missing a name.");
        }
        const normalized: LayoutPreset = {
          schemaVersion: LAYOUT_PRESET_SCHEMA_VERSION,
          name: payload.name,
          assignments: { ...(payload.assignments ?? {}) },
          customCategories: (payload.customCategories ?? []).map((c) => ({ ...c })),
          categoryRenames: { ...(payload.categoryRenames ?? {}) },
          categoryOrder: [...(payload.categoryOrder ?? [])],
          categoryColors: { ...(payload.categoryColors ?? {}) },
          savedAt: payload.savedAt ?? new Date().toISOString(),
        };
        set((state) => ({
          presets: { ...state.presets, [normalized.name]: normalized },
        }));
        return normalized;
      },
    }),
    {
      name: "rustyblocks-block-org",
      // Deep-merge `assignments` so newly-introduced built-in blocks
      // (e.g. TurboWarp modules added after the user first persisted state)
      // get their default category without clobbering the user's overrides.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<BlockOrgStore>;
        return {
          ...current,
          ...p,
          assignments: {
            ...current.assignments,
            ...(p.assignments ?? {}),
          },
        };
      },
    }
  )
);
