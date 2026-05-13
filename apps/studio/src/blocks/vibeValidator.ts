/**
 * Field-level validator for the Vibe code path.
 *
 * Walks a parsed Blockly DOM, looks up each block's type in
 * `VIBE_BLOCK_SCHEMA`, and reports any:
 *   - missing required fields
 *   - empty values where the schema demands non-empty
 *   - non-numeric values where the schema declares a number
 *   - out-of-range numbers
 *   - wrong-spelling enum values
 *   - regex mismatches (for ROUTE, PACKAGE_ID, URL, etc.)
 *
 * Returns a flat `Issue[]`; the caller decides whether to surface them
 * verbatim, send them back to the AI for a fix-up pass, or both. Empty
 * list = the XML passed every check.
 *
 * Unknown block types are NOT reported here — `findUnknownBlockTypes`
 * already handles that path with a clearer message.
 */

import { VIBE_BLOCK_SCHEMA, type FieldRule } from "./vibeBlockSchema";

export interface Issue {
  blockId: string | null;
  blockType: string;
  fieldName: string | null;
  message: string;
}

function describeBlock(b: Element): { id: string | null; type: string } {
  return {
    id: b.getAttribute("id"),
    type: b.getAttribute("type") ?? "<unknown>",
  };
}

function getFieldValue(block: Element, fieldName: string): string | null {
  // Direct child <field name="..."> only — Blockly does not nest field
  // tags into other blocks, so a deep query would catch unrelated fields
  // from connected reporters.
  for (const child of Array.from(block.children)) {
    if (child.tagName.toLowerCase() === "field" && child.getAttribute("name") === fieldName) {
      return child.textContent ?? "";
    }
  }
  return null;
}

function checkRule(
  rule: FieldRule,
  value: string | null
): { ok: true } | { ok: false; reason: string } {
  if (value === null) {
    return rule.required
      ? { ok: false, reason: "missing required field" }
      : { ok: true };
  }

  switch (rule.kind) {
    case "string": {
      if (rule.nonEmpty && value.trim() === "") {
        return { ok: false, reason: "value is empty (must be non-empty)" };
      }
      if (rule.pattern && !rule.pattern.regex.test(value)) {
        return { ok: false, reason: `value "${value}" ${rule.pattern.description}` };
      }
      return { ok: true };
    }
    case "number": {
      if (value.trim() === "") {
        return rule.required
          ? { ok: false, reason: "value is empty (expected a number)" }
          : { ok: true };
      }
      const n = Number(value);
      if (!Number.isFinite(n)) {
        return { ok: false, reason: `value "${value}" is not a number` };
      }
      if (rule.integer && !Number.isInteger(n)) {
        return { ok: false, reason: `value ${n} must be an integer` };
      }
      if (rule.min !== undefined && n < rule.min) {
        return { ok: false, reason: `value ${n} is below minimum ${rule.min}` };
      }
      if (rule.max !== undefined && n > rule.max) {
        return { ok: false, reason: `value ${n} is above maximum ${rule.max}` };
      }
      return { ok: true };
    }
    case "enum": {
      const expected = rule.values;
      const haystack = rule.caseInsensitive ? value.toUpperCase() : value;
      const set = rule.caseInsensitive
        ? expected.map((s) => s.toUpperCase())
        : (expected as readonly string[]);
      if (!set.includes(haystack)) {
        return {
          ok: false,
          reason: `value "${value}" is not one of ${expected.join(", ")}`,
        };
      }
      return { ok: true };
    }
    case "boolean": {
      if (value !== "TRUE" && value !== "FALSE") {
        return { ok: false, reason: `value "${value}" must be TRUE or FALSE` };
      }
      return { ok: true };
    }
  }
}

export function validateVibeXml(dom: Element): Issue[] {
  const issues: Issue[] = [];
  const blocks = dom.querySelectorAll("block, shadow");
  blocks.forEach((b) => {
    const { id, type } = describeBlock(b);
    const schema = VIBE_BLOCK_SCHEMA[type];
    // Schema-less block types are caught upstream by findUnknownBlockTypes
    // (or are intentional escape hatches). Skip silently here.
    if (!schema) return;

    for (const [fieldName, rule] of Object.entries(schema.fields)) {
      const value = getFieldValue(b, fieldName);
      const result = checkRule(rule, value);
      if (result.ok) continue;
      issues.push({
        blockId: id,
        blockType: type,
        fieldName,
        message: result.reason,
      });
    }
  });
  return issues;
}

/**
 * Format a list of issues into a concise multi-line string suitable
 * for showing to the user OR feeding back to the AI in a fix-up
 * prompt. Each line is one issue; block id + type prefix every line.
 */
export function formatIssues(issues: Issue[]): string {
  return issues
    .map((i) => {
      const idHint = i.blockId ? `(id ${i.blockId})` : "";
      const fieldHint = i.fieldName ? `field ${i.fieldName}` : "";
      return `- ${i.blockType} ${idHint} ${fieldHint}: ${i.message}`.replace(/\s+/g, " ").trim();
    })
    .join("\n");
}
