import * as Blockly from "blockly";

const blockStyles = {
  project_blocks: { colourPrimary: "#ff7f50", colourSecondary: "#ff6f3f", colourTertiary: "#d95f2f" },
  structure_blocks: { colourPrimary: "#4a90e2", colourSecondary: "#327ccf", colourTertiary: "#2163a8" },
  ui_blocks: { colourPrimary: "#3dbb7c", colourSecondary: "#2da86a", colourTertiary: "#1f8552" },
  logic_blocks: { colourPrimary: "#f5a623", colourSecondary: "#e4961b", colourTertiary: "#be7814" },
  state_blocks: { colourPrimary: "#7b61ff", colourSecondary: "#6a52e6", colourTertiary: "#553fc0" },
  events_blocks: { colourPrimary: "#ff5f8f", colourSecondary: "#ef4f7f", colourTertiary: "#bf3d65" },
  io_blocks: { colourPrimary: "#00a3a3", colourSecondary: "#008f8f", colourTertiary: "#006e6e" },
  network_blocks: { colourPrimary: "#c07bff", colourSecondary: "#aa67ea", colourTertiary: "#834eb8" },
  ai_blocks: { colourPrimary: "#ff8f3d", colourSecondary: "#eb7f2f", colourTertiary: "#bd6323" },
  export_blocks: { colourPrimary: "#5e6cff", colourSecondary: "#4b58e6", colourTertiary: "#3741b8" },
  tw_modules_blocks: { colourPrimary: "#3e7bfa", colourSecondary: "#2d66e6", colourTertiary: "#1f4fb8" },
  motion_blocks: { colourPrimary: "#4c97ff", colourSecondary: "#3373cc", colourTertiary: "#2858a3" },
  looks_blocks: { colourPrimary: "#9966ff", colourSecondary: "#774dcb", colourTertiary: "#5c3da1" },
  sound_blocks: { colourPrimary: "#cf63cf", colourSecondary: "#bd42bd", colourTertiary: "#963596" },
  control_blocks: { colourPrimary: "#ffab19", colourSecondary: "#ec9c13", colourTertiary: "#bf7d11" },
  sensing_blocks: { colourPrimary: "#5cb1d6", colourSecondary: "#47a8c2", colourTertiary: "#2e8eb8" },
  operators_blocks: { colourPrimary: "#59c059", colourSecondary: "#46a946", colourTertiary: "#389038" },
  variables_blocks: { colourPrimary: "#ff8c1a", colourSecondary: "#e16413", colourTertiary: "#b1490e" },
  rust_blocks: { colourPrimary: "#ce422b", colourSecondary: "#b53824", colourTertiary: "#8d2c1c" },
  my_blocks: { colourPrimary: "#6b7280", colourSecondary: "#5b6371", colourTertiary: "#444a55" }
};

const fontStyle = {
  family: "Avenir Next, Helvetica Neue, sans-serif",
  weight: "600",
  size: 12
};

export const warpforgeTheme = Blockly.Theme.defineTheme("warpforge", {
  name: "warpforge",
  base: Blockly.Themes.Classic,
  blockStyles,
  componentStyles: {
    workspaceBackgroundColour: "#ffffff",
    toolboxBackgroundColour: "#ffffff",
    toolboxForegroundColour: "#203048",
    flyoutBackgroundColour: "#f8fbff",
    flyoutForegroundColour: "#203048",
    flyoutOpacity: 1,
    scrollbarColour: "#88a2c7",
    insertionMarkerColour: "#203048",
    insertionMarkerOpacity: 0.4,
    markerColour: "#ff7f50",
    cursorColour: "#203048"
  },
  fontStyle,
  startHats: true
});

export const warpforgeDarkTheme = Blockly.Theme.defineTheme("warpforge-dark", {
  name: "warpforge-dark",
  base: Blockly.Themes.Classic,
  blockStyles,
  componentStyles: {
    workspaceBackgroundColour: "#1e2335",
    toolboxBackgroundColour: "#242938",
    toolboxForegroundColour: "#dce6f4",
    flyoutBackgroundColour: "#1e2a40",
    flyoutForegroundColour: "#dce6f4",
    flyoutOpacity: 1,
    scrollbarColour: "#3a4d6a",
    insertionMarkerColour: "#dce6f4",
    insertionMarkerOpacity: 0.4,
    markerColour: "#ff8c60",
    cursorColour: "#dce6f4"
  },
  fontStyle,
  startHats: true
});
