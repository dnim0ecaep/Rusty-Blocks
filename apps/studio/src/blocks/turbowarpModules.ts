export interface TurboWarpModuleSpec {
  id: string;
  name: string;
}

export const TURBOWARP_MODULE_SNAPSHOT_DATE = "2026-03-02";

// Snapshot from https://extensions.turbowarp.org/ on 2026-03-02.
export const TURBOWARP_MODULES: TurboWarpModuleSpec[] = [
  { name: "Animated Text", id: "animated_text" },
  { name: "Face Sensing", id: "face_sensing" },
  { name: "Stretch", id: "stretch" },
  { name: "Gamepad", id: "gamepad" },
  { name: "Box2D Physics", id: "box2d_physics" },
  { name: "Files", id: "files" },
  { name: "Pointerlock", id: "pointerlock" },
  { name: "Mouse Cursor", id: "mouse_cursor" },
  { name: "Runtime Options", id: "runtime_options" },
  { name: "Fetch", id: "fetch" },
  { name: "Text", id: "text" },
  { name: "Local Storage", id: "local_storage" },
  { name: "Base", id: "base" },
  { name: "Bitwise", id: "bitwise" },
  { name: "BigInt", id: "bigint" },
  { name: "Utilities", id: "utilities" },
  { name: "URL Playback", id: "url_playback" },
  { name: "Video", id: "video" },
  { name: "Iframe", id: "iframe" },
  { name: "HTML Encode", id: "html_encode" },
  { name: "Clipping & Blending", id: "clipping_and_blending" },
  { name: "Clipboard", id: "clipboard" },
  { name: "Pen Plus V7", id: "pen_plus_v7" },
  { name: "Pen Plus V5 (Old)", id: "pen_plus_v5_old" },
  { name: "Simple 3D", id: "simple_3d" },
  { name: "Skins", id: "skins" },
  { name: "Sensing Plus", id: "sensing_plus" },
  { name: "Key Simulation", id: "key_simulation" },
  { name: "Clones Plus", id: "clones_plus" },
  { name: "Looks Plus", id: "looks_plus" },
  { name: "More Events", id: "more_events" },
  { name: "List Tools", id: "list_tools" },
  { name: "Mobile Keyboard", id: "mobile_keyboard" },
  { name: "More Motion", id: "more_motion" },
  { name: "Window Controls", id: "window_controls" },
  { name: "Browser Fullscreen", id: "browser_fullscreen" },
  { name: "Screen Resolution", id: "screen_resolution" },
  { name: "Ask Before Closing Tab", id: "ask_before_closing_tab" },
  { name: "Navigator", id: "navigator" },
  { name: "Battery", id: "battery" },
  { name: "Vibration", id: "vibration" },
  { name: "Custom Styles", id: "custom_styles" },
  { name: "Color Picker", id: "color_picker" },
  { name: "Control Controls", id: "control_controls" },
  { name: "Notifications", id: "notifications" },
  { name: "Delta Time", id: "delta_time" },
  { name: "Augmented Reality", id: "augmented_reality" },
  { name: "Encoding", id: "encoding" },
  { name: "Sound Expanded", id: "sound_expanded" },
  { name: "Temporary Variables", id: "temporary_variables" },
  { name: "More Timers", id: "more_timers" },
  { name: "Ping Cloud Data", id: "ping_cloud_data" },
  { name: "CloudLink V4", id: "cloudlink_v4" },
  { name: "Network", id: "network" },
  { name: "Math", id: "math" },
  { name: "RegExp", id: "regexp" },
  { name: "Couplers", id: "couplers" },
  { name: "Format Numbers", id: "format_numbers" },
  { name: "All Menus", id: "all_menus" },
  { name: "Hidden Block Collection", id: "hidden_block_collection" },
  { name: "Cast", id: "cast" },
  { name: "Time", id: "time" },
  { name: "Consoles", id: "consoles" },
  { name: "Search Params", id: "search_params" },
  { name: "ShovelUtils", id: "shovelutils" },
  { name: "Asset Manager", id: "asset_manager" },
  { name: "Font Manager", id: "font_manager" },
  { name: "Wake Lock", id: "wake_lock" },
  { name: "JSON", id: "json" },
  { name: "XML", id: "xml" },
  { name: "Numerical Encoding V2", id: "numerical_encoding_v2" },
  { name: "Numerical Encoding V1", id: "numerical_encoding_v1" },
  { name: "Camera V2", id: "camera_v2" },
  { name: "Camera V1", id: "camera_v1" },
  { name: "Canvas Effects", id: "canvas_effects" },
  { name: "RGB Channels", id: "rgb_channels" },
  { name: "Zip", id: "zip" },
  { name: "Images", id: "images" },
  { name: "LZ Compress", id: "lz_compress" },
  { name: "rxFS", id: "rxfs" },
  { name: "S-Grab", id: "s_grab" },
  { name: "Graphics 2D", id: "graphics_2d" },
  { name: "More Comparisons", id: "more_comparisons" },
  { name: "Tween", id: "tween" },
  { name: "RixxyX", id: "rixxyx" },
  { name: "Lily's Toolbox", id: "lily_s_toolbox" },
  { name: "Data Analysis", id: "data_analysis" },
  { name: "Variable and list", id: "variable_and_list" },
  { name: "Dictionaries", id: "dictionaries" },
  { name: "HTTP", id: "http" },
  { name: "WebSocket", id: "websocket" },
  { name: "Comment Blocks", id: "comment_blocks" },
  { name: "Longman Dictionary", id: "longman_dictionary" },
  { name: "TurboHook", id: "turbohook" },
  { name: "NFCWarp", id: "nfcwarp" },
  { name: "Steamworks", id: "steamworks" },
  { name: "itch.io", id: "itch_io" },
  { name: "Game Jolt", id: "game_jolt" },
  { name: "Newgrounds", id: "newgrounds" },
  { name: "McUtils", id: "mcutils" }
];

export const TURBOWARP_MODULE_BLOCK_PREFIX = "wf_tw_mod_";

export function turboWarpModuleBlockType(id: string): string {
  return `${TURBOWARP_MODULE_BLOCK_PREFIX}${id}`;
}

export function turboWarpModuleIdFromBlockType(blockType: string): string | null {
  if (!blockType.startsWith(TURBOWARP_MODULE_BLOCK_PREFIX)) {
    return null;
  }
  return blockType.slice(TURBOWARP_MODULE_BLOCK_PREFIX.length);
}
