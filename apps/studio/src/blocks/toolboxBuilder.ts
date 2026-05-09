import type { CustomCategory } from "../store/blockOrgStore";
import {
  CATEGORY_DEFS,
  displayCategoryName,
  orderCategoryNames,
} from "../store/blockOrgStore";

/**
 * Builds Blockly toolbox XML from the current block-to-category assignments.
 * Built-in categories use a registered categorystyle.
 * Custom user categories use a colour attribute directly.
 *
 * Assignments are keyed by canonical category name; the `categoryRenames`
 * map (canonical → display) is applied only when writing the visible
 * `name` attribute on each <category> element. `categoryOrder` reorders
 * which category is rendered first / last.
 */
export function buildToolboxXml(
  assignments: Record<string, string>,
  customCategories: CustomCategory[],
  categoryRenames: Record<string, string> = {},
  categoryOrder: string[] = [],
  categoryColors: Record<string, string> = {}
): string {
  const styleByName: Record<string, string> = {};
  for (const def of CATEGORY_DEFS) styleByName[def.name] = def.style;
  const colorByName: Record<string, string> = {};
  for (const c of customCategories) colorByName[c.name] = c.color;

  const naturalOrder = [
    ...CATEGORY_DEFS.map((c) => c.name),
    ...customCategories.map((c) => c.name),
  ];
  const orderedNames = orderCategoryNames(naturalOrder, categoryOrder);

  const byCategory: Record<string, string[]> = {};
  for (const name of naturalOrder) {
    byCategory[name] = [];
  }
  for (const [blockType, catName] of Object.entries(assignments)) {
    if (byCategory[catName] !== undefined) {
      byCategory[catName].push(blockType);
    }
  }

  const escapeXml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const sectionsXml = orderedNames.map((name) => {
    const blocks = byCategory[name] ?? [];
    const blocksXml = blocks.map((t) => `    <block type="${t}"></block>`).join("\n");
    const display = escapeXml(displayCategoryName(name, categoryRenames));
    // User color override wins over the registered style or the custom-cat color.
    const override = categoryColors[name];
    if (override) {
      return `  <category name="${display}" colour="${escapeXml(override)}">\n${blocksXml}\n  </category>`;
    }
    const style = styleByName[name];
    if (style) {
      return `  <category name="${display}" categorystyle="${style}">\n${blocksXml}\n  </category>`;
    }
    const color = colorByName[name] ?? "#607d8b";
    return `  <category name="${display}" colour="${color}">\n${blocksXml}\n  </category>`;
  });

  const categoriesXml = sectionsXml.join("\n");
  return `<xml xmlns="https://developers.google.com/blockly/xml" id="toolbox" style="display: none">\n${categoriesXml}\n</xml>`;
}
