/**
 * Live input state for the running stage: pressed keys, mouse position,
 * mouse-button state, and the timer baseline.
 *
 * Held as a module-scope singleton so the interpreter can read it without
 * threading it through every call. The StagePanel installs DOM listeners
 * that update this bus; nothing in the interpreter writes to it (except
 * `resetTimer`).
 *
 * Keys are stored as the lowercase Scratch name (e.g. "space", "up", "a"),
 * matching the values in the `scratch_sensing_key_pressed` dropdown.
 */

import { maybeCurrentView } from "./stateView";

export interface StageInputSnapshot {
  pressedKeys: ReadonlySet<string>;
  /** Stage coords (centered, +y up). NaN when the pointer hasn't entered the stage yet. */
  mouseX: number;
  mouseY: number;
  mouseDown: boolean;
  /** ms baseline for the Scratch timer reporter — `(now() - timerBaseline) / 1000`. */
  timerBaseline: number;
}

const state = {
  pressedKeys: new Set<string>(),
  mouseX: 0,
  mouseY: 0,
  mouseDown: false,
  timerBaseline: 0,
};

let initialized = false;

/** Initialize timerBaseline lazily on first read so a fresh page load reads timer ≈ 0. */
function ensureInit() {
  if (!initialized) {
    state.timerBaseline = performance.now();
    initialized = true;
  }
}

export function snapshot(): StageInputSnapshot {
  ensureInit();
  return state;
}

export function setMouse(x: number, y: number) {
  state.mouseX = x;
  state.mouseY = y;
}

export function setMouseDown(down: boolean) {
  state.mouseDown = down;
}

/** Map a DOM `KeyboardEvent` to Scratch's lowercase key name. */
export function keyEventToScratchName(e: KeyboardEvent): string | null {
  if (e.key === " " || e.code === "Space") return "space";
  if (e.code === "ArrowUp") return "up";
  if (e.code === "ArrowDown") return "down";
  if (e.code === "ArrowLeft") return "left";
  if (e.code === "ArrowRight") return "right";
  if (e.code === "Enter") return "enter";
  // Letters and digits map to their lowercase character.
  if (/^Key[A-Z]$/.test(e.code)) return e.code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(e.code)) return e.code.slice(5);
  // Fallback: single-character keys.
  if (e.key.length === 1) return e.key.toLowerCase();
  return null;
}

export function pressKey(name: string) {
  state.pressedKeys.add(name);
}

export function releaseKey(name: string) {
  state.pressedKeys.delete(name);
}

export function clearKeys() {
  state.pressedKeys.clear();
}

export function isKeyPressed(name: string): boolean {
  ensureInit();
  if (name === "any") return state.pressedKeys.size > 0;
  return state.pressedKeys.has(name);
}

export function timerSeconds(): number {
  ensureInit();
  return (performance.now() - state.timerBaseline) / 1000;
}

export function resetTimer() {
  state.timerBaseline = performance.now();
}

/**
 * Install DOM listeners that drive the bus. Returns a cleanup callback.
 *
 * The keyboard listeners attach to `window` so a script reacting to a key
 * press doesn't require the canvas to be focused. Mouse listeners attach
 * to the canvas because mouse position is stage-local.
 */
export function installListeners(canvas: HTMLCanvasElement): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    const name = keyEventToScratchName(e);
    if (name) pressKey(name);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const name = keyEventToScratchName(e);
    if (name) releaseKey(name);
  };
  const onBlur = () => clearKeys();

  const onMouseMove = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const py = ((e.clientY - rect.top) / rect.height) * canvas.height;
    setMouse(px - canvas.width / 2, canvas.height / 2 - py);
  };
  const onMouseDownDom = () => setMouseDown(true);
  const onMouseUpDom = () => setMouseDown(false);

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mousedown", onMouseDownDom);
  window.addEventListener("mouseup", onMouseUpDom);

  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    canvas.removeEventListener("mousemove", onMouseMove);
    canvas.removeEventListener("mousedown", onMouseDownDom);
    window.removeEventListener("mouseup", onMouseUpDom);
  };
}

/**
 * Resolve a sensing target name (used by `touching` / `distance to`) to a
 * point on the stage. Returns `null` for unknown names so the caller can
 * decide on a sensible fallback.
 */
export function resolveSensingTarget(
  target: string,
  selfId: string
): { x: number; y: number } | null {
  if (target === "mouse-pointer") {
    const s = snapshot();
    if (Number.isNaN(s.mouseX)) return null;
    return { x: s.mouseX, y: s.mouseY };
  }
  // Anything else: try to match a sprite by name (case-insensitive).
  const view = maybeCurrentView();
  if (!view) return null;
  const lower = target.toLowerCase();
  const match = view
    .getSprites()
    .find((s) => s.id !== selfId && s.name.toLowerCase() === lower);
  if (!match) return null;
  return { x: match.x, y: match.y };
}
