/**
 * Extract a Blockly XML payload from a free-form AI response.
 *
 * The AI is instructed to output ONLY <xml>...</xml>, but real-world responses
 * sometimes include markdown fences, leading prose, or trailing commentary.
 * This helper:
 *   1. Strips a single leading ```xml or ``` fence and a trailing ``` fence
 *   2. Searches for the first <xml ...>...</xml> span (lazy match)
 *   3. Falls back to returning the cleaned text if it begins with <xml
 *
 * Returns null if no usable XML span is found.
 */
export function extractVibeXml(text: string): string | null {
  let cleaned = text.trim();

  cleaned = cleaned
    .replace(/^```(?:xml)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "");

  const match = cleaned.match(/<xml[\s\S]*?<\/xml>/i);
  if (match) {
    return match[0].trim();
  }

  if (cleaned.startsWith("<xml") && cleaned.includes("</xml>")) {
    return cleaned;
  }

  return null;
}
