import { FormEvent, useState } from "react";
import * as Blockly from "blockly";
import { useAiStore } from "../store/aiStore";
import { getVibeWorkspace } from "../blocks/vibeWorkspace";
import { extractVibeXml } from "../blocks/extractVibeXml";

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

const SYSTEM_PROMPT = `You are a WarpForge block assembler. Your ONLY job is to output valid Blockly XML that assembles blocks to fulfill the user's request.

${BLOCK_REFERENCE}

RULES:
- Output ONLY the XML — no explanation, no markdown fences, no extra text
- Start with <xml xmlns="https://developers.google.com/blockly/xml"> and end with </xml>
- Chain blocks vertically using <next> tags
- Set field values using <field name="FIELDNAME">value</field>
- Each top-level block needs x/y coordinates, e.g. <block type="..." x="20" y="20">
- Spread multiple top-level block stacks out (use y increments of ~200)
- Only use block types from the list above — never invent new ones`;

function loadXmlIntoWorkspace(xml: string): number {
  const ws = getVibeWorkspace();
  if (!ws) {
    throw new Error(
      "No active Blockly workspace to insert into. Open or create a project first."
    );
  }
  try {
    const dom = Blockly.utils.xml.textToDom(xml);
    const ids = Blockly.Xml.appendDomToWorkspace(dom, ws);
    return ids.length;
  } catch (err) {
    console.error("Failed to load vibe XML into workspace:", err);
    throw new Error(`Blockly XML load failed: ${String(err)}`);
  }
}

interface Props {
  onClose(): void;
}

export function VibeDialog({ onClose }: Props) {
  const { busy, runPrompt } = useAiStore();
  const [request, setRequest] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = request.trim();
    if (!trimmed) return;

    setStatus("loading");
    setErrorMsg("");

    const fullPrompt = `${SYSTEM_PROMPT}\n\nUser request: ${trimmed}`;

    try {
      const result = await runPrompt("text", fullPrompt, { vibeMode: true });

      if (!result.ok) {
        setStatus("error");
        setErrorMsg(
          `AI request failed: ${result.error ?? "unknown error"}\n\n` +
            `Open the AI Copilot panel and click the settings gear to configure your provider.`
        );
        return;
      }

      // For text mode, the Rust backend wraps the result as { text: "..." }.
      const out =
        result.output && typeof result.output === "object"
          ? (result.output as { text?: unknown })
          : {};
      const textContent = typeof out.text === "string" ? out.text : "";
      if (!textContent) {
        setStatus("error");
        setErrorMsg(
          `AI returned an empty response. Output: ${JSON.stringify(result.output)}`
        );
        return;
      }

      const xml = extractVibeXml(textContent);
      if (!xml) {
        console.error("Failed to extract XML from AI response:", textContent);
        setStatus("error");
        setErrorMsg(
          "The AI didn't return valid Blockly XML. Try rephrasing your request.\n\n" +
            `Response preview: ${textContent.substring(0, 300)}${
              textContent.length > 300 ? "..." : ""
            }`
        );
        return;
      }

      const inserted = loadXmlIntoWorkspace(xml);
      if (inserted === 0) {
        setStatus("error");
        setErrorMsg(
          "The AI returned XML but no blocks were inserted. The XML may reference unknown block types."
        );
        return;
      }
      setStatus("success");
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
            <div className="vibe-success-actions">
              <button type="button" className="vibe-btn vibe-btn-primary" onClick={() => { setStatus("idle"); setRequest(""); }}>
                Build more
              </button>
              <button type="button" className="vibe-btn" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="vibe-form">
            <textarea
              className="vibe-textarea"
              value={request}
              onChange={(e) => { setRequest(e.target.value); setStatus("idle"); setErrorMsg(""); }}
              placeholder="e.g. Create a login screen with an email input, password input, and a submit button that navigates to the home screen..."
              rows={6}
              disabled={busy}
              autoFocus
            />
            {status === "error" && (
              <p className="vibe-error">{errorMsg}</p>
            )}
            <div className="vibe-actions">
              <button
                type="submit"
                className="vibe-btn vibe-btn-primary"
                disabled={busy || !request.trim()}
              >
                {busy ? "Generating..." : "Generate Blocks"}
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
