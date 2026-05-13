import { describe, expect, it } from "vitest";
import {
  DEFAULT_NEW_BLOCK_LABEL,
  defaultDef,
  defaultDefFromCode,
  slugify,
  typeFromLabel,
  validateAndNormalize,
} from "./customBlockValidation";
import { CUSTOM_BLOCK_TYPE_PREFIX } from "./customBlockTypes";

describe("slugify", () => {
  it("lowercases, replaces non-alphanumerics with underscores, trims", () => {
    expect(slugify("My Block")).toBe("my_block");
    expect(slugify("  Greeting!! ")).toBe("greeting");
    expect(slugify("foo--bar")).toBe("foo_bar");
  });

  it("falls back to 'block' for empty / pure-symbol input", () => {
    expect(slugify("")).toBe("block");
    expect(slugify("   ")).toBe("block");
    expect(slugify("---")).toBe("block");
  });
});

describe("typeFromLabel", () => {
  it("prepends the custom-block prefix", () => {
    expect(typeFromLabel("My Block")).toBe(`${CUSTOM_BLOCK_TYPE_PREFIX}my_block`);
  });
});

describe("defaultDef", () => {
  it("produces a label/type pair where typeFromLabel(label) === type", () => {
    const def = defaultDef();
    // The original bug was that label='my block' didn't slugify to the
    // hard-coded type='wf_custom_new_block'. Lock the invariant.
    expect(def.label).toBe(DEFAULT_NEW_BLOCK_LABEL);
    expect(def.type).toBe(typeFromLabel(def.label));
  });
});

describe("defaultDefFromCode", () => {
  it("also keeps label/type consistent", () => {
    const def = defaultDefFromCode();
    expect(def.label).toBe("rust snippet");
    expect(def.type).toBe(typeFromLabel("rust snippet"));
    expect(def.kindKind).toBe("code_import");
    expect(def.fields).toHaveLength(1);
    expect(def.fields[0].name).toBe("SOURCE");
  });
});

describe("validateAndNormalize", () => {
  const empty = new Set<string>();

  it("accepts a fully-formed new block and re-derives the type", () => {
    const draft = { ...defaultDef(), label: "Greeting" };
    // Simulate the case where setLabel never fired (e.g. label pasted).
    draft.type = "wf_custom_outdated";
    const r = validateAndNormalize(draft, { existingTypes: empty, isEditing: false });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.def.label).toBe("Greeting");
      expect(r.def.type).toBe(typeFromLabel("Greeting"));
    }
  });

  it("preserves the locked type when editing", () => {
    const draft = { ...defaultDef(), label: "Greeting", type: "wf_custom_legacy" };
    const r = validateAndNormalize(draft, { existingTypes: empty, isEditing: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.def.type).toBe("wf_custom_legacy");
  });

  it("rejects an empty label", () => {
    const draft = { ...defaultDef(), label: "  " };
    const r = validateAndNormalize(draft, { existingTypes: empty, isEditing: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Label is required/);
  });

  it("rejects the placeholder label on a new block", () => {
    const draft = defaultDef(); // label === placeholder by construction
    const r = validateAndNormalize(draft, { existingTypes: empty, isEditing: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/specific name/);
  });

  it("allows the placeholder label when editing (already-named block)", () => {
    const draft = defaultDef();
    const r = validateAndNormalize(draft, { existingTypes: empty, isEditing: true });
    expect(r.ok).toBe(true);
  });

  it("rejects a duplicate type", () => {
    const draft = { ...defaultDef(), label: "Greeting" };
    const existing = new Set([typeFromLabel("Greeting")]);
    const r = validateAndNormalize(draft, { existingTypes: existing, isEditing: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/already exists/);
  });

  it("rejects malformed field names", () => {
    const draft = {
      ...defaultDef(),
      label: "Greeting",
      fields: [
        {
          type: "field_input" as const,
          name: "lower_case",
          label: "x",
          defaultValue: "",
        },
      ],
    };
    const r = validateAndNormalize(draft, { existingTypes: empty, isEditing: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/UPPERCASE/);
  });

  it("rejects dropdowns without options", () => {
    const draft = {
      ...defaultDef(),
      label: "Greeting",
      fields: [
        {
          type: "field_dropdown" as const,
          name: "OPT",
          label: "opt",
          defaultValue: "",
          options: [],
        },
      ],
    };
    const r = validateAndNormalize(draft, { existingTypes: empty, isEditing: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/at least one option/);
  });

  it("trims whitespace from the saved label", () => {
    const draft = { ...defaultDef(), label: "  Greeting  " };
    const r = validateAndNormalize(draft, { existingTypes: empty, isEditing: false });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.def.label).toBe("Greeting");
      expect(r.def.type).toBe(typeFromLabel("Greeting"));
    }
  });
});
