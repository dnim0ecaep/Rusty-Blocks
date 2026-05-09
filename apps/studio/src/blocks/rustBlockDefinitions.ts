import * as Blockly from "blockly";

let registered = false;

export function registerRustBlocks() {
  if (registered) {
    return;
  }

  Blockly.common.defineBlocksWithJsonArray([
    {
      type: "wf_rust_fn",
      message0: "fn %1 %2 %3 body %4",
      args0: [
        { type: "field_input", name: "VIS", text: "" },
        { type: "field_input", name: "NAME", text: "main" },
        { type: "field_input", name: "SIGNATURE", text: "fn main()" },
        { type: "input_statement", name: "BODY" }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "rust_blocks",
      tooltip: "Rust function"
    },
    {
      type: "wf_rust_struct",
      message0: "struct %1 %2 fields %3",
      args0: [
        { type: "field_input", name: "VIS", text: "" },
        { type: "field_input", name: "NAME", text: "Foo" },
        { type: "field_input", name: "FIELDS_TEXT", text: "{ x: i32 }" }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "rust_blocks",
      tooltip: "Rust struct definition"
    },
    {
      type: "wf_rust_enum",
      message0: "enum %1 %2 variants %3",
      args0: [
        { type: "field_input", name: "VIS", text: "" },
        { type: "field_input", name: "NAME", text: "Color" },
        { type: "field_input", name: "VARIANTS_TEXT", text: "Red, Green, Blue" }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "rust_blocks",
      tooltip: "Rust enum definition"
    },
    {
      type: "wf_rust_use",
      message0: "use %1 %2",
      args0: [
        { type: "field_input", name: "VIS", text: "" },
        { type: "field_input", name: "PATH", text: "std::collections::HashMap" }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "rust_blocks",
      tooltip: "Rust use statement"
    },
    {
      type: "wf_rust_const",
      message0: "const %1 %2 : %3 = %4",
      args0: [
        { type: "field_input", name: "VIS", text: "" },
        { type: "field_input", name: "NAME", text: "N" },
        { type: "field_input", name: "TY_TEXT", text: "u32" },
        { type: "field_input", name: "VALUE_TEXT", text: "42" }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "rust_blocks",
      tooltip: "Rust const definition"
    },
    {
      type: "wf_rust_static",
      message0: "static %1 mut %2 %3 : %4 = %5",
      args0: [
        { type: "field_input", name: "VIS", text: "" },
        { type: "field_checkbox", name: "MUTABLE", checked: false },
        { type: "field_input", name: "NAME", text: "VALUE" },
        { type: "field_input", name: "TY_TEXT", text: "u32" },
        { type: "field_input", name: "VALUE_TEXT", text: "0" }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "rust_blocks",
      tooltip: "Rust static definition"
    },
    {
      type: "wf_rust_mod",
      message0: "mod %1 %2 inline %3 body %4",
      args0: [
        { type: "field_input", name: "VIS", text: "" },
        { type: "field_input", name: "NAME", text: "submodule" },
        { type: "field_checkbox", name: "INLINE", checked: false },
        { type: "field_input", name: "BODY_TEXT", text: "" }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "rust_blocks",
      tooltip: "Rust module"
    },
    {
      type: "wf_rust_impl",
      message0: "impl %1 for %2 body %3",
      args0: [
        { type: "field_input", name: "TRAIT_TEXT", text: "" },
        { type: "field_input", name: "SELF_TY_TEXT", text: "Foo" },
        { type: "field_input", name: "BODY_TEXT", text: "" }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "rust_blocks",
      tooltip: "Rust impl block"
    },
    {
      type: "wf_rust_trait",
      message0: "trait %1 %2 body %3",
      args0: [
        { type: "field_input", name: "VIS", text: "" },
        { type: "field_input", name: "NAME", text: "MyTrait" },
        { type: "field_input", name: "BODY_TEXT", text: "" }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "rust_blocks",
      tooltip: "Rust trait definition"
    },
    {
      type: "wf_rust_unknown",
      message0: "rust source %1",
      args0: [{ type: "field_input", name: "SOURCE", text: "" }],
      previousStatement: null,
      nextStatement: null,
      style: "rust_blocks",
      tooltip: "Unrecognized Rust item — preserved as raw source"
    },
    {
      type: "wf_rust_let",
      message0: "let %1 = %2",
      args0: [
        { type: "field_input", name: "PATTERN_TEXT", text: "x" },
        { type: "field_input", name: "VALUE_TEXT", text: "0" }
      ],
      previousStatement: null,
      nextStatement: null,
      style: "rust_blocks",
      tooltip: "Rust let binding"
    },
    {
      type: "wf_rust_expr_stmt",
      message0: "expr %1 ;",
      args0: [{ type: "field_input", name: "EXPR_TEXT", text: "" }],
      previousStatement: null,
      nextStatement: null,
      style: "rust_blocks",
      tooltip: "Rust expression statement (semicolon-terminated)"
    },
    {
      type: "wf_rust_expr_tail",
      message0: "tail %1",
      args0: [{ type: "field_input", name: "EXPR_TEXT", text: "" }],
      previousStatement: null,
      nextStatement: null,
      style: "rust_blocks",
      tooltip: "Rust tail expression (block return value)"
    },
    {
      type: "wf_rust_macro_stmt",
      message0: "macro %1",
      args0: [{ type: "field_input", name: "MACRO_TEXT", text: "println!(\"hi\")" }],
      previousStatement: null,
      nextStatement: null,
      style: "rust_blocks",
      tooltip: "Rust macro invocation"
    }
  ]);

  registered = true;
}
