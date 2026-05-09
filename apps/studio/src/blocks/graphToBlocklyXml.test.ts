import { describe, expect, it } from "vitest";

import type { NormalizedGraph } from "../types/workspace";
import { graphToBlocklyXml } from "./graphToBlocklyXml";

describe("graphToBlocklyXml", () => {
  it("emits empty xml shell for an empty graph", () => {
    const xml = graphToBlocklyXml({ nodes: [], edges: [] });
    expect(xml).toContain("<xml");
    expect(xml).toContain("</xml>");
    expect(xml).not.toContain("<block");
  });

  it("emits a single root block with declared fields", () => {
    const graph: NormalizedGraph = {
      nodes: [
        {
          id: "n1",
          kind: "rust.use",
          category: "rust",
          props: { vis: "pub", path: "std::fs" }
        }
      ],
      edges: []
    };
    const xml = graphToBlocklyXml(graph);
    expect(xml).toContain('type="wf_rust_use"');
    expect(xml).toContain('id="n1"');
    expect(xml).toContain('<field name="VIS">pub</field>');
    expect(xml).toContain('<field name="PATH">std::fs</field>');
  });

  it("chains flow edges via <next>", () => {
    const graph: NormalizedGraph = {
      nodes: [
        { id: "a", kind: "rust.use", category: "rust", props: { path: "std::a" } },
        { id: "b", kind: "rust.use", category: "rust", props: { path: "std::b" } }
      ],
      edges: [{ id: "e1", from: "a", to: "b", edge_type: "flow" }]
    };
    const xml = graphToBlocklyXml(graph);
    // 'a' is the only root and contains a <next> with 'b'
    expect(xml).toMatch(/id="a"[\s\S]*<next><block[^>]*id="b"/);
    // 'b' must NOT appear at top level (must only appear nested under <next>)
    const topLevelBlocks = xml.match(/<xml[^>]*>[\s\S]*?<block/g) ?? [];
    // first <block> after <xml> tag should be 'a', not 'b'
    expect(xml).toMatch(/<xml[^>]*>\s*<block type="wf_rust_use" id="a"/);
    expect(topLevelBlocks.length).toBeGreaterThan(0);
  });

  it("nests child edges in a <statement name=BODY> for wf_rust_fn", () => {
    const graph: NormalizedGraph = {
      nodes: [
        {
          id: "fn1",
          kind: "rust.fn",
          category: "rust",
          props: { vis: "pub", name: "main", signature: "fn main()" }
        },
        {
          id: "stmt1",
          kind: "rust.let",
          category: "rust",
          props: { pattern_text: "x", value_text: "1" }
        }
      ],
      edges: [{ id: "e1", from: "fn1", to: "stmt1", edge_type: "child" }]
    };
    const xml = graphToBlocklyXml(graph);
    expect(xml).toContain('<statement name="BODY">');
    expect(xml).toMatch(/<statement name="BODY"><block[^>]*id="stmt1"/);
    expect(xml).toContain('<field name="NAME">main</field>');
  });

  it("escapes special XML characters in field values", () => {
    const graph: NormalizedGraph = {
      nodes: [
        {
          id: "x",
          kind: "rust.expr_stmt",
          category: "rust",
          props: { expr_text: 'foo("a < b & c") ' }
        }
      ],
      edges: []
    };
    const xml = graphToBlocklyXml(graph);
    expect(xml).toContain("&lt;");
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&quot;");
  });

  it("emits multiple roots with staggered y positions", () => {
    const graph: NormalizedGraph = {
      nodes: [
        { id: "a", kind: "rust.use", category: "rust", props: { path: "a" } },
        { id: "b", kind: "rust.use", category: "rust", props: { path: "b" } }
      ],
      edges: [] // no flow edges → both roots
    };
    const xml = graphToBlocklyXml(graph);
    const ys = [...xml.matchAll(/y="(\d+)"/g)].map((m) => Number(m[1]));
    expect(ys.length).toBe(2);
    expect(ys[0]).not.toBe(ys[1]);
  });

  it("falls back to wf_rust_unknown for unrecognized kinds", () => {
    const graph: NormalizedGraph = {
      nodes: [
        {
          id: "mystery",
          kind: "rust.something_new",
          category: "rust",
          props: { source: "/* mystery */" }
        }
      ],
      edges: []
    };
    const xml = graphToBlocklyXml(graph);
    expect(xml).toContain('type="wf_rust_unknown"');
  });
});
