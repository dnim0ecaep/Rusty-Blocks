import { describe, expect, it } from "vitest";

import { extractVibeXml } from "./extractVibeXml";

describe("extractVibeXml", () => {
  it("returns null for empty input", () => {
    expect(extractVibeXml("")).toBeNull();
    expect(extractVibeXml("   \n\n  ")).toBeNull();
  });

  it("returns null when no <xml> span is present", () => {
    expect(extractVibeXml("Sorry, I can't do that.")).toBeNull();
  });

  it("returns the xml span when the response is just XML", () => {
    const xml = '<xml xmlns="https://developers.google.com/blockly/xml"><block type="wf_window"/></xml>';
    expect(extractVibeXml(xml)).toBe(xml);
  });

  it("strips a leading ```xml fence and trailing ``` fence", () => {
    const wrapped = '```xml\n<xml><block type="wf_window"/></xml>\n```';
    expect(extractVibeXml(wrapped)).toBe('<xml><block type="wf_window"/></xml>');
  });

  it("strips a bare ``` fence (no language tag)", () => {
    const wrapped = '```\n<xml><block type="wf_window"/></xml>\n```';
    expect(extractVibeXml(wrapped)).toBe('<xml><block type="wf_window"/></xml>');
  });

  it("extracts XML from a response with leading prose", () => {
    const text =
      'Here you go!\n\n<xml xmlns="https://developers.google.com/blockly/xml"><block type="wf_window"/></xml>\n\nLet me know if you need changes.';
    const out = extractVibeXml(text);
    expect(out).toContain('<block type="wf_window"');
    expect(out).toMatch(/^<xml/);
    expect(out).toMatch(/<\/xml>$/);
  });

  it("returns the first <xml> span when multiple are present (lazy match)", () => {
    const text =
      "<xml><block type='a'/></xml> and another <xml><block type='b'/></xml>";
    expect(extractVibeXml(text)).toBe("<xml><block type='a'/></xml>");
  });
});
