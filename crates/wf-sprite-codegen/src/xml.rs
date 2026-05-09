//! Blockly XML → ScriptNode transcompiler.
//!
//! Mirrors the studio's `apps/studio/src/runtime/compileScripts.ts`. Reads
//! an `<xml>...</xml>` document containing one or more top-level
//! `<block>` elements and emits a `Vec<ScriptNode>`.
//!
//! Recognized child shapes inside a `<block>`:
//!   - `<field name="X">val</field>`        → fields["X"] = "val"
//!   - `<value name="X"><block .../></value>` → inputs["X"] = compiled child
//!   - `<statement name="X"><block .../></statement>` → inputs["X"] = compiled child
//!   - `<next><block .../></next>`           → next = compiled child
//!
//! Anything else is ignored, so unknown decorations from Blockly itself
//! (mutations, comments, position attrs) don't break the compile.

use std::collections::HashMap;

use anyhow::{anyhow, Result};
use roxmltree::{Document, Node};

use wf_sprite_runtime::ScriptNode;

pub fn parse_scripts_xml(xml: &str) -> Result<Vec<ScriptNode>> {
    let doc = Document::parse(xml).map_err(|e| anyhow!("invalid XML: {e}"))?;
    let root = doc.root_element();
    if root.tag_name().name() != "xml" {
        return Err(anyhow!("expected <xml> root, got <{}>", root.tag_name().name()));
    }

    let mut nodes = Vec::new();
    for child in root.children() {
        if !child.is_element() { continue; }
        if child.tag_name().name() != "block" { continue; }
        if let Some(node) = block_to_node(child)? {
            nodes.push(node);
        }
    }
    Ok(nodes)
}

fn block_to_node(elem: Node<'_, '_>) -> Result<Option<ScriptNode>> {
    let r#type = match elem.attribute("type") {
        Some(t) => t.to_string(),
        None => return Ok(None),
    };
    let mut node = ScriptNode {
        r#type,
        fields: None,
        inputs: None,
        next: None,
        id: elem.attribute("id").map(|s| s.to_string()),
    };
    let mut fields: HashMap<String, String> = HashMap::new();
    let mut inputs: HashMap<String, ScriptNode> = HashMap::new();

    for child in elem.children() {
        if !child.is_element() { continue; }
        match child.tag_name().name() {
            "field" => {
                if let Some(name) = child.attribute("name") {
                    let value = child.text().unwrap_or("").to_string();
                    fields.insert(name.to_string(), value);
                }
            }
            "value" | "statement" => {
                if let Some(name) = child.attribute("name") {
                    if let Some(b) = first_child_block(child) {
                        if let Some(inner) = block_to_node(b)? {
                            inputs.insert(name.to_string(), inner);
                        }
                    }
                }
            }
            "next" => {
                if let Some(b) = first_child_block(child) {
                    if let Some(inner) = block_to_node(b)? {
                        node.next = Some(Box::new(inner));
                    }
                }
            }
            // shadow blocks (Blockly's default-value placeholders) have
            // the same structure as <block> when nested in a <value> —
            // accept them.
            "shadow" => {
                // Treat <shadow> as a fallback only when no real <block>
                // sibling exists in the same value/statement slot.
                // Currently nothing uses these for the sprite-bouncer
                // example, but harmless to accept silently.
            }
            _ => { /* ignore */ }
        }
    }

    if !fields.is_empty() { node.fields = Some(fields); }
    if !inputs.is_empty() { node.inputs = Some(inputs); }
    Ok(Some(node))
}

fn first_child_block<'a, 'input: 'a>(elem: Node<'a, 'input>) -> Option<Node<'a, 'input>> {
    elem.children().find(|c| c.is_element() && c.tag_name().name() == "block")
        .or_else(|| elem.children().find(|c| c.is_element() && c.tag_name().name() == "shadow"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_top_level_block_with_field_and_next() {
        let xml = r#"<xml>
  <block type="scratch_motion_turn_right" id="t1">
    <field name="DEGREES">90</field>
    <next>
      <block type="scratch_motion_move_steps" id="m1">
        <field name="STEPS">10</field>
      </block>
    </next>
  </block>
</xml>"#;
        let nodes = parse_scripts_xml(xml).unwrap();
        assert_eq!(nodes.len(), 1);
        assert_eq!(nodes[0].r#type, "scratch_motion_turn_right");
        assert_eq!(nodes[0].field("DEGREES"), Some("90"));
        let next = nodes[0].next.as_ref().unwrap();
        assert_eq!(next.r#type, "scratch_motion_move_steps");
        assert_eq!(next.field("STEPS"), Some("10"));
    }

    #[test]
    fn parses_statement_input() {
        let xml = r#"<xml>
  <block type="scratch_control_forever" id="f1">
    <statement name="DO">
      <block type="scratch_motion_change_x" id="c1">
        <field name="DX">5</field>
      </block>
    </statement>
  </block>
</xml>"#;
        let nodes = parse_scripts_xml(xml).unwrap();
        assert_eq!(nodes[0].r#type, "scratch_control_forever");
        let body = nodes[0].input("DO").unwrap();
        assert_eq!(body.r#type, "scratch_motion_change_x");
        assert_eq!(body.field("DX"), Some("5"));
    }

    #[test]
    fn parses_value_input_with_nested_reporter() {
        let xml = r#"<xml>
  <block type="scratch_op_add" id="op">
    <value name="A">
      <block type="scratch_op_length_of">
        <field name="STRING">hi</field>
      </block>
    </value>
  </block>
</xml>"#;
        let nodes = parse_scripts_xml(xml).unwrap();
        let a = nodes[0].input("A").unwrap();
        assert_eq!(a.r#type, "scratch_op_length_of");
        assert_eq!(a.field("STRING"), Some("hi"));
    }

    #[test]
    fn handles_multiple_top_level_stacks() {
        let xml = r#"<xml>
  <block type="scratch_event_when_flag_clicked" id="h1"/>
  <block type="scratch_event_when_key_pressed" id="h2">
    <field name="KEY">space</field>
  </block>
</xml>"#;
        let nodes = parse_scripts_xml(xml).unwrap();
        assert_eq!(nodes.len(), 2);
        assert_eq!(nodes[0].r#type, "scratch_event_when_flag_clicked");
        assert_eq!(nodes[1].field("KEY"), Some("space"));
    }
}
