import { TURBOWARP_MODULES, turboWarpModuleBlockType } from "./turbowarpModules";

const turboWarpModuleBlocksXml = TURBOWARP_MODULES.map(
  (module) => `    <block type="${turboWarpModuleBlockType(module.id)}"></block>`
).join("\n");

export const toolboxXml = `
<xml xmlns="https://developers.google.com/blockly/xml" id="toolbox" style="display: none">
  <category name="Project" categorystyle="project_blocks">
    <block type="wf_project_meta"></block>
    <block type="wf_project_theme"></block>
  </category>
  <category name="Structure" categorystyle="structure_blocks">
    <block type="wf_window"></block>
    <block type="wf_screen"></block>
    <block type="wf_route"></block>
    <block type="wf_component"></block>
  </category>
  <category name="UI" categorystyle="ui_blocks">
    <block type="wf_ui_button"></block>
    <block type="wf_ui_text"></block>
    <block type="wf_ui_input"></block>
    <block type="wf_ui_textarea"></block>
    <block type="wf_ui_select"></block>
    <block type="wf_ui_checkbox"></block>
    <block type="wf_ui_toggle"></block>
    <block type="wf_ui_icon"></block>
    <block type="wf_ui_card"></block>
    <block type="wf_ui_list"></block>
    <block type="wf_ui_table"></block>
    <block type="wf_ui_tabs"></block>
    <block type="wf_ui_sidebar"></block>
    <block type="wf_ui_header"></block>
    <block type="wf_ui_footer"></block>
    <block type="wf_ui_modal"></block>
  </category>
  <category name="Logic" categorystyle="logic_blocks">
    <block type="wf_if_else"></block>
    <block type="wf_match"></block>
    <block type="wf_repeat"></block>
    <block type="wf_for_each"></block>
    <block type="wf_while"></block>
    <block type="wf_boolean_ops"></block>
    <block type="wf_string_ops"></block>
    <block type="controls_if"></block>
    <block type="logic_compare"></block>
    <block type="math_number"></block>
    <block type="math_arithmetic"></block>
  </category>
  <category name="State/Data" categorystyle="state_blocks">
    <block type="wf_define_variable"></block>
    <block type="wf_set_variable"></block>
    <block type="wf_define_collection"></block>
    <block type="wf_add_item"></block>
    <block type="wf_define_object"></block>
    <block type="wf_define_enum"></block>
    <block type="wf_optional_value"></block>
    <block type="wf_result_value"></block>
  </category>
  <category name="Events" categorystyle="events_blocks">
    <block type="wf_on_app_start"></block>
    <block type="wf_on_click"></block>
    <block type="wf_on_change"></block>
    <block type="wf_on_submit"></block>
    <block type="wf_on_timer"></block>
    <block type="wf_on_navigation"></block>
    <block type="wf_on_event_received"></block>
    <block type="wf_emit_event"></block>
  </category>
  <category name="IO / Storage" categorystyle="io_blocks">
    <block type="wf_read_file"></block>
    <block type="wf_write_file"></block>
    <block type="wf_save_local"></block>
    <block type="wf_load_local"></block>
    <block type="wf_parse_json"></block>
    <block type="wf_serialize_json"></block>
  </category>
  <category name="Network" categorystyle="network_blocks">
    <block type="wf_get_request"></block>
    <block type="wf_post_request"></block>
    <block type="wf_network_error_handler"></block>
    <block type="wf_network_timeout"></block>
    <block type="wf_network_retry"></block>
  </category>
  <category name="AI" categorystyle="ai_blocks">
    <block type="wf_ai_generate_image"></block>
    <block type="wf_ai_generate_icon"></block>
    <block type="wf_ai_rewrite_text"></block>
    <block type="wf_ai_generate_onboarding"></block>
    <block type="wf_ai_suggest_layout"></block>
    <block type="wf_ai_recommend_settings"></block>
    <block type="wf_ai_summarize_text"></block>
    <block type="wf_ai_create_mock_data"></block>
    <block type="wf_ai_explain_selection"></block>
    <block type="wf_ai_improve_prompt"></block>
  </category>
  <category name="Export" categorystyle="export_blocks">
    <block type="wf_validate"></block>
    <block type="wf_generate_source"></block>
    <block type="wf_export_bundle"></block>
  </category>
  <category name="TurboWarp Modules" categorystyle="tw_modules_blocks">
${turboWarpModuleBlocksXml}
  </category>
</xml>
`;

export const blockCategories = [
  "Project",
  "Structure",
  "UI",
  "Logic",
  "State/Data",
  "Events",
  "IO / Storage",
  "Network",
  "AI",
  "Export",
  "TurboWarp Modules",
  "My Blocks"
];
