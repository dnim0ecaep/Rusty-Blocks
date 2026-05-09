use std::collections::BTreeMap;

use anyhow::{Context, Result};
use quote::ToTokens;
use serde_json::{json, Value};
use syn::{Item, Stmt, Visibility};
use wf_schema::{EdgeType, GraphEdge, GraphNode, NormalizedGraph};

pub fn parse_rust_source(source: &str, _file_label: &str) -> Result<NormalizedGraph> {
    let file: syn::File =
        syn::parse_str(source).with_context(|| "failed to parse as Rust source")?;

    let mut builder = GraphBuilder::default();
    let item_ids = builder.add_items(&file.items, "item");

    // Chain top-level items via Flow edges for Blockly's vertical statement chain.
    for window in item_ids.windows(2) {
        builder.add_flow_edge(&window[0], &window[1]);
    }

    Ok(NormalizedGraph {
        nodes: builder.nodes,
        edges: builder.edges,
    })
}

#[derive(Default)]
struct GraphBuilder {
    nodes: Vec<GraphNode>,
    edges: Vec<GraphEdge>,
    next_id: usize,
}

impl GraphBuilder {
    fn fresh_id(&mut self, prefix: &str) -> String {
        self.next_id += 1;
        format!("{prefix}_{}", self.next_id)
    }

    fn add_node(
        &mut self,
        id_prefix: &str,
        kind: &str,
        category: &str,
        props: BTreeMap<String, Value>,
    ) -> String {
        let id = self.fresh_id(id_prefix);
        self.nodes.push(GraphNode {
            id: id.clone(),
            kind: kind.to_owned(),
            category: category.to_owned(),
            props,
        });
        id
    }

    fn add_flow_edge(&mut self, from: &str, to: &str) {
        let id = format!("edge_flow_{}_{}", from, to);
        self.edges.push(GraphEdge {
            id,
            from: from.to_owned(),
            to: to.to_owned(),
            edge_type: EdgeType::Flow,
        });
    }

    fn add_child_edge(&mut self, from: &str, to: &str) {
        let id = format!("edge_child_{}_{}", from, to);
        self.edges.push(GraphEdge {
            id,
            from: from.to_owned(),
            to: to.to_owned(),
            edge_type: EdgeType::Child,
        });
    }

    /// Visit a slice of items, returning the ids of the emitted nodes in order.
    fn add_items(&mut self, items: &[Item], id_prefix: &str) -> Vec<String> {
        items
            .iter()
            .map(|item| self.add_item(item, id_prefix))
            .collect()
    }

    /// Visit a slice of statements (function body), returning the ids of the
    /// emitted nodes in order.
    fn add_stmts(&mut self, stmts: &[Stmt], id_prefix: &str) -> Vec<String> {
        stmts
            .iter()
            .map(|stmt| self.add_stmt(stmt, id_prefix))
            .collect()
    }

    fn add_stmt(&mut self, stmt: &Stmt, id_prefix: &str) -> String {
        match stmt {
            Stmt::Local(local) => {
                let mut props = BTreeMap::new();
                props.insert("pattern_text".into(), json!(tokens(&local.pat)));
                let value_text = local
                    .init
                    .as_ref()
                    .map(|init| tokens(&*init.expr))
                    .unwrap_or_default();
                props.insert("value_text".into(), json!(value_text));
                self.add_node(id_prefix, "rust.let", "rust", props)
            }
            Stmt::Expr(expr, semi) => {
                let kind = if semi.is_some() {
                    "rust.expr_stmt"
                } else {
                    "rust.expr_tail"
                };
                let mut props = BTreeMap::new();
                props.insert("expr_text".into(), json!(tokens(expr)));
                self.add_node(id_prefix, kind, "rust", props)
            }
            Stmt::Item(item) => self.add_item(item, id_prefix),
            Stmt::Macro(stmt_macro) => {
                let mut props = BTreeMap::new();
                props.insert("macro_text".into(), json!(tokens(&stmt_macro.mac)));
                self.add_node(id_prefix, "rust.macro_stmt", "rust", props)
            }
        }
    }

    fn add_item(&mut self, item: &Item, id_prefix: &str) -> String {
        match item {
            Item::Fn(item_fn) => {
                let mut props = BTreeMap::new();
                props.insert("name".into(), json!(item_fn.sig.ident.to_string()));
                props.insert("vis".into(), json!(vis_text(&item_fn.vis)));
                props.insert("signature".into(), json!(tokens(&item_fn.sig)));
                props.insert("body_text".into(), json!(tokens(&*item_fn.block)));
                let fn_id = self.add_node(id_prefix, "rust.fn", "rust", props);

                let stmt_ids = self.add_stmts(&item_fn.block.stmts, "stmt");
                if let Some(first) = stmt_ids.first() {
                    self.add_child_edge(&fn_id, first);
                }
                for window in stmt_ids.windows(2) {
                    self.add_flow_edge(&window[0], &window[1]);
                }

                fn_id
            }
            Item::Struct(item_struct) => {
                let mut props = BTreeMap::new();
                props.insert("name".into(), json!(item_struct.ident.to_string()));
                props.insert("vis".into(), json!(vis_text(&item_struct.vis)));
                props.insert("fields_text".into(), json!(tokens(&item_struct.fields)));
                self.add_node(id_prefix, "rust.struct", "rust", props)
            }
            Item::Enum(item_enum) => {
                let variants_text = item_enum
                    .variants
                    .iter()
                    .map(|v| tokens(v))
                    .collect::<Vec<_>>()
                    .join(", ");
                let mut props = BTreeMap::new();
                props.insert("name".into(), json!(item_enum.ident.to_string()));
                props.insert("vis".into(), json!(vis_text(&item_enum.vis)));
                props.insert("variants_text".into(), json!(variants_text));
                self.add_node(id_prefix, "rust.enum", "rust", props)
            }
            Item::Use(item_use) => {
                let mut props = BTreeMap::new();
                props.insert("vis".into(), json!(vis_text(&item_use.vis)));
                props.insert("path".into(), json!(tokens(&item_use.tree)));
                self.add_node(id_prefix, "rust.use", "rust", props)
            }
            Item::Const(item_const) => {
                let mut props = BTreeMap::new();
                props.insert("name".into(), json!(item_const.ident.to_string()));
                props.insert("vis".into(), json!(vis_text(&item_const.vis)));
                props.insert("ty_text".into(), json!(tokens(&*item_const.ty)));
                props.insert("value_text".into(), json!(tokens(&*item_const.expr)));
                self.add_node(id_prefix, "rust.const", "rust", props)
            }
            Item::Static(item_static) => {
                let mut props = BTreeMap::new();
                props.insert("name".into(), json!(item_static.ident.to_string()));
                props.insert("vis".into(), json!(vis_text(&item_static.vis)));
                props.insert("ty_text".into(), json!(tokens(&*item_static.ty)));
                props.insert("value_text".into(), json!(tokens(&*item_static.expr)));
                props.insert(
                    "mutable".into(),
                    json!(matches!(item_static.mutability, syn::StaticMutability::Mut(_))),
                );
                self.add_node(id_prefix, "rust.static", "rust", props)
            }
            Item::Mod(item_mod) => {
                let mut props = BTreeMap::new();
                props.insert("name".into(), json!(item_mod.ident.to_string()));
                props.insert("vis".into(), json!(vis_text(&item_mod.vis)));
                let body_text = match &item_mod.content {
                    Some((_brace, items)) => items
                        .iter()
                        .map(|i| tokens(i))
                        .collect::<Vec<_>>()
                        .join("\n"),
                    None => String::new(),
                };
                props.insert("body_text".into(), json!(body_text));
                props.insert("inline".into(), json!(item_mod.content.is_some()));
                self.add_node(id_prefix, "rust.mod", "rust", props)
            }
            Item::Impl(item_impl) => {
                let mut props = BTreeMap::new();
                props.insert("self_ty_text".into(), json!(tokens(&*item_impl.self_ty)));
                let trait_text = item_impl
                    .trait_
                    .as_ref()
                    .map(|(bang, path, _for)| {
                        let bang_str = if bang.is_some() { "!" } else { "" };
                        format!("{bang_str}{}", tokens(path))
                    })
                    .unwrap_or_default();
                props.insert("trait_text".into(), json!(trait_text));
                let body_text = item_impl
                    .items
                    .iter()
                    .map(|i| tokens(i))
                    .collect::<Vec<_>>()
                    .join("\n");
                props.insert("body_text".into(), json!(body_text));
                self.add_node(id_prefix, "rust.impl", "rust", props)
            }
            Item::Trait(item_trait) => {
                let mut props = BTreeMap::new();
                props.insert("name".into(), json!(item_trait.ident.to_string()));
                props.insert("vis".into(), json!(vis_text(&item_trait.vis)));
                let body_text = item_trait
                    .items
                    .iter()
                    .map(|i| tokens(i))
                    .collect::<Vec<_>>()
                    .join("\n");
                props.insert("body_text".into(), json!(body_text));
                self.add_node(id_prefix, "rust.trait", "rust", props)
            }
            other => {
                let mut props = BTreeMap::new();
                props.insert("source".into(), json!(tokens(other)));
                self.add_node(id_prefix, "rust.unknown", "rust", props)
            }
        }
    }
}

fn vis_text(vis: &Visibility) -> String {
    match vis {
        Visibility::Inherited => String::new(),
        other => tokens(other),
    }
}

fn tokens<T: ToTokens>(item: &T) -> String {
    item.to_token_stream().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(source: &str) -> NormalizedGraph {
        parse_rust_source(source, "test.rs").expect("parse")
    }

    fn node_kinds(g: &NormalizedGraph) -> Vec<&str> {
        g.nodes.iter().map(|n| n.kind.as_str()).collect()
    }

    fn first_with_kind<'a>(g: &'a NormalizedGraph, kind: &str) -> &'a GraphNode {
        g.nodes
            .iter()
            .find(|n| n.kind == kind)
            .unwrap_or_else(|| panic!("no node with kind {kind}"))
    }

    fn prop<'a>(node: &'a GraphNode, key: &str) -> &'a Value {
        node.props
            .get(key)
            .unwrap_or_else(|| panic!("missing prop {key}"))
    }

    #[test]
    fn parses_empty_file() {
        let g = parse("");
        assert!(g.nodes.is_empty());
        assert!(g.edges.is_empty());
    }

    #[test]
    fn parses_single_fn() {
        let g = parse("fn hello() { println!(\"hi\"); }");
        let fn_node = first_with_kind(&g, "rust.fn");
        assert_eq!(prop(fn_node, "name"), &json!("hello"));
        assert!(prop(fn_node, "body_text").as_str().unwrap().contains("println"));
    }

    #[test]
    fn parses_struct_enum_use_const() {
        let src = r#"
            use std::collections::HashMap;
            pub struct Foo { x: i32 }
            enum Color { Red, Green }
            const N: u32 = 42;
        "#;
        let g = parse(src);
        let kinds = node_kinds(&g);
        assert!(kinds.contains(&"rust.use"));
        assert!(kinds.contains(&"rust.struct"));
        assert!(kinds.contains(&"rust.enum"));
        assert!(kinds.contains(&"rust.const"));

        let s = first_with_kind(&g, "rust.struct");
        assert_eq!(prop(s, "name"), &json!("Foo"));
        assert_eq!(prop(s, "vis"), &json!("pub"));

        let e = first_with_kind(&g, "rust.enum");
        assert_eq!(prop(e, "name"), &json!("Color"));
        assert!(prop(e, "variants_text").as_str().unwrap().contains("Red"));

        let c = first_with_kind(&g, "rust.const");
        assert_eq!(prop(c, "name"), &json!("N"));
        assert_eq!(prop(c, "value_text"), &json!("42"));
    }

    #[test]
    fn chains_top_level_items_via_flow_edges() {
        let g = parse("fn a() {} fn b() {} fn c() {}");
        assert_eq!(g.nodes.len(), 3);
        assert_eq!(g.edges.len(), 2);
        for edge in &g.edges {
            assert!(matches!(edge.edge_type, EdgeType::Flow));
        }
    }

    #[test]
    fn parses_impl_and_trait() {
        let src = r#"
            trait Greet { fn greet(&self); }
            impl Greet for Foo {
                fn greet(&self) { println!("hi"); }
            }
        "#;
        let g = parse(src);
        let kinds = node_kinds(&g);
        assert!(kinds.contains(&"rust.trait"));
        assert!(kinds.contains(&"rust.impl"));

        let i = first_with_kind(&g, "rust.impl");
        assert_eq!(prop(i, "self_ty_text"), &json!("Foo"));
        assert_eq!(prop(i, "trait_text"), &json!("Greet"));
    }

    #[test]
    fn unrecognized_falls_back_to_unknown() {
        let g = parse("extern crate foo;");
        let kinds = node_kinds(&g);
        assert!(kinds.contains(&"rust.unknown"));
    }

    #[test]
    fn parses_fn_body_let_and_return() {
        let g = parse(
            r#"
            fn add(a: i32, b: i32) -> i32 {
                let sum = a + b;
                return sum;
            }
            "#,
        );
        let kinds = node_kinds(&g);
        assert!(kinds.contains(&"rust.fn"));
        assert!(kinds.contains(&"rust.let"));
        // `return sum;` is an expression with semicolon → expr_stmt
        assert!(kinds.contains(&"rust.expr_stmt"));

        let let_node = first_with_kind(&g, "rust.let");
        assert!(prop(let_node, "pattern_text").as_str().unwrap().contains("sum"));
        assert!(prop(let_node, "value_text").as_str().unwrap().contains("a + b"));
    }

    #[test]
    fn fn_emits_child_edge_to_first_stmt() {
        let g = parse("fn it() { let x = 1; let y = 2; }");
        let fn_node = first_with_kind(&g, "rust.fn");
        let child_edges: Vec<_> = g
            .edges
            .iter()
            .filter(|e| matches!(e.edge_type, EdgeType::Child) && e.from == fn_node.id)
            .collect();
        assert_eq!(child_edges.len(), 1);

        let first_stmt_id = &child_edges[0].to;
        let first_stmt = g.nodes.iter().find(|n| &n.id == first_stmt_id).unwrap();
        assert_eq!(first_stmt.kind, "rust.let");
    }

    #[test]
    fn fn_chains_sibling_stmts_via_flow_edges() {
        let g = parse("fn it() { let x = 1; let y = 2; let z = 3; }");
        let stmt_ids: Vec<_> = g
            .nodes
            .iter()
            .filter(|n| n.kind == "rust.let")
            .map(|n| n.id.clone())
            .collect();
        assert_eq!(stmt_ids.len(), 3);

        let flow_among_stmts: Vec<_> = g
            .edges
            .iter()
            .filter(|e| {
                matches!(e.edge_type, EdgeType::Flow)
                    && stmt_ids.contains(&e.from)
                    && stmt_ids.contains(&e.to)
            })
            .collect();
        assert_eq!(flow_among_stmts.len(), 2);
    }

    #[test]
    fn macro_call_in_fn_body_becomes_macro_stmt() {
        let g = parse("fn it() { println!(\"hi\"); }");
        let kinds = node_kinds(&g);
        assert!(kinds.contains(&"rust.macro_stmt"));
        let m = first_with_kind(&g, "rust.macro_stmt");
        assert!(prop(m, "macro_text").as_str().unwrap().contains("println"));
    }

    #[test]
    fn tail_expression_distinguished_from_expr_stmt() {
        let g = parse("fn it() -> i32 { let x = 1; x }");
        let kinds = node_kinds(&g);
        assert!(kinds.contains(&"rust.expr_tail"));
        let tail = first_with_kind(&g, "rust.expr_tail");
        assert_eq!(prop(tail, "expr_text"), &json!("x"));
    }
}
