export interface WorkspaceComment {
  id: string;
  block_id?: string;
  text: string;
}

export interface WorkspaceGroup {
  id: string;
  label: string;
  block_ids: string[];
}

export interface WorkspaceState {
  zoom: number;
  pan_x: number;
  pan_y: number;
  selected_block_ids: string[];
  blockly_xml?: string;
  comments: WorkspaceComment[];
  groups: WorkspaceGroup[];
}

export interface GraphNode {
  id: string;
  kind: string;
  category: string;
  props: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  edge_type: "flow" | "data" | "child" | "event";
}

export interface NormalizedGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ProjectMetadata {
  id: string;
  app_name: string;
  package_id: string;
  version: string;
  author: string;
  description: string;
  target_type: "desktop_slint";
  theme: "auto" | "light" | "dark" | "custom";
  created_at: string;
  updated_at: string;
  /**
   * Custom stage size — TurboWarp-style. When unset, the studio + the
   * Slint codegen both use the Scratch defaults of 480 × 360.
   * Persisted in the project file so non-default sizes survive a
   * save/load round-trip; threaded through wf-ir → wf-codegen-slint
   * so the generated `MainWindow` and `STAGE_W/STAGE_H` constants pick
   * up the user-chosen dimensions.
   */
  stage_width?: number;
  stage_height?: number;
}

export interface AssetRecord {
  id: string;
  kind: "icon" | "image" | "text_snippet" | "prompt" | "screenshot" | "costume" | "sound";
  path: string;
  prompt?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  version: number;
}

/** A sprite costume — visual representation. assetId points at an entry in `assets[]` with kind="costume"; missing assetId means the costume is a placeholder rectangle. */
export interface Costume {
  id: string;
  name: string;
  assetId?: string;
  /** Center-point in the source image's pixel coordinates (used as the rotation/positioning anchor on the stage). */
  centerX: number;
  centerY: number;
  /** Cached dimensions of the source image; 0 means "not yet measured". */
  width: number;
  height: number;
}

/** A sprite sound. assetId points at an entry in `assets[]` with kind="sound". */
export interface SpriteSound {
  id: string;
  name: string;
  assetId?: string;
}

export type RotationStyle = "all-around" | "left-right" | "dont-rotate";

/**
 * A live sprite on the stage.
 *
 * Coordinate system: Scratch convention — origin at center, +x right, +y up.
 * The default stage is 480 × 360, so x ∈ [-240, 240] and y ∈ [-180, 180].
 * Direction is in degrees, 0° = up, 90° = right, ±180° = down, -90° = left.
 */
export interface Sprite {
  id: string;
  name: string;
  x: number;
  y: number;
  direction: number;
  /** Size as a percentage; 100 = original costume size. */
  size: number;
  visible: boolean;
  rotationStyle: RotationStyle;
  /** Index into `costumes[]`; -1 if no costumes (renders as a placeholder rectangle). */
  costumeIndex: number;
  costumes: Costume[];
  sounds: SpriteSound[];
  /** Per-sprite Blockly XML. Phase 2+ wires this up; Phase 1 stores empty string. */
  scripts_xml: string;
  /** Per-sprite variable scope. */
  variables: Record<string, number | string>;
  /** Per-sprite list scope. */
  lists: Record<string, Array<number | string>>;
  /** Sprite-list display order on the stage (lower = behind). */
  layer: number;
  /**
   * Active speech bubble. Cleared by `say`/`think` with empty text and by
   * `say_for_secs` after its timer elapses. Renders as a DOM overlay
   * positioned above the sprite.
   */
  bubble?: { kind: "say" | "think"; text: string };
  /**
   * Graphic effects. Brightness, ghost, and color render to the canvas
   * via the Canvas2D `filter` chain (`brightness(...)`, opacity, and
   * `hue-rotate(...)` respectively). Fisheye / whirl / pixelate / mosaic
   * need a real shader pass — for now we still accept the values
   * (`change effect by`, `set effect to`) so scripts compile and don't
   * silently drop, but rendering them is a no-op until that lands.
   * - color: 0..200 (Scratch wraps mod 200 — 200° = full hue cycle)
   * - brightness: -100..100, 0 = unchanged
   * - ghost: 0..100, 0 = opaque, 100 = invisible
   * - fisheye / whirl / pixelate / mosaic: stored, not rendered
   */
  effects?: {
    color?: number;
    fisheye?: number;
    whirl?: number;
    pixelate?: number;
    mosaic?: number;
    brightness?: number;
    ghost?: number;
  };
  /**
   * Per-sprite volume as a percentage, 0..100. Defaults to 100 when
   * undefined so sprites that never touched a sound block don't render
   * silent — see `volumeOf` in runtime/audio.ts.
   */
  volume?: number;
  /**
   * Cloning bookkeeping (Phase 9).
   * - `isClone`: true for sprites created at runtime by `create_clone_of`.
   *   Clones are filtered out of `toStageState` so they don't persist.
   * - `parentSpriteId`: the source sprite. The runtime materializes the
   *   parent's `scripts_xml` to find `when_i_start_as_clone` hats and
   *   the workspace UI shows the parent's scripts when a clone is
   *   selected (clones don't have their own scripts to edit).
   */
  isClone?: boolean;
  parentSpriteId?: string;
}

export interface StageState {
  schema_version: number;
  sprites: Sprite[];
  selectedSpriteId?: string;
  /** The stage itself can host backdrops (treated like costumes that fill the canvas). */
  backdropIndex: number;
  backdrops: Costume[];
  /** Stage-scope (global) variables — accessible from any sprite. */
  globalVariables: Record<string, number | string>;
  globalLists: Record<string, Array<number | string>>;
}

/**
 * Stage dimensions are exported as `let` bindings so they can be
 * updated at runtime when a project specifies a custom size. ES module
 * exports of `let` provide *live bindings* — every consumer that does
 * `import { STAGE_WIDTH }` reads the current value at access time, not
 * the value at import time. That's why a top-level mutator (rather
 * than every call site reading from the project store) is enough.
 *
 * Tests that don't touch `setStageDimensions` keep seeing the Scratch
 * defaults (480 × 360).
 */
export let STAGE_WIDTH = 480;
export let STAGE_HEIGHT = 360;
export const DEFAULT_STAGE_WIDTH = 480;
export const DEFAULT_STAGE_HEIGHT = 360;

/**
 * Update the live stage dimensions. Called once on app boot (and on
 * every project load) so the studio runtime honors any custom size in
 * `project.project.stage_width / stage_height`.
 *
 * Width and height are clamped to a sane range — large enough to be
 * useful, bounded so a typo doesn't blow up the canvas. Non-finite
 * values fall back to the defaults so corrupt project files don't
 * brick the studio.
 */
export function setStageDimensions(width: number, height: number): void {
  STAGE_WIDTH = clampStageSize(width, DEFAULT_STAGE_WIDTH);
  STAGE_HEIGHT = clampStageSize(height, DEFAULT_STAGE_HEIGHT);
}

function clampStageSize(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.max(60, Math.min(4096, Math.round(value)));
}

export const STAGE_STATE_SCHEMA_VERSION = 1;

export function emptyStageState(): StageState {
  return {
    schema_version: STAGE_STATE_SCHEMA_VERSION,
    sprites: [],
    backdropIndex: -1,
    backdrops: [],
    globalVariables: {},
    globalLists: {},
  };
}

export interface ProjectFile {
  schema_version: number;
  project: ProjectMetadata;
  workspace_state: WorkspaceState;
  normalized_graph: NormalizedGraph;
  ir_snapshot?: unknown;
  assets: AssetRecord[];
  ai_history: unknown[];
  /** Sprite/stage runtime state. Optional so older project files still load. */
  stage_state?: StageState;
  settings: {
    autosave_interval_secs: number;
    validate_on_change: boolean;
    codegen_deterministic: boolean;
    ai_default_text_provider: string;
    ai_default_image_provider: string;
  };
}
