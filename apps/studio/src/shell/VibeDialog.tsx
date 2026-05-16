import { FormEvent, useState } from "react";
import * as Blockly from "blockly";
import { useAiStore, type RunPromptResult } from "../store/aiStore";
import { getVibeWorkspace } from "../blocks/vibeWorkspace";
import { extractVibeXml } from "../blocks/extractVibeXml";
import { schemaPromptReference } from "../blocks/vibeBlockSchema";
import { formatIssues, validateVibeXml } from "../blocks/vibeValidator";

const BLOCK_REFERENCE = `
Available block types (use ONLY these exact type names in the XML):

PROJECT: wf_project_meta (fields: APP_NAME, PACKAGE_ID, VERSION), wf_project_theme (field: THEME = auto|light|dark|custom)

STRUCTURE: wf_window (fields: TITLE, WIDTH, HEIGHT), wf_screen (fields: NAME, ROUTE), wf_route (field: ROUTE), wf_component (fields: ID, KIND = ui.button|ui.text|ui.input|ui.list|ui.table)

UI: wf_ui_button (field: LABEL), wf_ui_text (field: TEXT), wf_ui_input (field: PLACEHOLDER), wf_ui_textarea (fields: PLACEHOLDER, ROWS), wf_ui_select (field: OPTIONS comma-separated), wf_ui_checkbox (fields: LABEL, CHECKED=TRUE|FALSE), wf_ui_toggle (field: LABEL), wf_ui_icon (fields: NAME, SIZE), wf_ui_card (field: TITLE), wf_ui_list (field: COLLECTION), wf_ui_table (field: COLLECTION), wf_ui_tabs (field: TABS), wf_ui_sidebar (field: ITEMS), wf_ui_header (field: TITLE), wf_ui_footer (field: TEXT), wf_ui_modal (field: TITLE)

LOGIC: wf_if_else, wf_match, wf_repeat (field: TIMES), wf_for_each (field: COLLECTION), wf_while, wf_boolean_ops (field: OP = AND|OR|NOT), wf_string_ops (field: OP = concat|trim|upper|lower|contains|replace)

STATE: wf_define_variable (fields: NAME, TYPE = string|number|bool|list|map, VALUE), wf_set_variable (fields: NAME, VALUE), wf_define_collection (fields: NAME, ITEM_TYPE = string|number|object), wf_add_item (fields: COLLECTION, VALUE), wf_define_object (fields: NAME, FIELDS), wf_define_enum (fields: NAME, VARIANTS), wf_optional_value (field: TYPE), wf_result_value (fields: OK_TYPE, ERR_TYPE)

EVENTS: wf_on_app_start, wf_on_click (field: TARGET), wf_on_change (field: TARGET), wf_on_submit (field: FORM), wf_on_timer (field: INTERVAL_MS), wf_on_navigation (field: ROUTE), wf_on_event_received (field: EVENT), wf_emit_event (field: EVENT)

IO: wf_read_file (field: PATH), wf_write_file (fields: PATH, CONTENT), wf_save_local (fields: KEY, VALUE), wf_load_local (field: KEY), wf_parse_json (field: INPUT), wf_serialize_json (field: INPUT)

NETWORK: wf_get_request (field: URL), wf_post_request (fields: URL, BODY), wf_network_error_handler, wf_network_timeout (field: MS), wf_network_retry (field: ATTEMPTS)

AI: wf_ai_generate_image (field: PROMPT), wf_ai_generate_icon (fields: DESCRIPTION, STYLE = flat|outline|filled), wf_ai_rewrite_text (field: TEXT), wf_ai_generate_onboarding (field: STEPS), wf_ai_suggest_layout (field: SCREEN), wf_ai_recommend_settings (field: FEATURE), wf_ai_summarize_text (field: TEXT), wf_ai_create_mock_data (fields: TYPE, COUNT), wf_ai_explain_selection, wf_ai_improve_prompt (field: PROMPT)

EXPORT: wf_validate, wf_generate_source (field: OUTPUT_DIR), wf_export_bundle (field: OUTPUT_DIR)
`.trim();

const WORKED_EXAMPLE = `Worked example. User: "A login screen with email and password inputs and a Sign In button that goes to /home"
Expected output:
<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="wf_window" id="win" x="20" y="20">
    <field name="TITLE">My App</field>
    <field name="WIDTH">800</field>
    <field name="HEIGHT">600</field>
    <next><block type="wf_screen" id="login_scr">
      <field name="NAME">Login</field>
      <field name="ROUTE">/login</field>
      <next><block type="wf_ui_input" id="email_in"><field name="PLACEHOLDER">Email</field>
        <next><block type="wf_ui_input" id="pw_in"><field name="PLACEHOLDER">Password</field>
          <next><block type="wf_ui_button" id="signin_btn"><field name="LABEL">Sign In</field></block></next>
        </block></next>
      </block></next>
    </block></next>
  </block>
  <block type="wf_on_click" id="signin_evt" x="20" y="220">
    <field name="TARGET">signin_btn</field>
    <next><block type="wf_on_navigation" id="go_home"><field name="ROUTE">/home</field></block></next>
  </block>
</xml>`;

const SCHEMA_REFERENCE = schemaPromptReference();

const COMMON_RULES = `RULES:
- Output ONLY the XML — no explanation, no markdown fences, no extra text
- Start with <xml xmlns="https://developers.google.com/blockly/xml"> and end with </xml>
- Chain blocks vertically using <next> tags
- Set field values using <field name="FIELDNAME">value</field>
- Each top-level block needs x/y coordinates, e.g. <block type="..." x="20" y="20">
- Spread multiple top-level block stacks out (use y increments of ~200)
- Only use block types from the list above — never invent new ones
- Honor every field constraint exactly: required fields, allowed enum values, integer ranges, route shapes (e.g. ROUTE must start with "/"), reverse-DNS PACKAGE_ID
- Use <field> tags only on the block they belong to; never write a field tag with empty content for a required field

DO NOT INVENT BLOCKS. The following are NOT real blocks — do not output them under any spelling:
- wf_variable_get, wf_get_variable, wf_value_of  → there is no value-getter block. Reference variables/inputs by name in field values (e.g. <field name="VALUE">my_var</field>); the runtime resolves them.
- wf_ui_input_value, wf_get_input_value, wf_ui_get_text → no input-value block. Use the input's COMPONENT_ID in downstream field references (e.g. wf_on_change with TARGET="email_in").
- wf_ui_list_refresh, wf_refresh_list, wf_ui_list_reload → no refresh block. Lists re-render automatically when their backing collection changes via wf_add_item / wf_set_variable.
- wf_ui_get_selected_item_value, wf_ui_selected_index, wf_ui_list_selected → no selection getter. Use wf_on_change with the list/select TARGET, and reference the bound variable.

When you need behavior the listed blocks can't express, prefer omitting the wire-up and adding a wf_ui_text block explaining the gap, instead of inventing a block name.`;

const SYSTEM_PROMPT_CREATE = `You are a WarpForge block assembler. Your ONLY job is to output valid Blockly XML that assembles blocks to fulfill the user's request.

${BLOCK_REFERENCE}

${SCHEMA_REFERENCE}

${COMMON_RULES}

${WORKED_EXAMPLE}`;

const SYSTEM_PROMPT_MODIFY = `You are a WarpForge block assembler. You are given the user's CURRENT Blockly workspace XML and a request describing how to modify it. Your ONLY job is to output the COMPLETE updated Blockly XML reflecting that change.

${BLOCK_REFERENCE}

${SCHEMA_REFERENCE}

${COMMON_RULES}
- Output the FULL updated workspace, not a diff or partial fragment
- Preserve existing blocks unless the request asks to change or remove them
- Keep block IDs from the original XML when a block is unchanged

${WORKED_EXAMPLE}`;

function getCurrentWorkspaceXml(): { xml: string; blockCount: number } {
  const ws = getVibeWorkspace();
  if (!ws) return { xml: "", blockCount: 0 };
  const dom = Blockly.Xml.workspaceToDom(ws);
  const xml = Blockly.Xml.domToText(dom);
  return { xml, blockCount: ws.getAllBlocks(false).length };
}

function findUnknownBlockTypes(dom: Element): string[] {
  const unknown = new Set<string>();
  const blocks = dom.querySelectorAll("block, shadow");
  blocks.forEach((b) => {
    const type = b.getAttribute("type");
    if (type && !Blockly.Blocks[type]) unknown.add(type);
  });
  return [...unknown];
}

/**
 * Cache of "does this block type have a previousStatement connector?".
 * Built lazily by instantiating each registered block on a throwaway
 * headless workspace and reading its `previousConnection`. We use it to
 * detect the AI nesting non-stackable blocks (expressions, reporters,
 * top-level project meta) under a `<next>` wrapper — Blockly crashes
 * those with "Next block does not have previous statement".
 */
let previousConnectionCache: Map<string, boolean> | null = null;

function getPreviousConnectionMap(): Map<string, boolean> {
  if (previousConnectionCache) return previousConnectionCache;
  const cache = new Map<string, boolean>();
  let probe: Blockly.Workspace | null = null;
  try {
    probe = new Blockly.Workspace();
  } catch {
    // Probe construction failed (jsdom env, etc.) — leave the cache
    // empty; the caller treats "unknown" as "trust the AI" and won't
    // unwrap. We still catch the load error downstream.
    previousConnectionCache = cache;
    return cache;
  }
  for (const type of Object.keys(Blockly.Blocks)) {
    try {
      const block = probe.newBlock(type);
      cache.set(type, block.previousConnection != null);
      block.dispose(false);
    } catch {
      // Some blocks (e.g. those depending on shadow defaults) can't be
      // instantiated headlessly. Leave them undefined.
    }
  }
  try { probe.dispose(); } catch { /* ignore */ }
  previousConnectionCache = cache;
  return cache;
}

/**
 * Patch up the AI's XML before handing it to Blockly. Catches three
 * common Claude-generated malformations that otherwise crash the load:
 *   - Duplicate `<next>` children under one `<block>` (Blockly allows
 *     at most one). We keep the first.
 *   - Duplicate `id` attributes across `<block>` elements. We rewrite
 *     subsequent collisions to fresh ids so each block lands cleanly.
 *   - Blocks nested under `<next>` whose type has no
 *     `previousStatement` connector ("Next block does not have previous
 *     statement"). We unwrap them to top-level with an offset.
 *
 * Returns the count of repairs applied so the caller can log it.
 */
function sanitizeVibeDom(dom: Element): { dom: Element; repairs: number } {
  let repairs = 0;
  const blocks = dom.querySelectorAll("block");

  // 1. Collapse multiple <next> children under any block element.
  blocks.forEach((block) => {
    const nexts: Element[] = [];
    for (const child of Array.from(block.children)) {
      if (child.tagName.toLowerCase() === "next") nexts.push(child);
    }
    if (nexts.length > 1) {
      for (let i = 1; i < nexts.length; i++) {
        nexts[i].remove();
        repairs++;
      }
    }
  });

  // 2. Deduplicate ids — second-and-later collisions get a fresh id.
  const seen = new Set<string>();
  blocks.forEach((block) => {
    const id = block.getAttribute("id");
    if (!id) return;
    if (seen.has(id)) {
      block.setAttribute("id", `${id}_dup${repairs}`);
      repairs++;
    } else {
      seen.add(id);
    }
  });

  // 3. Unwrap <next> children whose block type can't be statement-
  //    stacked. We move them to top-level with a fresh x/y so they
  //    still appear on the workspace (just disconnected) instead of
  //    crashing the load with "Next block does not have previous
  //    statement".
  const prevMap = getPreviousConnectionMap();
  const root = dom; // <xml> element
  // y starting point spread out so unwrapped orphans don't pile up.
  let unwrapY = 600;
  // Walk all <block> elements (re-querying each pass because we mutate).
  let pass = 0;
  while (pass < 50) {
    pass++;
    const candidates = Array.from(dom.querySelectorAll("block")).filter((b) => {
      const parent = b.parentElement;
      if (!parent || parent.tagName.toLowerCase() !== "next") return false;
      const type = b.getAttribute("type");
      if (!type) return false;
      const hasPrev = prevMap.get(type);
      // Unwrap only when we have evidence the type can't stack. Unknown
      // types stay put — we'd rather load and let Blockly's own check
      // run than aggressively edit AI output we can't reason about.
      return hasPrev === false;
    });
    if (candidates.length === 0) break;
    for (const block of candidates) {
      const wrapper = block.parentElement!;
      wrapper.removeChild(block);
      block.setAttribute("x", "20");
      block.setAttribute("y", String(unwrapY));
      unwrapY += 200;
      root.appendChild(block);
      // Empty <next> wrapper left behind? Drop it.
      if (
        !Array.from(wrapper.children).some(
          (c) =>
            c.tagName.toLowerCase() === "block" ||
            c.tagName.toLowerCase() === "shadow",
        )
      ) {
        wrapper.remove();
      }
      repairs++;
    }
  }

  return { dom, repairs };
}

interface LoadResult {
  inserted: number;
  stripped: string[];
}

function loadXmlIntoWorkspace(xml: string, replace: boolean): LoadResult {
  const ws = getVibeWorkspace();
  if (!ws) {
    throw new Error(
      "No active Blockly workspace to insert into. Open or create a project first."
    );
  }
  let dom: Element;
  try {
    dom = Blockly.utils.xml.textToDom(xml);
  } catch (err) {
    console.error("Failed to parse vibe XML:", err);
    throw new Error(`The AI returned malformed XML: ${String(err)}`);
  }

  // Remove any block elements whose type isn't registered. Earlier in
  // the pipeline the fix-up loop tries to coax the AI into substituting
  // valid blocks; if a few sneak through, drop them rather than abort
  // the whole load. We return the list of stripped types so the caller
  // can surface a "your request used N unsupported operations" notice
  // instead of a hard error.
  const stripped = stripUnknownBlocks(dom);

  const { repairs } = sanitizeVibeDom(dom);
  if (repairs > 0) {
    console.warn(`[vibe] Repaired ${repairs} malformed XML node(s) before loading.`);
  }

  try {
    if (replace) {
      ws.clear();
      Blockly.Xml.domToWorkspace(dom, ws);
      return { inserted: ws.getAllBlocks(false).length, stripped };
    }
    const ids = Blockly.Xml.appendDomToWorkspace(dom, ws);
    return { inserted: ids.length, stripped };
  } catch (err) {
    console.error("Failed to load vibe XML into workspace:", err);
    const detail = String(err);
    // Blockly's "Next statement is already connected" message survives
    // sanitization only when the malformation is structural (e.g. two
    // blocks both pointing to the same parent via <next>). Tell the user
    // what to do instead of dumping the raw Blockly internals on them.
    let hint = "";
    if (detail.includes("Next statement is already connected")) {
      hint =
        "\n\nThe AI produced a malformed block chain (two blocks trying to occupy the same `next` slot). Try the Fix-Up button or regenerate — Claude sometimes wires this incorrectly on long chains.";
    } else if (detail.includes("Next block does not have previous statement")) {
      hint =
        "\n\nThe AI nested a non-stackable block (an expression or top-level meta block) under `<next>`. Regenerate — the prompt's rules are clearer about which blocks can be chained.";
    }
    throw new Error(`Blockly XML load failed: ${detail}${hint}`);
  }
}

/**
 * Remove every `<block type="...">` / `<shadow type="...">` whose type
 * isn't registered. Returns the (deduplicated) list of types stripped
 * so the caller can mention them to the user. We also unwrap any
 * `<next>` whose only child was a stripped block, so the chain stays
 * well-formed for Blockly.
 */
function stripUnknownBlocks(dom: Element): string[] {
  const stripped = new Set<string>();
  const allBlocks = Array.from(dom.querySelectorAll("block, shadow"));
  for (const el of allBlocks) {
    const type = el.getAttribute("type");
    if (type && !Blockly.Blocks[type]) {
      stripped.add(type);
      const parent = el.parentElement;
      el.remove();
      // If the parent was a <next>/<statement>/<value> that now has no
      // <block> child, drop it too — leaving an empty <next/> can cause
      // Blockly to attach the following block weirdly.
      if (parent) {
        const tag = parent.tagName.toLowerCase();
        const hasBlockChild = Array.from(parent.children).some(
          (c) => c.tagName.toLowerCase() === "block" || c.tagName.toLowerCase() === "shadow"
        );
        if (!hasBlockChild && (tag === "next" || tag === "statement" || tag === "value")) {
          parent.remove();
        }
      }
    }
  }
  return [...stripped];
}

interface Props {
  onClose(): void;
}

/**
 * Run one AI text-mode round and pull XML out of the response. Returns
 * the extracted XML string on success, or an `{ error }` object the
 * caller can surface verbatim. Centralized so generate / fix-up share
 * the parsing path.
 */
type RunResult = { xml: string } | { error: string };

import type { AiMode } from "../types/ai";

type RunPrompt = (
  mode: AiMode,
  prompt: string,
  context?: Record<string, unknown>
) => Promise<RunPromptResult>;

async function runOneRound(
  runPrompt: RunPrompt,
  prompt: string
): Promise<RunResult> {
  const result = await runPrompt("text", prompt, { vibeMode: true });
  if (!result.ok) {
    return {
      error:
        `AI request failed: ${result.error ?? "unknown error"}\n\n` +
        "Open the AI Copilot panel and click the settings gear to configure your provider.",
    };
  }
  const out =
    result.output && typeof result.output === "object"
      ? (result.output as { text?: unknown })
      : {};
  const textContent = typeof out.text === "string" ? out.text : "";
  if (!textContent) {
    return { error: `AI returned an empty response. Output: ${JSON.stringify(result.output)}` };
  }
  const xml = extractVibeXml(textContent);
  if (!xml) {
    // Distinguish "AI never produced XML" from "AI started producing XML
    // but the response was cut off". The latter is by far the most
    // common failure mode (token cap on the provider side) and the fix
    // is different: increase max_tokens / shorten the request, not
    // rephrase.
    const trimmed = textContent.trim();
    const looksTruncated =
      trimmed.includes("<xml") && !trimmed.includes("</xml>");
    const headline = looksTruncated
      ? "The AI's response was cut off before it finished the XML (likely hit the provider's max-tokens limit). " +
        "Try a shorter request, or switch to a provider/model with a higher output limit."
      : "The AI didn't return valid Blockly XML. Try rephrasing your request.";
    return {
      error:
        `${headline}\n\n` +
        `Response preview: ${textContent.substring(0, 300)}${
          textContent.length > 300 ? "..." : ""
        }`,
    };
  }
  return { xml };
}

const CRITIC_PROMPT_HEAD = `You are a strict reviewer of WarpForge block XML.

Your job: verify the GENERATED XML faithfully implements the USER REQUEST. Check:
- Are all UI elements the user mentioned present?
- Are event handlers (on_click, on_submit, etc.) wired to the right targets?
- Do labels / placeholders / titles match what the user asked for?
- Are routes and screen structure correct?

Output ONE of:
- The single token OK (no other text) if the XML is correct.
- A bulleted list of concrete issues, one per line prefixed with "- ".
  Reference block ids when possible. Be strict but not pedantic — minor
  cosmetic differences are fine; missing or wrong functionality is not.

Do NOT output the XML. Do NOT output explanations or preamble. Just OK
or a bullet list.`;

function buildCriticPrompt(userRequest: string, xml: string): string {
  return `${CRITIC_PROMPT_HEAD}

USER REQUEST:
${userRequest}

GENERATED XML:
${xml}`;
}

function buildFixupPrompt(
  userRequest: string,
  xml: string,
  issues: string,
  isModify: boolean
): string {
  const baseRules = isModify ? SYSTEM_PROMPT_MODIFY : SYSTEM_PROMPT_CREATE;
  return `${baseRules}

The XML below has issues per a reviewer. Apply the fixes listed; preserve everything else. Output ONLY the corrected XML.

USER REQUEST:
${userRequest}

CURRENT XML:
${xml}

ISSUES TO FIX:
${issues}`;
}

/** Distinguish "OK" verdict (case-insensitive, ignoring whitespace) from
 *  an issue list. The critic prompt forces this exact shape; tolerate
 *  slight variants (extra punctuation, case) so a chatty model doesn't
 *  derail the loop. */
function parseCriticVerdict(raw: string): { ok: true } | { ok: false; issues: string } {
  const trimmed = raw.trim();
  if (/^ok\.?$/i.test(trimmed)) return { ok: true };
  // Pull bullet-prefixed lines as the issue list. If the critic returned
  // prose without bullets, surface the whole thing — better to ship the
  // text to the fix-up pass than to lose information.
  const lines = trimmed.split(/\r?\n/);
  const bullets = lines.filter((l) => /^\s*[-*]\s+/.test(l));
  return { ok: false, issues: bullets.length > 0 ? bullets.join("\n") : trimmed };
}

export function VibeDialog({ onClose }: Props) {
  const { busy, runPrompt } = useAiStore();
  const [request, setRequest] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [progress, setProgress] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [existing] = useState(() => getCurrentWorkspaceXml());
  const [mode, setMode] = useState<"create" | "modify">(
    existing.blockCount > 0 ? "modify" : "create"
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = request.trim();
    if (!trimmed) return;

    setStatus("loading");
    setProgress("Generating blocks…");
    setErrorMsg("");

    const isModify = mode === "modify" && existing.blockCount > 0;
    const generatePrompt = isModify
      ? `${SYSTEM_PROMPT_MODIFY}\n\nCurrent workspace XML:\n${existing.xml}\n\nUser request: ${trimmed}`
      : `${SYSTEM_PROMPT_CREATE}\n\nUser request: ${trimmed}`;

    try {
      // ── 1. Generate ─────────────────────────────────────────────
      const gen = await runOneRound(runPrompt, generatePrompt);
      if ("error" in gen) {
        setStatus("error");
        setErrorMsg(gen.error);
        return;
      }
      let xml = gen.xml;

      // Iterate up to one fix-up round, gated on field validation +
      // AI critique. Each round either accepts the XML or generates a
      // new one targeting the listed problems.
      const MAX_ROUNDS = 2;
      let lastIssuesText = "";
      for (let round = 0; round < MAX_ROUNDS; round++) {
        // ── 2. Field validate (deterministic, fast) ──────────────
        setProgress(round === 0 ? "Validating fields…" : "Re-validating fields after fix-up…");
        let dom: Element;
        try {
          dom = Blockly.utils.xml.textToDom(xml);
        } catch (err) {
          setStatus("error");
          setErrorMsg(`The AI returned malformed XML: ${String(err)}`);
          return;
        }
        const unknown = findUnknownBlockTypes(dom);
        const fieldIssues = validateVibeXml(dom);

        let issuesText = "";
        if (unknown.length > 0) {
          issuesText += `Unknown block types (replace with valid ones): ${unknown.join(", ")}\n`;
        }
        if (fieldIssues.length > 0) {
          issuesText += formatIssues(fieldIssues);
        }

        // ── 3. Critique (LLM) ────────────────────────────────────
        // Skip if we already have field issues — fix those first;
        // the critic isn't more reliable than deterministic checks.
        if (!issuesText) {
          setProgress("Reviewing for correctness…");
          const critique = await runPrompt("text", buildCriticPrompt(trimmed, xml), {
            vibeMode: true,
            critic: true,
          });
          if (critique.ok) {
            const out =
              critique.output && typeof critique.output === "object"
                ? (critique.output as { text?: unknown })
                : {};
            const verdictText = typeof out.text === "string" ? out.text : "";
            if (verdictText) {
              const verdict = parseCriticVerdict(verdictText);
              if (!verdict.ok) issuesText = verdict.issues;
            }
            // If the critic call failed or gave empty output, treat
            // it as "no opinion" — accept the XML rather than reject.
          }
        }

        // ── 4. Done? ─────────────────────────────────────────────
        if (!issuesText) break;
        lastIssuesText = issuesText;
        if (round === MAX_ROUNDS - 1) {
          // Out of fix-up budget — we still load the latest XML if
          // nothing's catastrophic, but tell the user what's off so
          // they can refine manually.
          break;
        }

        // ── 5. Fix-up ────────────────────────────────────────────
        setProgress("Refining based on review…");
        const fixup = await runOneRound(
          runPrompt,
          buildFixupPrompt(trimmed, xml, issuesText, isModify)
        );
        if ("error" in fixup) {
          // Fix-up itself failed — fall through and load whatever we
          // have, surfacing the original issues to the user.
          break;
        }
        xml = fixup.xml;
      }

      // ── 6. Load into workspace ──────────────────────────────────
      setProgress("Loading blocks…");
      const { inserted, stripped } = loadXmlIntoWorkspace(xml, isModify);
      if (inserted === 0) {
        setStatus("error");
        setErrorMsg(
          "The AI returned XML but no blocks were inserted. The XML may reference unknown block types."
        );
        return;
      }

      // Combine fix-up residual issues with any unknown blocks that
      // had to be dropped at load time — show all of it as a single
      // post-success note so the user knows exactly what's missing.
      const strippedNote =
        stripped.length > 0
          ? `Dropped unsupported block types: ${stripped.join(", ")}. ` +
            "The studio doesn't have these blocks — wire up the equivalent behavior manually if you need it."
          : "";
      const combinedNote = [strippedNote, lastIssuesText].filter(Boolean).join("\n\n");

      if (combinedNote) {
        setStatus("success");
        setErrorMsg("");
        setProgress(`Loaded with notes:\n${combinedNote}`);
      } else {
        setStatus("success");
        setProgress("");
      }
    } catch (err) {
      setStatus("error");
      setErrorMsg(String(err));
    }
  };

  return (
    <div
      className="vibe-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Vibe — AI Block Builder"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="vibe-dialog">
        <div className="vibe-header">
          <h2 className="vibe-title">✨ Vibe</h2>
          <p className="vibe-subtitle">Describe what you want to build and the AI will assemble the blocks for you.</p>
          <button type="button" className="vibe-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {status === "success" ? (
          <div className="vibe-success">
            <span className="vibe-success-icon">✅</span>
            <p>Blocks added to your workspace!</p>
            {progress && (
              <pre className="vibe-success-notes">{progress}</pre>
            )}
            <div className="vibe-success-actions">
              <button type="button" className="vibe-btn vibe-btn-primary" onClick={() => { setStatus("idle"); setRequest(""); setProgress(""); }}>
                Build more
              </button>
              <button type="button" className="vibe-btn" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="vibe-form">
            <div className="vibe-mode" role="radiogroup" aria-label="Vibe mode">
              <label className={`vibe-mode-option${mode === "create" ? " is-active" : ""}`}>
                <input
                  type="radio"
                  name="vibe-mode"
                  value="create"
                  checked={mode === "create"}
                  onChange={() => setMode("create")}
                  disabled={busy}
                />
                <span className="vibe-mode-label">Create new</span>
                <span className="vibe-mode-hint">Add fresh blocks to the workspace</span>
              </label>
              <label
                className={`vibe-mode-option${mode === "modify" ? " is-active" : ""}${
                  existing.blockCount === 0 ? " is-disabled" : ""
                }`}
                title={
                  existing.blockCount === 0
                    ? "Workspace is empty — nothing to modify yet"
                    : undefined
                }
              >
                <input
                  type="radio"
                  name="vibe-mode"
                  value="modify"
                  checked={mode === "modify"}
                  onChange={() => setMode("modify")}
                  disabled={busy || existing.blockCount === 0}
                />
                <span className="vibe-mode-label">Modify existing</span>
                <span className="vibe-mode-hint">
                  {existing.blockCount === 0
                    ? "No blocks in workspace"
                    : `Send your ${existing.blockCount} block${existing.blockCount === 1 ? "" : "s"} as context`}
                </span>
              </label>
            </div>
            <textarea
              className="vibe-textarea"
              value={request}
              onChange={(e) => { setRequest(e.target.value); setStatus("idle"); setErrorMsg(""); }}
              placeholder={
                mode === "modify"
                  ? "e.g. Add a logout button to the header, and change the welcome text to 'Hello there'..."
                  : "e.g. Create a login screen with an email input, password input, and a submit button that navigates to the home screen..."
              }
              rows={6}
              disabled={busy}
              autoFocus
            />
            {status === "error" && (
              <p className="vibe-error">{errorMsg}</p>
            )}
            {status === "loading" && progress && (
              <p className="vibe-progress">{progress}</p>
            )}
            <div className="vibe-actions">
              <button
                type="submit"
                className="vibe-btn vibe-btn-primary"
                disabled={busy || !request.trim()}
              >
                {busy
                  ? progress || "Generating…"
                  : mode === "modify"
                  ? "Update Blocks"
                  : "Generate Blocks"}
              </button>
              <button type="button" className="vibe-btn" onClick={onClose} disabled={busy}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
