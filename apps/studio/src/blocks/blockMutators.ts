import * as Blockly from "blockly";

let registered = false;

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

  registered = true;
}
