import { describe, expect, it } from "vitest";
import { validateVibeXml, formatIssues } from "./vibeValidator";

function parse(xml: string): Element {
  // jsdom (Vitest's default) ships a DOMParser via the JSDOM environment.
  return new DOMParser().parseFromString(xml, "text/xml").documentElement;
}

describe("validateVibeXml", () => {
  it("accepts a fully-formed wf_window block", () => {
    const dom = parse(`<xml xmlns="https://developers.google.com/blockly/xml">
      <block type="wf_window" id="w1" x="20" y="20">
        <field name="TITLE">App</field>
        <field name="WIDTH">800</field>
        <field name="HEIGHT">600</field>
      </block>
    </xml>`);
    expect(validateVibeXml(dom)).toEqual([]);
  });

  it("flags missing required fields", () => {
    const dom = parse(`<xml xmlns="https://developers.google.com/blockly/xml">
      <block type="wf_window" id="w1">
        <field name="TITLE">App</field>
      </block>
    </xml>`);
    const issues = validateVibeXml(dom);
    expect(issues).toHaveLength(2);
    expect(issues.map((i) => i.fieldName).sort()).toEqual(["HEIGHT", "WIDTH"]);
    expect(issues[0].message).toMatch(/missing required field/);
  });

  it("flags empty non-empty strings", () => {
    const dom = parse(`<xml xmlns="https://developers.google.com/blockly/xml">
      <block type="wf_ui_button" id="b1">
        <field name="LABEL">  </field>
      </block>
    </xml>`);
    const issues = validateVibeXml(dom);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/empty/);
  });

  it("flags non-numeric values where a number is expected", () => {
    const dom = parse(`<xml xmlns="https://developers.google.com/blockly/xml">
      <block type="wf_window" id="w1">
        <field name="TITLE">App</field>
        <field name="WIDTH">eight hundred</field>
        <field name="HEIGHT">600</field>
      </block>
    </xml>`);
    const issues = validateVibeXml(dom);
    expect(issues.some((i) => i.fieldName === "WIDTH" && /not a number/.test(i.message))).toBe(true);
  });

  it("flags out-of-range numbers", () => {
    const dom = parse(`<xml xmlns="https://developers.google.com/blockly/xml">
      <block type="wf_on_timer" id="t1">
        <field name="INTERVAL_MS">-50</field>
      </block>
    </xml>`);
    const issues = validateVibeXml(dom);
    expect(issues[0]?.message).toMatch(/below minimum/);
  });

  it("flags invalid enum values, case-sensitive", () => {
    const dom = parse(`<xml xmlns="https://developers.google.com/blockly/xml">
      <block type="wf_project_theme" id="t1">
        <field name="THEME">midnight</field>
      </block>
    </xml>`);
    const issues = validateVibeXml(dom);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/auto, light, dark, custom/);
  });

  it("accepts case-insensitive enum values when the rule allows", () => {
    const dom = parse(`<xml xmlns="https://developers.google.com/blockly/xml">
      <block type="wf_ui_checkbox" id="c1">
        <field name="LABEL">Subscribe</field>
        <field name="CHECKED">true</field>
      </block>
    </xml>`);
    expect(validateVibeXml(dom)).toEqual([]);
  });

  it("flags route patterns that don't start with a slash", () => {
    const dom = parse(`<xml xmlns="https://developers.google.com/blockly/xml">
      <block type="wf_screen" id="s1">
        <field name="NAME">Home</field>
        <field name="ROUTE">home</field>
      </block>
    </xml>`);
    const issues = validateVibeXml(dom);
    expect(issues.some((i) => i.fieldName === "ROUTE")).toBe(true);
  });

  it("flags invalid PACKAGE_ID shape", () => {
    const dom = parse(`<xml xmlns="https://developers.google.com/blockly/xml">
      <block type="wf_project_meta" id="p1">
        <field name="APP_NAME">App</field>
        <field name="PACKAGE_ID">my app</field>
        <field name="VERSION">0.1.0</field>
      </block>
    </xml>`);
    const issues = validateVibeXml(dom);
    expect(issues.some((i) => i.fieldName === "PACKAGE_ID")).toBe(true);
  });

  it("flags identifiers that start with a digit", () => {
    const dom = parse(`<xml xmlns="https://developers.google.com/blockly/xml">
      <block type="wf_define_variable" id="v1">
        <field name="NAME">1foo</field>
        <field name="TYPE">string</field>
        <field name="VALUE">x</field>
      </block>
    </xml>`);
    const issues = validateVibeXml(dom);
    expect(issues.some((i) => i.fieldName === "NAME")).toBe(true);
  });

  it("ignores unknown block types (caught by findUnknownBlockTypes)", () => {
    const dom = parse(`<xml xmlns="https://developers.google.com/blockly/xml">
      <block type="wf_invented" id="x1">
        <field name="WHATEVER">meh</field>
      </block>
    </xml>`);
    expect(validateVibeXml(dom)).toEqual([]);
  });

  it("formatIssues includes block id, type, and field for each issue", () => {
    const dom = parse(`<xml xmlns="https://developers.google.com/blockly/xml">
      <block type="wf_window" id="w1">
        <field name="TITLE"></field>
      </block>
    </xml>`);
    const issues = validateVibeXml(dom);
    const text = formatIssues(issues);
    expect(text).toMatch(/wf_window/);
    expect(text).toMatch(/id w1/);
    expect(text).toMatch(/field TITLE/);
  });
});
