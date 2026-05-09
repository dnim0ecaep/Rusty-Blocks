import * as Blockly from "blockly";

import { TURBOWARP_MODULES, turboWarpModuleBlockType } from "./turbowarpModules";
import { registerScratchPrimitiveBlocks } from "./scratchPrimitiveBlocks";

let registered = false;

export function registerWarpforgeBlocks() {
  if (registered) {
    return;
  }

  registerScratchPrimitiveBlocks();

  const turboWarpModuleBlocks = TURBOWARP_MODULES.map((module) => ({
    type: turboWarpModuleBlockType(module.id),
    message0: `${module.name} action %1`,
    args0: [{ type: "field_input", name: "ACTION", text: "use" }],
    previousStatement: null,
    nextStatement: null,
    style: "tw_modules_blocks",
    tooltip: `TurboWarp module: ${module.name}`
  }));

  Blockly.common.defineBlocksWithJsonArray([
    {
      type: "wf_project_meta",
      message0: "project name %1 package %2 version %3",
      args0: [
        { type: "field_input", name: "APP_NAME", text: "WarpForgeApp" },
        { type: "field_input", name: "PACKAGE_ID", text: "com.warpforge.app" },
        { type: "field_input", name: "VERSION", text: "0.1.0" }
      ],
      nextStatement: null,
      style: "project_blocks",
      tooltip: "Set project metadata",
      helpUrl: ""
    },
    {
      type: "wf_project_theme",
      message0: "theme %1",
      args0: [
        {
          type: "field_dropdown",
          name: "THEME",
          options: [
            ["auto", "auto"],
            ["light", "light"],
            ["dark", "dark"],
            ["custom", "custom"]
          ]
        }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "project_blocks"
    },
    {
      type: "wf_window",
      message0: "window title %1 width %2 height %3",
      args0: [
        { type: "field_input", name: "TITLE", text: "Main" },
        { type: "field_number", name: "WIDTH", value: 1024, min: 320 },
        { type: "field_number", name: "HEIGHT", value: 768, min: 240 }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "structure_blocks"
    },
    {
      type: "wf_screen",
      message0: "screen %1 route %2",
      args0: [
        { type: "field_input", name: "NAME", text: "Home" },
        { type: "field_input", name: "ROUTE", text: "/" }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "structure_blocks"
    },
    {
      type: "wf_route",
      message0: "route %1",
      args0: [{ type: "field_input", name: "ROUTE", text: "/" }],
      previousStatement: null,
      nextStatement: null,
      style: "structure_blocks"
    },
    {
      type: "wf_component",
      message0: "component %1 kind %2",
      args0: [
        { type: "field_input", name: "ID", text: "cmp_1" },
        {
          type: "field_dropdown",
          name: "KIND",
          options: [
            ["button", "ui.button"],
            ["text", "ui.text"],
            ["input", "ui.input"],
            ["list", "ui.list"],
            ["table", "ui.table"]
          ]
        }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "structure_blocks"
    },
    {
      type: "wf_ui_button",
      message0: "button label %1",
      args0: [{ type: "field_input", name: "LABEL", text: "Click" }],
      previousStatement: null,
      nextStatement: null,
      style: "ui_blocks"
    },
    {
      type: "wf_ui_text",
      message0: "text %1",
      args0: [{ type: "field_input", name: "TEXT", text: "Hello" }],
      previousStatement: null,
      nextStatement: null,
      style: "ui_blocks"
    },
    {
      type: "wf_ui_input",
      message0: "input placeholder %1",
      args0: [{ type: "field_input", name: "PLACEHOLDER", text: "Type here" }],
      previousStatement: null,
      nextStatement: null,
      style: "ui_blocks"
    },
    {
      type: "wf_ui_list",
      message0: "list bind %1",
      args0: [{ type: "field_input", name: "COLLECTION", text: "items" }],
      previousStatement: null,
      nextStatement: null,
      style: "ui_blocks"
    },
    {
      type: "wf_ui_table",
      message0: "table bind %1",
      args0: [{ type: "field_input", name: "COLLECTION", text: "rows" }],
      previousStatement: null,
      nextStatement: null,
      style: "ui_blocks"
    },
    {
      type: "wf_ui_textarea",
      message0: "textarea placeholder %1 rows %2",
      args0: [
        { type: "field_input", name: "PLACEHOLDER", text: "Enter text..." },
        { type: "field_number", name: "ROWS", value: 4, min: 1, max: 20 }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "ui_blocks"
    },
    {
      type: "wf_ui_select",
      message0: "select options %1",
      args0: [{ type: "field_input", name: "OPTIONS", text: "Option1,Option2,Option3" }],
      previousStatement: null,
      nextStatement: null,
      style: "ui_blocks"
    },
    {
      type: "wf_ui_checkbox",
      message0: "checkbox label %1 checked %2",
      args0: [
        { type: "field_input", name: "LABEL", text: "Accept terms" },
        { type: "field_checkbox", name: "CHECKED", checked: false }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "ui_blocks"
    },
    {
      type: "wf_ui_toggle",
      message0: "toggle label %1",
      args0: [{ type: "field_input", name: "LABEL", text: "Enable feature" }],
      previousStatement: null,
      nextStatement: null,
      style: "ui_blocks"
    },
    {
      type: "wf_ui_icon",
      message0: "icon name %1 size %2",
      args0: [
        { type: "field_input", name: "NAME", text: "star" },
        { type: "field_number", name: "SIZE", value: 24, min: 8, max: 128 }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "ui_blocks"
    },
    {
      type: "wf_ui_card",
      message0: "card title %1",
      args0: [{ type: "field_input", name: "TITLE", text: "Card Title" }],
      previousStatement: null,
      nextStatement: null,
      style: "ui_blocks"
    },
    {
      type: "wf_ui_tabs",
      message0: "tabs %1",
      args0: [{ type: "field_input", name: "TABS", text: "Tab1,Tab2,Tab3" }],
      previousStatement: null,
      nextStatement: null,
      style: "ui_blocks"
    },
    {
      type: "wf_ui_sidebar",
      message0: "sidebar position %1",
      args0: [
        {
          type: "field_dropdown",
          name: "POSITION",
          options: [["left", "left"], ["right", "right"]]
        }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "ui_blocks"
    },
    {
      type: "wf_ui_header",
      message0: "header title %1",
      args0: [{ type: "field_input", name: "TITLE", text: "App Header" }],
      previousStatement: null,
      nextStatement: null,
      style: "ui_blocks"
    },
    {
      type: "wf_ui_footer",
      message0: "footer text %1",
      args0: [{ type: "field_input", name: "TEXT", text: "© 2026" }],
      previousStatement: null,
      nextStatement: null,
      style: "ui_blocks"
    },
    {
      type: "wf_ui_modal",
      message0: "modal title %1",
      args0: [{ type: "field_input", name: "TITLE", text: "Dialog" }],
      previousStatement: null,
      nextStatement: null,
      style: "ui_blocks"
    },
    {
      type: "wf_define_variable",
      message0: "define variable %1 type %2",
      args0: [
        { type: "field_input", name: "NAME", text: "counter" },
        {
          type: "field_dropdown",
          name: "TYPE",
          options: [["string", "string"], ["i64", "i64"], ["f64", "f64"], ["bool", "bool"]]
        }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "state_blocks"
    },
    {
      type: "wf_set_variable",
      message0: "set variable %1 value %2",
      args0: [
        { type: "field_input", name: "NAME", text: "counter" },
        { type: "field_input", name: "VALUE", text: "1" }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "state_blocks"
    },
    {
      type: "wf_define_collection",
      message0: "define collection %1",
      args0: [{ type: "field_input", name: "NAME", text: "items" }],
      previousStatement: null,
      nextStatement: null,
      style: "state_blocks"
    },
    {
      type: "wf_add_item",
      message0: "add item to %1 value %2",
      args0: [
        { type: "field_input", name: "NAME", text: "items" },
        { type: "field_input", name: "VALUE", text: "value" }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "state_blocks"
    },
    {
      type: "wf_define_object",
      message0: "define object %1 fields %2",
      args0: [
        { type: "field_input", name: "NAME", text: "user" },
        { type: "field_input", name: "FIELDS", text: "name:string,age:i64" }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "state_blocks"
    },
    {
      type: "wf_define_enum",
      message0: "define enum %1 values %2",
      args0: [
        { type: "field_input", name: "NAME", text: "Status" },
        { type: "field_input", name: "VALUES", text: "Active,Inactive,Pending" }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "state_blocks"
    },
    {
      type: "wf_optional_value",
      message0: "optional %1 value %2",
      args0: [
        { type: "field_input", name: "NAME", text: "email" },
        { type: "field_input", name: "VALUE", text: "" }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "state_blocks"
    },
    {
      type: "wf_result_value",
      message0: "result %1 ok %2 error %3",
      args0: [
        { type: "field_input", name: "NAME", text: "operation" },
        { type: "field_input", name: "OK_VALUE", text: "success" },
        { type: "field_input", name: "ERROR_VALUE", text: "failed" }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "state_blocks"
    },
    {
      type: "wf_on_app_start",
      message0: "on app start",
      nextStatement: null,
      style: "events_blocks"
    },
    {
      type: "wf_on_click",
      message0: "on click target %1",
      args0: [{ type: "field_input", name: "TARGET", text: "button_1" }],
      nextStatement: null,
      style: "events_blocks"
    },
    {
      type: "wf_emit_event",
      message0: "emit event %1",
      args0: [{ type: "field_input", name: "EVENT", text: "save" }],
      previousStatement: null,
      nextStatement: null,
      style: "events_blocks"
    },
    {
      type: "wf_on_change",
      message0: "on change target %1",
      args0: [{ type: "field_input", name: "TARGET", text: "input_1" }],
      nextStatement: null,
      style: "events_blocks"
    },
    {
      type: "wf_on_submit",
      message0: "on submit form %1",
      args0: [{ type: "field_input", name: "FORM", text: "form_1" }],
      nextStatement: null,
      style: "events_blocks"
    },
    {
      type: "wf_on_timer",
      message0: "on timer interval %1 ms",
      args0: [{ type: "field_number", name: "INTERVAL", value: 1000, min: 100 }],
      nextStatement: null,
      style: "events_blocks"
    },
    {
      type: "wf_on_navigation",
      message0: "on navigate to %1",
      args0: [{ type: "field_input", name: "ROUTE", text: "/" }],
      nextStatement: null,
      style: "events_blocks"
    },
    {
      type: "wf_on_event_received",
      message0: "on event %1 received",
      args0: [{ type: "field_input", name: "EVENT", text: "custom_event" }],
      nextStatement: null,
      style: "events_blocks"
    },
    {
      type: "wf_read_file",
      message0: "read file %1",
      args0: [{ type: "field_input", name: "PATH", text: "./data.json" }],
      previousStatement: null,
      nextStatement: null,
      style: "io_blocks"
    },
    {
      type: "wf_write_file",
      message0: "write file %1 value %2",
      args0: [
        { type: "field_input", name: "PATH", text: "./data.json" },
        { type: "field_input", name: "VALUE", text: "{}" }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "io_blocks"
    },
    {
      type: "wf_save_local",
      message0: "save local key %1",
      args0: [{ type: "field_input", name: "KEY", text: "notes" }],
      previousStatement: null,
      nextStatement: null,
      style: "io_blocks"
    },
    {
      type: "wf_load_local",
      message0: "load local key %1",
      args0: [{ type: "field_input", name: "KEY", text: "notes" }],
      previousStatement: null,
      nextStatement: null,
      style: "io_blocks"
    },
    {
      type: "wf_parse_json",
      message0: "parse JSON %1",
      args0: [{ type: "field_input", name: "JSON", text: "{}" }],
      previousStatement: null,
      nextStatement: null,
      style: "io_blocks"
    },
    {
      type: "wf_serialize_json",
      message0: "serialize to JSON %1",
      args0: [{ type: "field_input", name: "DATA", text: "data" }],
      previousStatement: null,
      nextStatement: null,
      style: "io_blocks"
    },
    {
      type: "wf_get_request",
      message0: "GET %1",
      args0: [{ type: "field_input", name: "URL", text: "https://api.example.com" }],
      previousStatement: null,
      nextStatement: null,
      style: "network_blocks"
    },
    {
      type: "wf_post_request",
      message0: "POST %1 body %2",
      args0: [
        { type: "field_input", name: "URL", text: "https://api.example.com" },
        { type: "field_input", name: "BODY", text: "{}" }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "network_blocks"
    },
    {
      type: "wf_network_error_handler",
      message0: "on network error %1",
      args0: [{ type: "field_input", name: "HANDLER", text: "handle_error" }],
      previousStatement: null,
      nextStatement: null,
      style: "network_blocks"
    },
    {
      type: "wf_network_timeout",
      message0: "set timeout %1 seconds",
      args0: [{ type: "field_number", name: "TIMEOUT", value: 30, min: 1, max: 300 }],
      previousStatement: null,
      nextStatement: null,
      style: "network_blocks"
    },
    {
      type: "wf_network_retry",
      message0: "retry %1 times delay %2 ms",
      args0: [
        { type: "field_number", name: "RETRIES", value: 3, min: 1, max: 10 },
        { type: "field_number", name: "DELAY", value: 1000, min: 100 }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "network_blocks"
    },
    {
      type: "wf_ai_generate_image",
      message0: "AI generate image prompt %1",
      args0: [{ type: "field_input", name: "PROMPT", text: "Generate icon" }],
      previousStatement: null,
      nextStatement: null,
      style: "ai_blocks"
    },
    {
      type: "wf_ai_rewrite_text",
      message0: "AI rewrite text %1",
      args0: [{ type: "field_input", name: "TEXT", text: "Welcome to app" }],
      previousStatement: null,
      nextStatement: null,
      style: "ai_blocks"
    },
    {
      type: "wf_ai_suggest_layout",
      message0: "AI suggest layout for %1",
      args0: [{ type: "field_input", name: "SCREEN", text: "Home" }],
      previousStatement: null,
      nextStatement: null,
      style: "ai_blocks"
    },
    {
      type: "wf_ai_generate_icon",
      message0: "AI generate icon %1 style %2",
      args0: [
        { type: "field_input", name: "DESCRIPTION", text: "app icon" },
        {
          type: "field_dropdown",
          name: "STYLE",
          options: [["flat", "flat"], ["3d", "3d"], ["minimal", "minimal"], ["colorful", "colorful"]]
        }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "ai_blocks"
    },
    {
      type: "wf_ai_generate_onboarding",
      message0: "AI generate onboarding steps %1",
      args0: [{ type: "field_number", name: "STEPS", value: 4, min: 2, max: 10 }],
      previousStatement: null,
      nextStatement: null,
      style: "ai_blocks"
    },
    {
      type: "wf_ai_recommend_settings",
      message0: "AI recommend settings for %1",
      args0: [{ type: "field_input", name: "FEATURE", text: "feature" }],
      previousStatement: null,
      nextStatement: null,
      style: "ai_blocks"
    },
    {
      type: "wf_ai_summarize_text",
      message0: "AI summarize %1 max length %2",
      args0: [
        { type: "field_input", name: "TEXT", text: "long text..." },
        { type: "field_number", name: "MAX_LENGTH", value: 100, min: 20, max: 500 }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "ai_blocks"
    },
    {
      type: "wf_ai_create_mock_data",
      message0: "AI create mock data type %1 count %2",
      args0: [
        { type: "field_input", name: "TYPE", text: "user" },
        { type: "field_number", name: "COUNT", value: 10, min: 1, max: 100 }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "ai_blocks"
    },
    {
      type: "wf_ai_explain_selection",
      message0: "AI explain selected blocks",
      previousStatement: null,
      nextStatement: null,
      style: "ai_blocks"
    },
    {
      type: "wf_ai_improve_prompt",
      message0: "AI improve prompt %1",
      args0: [{ type: "field_input", name: "PROMPT", text: "original prompt" }],
      previousStatement: null,
      nextStatement: null,
      style: "ai_blocks"
    },
    {
      type: "wf_validate",
      message0: "validate app",
      previousStatement: null,
      nextStatement: null,
      style: "export_blocks"
    },
    {
      type: "wf_generate_source",
      message0: "generate source",
      previousStatement: null,
      nextStatement: null,
      style: "export_blocks"
    },
    {
      type: "wf_export_bundle",
      message0: "export bundle",
      previousStatement: null,
      nextStatement: null,
      style: "export_blocks"
    },
    {
      type: "wf_if_else",
      message0: "if %1 then %2 else %3",
      args0: [
        { type: "input_value", name: "CONDITION", check: "Boolean" },
        { type: "input_statement", name: "THEN" },
        { type: "input_statement", name: "ELSE" }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "logic_blocks"
    },
    {
      type: "wf_match",
      message0: "match %1 cases %2 %3 %4",
      args0: [
        { type: "field_input", name: "VALUE", text: "value" },
        { type: "field_input", name: "CASES", text: "case1,case2,default" },
        { type: "input_dummy" },
        { type: "input_statement", name: "BODY" }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "logic_blocks"
    },
    {
      type: "wf_repeat",
      message0: "repeat %1 times %2 %3",
      args0: [
        { type: "field_number", name: "TIMES", value: 10, min: 1 },
        { type: "input_dummy" },
        { type: "input_statement", name: "DO" }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "logic_blocks"
    },
    {
      type: "wf_for_each",
      message0: "for each %1 in %2 %3 %4",
      args0: [
        { type: "field_input", name: "ITEM", text: "item" },
        { type: "field_input", name: "COLLECTION", text: "items" },
        { type: "input_dummy" },
        { type: "input_statement", name: "DO" }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "logic_blocks"
    },
    {
      type: "wf_while",
      message0: "while %1 %2 %3",
      args0: [
        { type: "input_value", name: "CONDITION", check: "Boolean" },
        { type: "input_dummy" },
        { type: "input_statement", name: "DO" }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "logic_blocks"
    },
    {
      type: "wf_boolean_ops",
      message0: "%1 %2 %3",
      args0: [
        { type: "input_value", name: "LEFT", check: "Boolean" },
        {
          type: "field_dropdown",
          name: "OP",
          options: [["and", "and"], ["or", "or"], ["not", "not"]]
        },
        { type: "input_value", name: "RIGHT", check: "Boolean" }
      ],
      output: "Boolean",
      style: "logic_blocks",
      inputsInline: true
    },
    {
      type: "wf_string_ops",
      message0: "string %1 %2 %3",
      args0: [
        { type: "input_value", name: "STRING", check: "String" },
        {
          type: "field_dropdown",
          name: "OP",
          options: [
            ["concat", "concat"],
            ["contains", "contains"],
            ["starts with", "starts_with"],
            ["ends with", "ends_with"],
            ["length", "length"],
            ["uppercase", "uppercase"],
            ["lowercase", "lowercase"]
          ]
        },
        { type: "input_value", name: "ARG" }
      ],
      output: null,
      style: "logic_blocks",
      inputsInline: true
    },
    ...turboWarpModuleBlocks
  ]);

  registered = true;
}
