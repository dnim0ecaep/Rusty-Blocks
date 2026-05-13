import * as Blockly from "blockly";

let registered = false;

/**
 * Attach a default `<shadow>` to a block's value input so the user
 * sees an editable field instead of an empty round socket. Without
 * this, a freshly-dragged block with a `valueInput` rejects keyboard
 * input — the user can only plug in a reporter. Scratch's standard
 * `say [Hello!]` ships shadows in its toolbox XML for the same
 * reason; we use an init-time extension because our toolbox builder
 * emits plain `<block type="…">` entries.
 */
function attachShadow(
  block: Blockly.Block,
  inputName: string,
  shadowXml: string
): void {
  const input = block.getInput(inputName);
  if (!input || !input.connection) return;
  // Don't clobber an existing shadow (e.g. loaded from saved XML).
  if (input.connection.getShadowDom()) return;
  const dom = Blockly.utils.xml.textToDom(shadowXml);
  input.connection.setShadowDom(dom);
}

const textShadow = (value = ""): string =>
  `<shadow type="text"><field name="TEXT">${value}</field></shadow>`;
const numberShadow = (value: number): string =>
  `<shadow type="math_number"><field name="NUM">${value}</field></shadow>`;

export function registerWarpforgeMutators() {
  if (registered) {
    return;
  }

  Blockly.Extensions.register("wf_event_tooltip", function eventTooltipExtension(this: Blockly.Block) {
    this.setTooltip("Event blocks trigger action flows");
  });

  Blockly.Extensions.registerMutator("wf_noop_mutator", {
    saveExtraState() {
      return {};
    },
    loadExtraState() {
      return;
    }
  });

  // Default shadows on the dynamic-text family so the value sockets
  // accept keyboard input out of the box. Sensible literals so the
  // sprite renders something visible the moment the block is dragged
  // — paired with the authoring preview in stageStore, the user sees
  // immediate feedback without ever pressing the flag.
  Blockly.Extensions.register("wf_text_input_default", function (this: Blockly.Block) {
    attachShadow(this, "TEXT", textShadow("Hello"));
  });
  Blockly.Extensions.register("wf_text_font_default", function (this: Blockly.Block) {
    attachShadow(this, "TEXT", textShadow("Hello"));
    attachShadow(this, "FONT", textShadow("Georgia"));
  });
  Blockly.Extensions.register("wf_text_size_default", function (this: Blockly.Block) {
    attachShadow(this, "SIZE", numberShadow(24));
  });

  // Same fix for `scratch_io_open_url` — its URL input has been a
  // value socket since the per-entry URL launch landed, and without
  // a shadow the user can't type a URL directly into the block.
  Blockly.Extensions.register("wf_open_url_default", function (this: Blockly.Block) {
    attachShadow(this, "URL", textShadow("https://example.com"));
  });

  registered = true;
}
