/**
 * Scratch / TurboWarp primitive blocks.
 *
 * These are the core Scratch 3 motion / looks / sound / events / control /
 * sensing / operators / variables blocks ("move 10 steps", "say Hello!",
 * "when ⚑ clicked", etc.). They're modeled here as real Blockly block
 * definitions so users can drag them onto the workspace, with shape and
 * coloring chosen to match Scratch.
 *
 * The full Scratch runtime semantics are intentionally out of scope —
 * WarpForge captures these as IR nodes for export, not for live execution.
 */

import * as Blockly from "blockly";

export interface ScratchPrimitiveSpec {
  /** Block-type identifier registered with Blockly. Convention: `scratch_<category>_<verb>`. */
  type: string;
  /** Human-readable label shown in the Block Organizer. */
  label: string;
  /** One of the eight Scratch categories: Motion, Looks, Sound, Events, Control, Sensing, Operators, Variables. */
  category:
    | "Motion"
    | "Looks"
    | "Sound"
    | "Events"
    | "Control"
    | "Sensing"
    | "Operators"
    | "Variables";
}

const KEY_OPTIONS: Array<[string, string]> = [
  ["space", "space"],
  ["any", "any"],
  ["up arrow", "up"],
  ["down arrow", "down"],
  ["right arrow", "right"],
  ["left arrow", "left"],
  ["enter", "enter"],
  ["a", "a"],
  ["b", "b"],
  ["c", "c"],
];

const ROTATION_STYLE_OPTIONS: Array<[string, string]> = [
  ["left-right", "left-right"],
  ["don't rotate", "dont-rotate"],
  ["all around", "all-around"],
];

const STOP_OPTIONS: Array<[string, string]> = [
  ["all", "all"],
  ["this script", "this-script"],
  ["other scripts in sprite", "other-scripts"],
];

const LAYER_OPTIONS: Array<[string, string]> = [
  ["front", "front"],
  ["back", "back"],
];

const EFFECT_OPTIONS: Array<[string, string]> = [
  ["color", "color"],
  ["fisheye", "fisheye"],
  ["whirl", "whirl"],
  ["pixelate", "pixelate"],
  ["mosaic", "mosaic"],
  ["brightness", "brightness"],
  ["ghost", "ghost"],
];

const MATH_OP_OPTIONS: Array<[string, string]> = [
  ["abs", "abs"],
  ["floor", "floor"],
  ["ceiling", "ceiling"],
  ["sqrt", "sqrt"],
  ["sin", "sin"],
  ["cos", "cos"],
  ["tan", "tan"],
  ["ln", "ln"],
  ["log", "log"],
  ["e ^", "e^"],
  ["10 ^", "10^"],
];

const BACKDROP_DROPDOWN_OPTIONS: Array<[string, string]> = [
  ["next backdrop", "next backdrop"],
  ["previous backdrop", "previous backdrop"],
  ["random backdrop", "random backdrop"],
];

interface BlockDef extends ScratchPrimitiveSpec {
  json: Record<string, unknown>;
}

function num(value = 0) {
  return { type: "field_number", value };
}

function text(value = "") {
  return { type: "field_input", text: value };
}

function dropdown(name: string, options: Array<[string, string]>) {
  return { type: "field_dropdown", name, options };
}

function valueInput(name: string, check?: string | string[]) {
  const inp: Record<string, unknown> = { type: "input_value", name };
  if (check) inp.check = check;
  return inp;
}

function statementInput(name: string) {
  return { type: "input_statement", name };
}

const BLOCKS: BlockDef[] = [
  // ── Motion ─────────────────────────────────────────────────────────────
  {
    type: "scratch_motion_move_steps",
    label: "Move N steps",
    category: "Motion",
    json: {
      type: "scratch_motion_move_steps",
      message0: "move %1 steps",
      args0: [{ ...num(10), name: "STEPS" }],
      previousStatement: null,
      nextStatement: null,
      style: "motion_blocks",
      tooltip: "Move the sprite forward N steps in its current direction",
    },
  },
  {
    type: "scratch_motion_turn_right",
    label: "Turn ↻ (right)",
    category: "Motion",
    json: {
      type: "scratch_motion_turn_right",
      message0: "turn ↻ %1 degrees",
      args0: [{ ...num(15), name: "DEGREES" }],
      previousStatement: null,
      nextStatement: null,
      style: "motion_blocks",
      tooltip: "Rotate the sprite clockwise",
    },
  },
  {
    type: "scratch_motion_turn_left",
    label: "Turn ↺ (left)",
    category: "Motion",
    json: {
      type: "scratch_motion_turn_left",
      message0: "turn ↺ %1 degrees",
      args0: [{ ...num(15), name: "DEGREES" }],
      previousStatement: null,
      nextStatement: null,
      style: "motion_blocks",
      tooltip: "Rotate the sprite counter-clockwise",
    },
  },
  {
    type: "scratch_motion_goto_xy",
    label: "Go to x/y",
    category: "Motion",
    json: {
      type: "scratch_motion_goto_xy",
      message0: "go to x: %1 y: %2",
      args0: [
        { ...num(0), name: "X" },
        { ...num(0), name: "Y" },
      ],
      previousStatement: null,
      nextStatement: null,
      style: "motion_blocks",
    },
  },
  {
    type: "scratch_motion_glide_xy",
    label: "Glide to x/y",
    category: "Motion",
    json: {
      type: "scratch_motion_glide_xy",
      message0: "glide %1 secs to x: %2 y: %3",
      args0: [
        { ...num(1), name: "SECS" },
        { ...num(0), name: "X" },
        { ...num(0), name: "Y" },
      ],
      previousStatement: null,
      nextStatement: null,
      style: "motion_blocks",
    },
  },
  {
    type: "scratch_motion_point_in_direction",
    label: "Point in direction",
    category: "Motion",
    json: {
      type: "scratch_motion_point_in_direction",
      message0: "point in direction %1",
      args0: [{ ...num(90), name: "DIRECTION" }],
      previousStatement: null,
      nextStatement: null,
      style: "motion_blocks",
    },
  },
  {
    type: "scratch_motion_change_x",
    label: "Change x",
    category: "Motion",
    json: {
      type: "scratch_motion_change_x",
      message0: "change x by %1",
      args0: [{ ...num(10), name: "DX" }],
      previousStatement: null,
      nextStatement: null,
      style: "motion_blocks",
    },
  },
  {
    type: "scratch_motion_set_x",
    label: "Set x",
    category: "Motion",
    json: {
      type: "scratch_motion_set_x",
      message0: "set x to %1",
      args0: [{ ...num(0), name: "X" }],
      previousStatement: null,
      nextStatement: null,
      style: "motion_blocks",
    },
  },
  {
    type: "scratch_motion_change_y",
    label: "Change y",
    category: "Motion",
    json: {
      type: "scratch_motion_change_y",
      message0: "change y by %1",
      args0: [{ ...num(10), name: "DY" }],
      previousStatement: null,
      nextStatement: null,
      style: "motion_blocks",
    },
  },
  {
    type: "scratch_motion_set_y",
    label: "Set y",
    category: "Motion",
    json: {
      type: "scratch_motion_set_y",
      message0: "set y to %1",
      args0: [{ ...num(0), name: "Y" }],
      previousStatement: null,
      nextStatement: null,
      style: "motion_blocks",
    },
  },
  {
    type: "scratch_motion_if_on_edge_bounce",
    label: "If on edge, bounce",
    category: "Motion",
    json: {
      type: "scratch_motion_if_on_edge_bounce",
      message0: "if on edge, bounce",
      previousStatement: null,
      nextStatement: null,
      style: "motion_blocks",
    },
  },
  {
    type: "scratch_motion_set_rotation_style",
    label: "Set rotation style",
    category: "Motion",
    json: {
      type: "scratch_motion_set_rotation_style",
      message0: "set rotation style %1",
      args0: [dropdown("STYLE", ROTATION_STYLE_OPTIONS)],
      previousStatement: null,
      nextStatement: null,
      style: "motion_blocks",
    },
  },
  {
    type: "scratch_motion_x_position",
    label: "x position (reporter)",
    category: "Motion",
    json: {
      type: "scratch_motion_x_position",
      message0: "x position",
      output: "Number",
      style: "motion_blocks",
    },
  },
  {
    type: "scratch_motion_y_position",
    label: "y position (reporter)",
    category: "Motion",
    json: {
      type: "scratch_motion_y_position",
      message0: "y position",
      output: "Number",
      style: "motion_blocks",
    },
  },
  {
    type: "scratch_motion_direction",
    label: "direction (reporter)",
    category: "Motion",
    json: {
      type: "scratch_motion_direction",
      message0: "direction",
      output: "Number",
      style: "motion_blocks",
    },
  },

  // ── Looks ──────────────────────────────────────────────────────────────
  {
    type: "scratch_looks_say",
    label: "Say",
    category: "Looks",
    json: {
      type: "scratch_looks_say",
      message0: "say %1",
      args0: [{ ...text("Hello!"), name: "MESSAGE" }],
      previousStatement: null,
      nextStatement: null,
      style: "looks_blocks",
    },
  },
  {
    type: "scratch_looks_say_for_secs",
    label: "Say for N seconds",
    category: "Looks",
    json: {
      type: "scratch_looks_say_for_secs",
      message0: "say %1 for %2 seconds",
      args0: [
        { ...text("Hello!"), name: "MESSAGE" },
        { ...num(2), name: "SECS" },
      ],
      previousStatement: null,
      nextStatement: null,
      style: "looks_blocks",
    },
  },
  {
    type: "scratch_looks_think",
    label: "Think",
    category: "Looks",
    json: {
      type: "scratch_looks_think",
      message0: "think %1",
      args0: [{ ...text("Hmm…"), name: "MESSAGE" }],
      previousStatement: null,
      nextStatement: null,
      style: "looks_blocks",
    },
  },
  {
    type: "scratch_looks_think_for_secs",
    label: "Think for N seconds",
    category: "Looks",
    json: {
      type: "scratch_looks_think_for_secs",
      message0: "think %1 for %2 seconds",
      args0: [
        { ...text("Hmm…"), name: "MESSAGE" },
        { ...num(2), name: "SECS" },
      ],
      previousStatement: null,
      nextStatement: null,
      style: "looks_blocks",
    },
  },
  {
    type: "scratch_looks_switch_costume",
    label: "Switch costume",
    category: "Looks",
    json: {
      type: "scratch_looks_switch_costume",
      message0: "switch costume to %1",
      args0: [{ ...text("costume1"), name: "COSTUME" }],
      previousStatement: null,
      nextStatement: null,
      style: "looks_blocks",
    },
  },
  {
    type: "scratch_looks_next_costume",
    label: "Next costume",
    category: "Looks",
    json: {
      type: "scratch_looks_next_costume",
      message0: "next costume",
      previousStatement: null,
      nextStatement: null,
      style: "looks_blocks",
    },
  },
  {
    type: "scratch_looks_switch_backdrop",
    label: "Switch backdrop",
    category: "Looks",
    json: {
      type: "scratch_looks_switch_backdrop",
      message0: "switch backdrop to %1",
      args0: [dropdown("BACKDROP", BACKDROP_DROPDOWN_OPTIONS)],
      previousStatement: null,
      nextStatement: null,
      style: "looks_blocks",
    },
  },
  {
    type: "scratch_looks_change_size",
    label: "Change size",
    category: "Looks",
    json: {
      type: "scratch_looks_change_size",
      message0: "change size by %1",
      args0: [{ ...num(10), name: "DSIZE" }],
      previousStatement: null,
      nextStatement: null,
      style: "looks_blocks",
    },
  },
  {
    type: "scratch_looks_set_size",
    label: "Set size %",
    category: "Looks",
    json: {
      type: "scratch_looks_set_size",
      message0: "set size to %1 %",
      args0: [{ ...num(100), name: "SIZE" }],
      previousStatement: null,
      nextStatement: null,
      style: "looks_blocks",
    },
  },
  {
    type: "scratch_looks_show",
    label: "Show",
    category: "Looks",
    json: {
      type: "scratch_looks_show",
      message0: "show",
      previousStatement: null,
      nextStatement: null,
      style: "looks_blocks",
    },
  },
  {
    type: "scratch_looks_hide",
    label: "Hide",
    category: "Looks",
    json: {
      type: "scratch_looks_hide",
      message0: "hide",
      previousStatement: null,
      nextStatement: null,
      style: "looks_blocks",
    },
  },
  {
    type: "scratch_looks_change_effect_by",
    label: "Change graphic effect by",
    category: "Looks",
    json: {
      type: "scratch_looks_change_effect_by",
      message0: "change %1 effect by %2",
      args0: [dropdown("EFFECT", EFFECT_OPTIONS), { ...num(25), name: "VALUE" }],
      previousStatement: null,
      nextStatement: null,
      style: "looks_blocks",
    },
  },
  {
    type: "scratch_looks_set_effect_to",
    label: "Set graphic effect to",
    category: "Looks",
    json: {
      type: "scratch_looks_set_effect_to",
      message0: "set %1 effect to %2",
      args0: [dropdown("EFFECT", EFFECT_OPTIONS), { ...num(0), name: "VALUE" }],
      previousStatement: null,
      nextStatement: null,
      style: "looks_blocks",
    },
  },
  {
    type: "scratch_looks_clear_effects",
    label: "Clear graphic effects",
    category: "Looks",
    json: {
      type: "scratch_looks_clear_effects",
      message0: "clear graphic effects",
      previousStatement: null,
      nextStatement: null,
      style: "looks_blocks",
    },
  },
  {
    type: "scratch_looks_go_to_layer",
    label: "Go to front/back layer",
    category: "Looks",
    json: {
      type: "scratch_looks_go_to_layer",
      message0: "go to %1 layer",
      args0: [dropdown("LAYER", LAYER_OPTIONS)],
      previousStatement: null,
      nextStatement: null,
      style: "looks_blocks",
    },
  },
  {
    type: "scratch_looks_costume_number",
    label: "costume # (reporter)",
    category: "Looks",
    json: {
      type: "scratch_looks_costume_number",
      message0: "costume #",
      output: "Number",
      style: "looks_blocks",
    },
  },
  {
    type: "scratch_looks_size",
    label: "size (reporter)",
    category: "Looks",
    json: {
      type: "scratch_looks_size",
      message0: "size",
      output: "Number",
      style: "looks_blocks",
    },
  },

  // ── Sound ──────────────────────────────────────────────────────────────
  {
    type: "scratch_sound_play_until_done",
    label: "Play sound until done",
    category: "Sound",
    json: {
      type: "scratch_sound_play_until_done",
      message0: "play sound %1 until done",
      args0: [{ ...text("Meow"), name: "SOUND" }],
      previousStatement: null,
      nextStatement: null,
      style: "sound_blocks",
    },
  },
  {
    type: "scratch_sound_play",
    label: "Start sound",
    category: "Sound",
    json: {
      type: "scratch_sound_play",
      message0: "start sound %1",
      args0: [{ ...text("Meow"), name: "SOUND" }],
      previousStatement: null,
      nextStatement: null,
      style: "sound_blocks",
    },
  },
  {
    type: "scratch_sound_stop_all",
    label: "Stop all sounds",
    category: "Sound",
    json: {
      type: "scratch_sound_stop_all",
      message0: "stop all sounds",
      previousStatement: null,
      nextStatement: null,
      style: "sound_blocks",
    },
  },
  {
    type: "scratch_sound_change_volume",
    label: "Change volume",
    category: "Sound",
    json: {
      type: "scratch_sound_change_volume",
      message0: "change volume by %1",
      args0: [{ ...num(-10), name: "DVOLUME" }],
      previousStatement: null,
      nextStatement: null,
      style: "sound_blocks",
    },
  },
  {
    type: "scratch_sound_set_volume",
    label: "Set volume %",
    category: "Sound",
    json: {
      type: "scratch_sound_set_volume",
      message0: "set volume to %1 %",
      args0: [{ ...num(100), name: "VOLUME" }],
      previousStatement: null,
      nextStatement: null,
      style: "sound_blocks",
    },
  },
  {
    type: "scratch_sound_volume",
    label: "volume (reporter)",
    category: "Sound",
    json: {
      type: "scratch_sound_volume",
      message0: "volume",
      output: "Number",
      style: "sound_blocks",
    },
  },

  // ── Events ─────────────────────────────────────────────────────────────
  {
    type: "scratch_event_when_flag_clicked",
    label: "When ⚑ clicked",
    category: "Events",
    json: {
      type: "scratch_event_when_flag_clicked",
      message0: "when ⚑ clicked",
      nextStatement: null,
      style: "events_blocks",
    },
  },
  {
    type: "scratch_event_when_key_pressed",
    label: "When key pressed",
    category: "Events",
    json: {
      type: "scratch_event_when_key_pressed",
      message0: "when %1 key pressed",
      args0: [dropdown("KEY", KEY_OPTIONS)],
      nextStatement: null,
      style: "events_blocks",
    },
  },
  {
    type: "scratch_event_when_this_sprite_clicked",
    label: "When this sprite clicked",
    category: "Events",
    json: {
      type: "scratch_event_when_this_sprite_clicked",
      message0: "when this sprite clicked",
      nextStatement: null,
      style: "events_blocks",
    },
  },
  {
    type: "scratch_event_when_backdrop_switches",
    label: "When backdrop switches",
    category: "Events",
    json: {
      type: "scratch_event_when_backdrop_switches",
      message0: "when backdrop switches to %1",
      args0: [{ ...text("backdrop1"), name: "BACKDROP" }],
      nextStatement: null,
      style: "events_blocks",
    },
  },
  {
    type: "scratch_event_when_i_receive",
    label: "When I receive",
    category: "Events",
    json: {
      type: "scratch_event_when_i_receive",
      message0: "when I receive %1",
      args0: [{ ...text("message1"), name: "BROADCAST" }],
      nextStatement: null,
      style: "events_blocks",
    },
  },
  {
    type: "scratch_event_broadcast",
    label: "Broadcast",
    category: "Events",
    json: {
      type: "scratch_event_broadcast",
      message0: "broadcast %1",
      args0: [{ ...text("message1"), name: "BROADCAST" }],
      previousStatement: null,
      nextStatement: null,
      style: "events_blocks",
    },
  },
  {
    type: "scratch_event_broadcast_and_wait",
    label: "Broadcast and wait",
    category: "Events",
    json: {
      type: "scratch_event_broadcast_and_wait",
      message0: "broadcast %1 and wait",
      args0: [{ ...text("message1"), name: "BROADCAST" }],
      previousStatement: null,
      nextStatement: null,
      style: "events_blocks",
    },
  },

  // ── Control ────────────────────────────────────────────────────────────
  {
    type: "scratch_control_wait",
    label: "Wait N seconds",
    category: "Control",
    json: {
      type: "scratch_control_wait",
      message0: "wait %1 seconds",
      args0: [{ ...num(1), name: "SECS" }],
      previousStatement: null,
      nextStatement: null,
      style: "control_blocks",
    },
  },
  {
    type: "scratch_control_repeat",
    label: "Repeat N times",
    category: "Control",
    json: {
      type: "scratch_control_repeat",
      message0: "repeat %1 %2 %3",
      args0: [
        { ...num(10), name: "TIMES" },
        { type: "input_dummy" },
        statementInput("DO"),
      ],
      previousStatement: null,
      nextStatement: null,
      style: "control_blocks",
    },
  },
  {
    type: "scratch_control_forever",
    label: "Forever",
    category: "Control",
    json: {
      type: "scratch_control_forever",
      message0: "forever %1 %2",
      args0: [{ type: "input_dummy" }, statementInput("DO")],
      previousStatement: null,
      style: "control_blocks",
    },
  },
  {
    type: "scratch_control_if",
    label: "If…then",
    category: "Control",
    json: {
      type: "scratch_control_if",
      message0: "if %1 then %2 %3",
      args0: [
        valueInput("CONDITION", "Boolean"),
        { type: "input_dummy" },
        statementInput("DO"),
      ],
      previousStatement: null,
      nextStatement: null,
      style: "control_blocks",
    },
  },
  {
    type: "scratch_control_if_else",
    label: "If…then…else",
    category: "Control",
    json: {
      type: "scratch_control_if_else",
      message0: "if %1 then %2 %3 else %4 %5",
      args0: [
        valueInput("CONDITION", "Boolean"),
        { type: "input_dummy" },
        statementInput("DO"),
        { type: "input_dummy" },
        statementInput("ELSE"),
      ],
      previousStatement: null,
      nextStatement: null,
      style: "control_blocks",
    },
  },
  {
    type: "scratch_control_wait_until",
    label: "Wait until",
    category: "Control",
    json: {
      type: "scratch_control_wait_until",
      message0: "wait until %1",
      args0: [valueInput("CONDITION", "Boolean")],
      previousStatement: null,
      nextStatement: null,
      style: "control_blocks",
    },
  },
  {
    type: "scratch_control_repeat_until",
    label: "Repeat until",
    category: "Control",
    json: {
      type: "scratch_control_repeat_until",
      message0: "repeat until %1 %2 %3",
      args0: [
        valueInput("CONDITION", "Boolean"),
        { type: "input_dummy" },
        statementInput("DO"),
      ],
      previousStatement: null,
      nextStatement: null,
      style: "control_blocks",
    },
  },
  {
    type: "scratch_control_stop",
    label: "Stop",
    category: "Control",
    json: {
      type: "scratch_control_stop",
      message0: "stop %1",
      args0: [dropdown("STOP_OPTION", STOP_OPTIONS)],
      previousStatement: null,
      style: "control_blocks",
    },
  },
  {
    type: "scratch_control_create_clone_of",
    label: "Create clone of",
    category: "Control",
    json: {
      type: "scratch_control_create_clone_of",
      message0: "create clone of %1",
      args0: [{ ...text("myself"), name: "TARGET" }],
      previousStatement: null,
      nextStatement: null,
      style: "control_blocks",
    },
  },
  {
    type: "scratch_control_delete_this_clone",
    label: "Delete this clone",
    category: "Control",
    json: {
      type: "scratch_control_delete_this_clone",
      message0: "delete this clone",
      previousStatement: null,
      style: "control_blocks",
    },
  },
  {
    type: "scratch_control_when_i_start_as_clone",
    label: "When I start as a clone",
    category: "Control",
    json: {
      type: "scratch_control_when_i_start_as_clone",
      message0: "when I start as a clone",
      nextStatement: null,
      style: "control_blocks",
    },
  },

  // ── Sensing ────────────────────────────────────────────────────────────
  {
    type: "scratch_sensing_touching",
    label: "Touching ___? (reporter)",
    category: "Sensing",
    json: {
      type: "scratch_sensing_touching",
      message0: "touching %1 ?",
      args0: [{ ...text("edge"), name: "TARGET" }],
      output: "Boolean",
      style: "sensing_blocks",
    },
  },
  // `scratch_sensing_touching_color` is intentionally not registered.
  // Implementing it correctly requires sampling pixels from the rendered
  // stage canvas (rasterize every visible sprite + backdrop, then read
  // the pixel at the asking sprite's bounding box and compare to the
  // user-picked color with tolerance). Until that runtime support
  // lands, exposing the block in the toolbox would silently return
  // false — worse than not offering it. Restore this entry once the
  // interpreter has a `getStagePixel(x, y)` hook.
  {
    type: "scratch_sensing_distance_to",
    label: "Distance to (reporter)",
    category: "Sensing",
    json: {
      type: "scratch_sensing_distance_to",
      message0: "distance to %1",
      args0: [{ ...text("mouse-pointer"), name: "TARGET" }],
      output: "Number",
      style: "sensing_blocks",
    },
  },
  {
    type: "scratch_sensing_ask_and_wait",
    label: "Ask and wait",
    category: "Sensing",
    json: {
      type: "scratch_sensing_ask_and_wait",
      message0: "ask %1 and wait",
      args0: [{ ...text("What's your name?"), name: "QUESTION" }],
      previousStatement: null,
      nextStatement: null,
      style: "sensing_blocks",
    },
  },
  {
    type: "scratch_sensing_answer",
    label: "answer (reporter)",
    category: "Sensing",
    json: {
      type: "scratch_sensing_answer",
      message0: "answer",
      output: "String",
      style: "sensing_blocks",
    },
  },
  {
    type: "scratch_sensing_key_pressed",
    label: "Key pressed? (reporter)",
    category: "Sensing",
    json: {
      type: "scratch_sensing_key_pressed",
      message0: "key %1 pressed?",
      args0: [dropdown("KEY", KEY_OPTIONS)],
      output: "Boolean",
      style: "sensing_blocks",
    },
  },
  {
    type: "scratch_sensing_mouse_down",
    label: "Mouse down? (reporter)",
    category: "Sensing",
    json: {
      type: "scratch_sensing_mouse_down",
      message0: "mouse down?",
      output: "Boolean",
      style: "sensing_blocks",
    },
  },
  {
    type: "scratch_sensing_mouse_x",
    label: "mouse x (reporter)",
    category: "Sensing",
    json: {
      type: "scratch_sensing_mouse_x",
      message0: "mouse x",
      output: "Number",
      style: "sensing_blocks",
    },
  },
  {
    type: "scratch_sensing_mouse_y",
    label: "mouse y (reporter)",
    category: "Sensing",
    json: {
      type: "scratch_sensing_mouse_y",
      message0: "mouse y",
      output: "Number",
      style: "sensing_blocks",
    },
  },
  {
    type: "scratch_sensing_timer",
    label: "timer (reporter)",
    category: "Sensing",
    json: {
      type: "scratch_sensing_timer",
      message0: "timer",
      output: "Number",
      style: "sensing_blocks",
    },
  },
  {
    type: "scratch_sensing_reset_timer",
    label: "Reset timer",
    category: "Sensing",
    json: {
      type: "scratch_sensing_reset_timer",
      message0: "reset timer",
      previousStatement: null,
      nextStatement: null,
      style: "sensing_blocks",
    },
  },

  // ── Operators ──────────────────────────────────────────────────────────
  {
    type: "scratch_op_add",
    label: "+ (reporter)",
    category: "Operators",
    json: {
      type: "scratch_op_add",
      message0: "%1 + %2",
      args0: [valueInput("A", "Number"), valueInput("B", "Number")],
      output: "Number",
      style: "operators_blocks",
      inputsInline: true,
    },
  },
  {
    type: "scratch_op_subtract",
    label: "− (reporter)",
    category: "Operators",
    json: {
      type: "scratch_op_subtract",
      message0: "%1 - %2",
      args0: [valueInput("A", "Number"), valueInput("B", "Number")],
      output: "Number",
      style: "operators_blocks",
      inputsInline: true,
    },
  },
  {
    type: "scratch_op_multiply",
    label: "× (reporter)",
    category: "Operators",
    json: {
      type: "scratch_op_multiply",
      message0: "%1 * %2",
      args0: [valueInput("A", "Number"), valueInput("B", "Number")],
      output: "Number",
      style: "operators_blocks",
      inputsInline: true,
    },
  },
  {
    type: "scratch_op_divide",
    label: "÷ (reporter)",
    category: "Operators",
    json: {
      type: "scratch_op_divide",
      message0: "%1 / %2",
      args0: [valueInput("A", "Number"), valueInput("B", "Number")],
      output: "Number",
      style: "operators_blocks",
      inputsInline: true,
    },
  },
  {
    type: "scratch_op_random",
    label: "Pick random",
    category: "Operators",
    json: {
      type: "scratch_op_random",
      message0: "pick random %1 to %2",
      args0: [
        { ...num(1), name: "FROM" },
        { ...num(10), name: "TO" },
      ],
      output: "Number",
      style: "operators_blocks",
      inputsInline: true,
    },
  },
  {
    type: "scratch_op_lt",
    label: "< (reporter)",
    category: "Operators",
    json: {
      type: "scratch_op_lt",
      message0: "%1 < %2",
      args0: [valueInput("A"), valueInput("B")],
      output: "Boolean",
      style: "operators_blocks",
      inputsInline: true,
    },
  },
  {
    type: "scratch_op_eq",
    label: "= (reporter)",
    category: "Operators",
    json: {
      type: "scratch_op_eq",
      message0: "%1 = %2",
      args0: [valueInput("A"), valueInput("B")],
      output: "Boolean",
      style: "operators_blocks",
      inputsInline: true,
    },
  },
  {
    type: "scratch_op_gt",
    label: "> (reporter)",
    category: "Operators",
    json: {
      type: "scratch_op_gt",
      message0: "%1 > %2",
      args0: [valueInput("A"), valueInput("B")],
      output: "Boolean",
      style: "operators_blocks",
      inputsInline: true,
    },
  },
  {
    type: "scratch_op_and",
    label: "and (reporter)",
    category: "Operators",
    json: {
      type: "scratch_op_and",
      message0: "%1 and %2",
      args0: [valueInput("A", "Boolean"), valueInput("B", "Boolean")],
      output: "Boolean",
      style: "operators_blocks",
      inputsInline: true,
    },
  },
  {
    type: "scratch_op_or",
    label: "or (reporter)",
    category: "Operators",
    json: {
      type: "scratch_op_or",
      message0: "%1 or %2",
      args0: [valueInput("A", "Boolean"), valueInput("B", "Boolean")],
      output: "Boolean",
      style: "operators_blocks",
      inputsInline: true,
    },
  },
  {
    type: "scratch_op_not",
    label: "not (reporter)",
    category: "Operators",
    json: {
      type: "scratch_op_not",
      message0: "not %1",
      args0: [valueInput("A", "Boolean")],
      output: "Boolean",
      style: "operators_blocks",
    },
  },
  {
    type: "scratch_op_join",
    label: "Join text (reporter)",
    category: "Operators",
    json: {
      type: "scratch_op_join",
      message0: "join %1 %2",
      args0: [
        { ...text("hello "), name: "A" },
        { ...text("world"), name: "B" },
      ],
      output: "String",
      style: "operators_blocks",
      inputsInline: true,
    },
  },
  {
    type: "scratch_op_letter_of",
    label: "Letter of (reporter)",
    category: "Operators",
    json: {
      type: "scratch_op_letter_of",
      message0: "letter %1 of %2",
      args0: [
        { ...num(1), name: "INDEX" },
        { ...text("world"), name: "STRING" },
      ],
      output: "String",
      style: "operators_blocks",
      inputsInline: true,
    },
  },
  {
    type: "scratch_op_length_of",
    label: "Length of (reporter)",
    category: "Operators",
    json: {
      type: "scratch_op_length_of",
      message0: "length of %1",
      args0: [{ ...text("world"), name: "STRING" }],
      output: "Number",
      style: "operators_blocks",
    },
  },
  {
    type: "scratch_op_contains",
    label: "Contains? (reporter)",
    category: "Operators",
    json: {
      type: "scratch_op_contains",
      message0: "%1 contains %2 ?",
      args0: [
        { ...text("hello"), name: "STRING" },
        { ...text("ll"), name: "SUBSTRING" },
      ],
      output: "Boolean",
      style: "operators_blocks",
      inputsInline: true,
    },
  },
  {
    type: "scratch_op_mod",
    label: "mod (reporter)",
    category: "Operators",
    json: {
      type: "scratch_op_mod",
      message0: "%1 mod %2",
      args0: [valueInput("A", "Number"), valueInput("B", "Number")],
      output: "Number",
      style: "operators_blocks",
      inputsInline: true,
    },
  },
  {
    type: "scratch_op_round",
    label: "round (reporter)",
    category: "Operators",
    json: {
      type: "scratch_op_round",
      message0: "round %1",
      args0: [valueInput("VALUE", "Number")],
      output: "Number",
      style: "operators_blocks",
    },
  },
  {
    type: "scratch_op_math_op",
    label: "Math fn (reporter)",
    category: "Operators",
    json: {
      type: "scratch_op_math_op",
      message0: "%1 of %2",
      args0: [dropdown("OP", MATH_OP_OPTIONS), valueInput("VALUE", "Number")],
      output: "Number",
      style: "operators_blocks",
      inputsInline: true,
    },
  },

  // ── Variables / Lists ──────────────────────────────────────────────────
  {
    type: "scratch_data_set_variable",
    label: "Set variable",
    category: "Variables",
    json: {
      type: "scratch_data_set_variable",
      message0: "set %1 to %2",
      args0: [
        { ...text("my variable"), name: "VARIABLE" },
        { ...text("0"), name: "VALUE" },
      ],
      previousStatement: null,
      nextStatement: null,
      style: "variables_blocks",
    },
  },
  {
    type: "scratch_data_change_variable",
    label: "Change variable",
    category: "Variables",
    json: {
      type: "scratch_data_change_variable",
      message0: "change %1 by %2",
      args0: [
        { ...text("my variable"), name: "VARIABLE" },
        { ...num(1), name: "VALUE" },
      ],
      previousStatement: null,
      nextStatement: null,
      style: "variables_blocks",
    },
  },
  {
    type: "scratch_data_show_variable",
    label: "Show variable",
    category: "Variables",
    json: {
      type: "scratch_data_show_variable",
      message0: "show variable %1",
      args0: [{ ...text("my variable"), name: "VARIABLE" }],
      previousStatement: null,
      nextStatement: null,
      style: "variables_blocks",
    },
  },
  {
    type: "scratch_data_hide_variable",
    label: "Hide variable",
    category: "Variables",
    json: {
      type: "scratch_data_hide_variable",
      message0: "hide variable %1",
      args0: [{ ...text("my variable"), name: "VARIABLE" }],
      previousStatement: null,
      nextStatement: null,
      style: "variables_blocks",
    },
  },
  {
    type: "scratch_data_add_to_list",
    label: "Add to list",
    category: "Variables",
    json: {
      type: "scratch_data_add_to_list",
      message0: "add %1 to %2",
      args0: [
        { ...text("thing"), name: "ITEM" },
        { ...text("my list"), name: "LIST" },
      ],
      previousStatement: null,
      nextStatement: null,
      style: "variables_blocks",
    },
  },
  {
    type: "scratch_data_delete_from_list",
    label: "Delete from list",
    category: "Variables",
    json: {
      type: "scratch_data_delete_from_list",
      message0: "delete %1 of %2",
      args0: [
        { ...num(1), name: "INDEX" },
        { ...text("my list"), name: "LIST" },
      ],
      previousStatement: null,
      nextStatement: null,
      style: "variables_blocks",
    },
  },
  {
    type: "scratch_data_replace_in_list",
    label: "Replace in list",
    category: "Variables",
    json: {
      type: "scratch_data_replace_in_list",
      message0: "replace item %1 of %2 with %3",
      args0: [
        { ...num(1), name: "INDEX" },
        { ...text("my list"), name: "LIST" },
        { ...text("thing"), name: "ITEM" },
      ],
      previousStatement: null,
      nextStatement: null,
      style: "variables_blocks",
    },
  },
  {
    type: "scratch_data_item_of_list",
    label: "Item of list (reporter)",
    category: "Variables",
    json: {
      type: "scratch_data_item_of_list",
      message0: "item %1 of %2",
      args0: [
        { ...num(1), name: "INDEX" },
        { ...text("my list"), name: "LIST" },
      ],
      output: null,
      style: "variables_blocks",
    },
  },
  {
    type: "scratch_data_length_of_list",
    label: "Length of list (reporter)",
    category: "Variables",
    json: {
      type: "scratch_data_length_of_list",
      message0: "length of %1",
      args0: [{ ...text("my list"), name: "LIST" }],
      output: "Number",
      style: "variables_blocks",
    },
  },
  {
    type: "scratch_data_list_contains",
    label: "List contains? (reporter)",
    category: "Variables",
    json: {
      type: "scratch_data_list_contains",
      message0: "%1 contains %2 ?",
      args0: [
        { ...text("my list"), name: "LIST" },
        { ...text("thing"), name: "ITEM" },
      ],
      output: "Boolean",
      style: "variables_blocks",
    },
  },
  {
    type: "scratch_data_variables_get",
    label: "Variable value (reporter)",
    category: "Variables",
    json: {
      type: "scratch_data_variables_get",
      message0: "value of %1",
      args0: [{ ...text("my variable"), name: "VARIABLE" }],
      output: null,
      style: "variables_blocks",
    },
  },
  {
    // Side-effect: hand the URL/path to the platform's shell opener.
    // Browser host opens a new tab; native host calls xdg-open / open
    // / start. Categorized under Events because it sits alongside
    // broadcast as an "external thing happens" block.
    type: "scratch_io_open_url",
    label: "Open URL",
    category: "Events",
    json: {
      type: "scratch_io_open_url",
      message0: "open URL %1",
      args0: [{ ...text("https://example.com"), name: "URL" }],
      previousStatement: null,
      nextStatement: null,
      style: "events_blocks",
    },
  },
];

export const SCRATCH_PRIMITIVES: ScratchPrimitiveSpec[] = BLOCKS.map(({ type, label, category }) => ({
  type,
  label,
  category,
}));

export const SCRATCH_PRIMITIVE_CATEGORY: Record<string, ScratchPrimitiveSpec["category"]> =
  Object.fromEntries(SCRATCH_PRIMITIVES.map((b) => [b.type, b.category]));

export const SCRATCH_PRIMITIVE_LABEL: Record<string, string> = Object.fromEntries(
  SCRATCH_PRIMITIVES.map((b) => [b.type, b.label])
);

let registered = false;

/** Register every Scratch primitive block with Blockly. Idempotent. */
export function registerScratchPrimitiveBlocks(): void {
  if (registered) return;
  Blockly.common.defineBlocksWithJsonArray(BLOCKS.map((b) => b.json) as never[]);
  registered = true;
}
