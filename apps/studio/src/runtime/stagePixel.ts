/**
 * Pixel-sampling bridge from the runtime to the stage <canvas>.
 *
 * `scratch_sensing_touching_color` needs to read the rendered pixel
 * at a given stage coordinate. The runtime can't reach DOM directly, so
 * `StagePanel` registers its canvas + dimensions here at mount time;
 * the interpreter calls `getStagePixel(x, y)` through this module.
 *
 * Coordinate convention: `x`, `y` are Scratch stage coords (origin at
 * stage center, +y up). `getStagePixel` converts to canvas pixel coords
 * before reading via `ctx.getImageData`.
 */

let canvas: HTMLCanvasElement | null = null;
let stageWidth = 480;
let stageHeight = 360;

/** Called by StagePanel on mount / canvas-ref change. */
export function registerStageCanvas(
  el: HTMLCanvasElement | null,
  width: number,
  height: number
): void {
  canvas = el;
  stageWidth = width;
  stageHeight = height;
}

/**
 * Sample one pixel from the rendered stage at the given Scratch coords.
 * Returns `[r, g, b]` in 0..255, or `null` when the canvas is not ready
 * (no sprite renderer has mounted yet) or the coords are off-stage.
 *
 * `getImageData` is comparatively expensive; the interpreter caller
 * batches samples per `touching_color` evaluation so we don't pay it
 * once per block invocation across many sprites.
 */
export function getStagePixel(
  x: number,
  y: number
): [number, number, number] | null {
  if (!canvas) return null;
  const px = Math.round((x + stageWidth / 2) * (canvas.width / stageWidth));
  const py = Math.round((stageHeight / 2 - y) * (canvas.height / stageHeight));
  if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) {
    return null;
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    const data = ctx.getImageData(px, py, 1, 1).data;
    return [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0];
  } catch {
    // SecurityError on a tainted canvas (cross-origin images) — fall
    // through. None of our costume sources should taint, but stay
    // defensive so a user-imported image doesn't kill the runtime.
    return null;
  }
}

/**
 * Parse a color string the way the `field_colour` block stores values
 * (`"#rrggbb"`). Tolerates a missing leading `#` and short `"#rgb"`
 * shorthand. Returns `null` for malformed input.
 */
export function parseHexColor(
  hex: string
): [number, number, number] | null {
  const s = hex.trim().replace(/^#/, "");
  if (s.length === 3) {
    const r = parseInt(s[0]! + s[0]!, 16);
    const g = parseInt(s[1]! + s[1]!, 16);
    const b = parseInt(s[2]! + s[2]!, 16);
    if ([r, g, b].every((n) => Number.isFinite(n))) return [r, g, b];
    return null;
  }
  if (s.length === 6) {
    const r = parseInt(s.slice(0, 2), 16);
    const g = parseInt(s.slice(2, 4), 16);
    const b = parseInt(s.slice(4, 6), 16);
    if ([r, g, b].every((n) => Number.isFinite(n))) return [r, g, b];
    return null;
  }
  return null;
}

/**
 * Scratch-style color match: per-channel difference within a tolerance.
 * Default tolerance (5) matches what scratch-vm uses; loose enough to
 * accept anti-aliasing / small render variation, tight enough that
 * picking "red" doesn't match a slightly-pink neighbor.
 */
export function colorsMatch(
  a: [number, number, number],
  b: [number, number, number],
  tolerance = 5
): boolean {
  return (
    Math.abs(a[0] - b[0]) <= tolerance &&
    Math.abs(a[1] - b[1]) <= tolerance &&
    Math.abs(a[2] - b[2]) <= tolerance
  );
}
