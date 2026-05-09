/**
 * Centralized block registry for WarpForge Studio
 * This provides metadata for all blocks and enables dynamic recategorization
 */

export interface BlockMetadata {
  type: string;
  category: string;
  kind: string;
  label: string;
  description: string;
}

export const BLOCK_REGISTRY: BlockMetadata[] = [
  // Project blocks
  { type: "wf_project_meta", category: "project", kind: "project.meta", label: "Project Metadata", description: "Define project name, package ID, and version" },
  { type: "wf_project_theme", category: "project", kind: "project.theme", label: "Theme", description: "Set application theme" },

  // Structure blocks
  { type: "wf_window", category: "structure", kind: "structure.window", label: "Window", description: "Define an application window" },
  { type: "wf_screen", category: "structure", kind: "structure.screen", label: "Screen", description: "Define a screen/view" },
  { type: "wf_route", category: "structure", kind: "structure.route", label: "Route", description: "Define a navigation route" },
  { type: "wf_component", category: "structure", kind: "structure.component", label: "Component", description: "Define a reusable component" },

  // UI blocks
  { type: "wf_ui_button", category: "ui", kind: "ui.button", label: "Button", description: "Create a button" },
  { type: "wf_ui_text", category: "ui", kind: "ui.text", label: "Text", description: "Display text" },
  { type: "wf_ui_input", category: "ui", kind: "ui.input", label: "Input", description: "Text input field" },
  { type: "wf_ui_textarea", category: "ui", kind: "ui.textarea", label: "Textarea", description: "Multi-line text input" },
  { type: "wf_ui_select", category: "ui", kind: "ui.select", label: "Select", description: "Dropdown selection" },
  { type: "wf_ui_checkbox", category: "ui", kind: "ui.checkbox", label: "Checkbox", description: "Checkbox input" },
  { type: "wf_ui_toggle", category: "ui", kind: "ui.toggle", label: "Toggle", description: "Toggle switch" },
  { type: "wf_ui_icon", category: "ui", kind: "ui.icon", label: "Icon", description: "Display an icon" },
  { type: "wf_ui_card", category: "ui", kind: "ui.card", label: "Card", description: "Card container" },
  { type: "wf_ui_list", category: "ui", kind: "ui.list", label: "List", description: "List view" },
  { type: "wf_ui_table", category: "ui", kind: "ui.table", label: "Table", description: "Data table" },
  { type: "wf_ui_tabs", category: "ui", kind: "ui.tabs", label: "Tabs", description: "Tabbed interface" },
  { type: "wf_ui_sidebar", category: "ui", kind: "ui.sidebar", label: "Sidebar", description: "Sidebar panel" },
  { type: "wf_ui_header", category: "ui", kind: "ui.header", label: "Header", description: "Page header" },
  { type: "wf_ui_footer", category: "ui", kind: "ui.footer", label: "Footer", description: "Page footer" },
  { type: "wf_ui_modal", category: "ui", kind: "ui.modal", label: "Modal", description: "Modal dialog" },

  // Logic blocks
  { type: "wf_if_else", category: "logic", kind: "logic.if_else", label: "If/Else", description: "Conditional branching" },
  { type: "wf_match", category: "logic", kind: "logic.match", label: "Match", description: "Pattern matching" },
  { type: "wf_repeat", category: "logic", kind: "logic.repeat", label: "Repeat", description: "Repeat N times" },
  { type: "wf_for_each", category: "logic", kind: "logic.for_each", label: "For Each", description: "Iterate over collection" },
  { type: "wf_while", category: "logic", kind: "logic.while", label: "While", description: "While loop" },
  { type: "wf_boolean_ops", category: "logic", kind: "logic.boolean_ops", label: "Boolean Operations", description: "AND, OR, NOT operations" },
  { type: "wf_string_ops", category: "logic", kind: "logic.string_ops", label: "String Operations", description: "String manipulation" },

  // State/Data blocks
  { type: "wf_define_variable", category: "state", kind: "state.define_variable", label: "Define Variable", description: "Define a typed variable" },
  { type: "wf_set_variable", category: "state", kind: "state.set_variable", label: "Set Variable", description: "Set variable value" },
  { type: "wf_define_collection", category: "state", kind: "state.define_collection", label: "Define Collection", description: "Define a collection/list" },
  { type: "wf_add_item", category: "state", kind: "state.add_item", label: "Add Item", description: "Add item to collection" },
  { type: "wf_define_object", category: "state", kind: "state.define_object", label: "Define Object", description: "Define a structured object" },
  { type: "wf_define_enum", category: "state", kind: "state.define_enum", label: "Define Enum", description: "Define an enumeration" },
  { type: "wf_optional_value", category: "state", kind: "state.optional_value", label: "Optional Value", description: "Optional/nullable value" },
  { type: "wf_result_value", category: "state", kind: "state.result_value", label: "Result Value", description: "Result with ok/error states" },

  // Events blocks
  { type: "wf_on_app_start", category: "events", kind: "events.on_app_start", label: "On App Start", description: "Triggered when app starts" },
  { type: "wf_on_click", category: "events", kind: "events.on_click", label: "On Click", description: "Triggered on click" },
  { type: "wf_on_change", category: "events", kind: "events.on_change", label: "On Change", description: "Triggered on value change" },
  { type: "wf_on_submit", category: "events", kind: "events.on_submit", label: "On Submit", description: "Triggered on form submit" },
  { type: "wf_on_timer", category: "events", kind: "events.on_timer", label: "On Timer", description: "Triggered on timer interval" },
  { type: "wf_on_navigation", category: "events", kind: "events.on_navigation", label: "On Navigation", description: "Triggered on route navigation" },
  { type: "wf_on_event_received", category: "events", kind: "events.on_event_received", label: "On Event Received", description: "Triggered on custom event" },
  { type: "wf_emit_event", category: "events", kind: "events.emit_event", label: "Emit Event", description: "Emit a custom event" },

  // IO/Storage blocks
  { type: "wf_read_file", category: "io", kind: "io.read_file", label: "Read File", description: "Read file from disk" },
  { type: "wf_write_file", category: "io", kind: "io.write_file", label: "Write File", description: "Write file to disk" },
  { type: "wf_save_local", category: "io", kind: "io.save_local_data", label: "Save Local", description: "Save to local storage" },
  { type: "wf_load_local", category: "io", kind: "io.load_local_data", label: "Load Local", description: "Load from local storage" },
  { type: "wf_parse_json", category: "io", kind: "io.parse_json", label: "Parse JSON", description: "Parse JSON string" },
  { type: "wf_serialize_json", category: "io", kind: "io.serialize_json", label: "Serialize JSON", description: "Convert to JSON string" },

  // Network blocks
  { type: "wf_get_request", category: "network", kind: "network.get", label: "GET Request", description: "HTTP GET request" },
  { type: "wf_post_request", category: "network", kind: "network.post", label: "POST Request", description: "HTTP POST request" },
  { type: "wf_network_error_handler", category: "network", kind: "network.error_handler", label: "Error Handler", description: "Handle network errors" },
  { type: "wf_network_timeout", category: "network", kind: "network.timeout", label: "Set Timeout", description: "Set request timeout" },
  { type: "wf_network_retry", category: "network", kind: "network.retry", label: "Retry", description: "Retry failed requests" },

  // AI blocks
  { type: "wf_ai_generate_image", category: "ai", kind: "ai.generate_image", label: "Generate Image", description: "AI image generation" },
  { type: "wf_ai_generate_icon", category: "ai", kind: "ai.generate_icon", label: "Generate Icon", description: "AI icon generation" },
  { type: "wf_ai_rewrite_text", category: "ai", kind: "ai.rewrite_text", label: "Rewrite Text", description: "AI text rewriting" },
  { type: "wf_ai_generate_onboarding", category: "ai", kind: "ai.generate_onboarding", label: "Generate Onboarding", description: "AI onboarding content" },
  { type: "wf_ai_suggest_layout", category: "ai", kind: "ai.suggest_layout", label: "Suggest Layout", description: "AI layout recommendations" },
  { type: "wf_ai_recommend_settings", category: "ai", kind: "ai.recommend_settings", label: "Recommend Settings", description: "AI settings recommendations" },
  { type: "wf_ai_summarize_text", category: "ai", kind: "ai.summarize_text", label: "Summarize Text", description: "AI text summarization" },
  { type: "wf_ai_create_mock_data", category: "ai", kind: "ai.create_mock_data", label: "Create Mock Data", description: "AI mock data generation" },
  { type: "wf_ai_explain_selection", category: "ai", kind: "ai.explain_selection", label: "Explain Selection", description: "AI explanation of blocks" },
  { type: "wf_ai_improve_prompt", category: "ai", kind: "ai.improve_prompt", label: "Improve Prompt", description: "AI prompt improvement" },

  // Export blocks
  { type: "wf_validate", category: "export", kind: "export.validate_app", label: "Validate App", description: "Validate application" },
  { type: "wf_generate_source", category: "export", kind: "export.generate_source", label: "Generate Source", description: "Generate source code" },
  { type: "wf_export_bundle", category: "export", kind: "export.export_bundle", label: "Export Bundle", description: "Export installable bundle" },

  // Rust blocks (imported from .rs files)
  { type: "wf_rust_fn", category: "rust", kind: "rust.fn", label: "Function", description: "Rust function definition" },
  { type: "wf_rust_struct", category: "rust", kind: "rust.struct", label: "Struct", description: "Rust struct definition" },
  { type: "wf_rust_enum", category: "rust", kind: "rust.enum", label: "Enum", description: "Rust enum definition" },
  { type: "wf_rust_use", category: "rust", kind: "rust.use", label: "Use", description: "Rust use statement" },
  { type: "wf_rust_const", category: "rust", kind: "rust.const", label: "Const", description: "Rust const definition" },
  { type: "wf_rust_static", category: "rust", kind: "rust.static", label: "Static", description: "Rust static definition" },
  { type: "wf_rust_mod", category: "rust", kind: "rust.mod", label: "Module", description: "Rust module" },
  { type: "wf_rust_impl", category: "rust", kind: "rust.impl", label: "Impl", description: "Rust impl block" },
  { type: "wf_rust_trait", category: "rust", kind: "rust.trait", label: "Trait", description: "Rust trait definition" },
  { type: "wf_rust_unknown", category: "rust", kind: "rust.unknown", label: "Unknown", description: "Unrecognized Rust source" },
  { type: "wf_rust_let", category: "rust", kind: "rust.let", label: "Let Binding", description: "Rust let binding" },
  { type: "wf_rust_expr_stmt", category: "rust", kind: "rust.expr_stmt", label: "Expression Statement", description: "Rust expression statement" },
  { type: "wf_rust_expr_tail", category: "rust", kind: "rust.expr_tail", label: "Tail Expression", description: "Rust block tail expression" },
  { type: "wf_rust_macro_stmt", category: "rust", kind: "rust.macro_stmt", label: "Macro Call", description: "Rust macro invocation" },
];

/**
 * Get block metadata by type
 */
export function getBlockMetadata(blockType: string): BlockMetadata | undefined {
  return BLOCK_REGISTRY.find(block => block.type === blockType);
}

/**
 * Get all blocks in a category
 */
export function getBlocksByCategory(category: string): BlockMetadata[] {
  return BLOCK_REGISTRY.filter(block => block.category === category);
}

/**
 * Get category for a block type
 */
export function getCategoryForBlock(blockType: string): string {
  const metadata = getBlockMetadata(blockType);
  if (metadata) return metadata.category;
  // User-created custom blocks are detected by their prefix.
  if (blockType.startsWith("wf_custom_")) return "custom";
  return "logic";
}

/**
 * Get kind for a block type
 */
export function getKindForBlock(blockType: string): string {
  const metadata = getBlockMetadata(blockType);
  if (metadata) return metadata.kind;
  // Custom blocks: kind = the block type itself, so the graph round-trips.
  if (blockType.startsWith("wf_custom_")) return blockType;
  return blockType;
}

/**
 * Get all unique categories
 */
export function getAllCategories(): string[] {
  const categories = new Set(BLOCK_REGISTRY.map(block => block.category));
  return Array.from(categories).sort();
}
