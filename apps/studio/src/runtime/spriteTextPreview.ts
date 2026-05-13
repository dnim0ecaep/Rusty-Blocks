/**
 * Authoring-time preview of the dynamic-text overlay.
 *
 * The runtime fires `scratch_looks_set_text_to`, `…_with_font`, and
 * `…_set_text_size_to` only when a hat actually runs (flag click,
 * sprite click, broadcast). That makes the studio Stage panel feel
 * dead while you author: drop "set text to 'Hello'", and nothing
 * happens until you press the green flag.
 *
 * This module closes that gap. Whenever the sprite's `scripts_xml`
 * changes, we walk it for the three dynamic-text blocks and pull out
 * any *literal* inputs (text-shadow blocks, math_number-shadow
 * blocks). Those go straight onto the sprite as a WYSIWYG preview so
 * the user can see what the script will do before they run it.
 *
 * Non-literal inputs (variable getters, `item N of …`, `op_join`, etc.)
 * resolve at runtime — we have no idea what they'll evaluate to — so
 * we leave the corresponding field alone. The runtime will overwrite
 * it the moment a script actually fires.
 *
 * If the workspace contains no `set_text_*` blocks at all, we clear
 * everything: the user has explicitly removed every text instruction,
 * so the sprite should go back to showing no overlay.
 */

import type { Sprite } from "../types/workspace";

const TEXT_BLOCK_TYPES = new Set([
  "scratch_looks_set_text_to",
  "scratch_looks_set_text_with_font",
  "scratch_looks_set_text_size_to",
]);

/**
 * Read a literal value from a `<value name="…">` child of `block`.
 * Returns the string body of a `text` shadow, the NUM of a math_number
 * shadow, or `null` for anything else (reporter, variable getter,
 * missing). The caller decides whether to coerce to number.
 */
function readLiteralValue(block: Element, name: string): string | null {
  const valueEl = Array.from(block.children).find(
    (c) => c.tagName.toLowerCase() === "value" && c.getAttribute("name") === name
  );
  if (!valueEl) return null;
  // The value child may be a `<shadow>` or a `<block>` whose type tells
  // us whether it's a literal we can read.
  for (const child of Array.from(valueEl.children)) {
    const tag = child.tagName.toLowerCase();
    if (tag !== "shadow" && tag !== "block") continue;
    const type = child.getAttribute("type");
    if (type === "text") {
      const fieldEl = Array.from(child.children).find(
        (f) => f.tagName.toLowerCase() === "field" && f.getAttribute("name") === "TEXT"
      );
      return fieldEl?.textContent ?? "";
    }
    if (type === "math_number") {
      const fieldEl = Array.from(child.children).find(
        (f) => f.tagName.toLowerCase() === "field" && f.getAttribute("name") === "NUM"
      );
      return fieldEl?.textContent ?? "";
    }
    // Anything else — variable getter, list-item reporter, op_join,
    // sensing_answer, etc. — needs runtime evaluation, so it's not
    // a usable preview value. Bail out for this slot.
    return null;
  }
  return null;
}

export type SpriteTextPreviewPatch = Partial<
  Pick<Sprite, "text_value" | "font_family" | "text_size">
>;

/**
 * Walk every `<block>` in the parsed XML (including blocks nested
 * inside `<statement>` children of e.g. a `forever` loop) and harvest
 * the last literal value found for TEXT, FONT, and SIZE inputs to the
 * three dynamic-text blocks. Returns the patch to apply to the sprite,
 * with clear semantics:
 *
 *   - no `set_text_*` blocks in the workspace at all → return a patch
 *     that *clears* text_value / font_family / text_size (the user
 *     removed every text instruction);
 *   - blocks exist but the input is a reporter (variable getter, etc.)
 *     → leave the corresponding field undefined in the patch (so the
 *     runtime keeps whatever it last set);
 *   - block found with a literal → return the literal in the patch.
 *
 * Returns an empty patch when scripts_xml is malformed or empty.
 */
export function derivePreviewFromScripts(scriptsXml: string): SpriteTextPreviewPatch {
  if (!scriptsXml || typeof scriptsXml !== "string") return {};

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(scriptsXml, "text/xml");
  } catch {
    return {};
  }
  // Parser-error fallback (browser DOMParser surfaces these as a
  // <parsererror> element rather than throwing).
  if (doc.getElementsByTagName("parsererror").length > 0) return {};

  const allBlocks = Array.from(doc.getElementsByTagName("block"));
  const textBlocks = allBlocks.filter((b) =>
    TEXT_BLOCK_TYPES.has(b.getAttribute("type") ?? "")
  );

  if (textBlocks.length === 0) {
    // User removed every set_text_* block. Clear the overlay.
    return {
      text_value: undefined,
      font_family: undefined,
      text_size: undefined,
    };
  }

  const patch: SpriteTextPreviewPatch = {};
  // Walk in document order; later blocks (closer to the bottom of the
  // chain / inside a forever loop) override earlier ones — same as how
  // the runtime executes them.
  for (const block of textBlocks) {
    const type = block.getAttribute("type");
    if (type === "scratch_looks_set_text_to" || type === "scratch_looks_set_text_with_font") {
      const text = readLiteralValue(block, "TEXT");
      if (text !== null) {
        patch.text_value = text;
      }
    }
    if (type === "scratch_looks_set_text_with_font") {
      const font = readLiteralValue(block, "FONT");
      if (font !== null) {
        // Empty string clears the override (matches the runtime).
        patch.font_family = font.trim() === "" ? undefined : font;
      }
    }
    if (type === "scratch_looks_set_text_size_to") {
      const sizeStr = readLiteralValue(block, "SIZE");
      if (sizeStr !== null) {
        const n = Number(sizeStr);
        if (Number.isFinite(n) && n > 0) {
          // Clamp to the same range the interpreter enforces, so the
          // preview matches what the runtime would land on.
          patch.text_size = Math.max(8, Math.min(200, n));
        } else {
          patch.text_size = undefined;
        }
      }
    }
  }
  return patch;
}
