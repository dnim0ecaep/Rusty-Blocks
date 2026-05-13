import { useEffect, useRef, useState } from "react";

import { CostumeEditor } from "./CostumeEditor";
import { LibraryDialog } from "./LibraryDialog";
import { SoundEditor } from "./SoundEditor";
import { SoundLibraryDialog } from "./SoundLibraryDialog";
import { VectorCostumeEditor, type VectorShape } from "./VectorCostumeEditor";
import type { LibraryEntry } from "../data/builtInLibrary";
import type { SoundLibraryEntry } from "../data/builtInSounds";
import {
  getPending as getPendingAsk,
  submit as submitAskAnswer,
  subscribe as subscribeAsk,
} from "../runtime/ask";
import {
  evictCostume,
  getCostumeImage,
  onCostumeLoaded,
} from "../runtime/costumeImageCache";
import {
  dispatchKeyPress,
  dispatchSpriteClicked,
  fireHatAcrossSprites,
  makeRuntimeContext,
} from "../runtime/runFlow";
import { sharedScheduler } from "../runtime/scheduler";
import { runWorkspaceOnce } from "../runtime/scriptInterpreter";
import { withSpriteWorkspace } from "../runtime/spriteWorkspaces";
import {
  installListeners as installStageInputListeners,
  keyEventToScratchName,
} from "../runtime/stageInput";
import { registerStageCanvas } from "../runtime/stagePixel";
import { useProjectStore } from "../store/projectStore";
import { useStageStore } from "../store/stageStore";
import { useUiStore } from "../store/uiStore";
import {
  STAGE_HEIGHT,
  STAGE_WIDTH,
  type AssetRecord,
  type Costume,
  type Sprite,
  type SpriteSound,
} from "../types/workspace";

/**
 * Convert Scratch coords (origin center, +y up) → canvas pixel coords
 * (origin top-left, +y down).
 */
function scratchToCanvas(x: number, y: number): { px: number; py: number } {
  return { px: STAGE_WIDTH / 2 + x, py: STAGE_HEIGHT / 2 - y };
}

/** Inverse of scratchToCanvas. */
function canvasToScratch(px: number, py: number): { x: number; y: number } {
  return { x: px - STAGE_WIDTH / 2, y: STAGE_HEIGHT / 2 - py };
}

/**
 * Choose a deterministic placeholder color for a sprite. Used until
 * costume assets land in Phase 8.
 */
function placeholderColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return `hsl(${hue}, 70%, 60%)`;
}

const SPRITE_PLACEHOLDER_SIZE = 40;

export function StagePanel() {
  const sprites = useStageStore((s) => s.sprites);
  const selectedSpriteId = useStageStore((s) => s.selectedSpriteId);
  const backdropIndex = useStageStore((s) => s.backdropIndex);
  const backdrops = useStageStore((s) => s.backdrops);
  const addSprite = useStageStore((s) => s.addSprite);
  const removeSprite = useStageStore((s) => s.removeSprite);
  const selectSprite = useStageStore((s) => s.selectSprite);
  const setSpritePosition = useStageStore((s) => s.setSpritePosition);
  const setMounted = useStageStore((s) => s.setMounted);
  // Project-derived stage dimensions. Subscribing here makes StagePanel
  // re-render when the user changes the size; the draw effect lists
  // both values in its deps so the canvas redraws with the new bounds.
  // STAGE_WIDTH / STAGE_HEIGHT (the live exports) are kept in sync by
  // App.tsx, so all the helper callsites below still resolve correctly.
  const projectStageWidth = useProjectStore(
    (s) => s.project?.project.stage_width,
  );
  const projectStageHeight = useProjectStore(
    (s) => s.project?.project.stage_height,
  );
  const showSpriteNames = useUiStore((s) => s.showSpriteNames);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const dragOffsetRef = useRef<{ dx: number; dy: number } | null>(null);
  const [hoverSpriteId, setHoverSpriteId] = useState<string | null>(null);
  const [activeScripts, setActiveScripts] = useState(0);
  // costumesLoadedTick is bumped whenever a costume image finishes
  // loading OR an in-place edit evicts the cache. Including it in the
  // canvas-render deps below is what guarantees the new image actually
  // gets drawn — sprites/backdrops references don't change on edit.
  const [costumesLoadedTick, setCostumesLoadedTick] = useState(0);

  // Re-render the canvas whenever a costume image finishes loading.
  useEffect(() => onCostumeLoaded(() => setCostumesLoadedTick((t) => t + 1)), []);

  // Mark the panel as mounted for the (future) interpreter.
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, [setMounted]);

  // Subscribe to the shared scheduler so the running indicator updates.
  useEffect(() => {
    const unsubscribe = sharedScheduler.onChange((scripts) => {
      setActiveScripts(scripts.length);
    });
    return unsubscribe;
  }, []);

  // Stop all scripts when the panel unmounts so they don't keep ticking.
  useEffect(() => () => sharedScheduler.stopAll(), []);

  // Install keyboard + mouse listeners so sensing reporters (key pressed?,
  // mouse x/y) read live state. The listeners attach to window/canvas, so
  // they need to mount/unmount with the StagePanel.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    registerStageCanvas(canvas, STAGE_WIDTH, STAGE_HEIGHT);
    const detach = installStageInputListeners(canvas);
    return () => {
      registerStageCanvas(null, STAGE_WIDTH, STAGE_HEIGHT);
      detach?.();
    };
  }, []);

  // Fire `when key pressed` hats on each discrete keydown. We skip OS
  // auto-repeats so a held key doesn't refire the hat every frame —
  // matches Scratch's "edge-triggered" semantics. Scripts that want
  // "while held" use `key pressed?` reporter inside a forever loop.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      // Don't steal keystrokes from the user typing in inputs/textareas.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      const scratchKey = keyEventToScratchName(e);
      if (!scratchKey) return;
      dispatchKeyPress(scratchKey);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Render the canvas any time sprites change.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // ── Backdrop ─────────────────────────────────────────────────────
    // If the active backdrop's costume image is loaded, draw it as the
    // background (cover the whole stage). Otherwise fall back to white
    // + grid + crosshair.
    const stageState = useStageStore.getState();
    const activeBackdrop =
      stageState.backdropIndex >= 0 && stageState.backdropIndex < stageState.backdrops.length
        ? stageState.backdrops[stageState.backdropIndex]
        : null;
    const backdropImg = activeBackdrop?.assetId
      ? getCostumeImage(activeBackdrop.assetId)
      : null;
    if (backdropImg && backdropImg.naturalWidth > 0) {
      // Draw the backdrop scaled to fill the stage. Aspect distortion
      // is acceptable here (matches TurboWarp behavior — the stage is
      // a fixed 480×360, backdrops stretch to fit).
      ctx.drawImage(backdropImg, 0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    } else {
      // Plain white + grid fallback.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
      ctx.strokeStyle = "#eef2f7";
      ctx.lineWidth = 1;
      for (let x = 0; x <= STAGE_WIDTH; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, STAGE_HEIGHT);
        ctx.stroke();
      }
      for (let y = 0; y <= STAGE_HEIGHT; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(STAGE_WIDTH, y + 0.5);
        ctx.stroke();
      }
      // Center crosshair so the origin is visible.
      ctx.strokeStyle = "#cdd6e2";
      ctx.beginPath();
      ctx.moveTo(STAGE_WIDTH / 2 + 0.5, 0);
      ctx.lineTo(STAGE_WIDTH / 2 + 0.5, STAGE_HEIGHT);
      ctx.moveTo(0, STAGE_HEIGHT / 2 + 0.5);
      ctx.lineTo(STAGE_WIDTH, STAGE_HEIGHT / 2 + 0.5);
      ctx.stroke();
    }

    // Draw sprites in layer order.
    const layered = [...sprites].sort((a, b) => a.layer - b.layer);
    for (const s of layered) {
      if (!s.visible) continue;
      const { px, py } = scratchToCanvas(s.x, s.y);
      const sizePx = (SPRITE_PLACEHOLDER_SIZE * s.size) / 100;
      ctx.save();
      // Apply brightness / ghost / color via canvas filter + globalAlpha.
      // Scratch effect mapping:
      //   ghost 0..100        → globalAlpha (1 - ghost/100)
      //   brightness -100..100 → CSS brightness(1 + b/100)
      //   color 0..200        → CSS hue-rotate(color * 1.8 deg)
      // The other four effects (fisheye/whirl/pixelate/mosaic) require a
      // shader pass; the values are stored on the sprite but rendering
      // them is intentionally a no-op for now.
      const ghost = Math.max(0, Math.min(100, s.effects?.ghost ?? 0));
      ctx.globalAlpha = 1 - ghost / 100;
      const brightness = s.effects?.brightness ?? 0;
      const color = s.effects?.color ?? 0;
      const filterParts: string[] = [];
      if (brightness !== 0) {
        filterParts.push(`brightness(${1 + brightness / 100})`);
      }
      if (color !== 0) {
        filterParts.push(`hue-rotate(${color * 1.8}deg)`);
      }
      if (filterParts.length > 0) {
        ctx.filter = filterParts.join(" ");
      }
      ctx.translate(px, py);
      // Rotation: Scratch direction 0° = up, 90° = right; canvas rotation is
      // +clockwise from +x. Convert: canvasAngle = direction - 90.
      if (s.rotationStyle === "all-around") {
        ctx.rotate(((s.direction - 90) * Math.PI) / 180);
      }
      // Real costume image when loaded; placeholder square otherwise.
      const costume = s.costumes[s.costumeIndex];
      const img = costume?.assetId ? getCostumeImage(costume.assetId) : null;
      if (img && img.naturalWidth > 0) {
        // Scale costume to honor sprite.size (% of original).
        const scale = s.size / 100;
        const w = img.naturalWidth * scale;
        const h = img.naturalHeight * scale;
        const cx = (costume?.centerX || img.naturalWidth / 2) * scale;
        const cy = (costume?.centerY || img.naturalHeight / 2) * scale;
        ctx.drawImage(img, -cx, -cy, w, h);
        if (s.id === selectedSpriteId) {
          ctx.strokeStyle = "#1967d2";
          ctx.lineWidth = 3;
          ctx.strokeRect(-cx, -cy, w, h);
        }
      } else {
        ctx.fillStyle = placeholderColor(s.id);
        ctx.strokeStyle = s.id === selectedSpriteId ? "#1967d2" : "#203048";
        ctx.lineWidth = s.id === selectedSpriteId ? 3 : 1;
        ctx.fillRect(-sizePx / 2, -sizePx / 2, sizePx, sizePx);
        ctx.strokeRect(-sizePx / 2, -sizePx / 2, sizePx, sizePx);
        // Direction tick.
        ctx.strokeStyle = "#203048";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(sizePx / 2, 0);
        ctx.stroke();
      }
      ctx.restore();
      // Dynamic-text overlay (set by `scratch_looks_set_text_to` or
      // `scratch_looks_set_text_with_font`). Drawn outside the
      // rotation/effects frame so the text reads upright regardless of
      // sprite direction or graphic effects. Font size scales with the
      // sprite footprint; a white halo + dark fill keeps the glyph
      // legible against any costume background. The font family comes
      // from `sprite.font_family` when set, with `ui-sans-serif` /
      // `system-ui` / `sans-serif` as the fallback stack so an
      // unrecognized custom font still resolves to something readable.
      if (s.text_value && s.text_value.length > 0) {
        ctx.save();
        // Explicit size from `scratch_looks_set_text_size_to` wins;
        // otherwise auto-derive ~32% of the sprite's rendered height
        // so a bigger sprite shows bigger text without manual tuning.
        const fontPx =
          s.text_size && s.text_size > 0
            ? s.text_size
            : Math.max(12, Math.round(sizePx * 0.32));
        const familyStack = s.font_family && s.font_family.trim().length > 0
          ? `${s.font_family}, ui-sans-serif, system-ui, sans-serif`
          : "ui-sans-serif, system-ui, sans-serif";
        ctx.font = `bold ${fontPx}px ${familyStack}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = Math.max(2, fontPx / 6);
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.strokeText(s.text_value, px, py);
        ctx.fillStyle = "#1a2333";
        ctx.fillText(s.text_value, px, py);
        ctx.restore();
      }
      // Name label below — drawn without effects so it's always readable.
      // Suppressed entirely when the user toggles names off from the
      // stage toolbar (useful for screenshots and demos).
      if (showSpriteNames) {
        ctx.save();
        ctx.fillStyle = s.id === selectedSpriteId ? "#1967d2" : "#5b6371";
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(s.name, px, py + sizePx / 2 + 14);
        ctx.restore();
      }
    }
  }, [
    sprites,
    selectedSpriteId,
    backdropIndex,
    backdrops,
    costumesLoadedTick,
    projectStageWidth,
    projectStageHeight,
    showSpriteNames,
  ]);

  // Hit-test a click against sprite bounding boxes (top sprite wins).
  // Use the actual rendered costume size when its image has loaded so a
  // big costume catches clicks across its full visible footprint, not
  // just the 40-unit placeholder square.
  const findSpriteAt = (px: number, py: number): Sprite | null => {
    const layered = [...sprites].sort((a, b) => b.layer - a.layer);
    for (const s of layered) {
      if (!s.visible) continue;
      const { px: cx, py: cy } = scratchToCanvas(s.x, s.y);
      const costume = s.costumes[s.costumeIndex];
      const img = costume?.assetId ? getCostumeImage(costume.assetId) : null;
      const scale = s.size / 100;
      const halfX = img && img.naturalWidth > 0
        ? (img.naturalWidth * scale) / 2
        : (SPRITE_PLACEHOLDER_SIZE * s.size) / 200;
      const halfY = img && img.naturalHeight > 0
        ? (img.naturalHeight * scale) / 2
        : (SPRITE_PLACEHOLDER_SIZE * s.size) / 200;
      if (px >= cx - halfX && px <= cx + halfX && py >= cy - halfY && py <= cy + halfY) {
        return s;
      }
    }
    return null;
  };

  const onCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * STAGE_WIDTH;
    const py = ((e.clientY - rect.top) / rect.height) * STAGE_HEIGHT;
    const hit = findSpriteAt(px, py);
    if (!hit) {
      selectSprite(undefined);
      return;
    }
    selectSprite(hit.id);
    draggingIdRef.current = hit.id;
    const { px: cx, py: cy } = scratchToCanvas(hit.x, hit.y);
    dragOffsetRef.current = { dx: px - cx, dy: py - cy };
    // Fire the sprite's `when this sprite clicked` hats. Scratch fires
    // these on press, not release, even if the user later drags.
    dispatchSpriteClicked(hit);
  };

  const onCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * STAGE_WIDTH;
    const py = ((e.clientY - rect.top) / rect.height) * STAGE_HEIGHT;

    if (draggingIdRef.current && dragOffsetRef.current) {
      const cx = px - dragOffsetRef.current.dx;
      const cy = py - dragOffsetRef.current.dy;
      const { x, y } = canvasToScratch(cx, cy);
      setSpritePosition(draggingIdRef.current, Math.round(x), Math.round(y));
      return;
    }
    // Hover for cursor feedback.
    const hit = findSpriteAt(px, py);
    setHoverSpriteId(hit?.id ?? null);
  };

  const onCanvasMouseUp = () => {
    draggingIdRef.current = null;
    dragOffsetRef.current = null;
  };

  const selected = sprites.find((s) => s.id === selectedSpriteId);

  return (
    <aside className="stage-panel">
      <header className="stage-panel-header">
        <h3>
          Stage
          {activeScripts > 0 ? (
            <span className="stage-running-badge" title={`${activeScripts} script(s) running`}>
              ● {activeScripts}
            </span>
          ) : null}
        </h3>
        <div className="stage-panel-actions">
          <button
            type="button"
            className="stage-panel-btn"
            disabled={sprites.length === 0}
            title={
              sprites.length === 0
                ? "Add a sprite first"
                : "Run every sprite's flag-clicked hat scripts"
            }
            onClick={() => {
              fireHatAcrossSprites({
                hatType: "scratch_event_when_flag_clicked",
                labelPrefix: "flag",
              });
            }}
          >
            ⚑
          </button>
          <button
            type="button"
            className="stage-panel-btn"
            disabled={activeScripts === 0}
            title="Stop all running scripts"
            onClick={() => sharedScheduler.stopAll()}
          >
            ⏹
          </button>
          <button
            type="button"
            className="stage-panel-btn"
            disabled={!selectedSpriteId}
            title={
              selectedSpriteId
                ? "Run every workspace stack once against the selected sprite (Phase 2 debug aid)"
                : "Select a sprite to enable Step"
            }
            onClick={() => {
              if (!selectedSpriteId) return;
              const sprite = useStageStore
                .getState()
                .sprites.find((s) => s.id === selectedSpriteId);
              if (!sprite) return;
              // Step uses a transient workspace built from the sprite's
              // scripts_xml so the debug button works for any sprite, not
              // just the one currently shown in CenterWorkspace.
              withSpriteWorkspace(sprite, (ws) => {
                runWorkspaceOnce(ws, makeRuntimeContext(selectedSpriteId));
              });
            }}
          >
            ▶ Step
          </button>
          <SpriteNamesToggleButton />
          <PlayerModeButton />
        </div>
      </header>

      <div className="stage-canvas-wrapper" style={{ position: "relative" }}>
        <canvas
          ref={canvasRef}
          width={STAGE_WIDTH}
          height={STAGE_HEIGHT}
          className="stage-canvas"
          onMouseDown={onCanvasMouseDown}
          onMouseMove={onCanvasMouseMove}
          onMouseUp={onCanvasMouseUp}
          onMouseLeave={onCanvasMouseUp}
          style={{
            cursor: draggingIdRef.current
              ? "grabbing"
              : hoverSpriteId
              ? "grab"
              : "default",
          }}
        />
        <BubbleOverlay sprites={sprites} />
        <MonitorOverlay />
        <AskOverlay />
      </div>

      <section className="sprite-list">
        <div className="sprite-list-header">
          <h4>Sprites ({sprites.length})</h4>
          <div className="sprite-list-actions">
            <button
              type="button"
              className="sprite-list-btn"
              onClick={() => addSprite()}
              title="Add a sprite"
            >
              + Sprite
            </button>
            <button
              type="button"
              className="sprite-list-btn"
              onClick={() => selectedSpriteId && removeSprite(selectedSpriteId)}
              disabled={!selectedSpriteId}
              title="Remove the selected sprite"
            >
              − Remove
            </button>
          </div>
        </div>
        <ul className="sprite-list-items">
          {/* Stage entry — sibling of the sprites. Matches Scratch's
              UI where the stage's scripts/backdrops/sounds are edited
              by selecting "Stage" in the same list. Clicking it
              deselects any sprite (selectedSpriteId = undefined). */}
          <li
            key="__stage__"
            className={`sprite-list-item${
              !selectedSpriteId ? " is-selected" : ""
            }`}
            onClick={() => selectSprite(undefined)}
            title="Edit the stage's scripts and backdrops"
          >
            <span
              className="sprite-color-dot"
              style={{ backgroundColor: "#a0c0e8" }}
            />
            <span className="sprite-name">Stage</span>
          </li>
          {sprites.length === 0 ? (
            <li className="sprite-list-empty" style={{ padding: "6px 8px", fontSize: 11, color: "#5b6371" }}>
              No sprites yet. Click <strong>+ Sprite</strong> to add one.
            </li>
          ) : (
            sprites.map((s) => (
              <li
                key={s.id}
                className={`sprite-list-item${
                  s.id === selectedSpriteId ? " is-selected" : ""
                }`}
                onClick={() => selectSprite(s.id)}
              >
                <span
                  className="sprite-color-dot"
                  style={{ backgroundColor: placeholderColor(s.id) }}
                />
                <span className="sprite-name">{s.name}</span>
                <span className="sprite-coords">
                  ({s.x}, {s.y})
                </span>
              </li>
            ))
          )}
        </ul>
      </section>

      {selected ? <SpriteInspector sprite={selected} /> : null}
    </aside>
  );
}

/**
 * Variable / list monitor overlay. Renders one chip per visible name,
 * showing the resolved value. Variables show as `name = value`; lists
 * show as a small scrollable card.
 *
 * Resolution mirrors the runtime: per-sprite (selected sprite) first,
 * stage-scope fallback. When no sprite is selected only stage-scope
 * names resolve.
 */
function MonitorOverlay() {
  const visible = useStageStore((s) => s.visibleMonitors);
  const globalVars = useStageStore((s) => s.globalVariables);
  const globalLists = useStageStore((s) => s.globalLists);
  const sprites = useStageStore((s) => s.sprites);
  const selectedSpriteId = useStageStore((s) => s.selectedSpriteId);
  const selected = sprites.find((s) => s.id === selectedSpriteId);

  if (visible.size === 0) return null;

  const entries = Array.from(visible).map((name) => {
    if (selected && Object.prototype.hasOwnProperty.call(selected.variables, name)) {
      return { name, kind: "var" as const, value: selected.variables[name] };
    }
    if (Object.prototype.hasOwnProperty.call(globalVars, name)) {
      return { name, kind: "var" as const, value: globalVars[name] };
    }
    if (selected && Object.prototype.hasOwnProperty.call(selected.lists, name)) {
      return { name, kind: "list" as const, value: selected.lists[name] };
    }
    if (Object.prototype.hasOwnProperty.call(globalLists, name)) {
      return { name, kind: "list" as const, value: globalLists[name] };
    }
    return { name, kind: "var" as const, value: "" as number | string };
  });

  return (
    <div
      className="stage-monitor-layer"
      style={{
        position: "absolute",
        top: 6,
        left: 6,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        pointerEvents: "none",
        maxWidth: "55%",
      }}
    >
      {entries.map((e) =>
        e.kind === "var" ? (
          <div
            key={e.name}
            style={{
              background: "rgba(255,255,255,0.92)",
              border: "1px solid #cdd6e2",
              borderRadius: 4,
              padding: "2px 6px",
              fontSize: 11,
              fontFamily: "monospace",
              color: "#1a2333",
            }}
          >
            <strong>{e.name}</strong> = {String(e.value)}
          </div>
        ) : (
          <div
            key={e.name}
            style={{
              background: "rgba(255,255,255,0.92)",
              border: "1px solid #cdd6e2",
              borderRadius: 4,
              padding: "2px 6px",
              fontSize: 11,
              fontFamily: "monospace",
              color: "#1a2333",
              maxHeight: 96,
              overflow: "auto",
            }}
          >
            <strong>{e.name}</strong> ({(e.value as Array<unknown>).length})
            <ol style={{ margin: "2px 0 0 18px", padding: 0 }}>
              {(e.value as Array<unknown>).map((v, i) => (
                <li key={i}>{String(v)}</li>
              ))}
            </ol>
          </div>
        )
      )}
    </div>
  );
}

/**
 * Floating speech/thought bubble layer drawn above the stage canvas.
 *
 * Uses the same canvas → screen-pixel mapping as the canvas renderer so
 * bubbles track sprite movement in real time. Anchored to the top-right
 * of the sprite's bounding box; clamps to the stage interior so a bubble
 * near an edge stays readable.
 */
/**
 * Toggles fullscreen "player mode" — App.tsx hides the rest of the
 * studio chrome and re-renders only the StagePanel when this flag is
 * on. Title swaps between "Enter player mode" and "Exit player mode (Esc)"
 * so the same button does both.
 */
function SpriteNamesToggleButton() {
  const showSpriteNames = useUiStore((s) => s.showSpriteNames);
  const toggleSpriteNames = useUiStore((s) => s.toggleSpriteNames);
  return (
    <button
      type="button"
      className="stage-panel-btn"
      onClick={toggleSpriteNames}
      title={
        showSpriteNames
          ? "Hide sprite names on the stage"
          : "Show sprite names on the stage"
      }
    >
      {showSpriteNames ? "Aa" : "A̶a̶"}
    </button>
  );
}

function PlayerModeButton() {
  const playerMode = useUiStore((s) => s.playerMode);
  const togglePlayerMode = useUiStore((s) => s.togglePlayerMode);
  return (
    <button
      type="button"
      className="stage-panel-btn"
      onClick={togglePlayerMode}
      title={playerMode ? "Exit player mode (Esc)" : "Enter player mode (fullscreen stage)"}
    >
      {playerMode ? "✕" : "⛶"}
    </button>
  );
}

/**
 * Renders the Scratch-style "ask" prompt: a bar pinned to the bottom of
 * the stage with the question text and an input. Subscribes to the ask
 * runtime — when a script runs `ask "Q" and wait`, the overlay appears;
 * pressing Enter (or clicking the check button) submits the answer and
 * the script continues.
 */
function AskOverlay() {
  const [pending, setPending] = useState(getPendingAsk());
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return subscribeAsk(() => setPending(getPendingAsk()));
  }, []);

  // Reset the draft and focus the input each time a new question arrives.
  useEffect(() => {
    if (pending) {
      setDraft("");
      // Defer to next tick so the input is mounted before focus.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [pending]);

  if (!pending) return null;

  const submit = () => {
    submitAskAnswer(draft);
  };

  return (
    <div
      className="stage-ask-overlay"
      style={{
        position: "absolute",
        left: 8,
        right: 8,
        bottom: 8,
        background: "rgba(255, 255, 255, 0.96)",
        border: "1px solid #cdd6e2",
        borderRadius: 6,
        padding: "8px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
      }}
    >
      {pending.question ? (
        <div style={{ fontSize: 12, color: "#1a2333" }}>{pending.question}</div>
      ) : null}
      <div style={{ display: "flex", gap: 6 }}>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          style={{
            flex: 1,
            border: "1px solid #cdd6e2",
            borderRadius: 14,
            padding: "4px 10px",
            fontSize: 12,
            outline: "none",
            font: "inherit",
          }}
        />
        <button
          type="button"
          onClick={submit}
          title="Submit"
          style={{
            width: 28,
            height: 28,
            border: "none",
            borderRadius: 14,
            background: "#1967d2",
            color: "#fff",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          ✓
        </button>
      </div>
    </div>
  );
}

function BubbleOverlay({ sprites }: { sprites: Sprite[] }) {
  const visible = sprites.filter((s) => s.visible && s.bubble);
  return (
    <div
      className="stage-bubble-layer"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
    >
      {visible.map((s) => {
        // s.bubble is non-null due to the filter, but TS narrowing can't see that.
        const bubble = s.bubble!;
        const px = STAGE_WIDTH / 2 + s.x;
        const py = STAGE_HEIGHT / 2 - s.y;
        const sizePx = (SPRITE_PLACEHOLDER_SIZE * s.size) / 100;
        const left = Math.min(STAGE_WIDTH - 8, Math.max(8, px + sizePx / 2 + 6));
        const top = Math.max(8, py - sizePx / 2 - 32);
        return (
          <div
            key={s.id}
            className={`stage-bubble stage-bubble-${bubble.kind}`}
            style={{
              position: "absolute",
              left: `${(left / STAGE_WIDTH) * 100}%`,
              top: `${(top / STAGE_HEIGHT) * 100}%`,
              maxWidth: 160,
              padding: "4px 8px",
              borderRadius: bubble.kind === "think" ? 12 : 6,
              background: "#fff",
              border: "1px solid #cdd6e2",
              boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
              fontSize: 12,
              fontFamily: "sans-serif",
              color: "#1a2333",
              wordWrap: "break-word",
              fontStyle: bubble.kind === "think" ? "italic" : "normal",
            }}
          >
            {bubble.text}
          </div>
        );
      })}
    </div>
  );
}

function SpriteInspector({ sprite }: { sprite: Sprite }) {
  const updateSprite = useStageStore((s) => s.updateSprite);
  return (
    <section className="sprite-inspector">
      <h4>{sprite.name}</h4>
      <div className="sprite-inspector-grid">
        <label>
          Name
          <input
            type="text"
            value={sprite.name}
            onChange={(e) => updateSprite(sprite.id, { name: e.target.value })}
          />
        </label>
        <label>
          x
          <input
            type="number"
            value={sprite.x}
            onChange={(e) =>
              updateSprite(sprite.id, { x: Number.parseFloat(e.target.value) || 0 })
            }
          />
        </label>
        <label>
          y
          <input
            type="number"
            value={sprite.y}
            onChange={(e) =>
              updateSprite(sprite.id, { y: Number.parseFloat(e.target.value) || 0 })
            }
          />
        </label>
        <label>
          dir
          <input
            type="number"
            value={sprite.direction}
            onChange={(e) =>
              updateSprite(sprite.id, {
                direction: Number.parseFloat(e.target.value) || 0,
              })
            }
          />
        </label>
        <label>
          size %
          <input
            type="number"
            value={sprite.size}
            onChange={(e) =>
              updateSprite(sprite.id, {
                size: Math.max(1, Number.parseFloat(e.target.value) || 100),
              })
            }
          />
        </label>
        <label className="sprite-inspector-checkbox">
          <input
            type="checkbox"
            checked={sprite.visible}
            onChange={(e) => updateSprite(sprite.id, { visible: e.target.checked })}
          />
          visible
        </label>
      </div>
      {/* Costume + Sound pickers moved out — they're now top-level
          tabs in the EditorPanel (Code / Costumes / Sounds), matching
          Scratch's workflow. */}
    </section>
  );
}

/**
 * Read a File as a base64 data URL — the storage shape Phase 8 uses for
 * costumes and sounds. Inline base64 keeps assets travelling with the
 * project file with no Tauri filesystem hop.
 */
function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Stable ID generator for new asset records / costume entries. */
function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function appendAsset(asset: AssetRecord): void {
  const project = useProjectStore.getState().project;
  if (!project) return;
  useProjectStore.getState().setProject({
    ...project,
    assets: [...project.assets, asset],
  });
}

/**
 * Probe an image data URL for its natural dimensions so newly-imported
 * costumes have a sane center-point on first import. Resolves to (0, 0)
 * for non-image assets so callers can use that as "unknown".
 */
function probeImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    if (typeof Image === "undefined") {
      resolve({ width: 0, height: 0 });
      return;
    }
    const img = new Image();
    img.onload = () =>
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = dataUrl;
  });
}

export function CostumePicker({ sprite }: { sprite: Sprite }) {
  const project = useProjectStore((s) => s.project);
  const setProject = useProjectStore((s) => s.setProject);
  const updateSprite = useStageStore((s) => s.updateSprite);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  // Either "new" (paint fresh costume) or the index of an existing one
  // to edit. Closing the editor clears this back to null.
  const [editorTarget, setEditorTarget] = useState<"new" | number | null>(null);
  // Vector editor target — separate from the bitmap editorTarget so the
  // picker can route to whichever editor matches the costume's format
  // without confusing the two state machines.
  const [vectorTarget, setVectorTarget] = useState<"new" | number | null>(null);

  const importLibraryCostume = (entry: LibraryEntry, dataUrl: string) => {
    const assetId = makeId("asset");
    appendAsset({
      id: assetId,
      kind: "costume",
      path: dataUrl,
      metadata: { source: "builtin", builtin_id: entry.id },
      created_at: new Date().toISOString(),
      version: 1,
    });
    const costume = {
      id: makeId("costume"),
      name: entry.name,
      assetId,
      centerX: 50,
      centerY: 50,
      width: 100,
      height: 100,
    };
    updateSprite(sprite.id, {
      costumes: [...sprite.costumes, costume],
      costumeIndex:
        sprite.costumeIndex < 0 ? sprite.costumes.length : sprite.costumeIndex,
    });
  };

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const newCostumes: Costume[] = [];
    for (const file of Array.from(files)) {
      try {
        const dataUrl = await readFileAsDataURL(file);
        const { width, height } = await probeImageSize(dataUrl);
        const assetId = makeId("asset");
        const asset: AssetRecord = {
          id: assetId,
          kind: "costume",
          path: dataUrl,
          metadata: { source_filename: file.name, mime: file.type },
          created_at: new Date().toISOString(),
          version: 1,
        };
        appendAsset(asset);
        newCostumes.push({
          id: makeId("costume"),
          name: file.name.replace(/\.[^.]+$/, ""),
          assetId,
          centerX: Math.floor(width / 2),
          centerY: Math.floor(height / 2),
          width,
          height,
        });
      } catch {
        // Skip files that fail to read.
      }
    }
    if (newCostumes.length === 0) return;
    const merged = [...sprite.costumes, ...newCostumes];
    updateSprite(sprite.id, {
      costumes: merged,
      // First-import case: switch to the newly added costume so the
      // user sees it on the stage immediately.
      costumeIndex: sprite.costumeIndex < 0 ? sprite.costumes.length : sprite.costumeIndex,
    });
  };

  return (
    <section className="sprite-costume-picker" style={{ marginTop: 8 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <strong style={{ fontSize: 12 }}>Costumes ({sprite.costumes.length})</strong>
        <button
          type="button"
          className="sprite-list-btn"
          onClick={() => setEditorTarget("new")}
          title="Paint a new bitmap costume from scratch"
          style={{ marginRight: 4 }}
        >
          + Paint
        </button>
        <button
          type="button"
          className="sprite-list-btn"
          onClick={() => setVectorTarget("new")}
          title="Create a new vector costume (SVG primitives — scales losslessly)"
          style={{ marginRight: 4 }}
        >
          + Vector
        </button>
        <button
          type="button"
          className="sprite-list-btn"
          onClick={() => setShowLibrary(true)}
          title="Pick a costume from the built-in library"
          style={{ marginRight: 4 }}
        >
          + Library
        </button>
        <button
          type="button"
          className="sprite-list-btn"
          onClick={() => fileInputRef.current?.click()}
        >
          + Import
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/svg+xml,image/gif"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            void onFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </header>
      {sprite.costumes.length > 0 ? (
        <ul style={{ listStyle: "none", padding: 0, margin: "4px 0 0" }}>
          {sprite.costumes.map((c, i) => (
            <li
              key={c.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "2px 4px",
                fontSize: 11,
                background: i === sprite.costumeIndex ? "#dde8fa" : "transparent",
                borderRadius: 3,
              }}
            >
              <button
                type="button"
                onClick={() => updateSprite(sprite.id, { costumeIndex: i })}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  textAlign: "left",
                  cursor: "pointer",
                  flex: 1,
                  color: "inherit",
                  font: "inherit",
                }}
              >
                {c.name}
                {c.width > 0 ? ` (${c.width}×${c.height})` : ""}
              </button>
              <button
                type="button"
                title="Edit in paint editor"
                onClick={() => {
                  // Route vector costumes (those carrying a saved
                  // shape list in the asset metadata) to the vector
                  // editor; everything else opens the bitmap editor.
                  // Imported SVGs without a shape list go through the
                  // bitmap editor so the user can still annotate, at
                  // the cost of lossless scaling.
                  if (vectorShapesFor(project, sprite.costumes[i]).length > 0) {
                    setVectorTarget(i);
                  } else {
                    setEditorTarget(i);
                  }
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#5b6371",
                  padding: "0 4px",
                }}
              >
                ✎
              </button>
              <button
                type="button"
                title="Remove costume"
                onClick={() => {
                  const next = sprite.costumes.filter((_, j) => j !== i);
                  updateSprite(sprite.id, {
                    costumes: next,
                    costumeIndex: Math.min(sprite.costumeIndex, next.length - 1),
                  });
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#a04050",
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {showLibrary ? (
        <LibraryDialog
          kind="sprite"
          onClose={() => setShowLibrary(false)}
          onPick={importLibraryCostume}
        />
      ) : null}
      {editorTarget !== null ? (
        <CostumeEditor
          title={
            editorTarget === "new"
              ? "New Costume"
              : `Edit: ${sprite.costumes[editorTarget]?.name ?? "Costume"}`
          }
          width={200}
          height={200}
          initialImage={
            editorTarget === "new"
              ? null
              : getInitialImageForCostume(sprite, editorTarget)
          }
          onCancel={() => setEditorTarget(null)}
          onSave={(dataUrl) => {
            if (editorTarget === "new") {
              const assetId = makeId("asset");
              appendAsset({
                id: assetId,
                kind: "costume",
                path: dataUrl,
                metadata: { source: "paint" },
                created_at: new Date().toISOString(),
                version: 1,
              });
              const costume = {
                id: makeId("costume"),
                name: `Costume ${sprite.costumes.length + 1}`,
                assetId,
                centerX: 100,
                centerY: 100,
                width: 200,
                height: 200,
              };
              updateSprite(sprite.id, {
                costumes: [...sprite.costumes, costume],
                costumeIndex:
                  sprite.costumeIndex < 0
                    ? sprite.costumes.length
                    : sprite.costumeIndex,
              });
            } else {
              // Edit-in-place: rewrite the existing asset's `path` and
              // evict the cache so the next render decodes the new
              // image. Stable assetId means scripts referencing the
              // costume keep working.
              const target = sprite.costumes[editorTarget];
              if (target?.assetId) {
                replaceAssetPath(target.assetId, dataUrl);
                evictCostume(target.assetId);
              }
            }
            setEditorTarget(null);
          }}
        />
      ) : null}
      {vectorTarget !== null ? (
        <VectorCostumeEditor
          title={
            vectorTarget === "new"
              ? "New Vector Costume"
              : `Edit: ${sprite.costumes[vectorTarget]?.name ?? "Costume"}`
          }
          width={200}
          height={200}
          initialShapes={
            vectorTarget === "new"
              ? []
              : vectorShapesFor(project, sprite.costumes[vectorTarget])
          }
          onCancel={() => setVectorTarget(null)}
          onSave={(dataUrl, shapes) => {
            if (vectorTarget === "new") {
              const assetId = makeId("asset");
              appendAsset({
                id: assetId,
                kind: "costume",
                path: dataUrl,
                // The shape list is the source of truth — re-edits
                // restore the editor state from here. The SVG `path`
                // is the cached render for the canvas + codegen.
                metadata: {
                  source: "vector",
                  vector_shapes: shapes,
                  mime: "image/svg+xml",
                },
                created_at: new Date().toISOString(),
                version: 1,
              });
              updateSprite(sprite.id, {
                costumes: [
                  ...sprite.costumes,
                  {
                    id: makeId("costume"),
                    name: `Costume ${sprite.costumes.length + 1}`,
                    assetId,
                    centerX: 100,
                    centerY: 100,
                    width: 200,
                    height: 200,
                  },
                ],
                costumeIndex:
                  sprite.costumeIndex < 0
                    ? sprite.costumes.length
                    : sprite.costumeIndex,
              });
            } else {
              // Edit-in-place: replace both the rendered SVG and the
              // shape list. We can't use replaceAssetPath here because
              // we need to update metadata as well — write through the
              // project store directly.
              const target = sprite.costumes[vectorTarget];
              if (target?.assetId && project) {
                setProject({
                  ...project,
                  assets: project.assets.map((a) =>
                    a.id === target.assetId
                      ? {
                          ...a,
                          path: dataUrl,
                          metadata: {
                            ...a.metadata,
                            source: "vector",
                            vector_shapes: shapes,
                            mime: "image/svg+xml",
                          },
                          version: a.version + 1,
                        }
                      : a,
                  ),
                });
                evictCostume(target.assetId);
              }
            }
            setVectorTarget(null);
          }}
        />
      ) : null}
    </section>
  );
}

/** Read the costume's stored asset path so the editor opens with the
 *  current image already drawn onto the canvas. Falls back to null
 *  when the costume has no asset (renderer would show a placeholder). */
function getInitialImageForCostume(sprite: Sprite, idx: number): string | null {
  const costume = sprite.costumes[idx];
  if (!costume?.assetId) return null;
  const project = useProjectStore.getState().project;
  if (!project) return null;
  const asset = project.assets.find((a) => a.id === costume.assetId);
  return asset?.path ?? null;
}

/** Look up the saved vector shape list for a costume. Returns an empty
 *  array when the costume isn't a vector costume we created (no shape
 *  list in metadata) — the caller uses that as the signal to fall back
 *  to the bitmap editor. */
function vectorShapesFor(
  project: ReturnType<typeof useProjectStore.getState>["project"],
  costume: Costume | undefined,
): VectorShape[] {
  if (!project || !costume?.assetId) return [];
  const asset = project.assets.find((a) => a.id === costume.assetId);
  const raw = asset?.metadata?.vector_shapes;
  if (!Array.isArray(raw)) return [];
  return raw as VectorShape[];
}

/** In-place asset replacement — used by edit-in-place flows so a
 *  costume keeps its assetId (and any sprites referencing it stay
 *  pointed at the same record). */
function replaceAssetPath(assetId: string, newPath: string): void {
  const project = useProjectStore.getState().project;
  if (!project) return;
  useProjectStore.getState().setProject({
    ...project,
    assets: project.assets.map((a) =>
      a.id === assetId ? { ...a, path: newPath, version: a.version + 1 } : a,
    ),
  });
}

export function SoundPicker({ sprite }: { sprite: Sprite }) {
  const updateSprite = useStageStore((s) => s.updateSprite);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [editingSoundId, setEditingSoundId] = useState<string | null>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    const newSounds: SpriteSound[] = [];
    for (const file of Array.from(files)) {
      try {
        const dataUrl = await readFileAsDataURL(file);
        const assetId = makeId("asset");
        const asset: AssetRecord = {
          id: assetId,
          kind: "sound",
          path: dataUrl,
          metadata: { source_filename: file.name, mime: file.type },
          created_at: new Date().toISOString(),
          version: 1,
        };
        appendAsset(asset);
        newSounds.push({
          id: makeId("sound"),
          name: file.name.replace(/\.[^.]+$/, ""),
          assetId,
        });
      } catch {
        /* skip */
      }
    }
    if (newSounds.length === 0) return;
    updateSprite(sprite.id, { sounds: [...sprite.sounds, ...newSounds] });
  };

  // Add a library entry as a new sound — same import pipeline as a file
  // upload, but the bytes come from the local synthesizer.
  const importLibrarySound = (entry: SoundLibraryEntry, dataUrl: string) => {
    const assetId = makeId("asset");
    appendAsset({
      id: assetId,
      kind: "sound",
      path: dataUrl,
      metadata: { source: "builtin", builtin_id: entry.id, mime: "audio/wav" },
      created_at: new Date().toISOString(),
      version: 1,
    });
    updateSprite(sprite.id, {
      sounds: [
        ...sprite.sounds,
        { id: makeId("sound"), name: entry.name, assetId },
      ],
    });
  };

  const editingSound = editingSoundId
    ? sprite.sounds.find((s) => s.id === editingSoundId) ?? null
    : null;

  return (
    <section className="sprite-sound-picker" style={{ marginTop: 8 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 4,
        }}
      >
        <strong style={{ fontSize: 12 }}>Sounds ({sprite.sounds.length})</strong>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            type="button"
            className="sprite-list-btn"
            onClick={() => setShowLibrary(true)}
            title="Pick a sound from the built-in library"
          >
            + Library
          </button>
          <button
            type="button"
            className="sprite-list-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Import an audio file"
          >
            + Import
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            void onFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </header>
      {sprite.sounds.length > 0 ? (
        <ul style={{ listStyle: "none", padding: 0, margin: "4px 0 0" }}>
          {sprite.sounds.map((snd, i) => (
            <li
              key={snd.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "2px 4px",
                fontSize: 11,
                gap: 4,
              }}
            >
              <input
                type="text"
                value={snd.name}
                onChange={(e) => {
                  const name = e.target.value;
                  const next = sprite.sounds.map((s, j) =>
                    j === i ? { ...s, name } : s,
                  );
                  updateSprite(sprite.id, { sounds: next });
                }}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "1px solid transparent",
                  font: "inherit",
                  fontSize: 11,
                  padding: "1px 4px",
                  borderRadius: 2,
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#cdd6e2";
                  e.currentTarget.style.background = "#fff";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "transparent";
                  e.currentTarget.style.background = "transparent";
                }}
              />
              <button
                type="button"
                title="Edit sound"
                onClick={() => setEditingSoundId(snd.id)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#1967d2",
                  fontSize: 12,
                  padding: 0,
                }}
              >
                ✎
              </button>
              <button
                type="button"
                title="Remove sound"
                onClick={() => {
                  const next = sprite.sounds.filter((_, j) => j !== i);
                  updateSprite(sprite.id, { sounds: next });
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#a04050",
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {showLibrary ? (
        <SoundLibraryDialog
          onClose={() => setShowLibrary(false)}
          onPick={importLibrarySound}
        />
      ) : null}
      {editingSound ? (
        <SoundEditor
          sound={editingSound}
          onClose={() => setEditingSoundId(null)}
        />
      ) : null}
    </section>
  );
}

/**
 * Stage-scope backdrop picker — TurboWarp/Scratch-style. Backdrops are
 * full-stage images (or solid colors) selected by `backdropIndex`. Two
 * import paths:
 *
 *   1. Import: file picker → PNG/JPEG/SVG → AssetRecord (kind costume)
 *   2. Solid Color: HTML color picker → render an offscreen 480×360
 *      canvas filled with that color → toDataURL → AssetRecord. Avoids
 *      shipping a paint editor; gets the user a coloured background in
 *      one click.
 */
export function BackdropPicker() {
  const backdrops = useStageStore((s) => s.backdrops);
  const backdropIndex = useStageStore((s) => s.backdropIndex);
  const addBackdrop = useStageStore((s) => s.addBackdrop);
  const removeBackdrop = useStageStore((s) => s.removeBackdrop);
  const setBackdropIndex = useStageStore((s) => s.setBackdropIndex);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [solidColor, setSolidColor] = useState<string>("#9ec5e6");
  const [showLibrary, setShowLibrary] = useState(false);
  const [editorTarget, setEditorTarget] = useState<"new" | number | null>(null);

  // Add a library entry as a backdrop. Same import pipeline as a file
  // upload — write an asset record, then push to backdrops list and
  // make it active if it's the first one.
  const importLibraryEntry = (entry: LibraryEntry, dataUrl: string) => {
    const assetId = makeId("asset");
    appendAsset({
      id: assetId,
      kind: "costume",
      path: dataUrl,
      metadata: { role: "backdrop", source: "builtin", builtin_id: entry.id },
      created_at: new Date().toISOString(),
      version: 1,
    });
    addBackdrop({
      id: makeId("backdrop"),
      name: entry.name,
      assetId,
      centerX: STAGE_WIDTH / 2,
      centerY: STAGE_HEIGHT / 2,
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
    });
  };

  const importFiles = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      try {
        const dataUrl = await readFileAsDataURL(file);
        const { width, height } = await probeImageSize(dataUrl);
        const assetId = makeId("asset");
        appendAsset({
          id: assetId,
          kind: "costume",
          path: dataUrl,
          metadata: { source_filename: file.name, mime: file.type, role: "backdrop" },
          created_at: new Date().toISOString(),
          version: 1,
        });
        addBackdrop({
          id: makeId("backdrop"),
          name: file.name.replace(/\.[^.]+$/, ""),
          assetId,
          centerX: Math.floor(width / 2),
          centerY: Math.floor(height / 2),
          width,
          height,
        });
      } catch {
        /* skip files that fail to read */
      }
    }
  };

  const addSolidColor = () => {
    // Render the chosen color into a 480×360 canvas → data URL.
    const canvas = document.createElement("canvas");
    canvas.width = STAGE_WIDTH;
    canvas.height = STAGE_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = solidColor;
    ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    const dataUrl = canvas.toDataURL("image/png");
    const assetId = makeId("asset");
    appendAsset({
      id: assetId,
      kind: "costume",
      path: dataUrl,
      metadata: { role: "backdrop", solid_color: solidColor },
      created_at: new Date().toISOString(),
      version: 1,
    });
    addBackdrop({
      id: makeId("backdrop"),
      name: `Color ${solidColor}`,
      assetId,
      centerX: STAGE_WIDTH / 2,
      centerY: STAGE_HEIGHT / 2,
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
    });
  };

  return (
    <section className="stage-backdrop-picker" style={{ marginTop: 12 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 6,
        }}
      >
        <strong style={{ fontSize: 12 }}>Backdrops ({backdrops.length})</strong>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <input
            type="color"
            value={solidColor}
            onChange={(e) => setSolidColor(e.target.value)}
            title="Pick a solid background color"
            style={{ width: 24, height: 24, border: "none", padding: 0, cursor: "pointer" }}
          />
          <button
            type="button"
            className="sprite-list-btn"
            onClick={() => setEditorTarget("new")}
            title="Paint a new backdrop"
          >
            + Paint
          </button>
          <button
            type="button"
            className="sprite-list-btn"
            onClick={addSolidColor}
            title="Add a solid-color backdrop using the color above"
          >
            + Color
          </button>
          <button
            type="button"
            className="sprite-list-btn"
            onClick={() => setShowLibrary(true)}
            title="Pick a backdrop from the built-in library"
          >
            + Library
          </button>
          <button
            type="button"
            className="sprite-list-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Import an image (PNG / JPEG / SVG) as a backdrop"
          >
            + Image
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/gif"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              void importFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </header>
      {backdrops.length > 0 ? (
        <ul style={{ listStyle: "none", padding: 0, margin: "4px 0 0" }}>
          {backdrops.map((b, i) => (
            <li
              key={b.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "2px 4px",
                fontSize: 11,
                background: i === backdropIndex ? "#dde8fa" : "transparent",
                borderRadius: 3,
              }}
            >
              <button
                type="button"
                onClick={() => setBackdropIndex(i)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  textAlign: "left",
                  cursor: "pointer",
                  flex: 1,
                  color: "inherit",
                  font: "inherit",
                }}
              >
                {b.name}
              </button>
              <button
                type="button"
                title="Edit in paint editor"
                onClick={() => setEditorTarget(i)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#5b6371",
                  padding: "0 4px",
                }}
              >
                ✎
              </button>
              <button
                type="button"
                title="Remove backdrop"
                onClick={() => removeBackdrop(i)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "#a04050",
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {showLibrary ? (
        <LibraryDialog
          kind="backdrop"
          onClose={() => setShowLibrary(false)}
          onPick={importLibraryEntry}
        />
      ) : null}
      {editorTarget !== null ? (
        <CostumeEditor
          title={
            editorTarget === "new"
              ? "New Backdrop"
              : `Edit: ${backdrops[editorTarget]?.name ?? "Backdrop"}`
          }
          width={STAGE_WIDTH}
          height={STAGE_HEIGHT}
          initialImage={
            editorTarget === "new"
              ? null
              : getInitialImageForBackdrop(backdrops, editorTarget)
          }
          onCancel={() => setEditorTarget(null)}
          onSave={(dataUrl) => {
            if (editorTarget === "new") {
              const assetId = makeId("asset");
              appendAsset({
                id: assetId,
                kind: "costume",
                path: dataUrl,
                metadata: { role: "backdrop", source: "paint" },
                created_at: new Date().toISOString(),
                version: 1,
              });
              addBackdrop({
                id: makeId("backdrop"),
                name: `Backdrop ${backdrops.length + 1}`,
                assetId,
                centerX: STAGE_WIDTH / 2,
                centerY: STAGE_HEIGHT / 2,
                width: STAGE_WIDTH,
                height: STAGE_HEIGHT,
              });
            } else {
              const target = backdrops[editorTarget];
              if (target?.assetId) {
                replaceAssetPath(target.assetId, dataUrl);
                evictCostume(target.assetId);
              }
            }
            setEditorTarget(null);
          }}
        />
      ) : null}
    </section>
  );
}

/** Read the backdrop's stored asset path so editing pre-fills the canvas. */
function getInitialImageForBackdrop(
  backdrops: { assetId?: string }[],
  idx: number
): string | null {
  const b = backdrops[idx];
  if (!b?.assetId) return null;
  const project = useProjectStore.getState().project;
  if (!project) return null;
  const asset = project.assets.find((a) => a.id === b.assetId);
  return asset?.path ?? null;
}
