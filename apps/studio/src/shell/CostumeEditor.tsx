import { useEffect, useRef, useState } from "react";

/**
 * Modal canvas paint editor for costumes + backdrops.
 *
 * Tools: pen, eraser, line, rectangle, ellipse, fill, eyedropper, text.
 * Shape tools support fill-vs-stroke toggle. Color picker + 12-swatch
 * palette. Brush/font size slider. Undo / redo (Ctrl+Z, Ctrl+Shift+Z)
 * with a per-canvas history stack capped at 50 frames. Optional
 * transparent background (with a checkered placeholder while editing).
 *
 * Save flow: `canvas.toDataURL("image/png")` becomes the new asset
 * path. Caller decides whether to write a new asset record or update
 * an existing one in place.
 */

type Tool =
  | "select"
  | "pen"
  | "eraser"
  | "line"
  | "rect"
  | "ellipse"
  | "fill"
  | "eyedropper"
  | "text";

/** Active selection state. While set, the canvas is a composite of
 *  `snapshot` (the canvas as it was when the selection began) plus the
 *  floating `image` drawn at the current `rect`. Committing paints
 *  the floating image onto the snapshot at the final rect; cancelling
 *  restores the snapshot untouched. */
interface SelectionState {
  rect: { x: number; y: number; w: number; h: number };
  image: ImageData;
  /** Pre-selection canvas — what we restore to on cancel. */
  snapshot: ImageData;
}

type SelInteraction =
  | { kind: "defining"; startX: number; startY: number }
  | { kind: "moving"; offsetX: number; offsetY: number }
  | {
      kind: "resizing";
      anchor: "tl" | "tr" | "bl" | "br" | "t" | "b" | "l" | "r";
      // Snapshot of the rect at drag start (so each mousemove computes
      // the new rect from the original anchor, not incrementally).
      origRect: { x: number; y: number; w: number; h: number };
    }
  | null;

const HANDLE_SIZE = 8;

interface Props {
  title: string;
  /** Initial canvas width. The user can change it via the size inputs;
   *  the saved PNG matches the canvas size at the moment of Save. */
  width: number;
  height: number;
  initialImage?: string | null;
  onCancel(): void;
  onSave(dataUrl: string): void;
}

/** Preset canvas sizes — small icons / standard sprite / standard
 *  stage / hi-res. Show in the size dropdown for one-click resize. */
const SIZE_PRESETS: Array<{ label: string; w: number; h: number }> = [
  { label: "32 × 32 (icon)", w: 32, h: 32 },
  { label: "64 × 64", w: 64, h: 64 },
  { label: "100 × 100 (sprite)", w: 100, h: 100 },
  { label: "200 × 200", w: 200, h: 200 },
  { label: "480 × 360 (stage)", w: 480, h: 360 },
  { label: "800 × 600", w: 800, h: 600 },
];

interface Point {
  x: number;
  y: number;
}

const HISTORY_CAP = 50;

const PALETTE: string[] = [
  "#000000", "#ffffff", "#7a7a7a", "#cdd6e2",
  "#e84a4a", "#ff9933", "#ffd633", "#5ab058",
  "#3a8af0", "#7a4ae8", "#e84a78", "#a8a8b0",
];

export function CostumeEditor({
  title,
  width: initialWidth,
  height: initialHeight,
  initialImage,
  onCancel,
  onSave,
}: Props) {
  // The canvas dims are state — the user can resize on the fly via the
  // W/H inputs or a preset. We do NOT use the props directly for the
  // running canvas; only as the initial values.
  const [width, setWidth] = useState(initialWidth);
  const [height, setHeight] = useState(initialHeight);
  // Drafts for the W/H inputs so the user can type freely (e.g. delete
  // and re-type) without the canvas resizing on every keystroke.
  const [widthDraft, setWidthDraft] = useState(String(initialWidth));
  const [heightDraft, setHeightDraft] = useState(String(initialHeight));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // Snapshot at mousedown — used by shape tools so the in-progress
  // preview doesn't smear across previous frames.
  const snapshotRef = useRef<ImageData | null>(null);
  const startRef = useRef<Point | null>(null);
  const drawingRef = useRef(false);
  // Undo / redo stacks. We store ImageData snapshots; size is bounded
  // by HISTORY_CAP × width × height × 4 bytes — typical 480×360 frame
  // is ~700KB, so 50 frames ≈ 33MB worst case. Acceptable for an
  // active edit session.
  const historyRef = useRef<ImageData[]>([]);
  const futureRef = useRef<ImageData[]>([]);

  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#1a2333");
  const [size, setSize] = useState(4);
  const [fillShapes, setFillShapes] = useState(false);
  const [transparent, setTransparent] = useState(false);
  // Display zoom — canvas pixels stay the same; only the displayed
  // size scales. canvasPos() already handles scale via the bounding
  // rect, so input coordinates remain correct.
  const [zoom, setZoom] = useState(1);
  // Selection state — when non-null, the canvas displays as
  // `snapshot + floating image at rect`. Committed on tool change /
  // outside-click; cancelled on Escape.
  const selectionRef = useRef<SelectionState | null>(null);
  const selInteractionRef = useRef<SelInteraction>(null);
  // Force re-render when selection rect changes (handles, dashed border).
  const [selectionTick, setSelectionTick] = useState(0);
  const bumpSel = () => setSelectionTick((t) => t + 1);
  // Wrapper around the canvas: lets us measure available space for the
  // "Fit" zoom mode.
  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);
  // Text tool: when the user clicks the canvas with the text tool, we
  // remember the click point and pop a centered dialog. They type their
  // string there; on OK we draw it onto the canvas at the click point.
  // (Earlier versions used an inline overlay that floated over the
  // canvas at the exact click coords — clever but fragile around CSS
  // scaling, scroll position, and resize. The centered dialog is dumber
  // and obviously correct.)
  const [textPrompt, setTextPrompt] = useState<{ x: number; y: number } | null>(null);
  const [textDraft, setTextDraft] = useState("");
  // Force re-render on undo/redo so disabled state on the buttons updates.
  const [historyTick, setHistoryTick] = useState(0);

  // Initialize canvas: optional transparent / white fill + initial image.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (transparent) {
      ctx.clearRect(0, 0, width, height);
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }
    if (initialImage) {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(width / img.naturalWidth, height / img.naturalHeight);
        const w = img.naturalWidth * scale;
        const h = img.naturalHeight * scale;
        ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);
        // Reset history with the loaded image as the baseline.
        historyRef.current = [ctx.getImageData(0, 0, width, height)];
        futureRef.current = [];
        setHistoryTick((t) => t + 1);
      };
      img.src = initialImage;
    } else {
      historyRef.current = [ctx.getImageData(0, 0, width, height)];
      futureRef.current = [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, initialImage]);

  // Keyboard shortcuts: Ctrl+Z / Ctrl+Shift+Z (and Cmd on macOS) +
  // Esc to cancel an active selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.key === "Escape" && selectionRef.current) {
        e.preventDefault();
        cancelSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the user switches away from the select tool, commit the
  // pending floating selection. This matches Scratch's behavior —
  // picking another tool finalizes the move.
  useEffect(() => {
    if (tool !== "select" && selectionRef.current) {
      commitSelection();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  /**
   * Render the selection on top of its snapshot — restore the snapshot,
   * draw the floating image at its current rect (scaled if the rect
   * was resized), then draw the dashed marquee + 8 handles. Called
   * after every selection mutation so the canvas stays in sync.
   */
  const redrawSelection = () => {
    const sel = selectionRef.current;
    const ctx = canvasRef.current?.getContext("2d");
    if (!sel || !ctx) return;
    ctx.putImageData(sel.snapshot, 0, 0);
    // Floating image: paint via a temporary canvas so we can use
    // drawImage's scaling to honor a resized rect.
    const tmp = document.createElement("canvas");
    tmp.width = sel.image.width;
    tmp.height = sel.image.height;
    tmp.getContext("2d")?.putImageData(sel.image, 0, 0);
    ctx.drawImage(tmp, sel.rect.x, sel.rect.y, sel.rect.w, sel.rect.h);
    // Marching-ants dashed border + handles.
    ctx.save();
    ctx.strokeStyle = "#1967d2";
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.strokeRect(sel.rect.x + 0.5, sel.rect.y + 0.5, sel.rect.w, sel.rect.h);
    ctx.restore();
    // Handles.
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#1967d2";
    ctx.lineWidth = 1;
    for (const [hx, hy] of handlePoints(sel.rect)) {
      const half = HANDLE_SIZE / 2;
      ctx.fillRect(hx - half, hy - half, HANDLE_SIZE, HANDLE_SIZE);
      ctx.strokeRect(hx - half, hy - half, HANDLE_SIZE, HANDLE_SIZE);
    }
  };

  /** Paint the floating selection onto the snapshot at its final rect,
   *  push history, and clear selection state. Idempotent — safe to
   *  call when no selection is active. */
  const commitSelection = () => {
    const sel = selectionRef.current;
    const ctx = canvasRef.current?.getContext("2d");
    if (!sel || !ctx) {
      selectionRef.current = null;
      selInteractionRef.current = null;
      return;
    }
    ctx.putImageData(sel.snapshot, 0, 0);
    const tmp = document.createElement("canvas");
    tmp.width = sel.image.width;
    tmp.height = sel.image.height;
    tmp.getContext("2d")?.putImageData(sel.image, 0, 0);
    ctx.drawImage(tmp, sel.rect.x, sel.rect.y, sel.rect.w, sel.rect.h);
    selectionRef.current = null;
    selInteractionRef.current = null;
    pushHistory();
    bumpSel();
  };

  /** Restore the canvas to its pre-selection state, drop selection. */
  const cancelSelection = () => {
    const sel = selectionRef.current;
    const ctx = canvasRef.current?.getContext("2d");
    if (sel && ctx) ctx.putImageData(sel.snapshot, 0, 0);
    selectionRef.current = null;
    selInteractionRef.current = null;
    bumpSel();
  };

  const pushHistory = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const snap = ctx.getImageData(0, 0, width, height);
    historyRef.current.push(snap);
    if (historyRef.current.length > HISTORY_CAP) {
      historyRef.current.shift();
    }
    futureRef.current = [];
    setHistoryTick((t) => t + 1);
  };

  const undo = () => {
    if (historyRef.current.length <= 1) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const current = historyRef.current.pop()!;
    futureRef.current.push(current);
    const previous = historyRef.current[historyRef.current.length - 1];
    ctx.putImageData(previous, 0, 0);
    setHistoryTick((t) => t + 1);
  };

  const redo = () => {
    if (futureRef.current.length === 0) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const next = futureRef.current.pop()!;
    historyRef.current.push(next);
    ctx.putImageData(next, 0, 0);
    setHistoryTick((t) => t + 1);
  };

  const canvasPos = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * width,
      y: ((e.clientY - rect.top) / rect.height) * height,
    };
  };

  const onDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const p = canvasPos(e);

    // ── Selection tool ────────────────────────────────────────────
    if (tool === "select") {
      const sel = selectionRef.current;
      // If a selection is active, decide between resize / move /
      // commit-and-restart.
      if (sel) {
        const handle = handleAt(sel.rect, p.x, p.y);
        if (handle) {
          selInteractionRef.current = {
            kind: "resizing",
            anchor: handle,
            origRect: { ...sel.rect },
          };
          return;
        }
        const insideX = p.x >= sel.rect.x && p.x <= sel.rect.x + sel.rect.w;
        const insideY = p.y >= sel.rect.y && p.y <= sel.rect.y + sel.rect.h;
        if (insideX && insideY) {
          selInteractionRef.current = {
            kind: "moving",
            offsetX: p.x - sel.rect.x,
            offsetY: p.y - sel.rect.y,
          };
          return;
        }
        // Outside both rect and handles → commit current selection
        // and start defining a new one.
        commitSelection();
      }
      // Begin defining a new selection.
      selInteractionRef.current = { kind: "defining", startX: p.x, startY: p.y };
      // Snapshot current canvas now so we can preview the marquee
      // without altering pixels.
      const previewSnap = ctx.getImageData(0, 0, canvas.width, canvas.height);
      selectionRef.current = {
        rect: { x: p.x, y: p.y, w: 0, h: 0 },
        // Empty placeholder — we capture real pixels on mouseup.
        image: ctx.createImageData(1, 1),
        snapshot: previewSnap,
      };
      return;
    }

    // One-shot tools — no drag needed.
    if (tool === "fill") {
      floodFill(ctx, Math.round(p.x), Math.round(p.y), color);
      pushHistory();
      return;
    }
    if (tool === "eyedropper") {
      const data = ctx.getImageData(Math.round(p.x), Math.round(p.y), 1, 1).data;
      // RGB → hex. Skip alpha (text input doesn't accept rgba).
      const hex = "#" + [data[0], data[1], data[2]]
        .map((c) => c.toString(16).padStart(2, "0"))
        .join("");
      setColor(hex);
      // Switch back to pen so the next click draws with the picked color.
      setTool("pen");
      return;
    }
    if (tool === "text") {
      // Don't open the dialog from mousedown! If we did, the dialog
      // would mount between mousedown (on canvas) and mouseup (on the
      // freshly-rendered dialog), making the browser fire `click` on
      // their least-common ancestor — the editor's outer backdrop —
      // which dismisses the editor. Instead, defer to the canvas's
      // onClick handler below; by then the full mousedown/mouseup
      // cycle has resolved on the canvas itself.
      return;
    }

    startRef.current = p;
    drawingRef.current = true;
    if (tool === "pen" || tool === "eraser") {
      // Drop a single dot at the start so a click without drag still
      // leaves a mark. Use destination-out for the eraser when on a
      // transparent canvas — otherwise the eraser would paint white
      // and we'd lose transparency.
      ctx.save();
      if (tool === "eraser" && transparent) {
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = "rgba(0,0,0,1)";
      } else {
        ctx.fillStyle = tool === "eraser" ? "#ffffff" : color;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      snapshotRef.current = ctx.getImageData(0, 0, width, height);
    }
  };

  const onMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Selection drag handling — independent of the freehand drawingRef.
    if (selInteractionRef.current && selectionRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const p = canvasPos(e);
      const interaction = selInteractionRef.current;
      const sel = selectionRef.current;
      if (interaction.kind === "defining") {
        // Live marquee: redraw the snapshot, then stroke the rect.
        const x = Math.min(interaction.startX, p.x);
        const y = Math.min(interaction.startY, p.y);
        const w = Math.abs(p.x - interaction.startX);
        const h = Math.abs(p.y - interaction.startY);
        sel.rect = { x, y, w, h };
        ctx.putImageData(sel.snapshot, 0, 0);
        ctx.save();
        ctx.strokeStyle = "#1967d2";
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w, h);
        ctx.restore();
      } else if (interaction.kind === "moving") {
        sel.rect.x = p.x - interaction.offsetX;
        sel.rect.y = p.y - interaction.offsetY;
        redrawSelection();
      } else if (interaction.kind === "resizing") {
        sel.rect = resizeRect(interaction.origRect, interaction.anchor, p.x, p.y);
        redrawSelection();
      }
      return;
    }

    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !startRef.current) return;
    const p = canvasPos(e);

    if (tool === "pen" || tool === "eraser") {
      ctx.save();
      if (tool === "eraser" && transparent) {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        ctx.strokeStyle = tool === "eraser" ? "#ffffff" : color;
      }
      ctx.lineWidth = size;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(startRef.current.x, startRef.current.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.restore();
      startRef.current = p;
    } else {
      if (snapshotRef.current) ctx.putImageData(snapshotRef.current, 0, 0);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = size;
      const sx = startRef.current.x;
      const sy = startRef.current.y;
      ctx.beginPath();
      if (tool === "line") {
        ctx.moveTo(sx, sy);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      } else if (tool === "rect") {
        const rx = Math.min(sx, p.x);
        const ry = Math.min(sy, p.y);
        const rw = Math.abs(p.x - sx);
        const rh = Math.abs(p.y - sy);
        if (fillShapes) ctx.fillRect(rx, ry, rw, rh);
        else ctx.strokeRect(rx, ry, rw, rh);
      } else if (tool === "ellipse") {
        ctx.ellipse(
          (sx + p.x) / 2,
          (sy + p.y) / 2,
          Math.abs(p.x - sx) / 2,
          Math.abs(p.y - sy) / 2,
          0, 0, Math.PI * 2,
        );
        if (fillShapes) ctx.fill();
        else ctx.stroke();
      }
    }
  };

  const onUp = () => {
    // Selection: finish the current interaction. The selection stays
    // floating — it commits later (tool change, click outside, etc).
    if (selInteractionRef.current && selectionRef.current) {
      const interaction = selInteractionRef.current;
      const sel = selectionRef.current;
      if (interaction.kind === "defining") {
        // Normalize tiny / zero-size rects: just drop the selection.
        if (sel.rect.w < 2 || sel.rect.h < 2) {
          cancelSelection();
          return;
        }
        // Capture the pixels from the snapshot at the rect's bounds —
        // those become the floating image. Then clear that area on the
        // snapshot so the selection appears "lifted" off the canvas.
        const ctx = canvasRef.current?.getContext("2d");
        if (!ctx) return;
        // Reload pre-marquee snapshot (without the dashed border) and
        // grab the pixels under the rect from it.
        ctx.putImageData(sel.snapshot, 0, 0);
        const captured = ctx.getImageData(
          Math.round(sel.rect.x),
          Math.round(sel.rect.y),
          Math.round(sel.rect.w),
          Math.round(sel.rect.h),
        );
        // Clear the original area from the snapshot (transparent so
        // the float visually lifts off; on white-bg canvases we'd
        // ideally fill white instead, but the floating image gets
        // painted back on commit so users see continuity).
        const newSnapshot = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
        clearRectInImageData(newSnapshot, sel.rect, transparent);
        sel.snapshot = newSnapshot;
        sel.image = captured;
        redrawSelection();
      } else {
        // moving / resizing — normalize negative width/height (flip).
        if (sel.rect.w < 0) {
          sel.rect.x += sel.rect.w;
          sel.rect.w = -sel.rect.w;
        }
        if (sel.rect.h < 0) {
          sel.rect.y += sel.rect.h;
          sel.rect.h = -sel.rect.h;
        }
        redrawSelection();
      }
      selInteractionRef.current = null;
      bumpSel();
      return;
    }

    if (!drawingRef.current) return;
    drawingRef.current = false;
    startRef.current = null;
    snapshotRef.current = null;
    pushHistory();
  };

  const commitText = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!textPrompt || !ctx) {
      setTextPrompt(null);
      return;
    }
    const text = textDraft;
    if (text.length > 0) {
      ctx.save();
      ctx.fillStyle = color;
      ctx.font = `${Math.max(12, size * 4)}px sans-serif`;
      // Anchor at the click point as the BASELINE (the bottom of the
      // glyphs sit at y), which feels natural when picking a spot.
      ctx.textBaseline = "alphabetic";
      ctx.fillText(text, textPrompt.x, textPrompt.y);
      ctx.restore();
      pushHistory();
    }
    setTextPrompt(null);
  };

  /**
   * Resize the canvas, preserving existing pixels from the top-left.
   * Shrinking crops; growing fills the new area with white (or leaves
   * it transparent if the editor is in transparent mode). History
   * snapshot pushed so resize is itself undoable.
   */
  const resizeCanvas = (newW: number, newH: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const w = Math.max(1, Math.min(2048, Math.floor(newW)));
    const h = Math.max(1, Math.min(2048, Math.floor(newH)));
    if (w === width && h === height) return;
    // Snapshot current pixels via a temporary canvas so we don't lose
    // them when we mutate canvas.width/height (which clears the buffer).
    const tmp = document.createElement("canvas");
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    tmp.getContext("2d")?.drawImage(canvas, 0, 0);

    canvas.width = w;
    canvas.height = h;
    if (!transparent) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.clearRect(0, 0, w, h);
    }
    // Replay the snapshot from (0, 0) — top-left anchor. Cropped if
    // shrinking, no-stretch if growing.
    ctx.drawImage(tmp, 0, 0);

    setWidth(w);
    setHeight(h);
    setWidthDraft(String(w));
    setHeightDraft(String(h));
    // Reset history at the new size — old snapshots have wrong dims.
    historyRef.current = [ctx.getImageData(0, 0, w, h)];
    futureRef.current = [];
    setHistoryTick((t) => t + 1);
  };

  const applyDraftSize = () => {
    const w = parseInt(widthDraft, 10);
    const h = parseInt(heightDraft, 10);
    if (!Number.isFinite(w) || !Number.isFinite(h)) {
      setWidthDraft(String(width));
      setHeightDraft(String(height));
      return;
    }
    resizeCanvas(w, h);
  };

  /**
   * Crop the canvas to the active selection's rect — or, if no
   * selection, to the bounding box of all non-background pixels.
   * Resets history at the new size. Active selection commits first.
   */
  const cropCanvas = () => {
    if (selectionRef.current) commitSelection();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let cropRect: { x: number; y: number; w: number; h: number } | null = null;
    // Use selection if present (commitSelection cleared it just now,
    // so this branch never fires; the auto-detect path handles it).
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    cropRect = contentBoundingBox(img, transparent);
    if (!cropRect || cropRect.w <= 0 || cropRect.h <= 0) return;
    // Pull the cropped pixels via a temp canvas.
    const tmp = document.createElement("canvas");
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    tmp.getContext("2d")?.putImageData(img, 0, 0);
    canvas.width = cropRect.w;
    canvas.height = cropRect.h;
    if (!transparent) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cropRect.w, cropRect.h);
    } else {
      ctx.clearRect(0, 0, cropRect.w, cropRect.h);
    }
    ctx.drawImage(tmp, -cropRect.x, -cropRect.y);
    setWidth(cropRect.w);
    setHeight(cropRect.h);
    setWidthDraft(String(cropRect.w));
    setHeightDraft(String(cropRect.h));
    historyRef.current = [ctx.getImageData(0, 0, cropRect.w, cropRect.h)];
    futureRef.current = [];
    setHistoryTick((t) => t + 1);
  };

  /**
   * Translate the canvas content so its non-background bounding box
   * is centered. Useful for sprite costumes — Scratch sprites rotate
   * around the canvas center, so off-center artwork wobbles.
   */
  const centerCanvas = () => {
    if (selectionRef.current) commitSelection();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const bbox = contentBoundingBox(img, transparent);
    if (!bbox) return;
    const dx = Math.round(canvas.width / 2 - (bbox.x + bbox.w / 2));
    const dy = Math.round(canvas.height / 2 - (bbox.y + bbox.h / 2));
    if (dx === 0 && dy === 0) return;
    const tmp = document.createElement("canvas");
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    tmp.getContext("2d")?.drawImage(canvas, 0, 0);
    if (transparent) ctx.clearRect(0, 0, canvas.width, canvas.height);
    else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(tmp, dx, dy);
    pushHistory();
  };

  const clearCanvas = () => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    if (transparent) ctx.clearRect(0, 0, width, height);
    else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }
    pushHistory();
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL("image/png"));
  };

  const canUndo = historyRef.current.length > 1;
  const canRedo = futureRef.current.length > 0;
  // Suppress unused-var warning — historyTick is the trigger.
  void historyTick;

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20, 28, 44, 0.55)",
        zIndex: 1100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 6,
          boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
          // Drag-resize handle in the bottom-right corner. Native
          // browser feature when set on a block-level element with
          // overflow != visible.
          resize: "both",
          overflow: "auto",
          width: 720,
          height: 600,
          minWidth: 520,
          minHeight: 420,
          maxWidth: "94vw",
          maxHeight: "94vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 14px",
            borderBottom: "1px solid #cdd6e2",
            background: "#f5f7fb",
          }}
        >
          <strong style={{ fontSize: 14 }}>{title}</strong>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              style={toolbarButtonStyle(false, !canUndo)}
            >
              ↶ Undo
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo}
              title="Redo (Ctrl+Shift+Z)"
              style={toolbarButtonStyle(false, !canRedo)}
            >
              ↷ Redo
            </button>
            <button
              type="button"
              onClick={onCancel}
              style={{
                background: "none",
                border: "none",
                fontSize: 18,
                cursor: "pointer",
                color: "#5b6371",
                marginLeft: 4,
              }}
              title="Cancel"
            >
              ×
            </button>
          </div>
        </header>

        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            padding: "8px 14px",
            borderBottom: "1px solid #cdd6e2",
            fontSize: 12,
            flexWrap: "wrap",
          }}
        >
          {(
            ["select", "pen", "eraser", "line", "rect", "ellipse", "fill", "eyedropper", "text"] as Tool[]
          ).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTool(t)}
              style={toolbarButtonStyle(tool === t, false)}
            >
              {labelFor(t)}
            </button>
          ))}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginLeft: 8,
              cursor: "pointer",
            }}
            title="When on, rect/ellipse fill instead of stroking"
          >
            <input
              type="checkbox"
              checked={fillShapes}
              onChange={(e) => setFillShapes(e.target.checked)}
            />
            Fill
          </label>
          <span style={{ marginLeft: 8 }}>Size</span>
          <input
            type="range"
            min={1}
            max={50}
            value={size}
            onChange={(e) => setSize(parseInt(e.target.value, 10))}
          />
          <span style={{ minWidth: 24 }}>{size}</span>
          <button
            type="button"
            onClick={clearCanvas}
            style={toolbarButtonStyle(false, false)}
          >
            Clear
          </button>
          <button
            type="button"
            onClick={cropCanvas}
            style={toolbarButtonStyle(false, false)}
            title="Shrink the canvas to its non-background content"
          >
            Crop
          </button>
          <button
            type="button"
            onClick={centerCanvas}
            style={toolbarButtonStyle(false, false)}
            title="Center the artwork on the canvas"
          >
            Center
          </button>
          <span style={{ marginLeft: 8 }}>Zoom</span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.1, z - 0.25))}
            style={toolbarButtonStyle(false, zoom <= 0.1)}
            disabled={zoom <= 0.1}
            title="Zoom out"
          >
            −
          </button>
          <span style={{ minWidth: 44, textAlign: "center" }}>
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(8, z + 0.25))}
            style={toolbarButtonStyle(false, zoom >= 8)}
            disabled={zoom >= 8}
            title="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            style={toolbarButtonStyle(false, false)}
            title="Reset zoom to 100%"
          >
            1:1
          </button>
          <button
            type="button"
            onClick={() => {
              // Fit canvas to the available wrapper area, preserving
              // aspect ratio. Uses the wrapper's content size minus a
              // little margin so the canvas isn't flush against edges.
              const wrap = canvasWrapperRef.current;
              if (!wrap) return;
              const padX = 32;
              const padY = 32;
              const fitX = (wrap.clientWidth - padX) / width;
              const fitY = (wrap.clientHeight - padY) / height;
              const next = Math.max(0.1, Math.min(8, Math.min(fitX, fitY)));
              setZoom(Number.isFinite(next) && next > 0 ? next : 1);
            }}
            style={toolbarButtonStyle(false, false)}
            title="Fit canvas to current window size"
          >
            Fit
          </button>
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            padding: "6px 14px",
            borderBottom: "1px solid #cdd6e2",
            fontSize: 12,
            background: "#fafbfd",
          }}
        >
          <span>Color</span>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            style={{ width: 28, height: 28, border: "none", padding: 0, cursor: "pointer" }}
          />
          <div style={{ display: "flex", gap: 3, marginLeft: 4 }}>
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                title={c}
                style={{
                  width: 18,
                  height: 18,
                  background: c,
                  border:
                    color.toLowerCase() === c.toLowerCase()
                      ? "2px solid #1967d2"
                      : "1px solid #cdd6e2",
                  borderRadius: 3,
                  cursor: "pointer",
                  padding: 0,
                }}
                aria-label={`Pick color ${c}`}
              />
            ))}
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginLeft: 16,
              cursor: "pointer",
            }}
            title="Use a transparent canvas — useful for sprite costumes"
          >
            <input
              type="checkbox"
              checked={transparent}
              onChange={(e) => setTransparent(e.target.checked)}
            />
            Transparent
          </label>
        </div>

        <div
          ref={canvasWrapperRef}
          style={{
            padding: 12,
            background: transparent ? checkerBg() : "#e3eaf5",
            // Centered when smaller than wrapper; scrollable when zoomed
            // in beyond the available area.
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "auto",
            flex: 1,
            position: "relative",
            minHeight: 0,
          }}
        >
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            onMouseDown={onDown}
            onMouseMove={onMove}
            onMouseUp={onUp}
            onMouseLeave={onUp}
            onClick={(e) => {
              // Single-click action for text tool. We open the dialog
              // from here (not mousedown) so the click event has
              // already resolved on the canvas before any new modal
              // mounts — see the comment in onDown.
              if (tool === "text") {
                const p = canvasPos(e);
                e.stopPropagation();
                setTextPrompt({ x: p.x, y: p.y });
                setTextDraft("");
              }
            }}
            style={{
              background: transparent ? checkerBg() : "#fff",
              border: "1px solid #cdd6e2",
              cursor: cursorFor(tool),
              // CSS-scaled display size — canvasPos() reads
              // boundingClientRect / canvas.width to convert mouse
              // events back into intrinsic pixel coords, so input
              // accuracy is preserved at any zoom.
              width: width * zoom,
              height: height * zoom,
              imageRendering: zoom >= 2 ? "pixelated" : "auto",
              flexShrink: 0,
            }}
          />
          {/* Live preview of the text right where it'll land — gives the
              user feedback before they confirm. */}
          {textPrompt && textDraft ? (
            <CanvasTextPreview
              canvasRef={canvasRef}
              x={textPrompt.x}
              y={textPrompt.y}
              text={textDraft}
              fontSize={Math.max(12, size * 4)}
              color={color}
            />
          ) : null}
        </div>

        <footer
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            borderTop: "1px solid #cdd6e2",
            background: "#f5f7fb",
            fontSize: 11,
            color: "#5b6371",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label
              style={{ display: "flex", gap: 4, alignItems: "center" }}
              title="Canvas width in pixels"
            >
              W
              <input
                type="number"
                min={1}
                max={2048}
                value={widthDraft}
                onChange={(e) => setWidthDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyDraftSize();
                  }
                }}
                style={sizeInputStyle()}
              />
            </label>
            <label
              style={{ display: "flex", gap: 4, alignItems: "center" }}
              title="Canvas height in pixels"
            >
              H
              <input
                type="number"
                min={1}
                max={2048}
                value={heightDraft}
                onChange={(e) => setHeightDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyDraftSize();
                  }
                }}
                style={sizeInputStyle()}
              />
            </label>
            <button
              type="button"
              onClick={applyDraftSize}
              style={toolbarButtonStyle(false, false)}
              title="Apply the W and H values; existing pixels are kept from the top-left corner (cropped on shrink, white-filled on grow)."
            >
              Apply
            </button>
            <select
              value=""
              onChange={(e) => {
                const preset = SIZE_PRESETS.find((p) => p.label === e.target.value);
                if (preset) resizeCanvas(preset.w, preset.h);
                // Reset select to placeholder.
                e.target.value = "";
              }}
              style={{
                padding: "4px 6px",
                border: "1px solid #cdd6e2",
                borderRadius: 3,
                background: "#f5f7fb",
                font: "inherit",
                cursor: "pointer",
              }}
              title="Resize to a preset"
            >
              <option value="">Preset…</option>
              {SIZE_PRESETS.map((p) => (
                <option key={p.label} value={p.label}>
                  {p.label}
                </option>
              ))}
            </select>
            <span style={{ marginLeft: 8 }}>{width} × {height}</span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              type="button"
              onClick={onCancel}
              style={toolbarButtonStyle(false, false)}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              style={{
                ...toolbarButtonStyle(true, false),
                background: "#1967d2",
                color: "#fff",
                borderColor: "#1967d2",
              }}
            >
              Save
            </button>
          </div>
        </footer>
      </div>
      {textPrompt ? (
        <TextPromptDialog
          draft={textDraft}
          setDraft={setTextDraft}
          onCommit={commitText}
          onCancel={() => setTextPrompt(null)}
          fontSize={Math.max(12, size * 4)}
        />
      ) : null}
    </div>
  );
}

/** Live-preview overlay: renders the in-progress text directly on the
 *  canvas at the click point, so the user can see what they're about
 *  to commit. Computed in screen pixels relative to the canvas's
 *  scrollable wrapper (the parent of the canvas).
 *
 *  This is purely visual — the actual drawing happens in commitText
 *  via fillText, not via this overlay. */
function CanvasTextPreview({
  canvasRef,
  x,
  y,
  text,
  fontSize,
  color,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
}) {
  const canvasEl = canvasRef.current;
  if (!canvasEl) return null;
  const rect = canvasEl.getBoundingClientRect();
  const parentRect = canvasEl.parentElement?.getBoundingClientRect() ?? rect;
  const scaleX = rect.width / canvasEl.width;
  const scaleY = rect.height / canvasEl.height;
  const left = rect.left - parentRect.left + x * scaleX;
  const top = rect.top - parentRect.top + (y - fontSize) * scaleY;
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        left,
        top,
        font: `${fontSize}px sans-serif`,
        color,
        pointerEvents: "none",
        whiteSpace: "pre",
        opacity: 0.6,
      }}
    >
      {text}
    </span>
  );
}

/** Centered prompt for the text tool. The user types, presses Enter
 *  (or clicks OK) to commit the string at the saved click point on
 *  the canvas. */
function TextPromptDialog({
  draft,
  setDraft,
  onCommit,
  onCancel,
  fontSize,
}: {
  draft: string;
  setDraft: (s: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  fontSize: number;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    // Defer one tick so React has actually committed the input element
    // to the DOM before we ask for focus.
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div
      // Stop EVERY pointer event from bubbling out of this overlay —
      // the text dialog is rendered inside the costume editor's modal
      // backdrop, so a single un-stopped event will reach the editor's
      // outer onClick and close the whole editor on top of the dialog.
      onClick={(e) => {
        e.stopPropagation();
        onCancel();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20, 28, 44, 0.4)",
        zIndex: 1200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 6,
          boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
          padding: 16,
          minWidth: 320,
        }}
      >
        <div style={{ fontSize: 13, marginBottom: 8 }}>
          Text to draw at click point ({fontSize}px):
        </div>
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Stop the keystroke from bubbling — anything outside this
            // dialog (e.g. global window-level handlers for hotkeys, or
            // any onKeyDown installed by the parent costume editor)
            // shouldn't see Enter / Escape that the dialog already
            // handled.
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              onCommit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              onCancel();
            }
          }}
          // Stop click events from bubbling out of the input, too —
          // belt-and-suspenders.
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            width: "100%",
            padding: "6px 8px",
            border: "1px solid #cdd6e2",
            borderRadius: 3,
            font: "inherit",
            boxSizing: "border-box",
          }}
          placeholder="Type your text…"
        />
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 6,
            marginTop: 12,
          }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            style={toolbarButtonStyle(false, false)}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCommit();
            }}
            style={{
              ...toolbarButtonStyle(true, false),
              background: "#1967d2",
              color: "#fff",
              borderColor: "#1967d2",
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Flood-fill the connected region starting at (x, y) with `fillHex`.
 * Replaces every adjacent pixel whose RGBA matches the seed pixel
 * (within a small tolerance to handle anti-aliased edges). Stack-based
 * scanline fill — handles canvas-sized regions without recursion.
 */
function floodFill(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  fillHex: string,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  if (startX < 0 || startY < 0 || startX >= w || startY >= h) return;
  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  const idx = (x: number, y: number) => (y * w + x) * 4;
  const seed = idx(startX, startY);
  const seedR = data[seed], seedG = data[seed + 1], seedB = data[seed + 2], seedA = data[seed + 3];
  const target = hexToRgba(fillHex);
  if (
    target[0] === seedR && target[1] === seedG && target[2] === seedB && target[3] === seedA
  ) return;
  const matches = (i: number) =>
    Math.abs(data[i] - seedR) < 4 &&
    Math.abs(data[i + 1] - seedG) < 4 &&
    Math.abs(data[i + 2] - seedB) < 4 &&
    Math.abs(data[i + 3] - seedA) < 4;
  const setPixel = (i: number) => {
    data[i] = target[0];
    data[i + 1] = target[1];
    data[i + 2] = target[2];
    data[i + 3] = target[3];
  };
  const stack: number[] = [startX, startY];
  while (stack.length > 0) {
    const py = stack.pop()!;
    const px = stack.pop()!;
    let x = px;
    while (x >= 0 && matches(idx(x, py))) x--;
    x++;
    let spanUp = false, spanDown = false;
    while (x < w && matches(idx(x, py))) {
      setPixel(idx(x, py));
      if (!spanUp && py > 0 && matches(idx(x, py - 1))) {
        stack.push(x, py - 1); spanUp = true;
      } else if (spanUp && py > 0 && !matches(idx(x, py - 1))) {
        spanUp = false;
      }
      if (!spanDown && py < h - 1 && matches(idx(x, py + 1))) {
        stack.push(x, py + 1); spanDown = true;
      } else if (spanDown && py < h - 1 && !matches(idx(x, py + 1))) {
        spanDown = false;
      }
      x++;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** The 8 selection handle positions (corner + edge midpoints), as
 *  pairs of (x, y) in canvas pixels. Order matches `SelInteraction`'s
 *  resize anchors so the index can map to a name. */
function handlePoints(r: { x: number; y: number; w: number; h: number }): Array<[number, number]> {
  return [
    [r.x, r.y],                        // tl
    [r.x + r.w / 2, r.y],              // t
    [r.x + r.w, r.y],                  // tr
    [r.x + r.w, r.y + r.h / 2],        // r
    [r.x + r.w, r.y + r.h],            // br
    [r.x + r.w / 2, r.y + r.h],        // b
    [r.x, r.y + r.h],                  // bl
    [r.x, r.y + r.h / 2],              // l
  ];
}

const HANDLE_NAMES: Array<"tl" | "t" | "tr" | "r" | "br" | "b" | "bl" | "l"> = [
  "tl", "t", "tr", "r", "br", "b", "bl", "l",
];

/** Which selection handle (if any) is at the given canvas pixel?
 *  Returns null when the click misses every handle. */
function handleAt(
  rect: { x: number; y: number; w: number; h: number },
  px: number,
  py: number,
): "tl" | "tr" | "bl" | "br" | "t" | "b" | "l" | "r" | null {
  const half = HANDLE_SIZE / 2 + 2; // 2px slop for easier grabbing
  const points = handlePoints(rect);
  for (let i = 0; i < points.length; i++) {
    const [hx, hy] = points[i];
    if (Math.abs(px - hx) <= half && Math.abs(py - hy) <= half) {
      return HANDLE_NAMES[i];
    }
  }
  return null;
}

/** Apply a corner/edge drag to a rect, given the original rect and
 *  the current pointer position. Allows the rect to flip (negative
 *  width/height) — caller should normalize on commit. */
function resizeRect(
  orig: { x: number; y: number; w: number; h: number },
  anchor: "tl" | "tr" | "bl" | "br" | "t" | "b" | "l" | "r",
  px: number,
  py: number,
): { x: number; y: number; w: number; h: number } {
  let { x, y, w, h } = orig;
  switch (anchor) {
    case "tl":
      w += x - px; h += y - py; x = px; y = py; break;
    case "tr":
      w = px - x; h += y - py; y = py; break;
    case "bl":
      w += x - px; x = px; h = py - y; break;
    case "br":
      w = px - x; h = py - y; break;
    case "t":
      h += y - py; y = py; break;
    case "b":
      h = py - y; break;
    case "l":
      w += x - px; x = px; break;
    case "r":
      w = px - x; break;
  }
  return { x, y, w, h };
}

/** Find the smallest axis-aligned bounding rect containing every
 *  non-background pixel. "Background" is white when the editor is
 *  in opaque mode, fully-transparent in transparent mode. Returns
 *  null when the canvas is entirely background. */
function contentBoundingBox(
  img: ImageData,
  transparent: boolean,
): { x: number; y: number; w: number; h: number } | null {
  const w = img.width;
  const h = img.height;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  const data = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = data[i + 3];
      const isBg = transparent
        ? a === 0
        : a === 255 && data[i] >= 250 && data[i + 1] >= 250 && data[i + 2] >= 250;
      if (!isBg) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** In-place clear of an axis-aligned rect within an ImageData buffer.
 *  Sets each pixel to white-opaque (default) or fully-transparent
 *  (when the editor is in transparent mode). Used after lifting a
 *  selection so the area under the floating image looks clean while
 *  it floats. */
function clearRectInImageData(
  img: ImageData,
  rect: { x: number; y: number; w: number; h: number },
  transparent: boolean,
): void {
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(img.width, Math.ceil(rect.x + rect.w));
  const y1 = Math.min(img.height, Math.ceil(rect.y + rect.h));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * 4;
      if (transparent) {
        img.data[i] = 0;
        img.data[i + 1] = 0;
        img.data[i + 2] = 0;
        img.data[i + 3] = 0;
      } else {
        img.data[i] = 255;
        img.data[i + 1] = 255;
        img.data[i + 2] = 255;
        img.data[i + 3] = 255;
      }
    }
  }
}

function hexToRgba(hex: string): [number, number, number, number] {
  const m = hex.replace(/^#/, "");
  const v = m.length === 3
    ? m.split("").map((c) => parseInt(c + c, 16))
    : [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
  return [v[0] || 0, v[1] || 0, v[2] || 0, 255];
}

function sizeInputStyle(): React.CSSProperties {
  return {
    width: 64,
    padding: "3px 6px",
    border: "1px solid #cdd6e2",
    borderRadius: 3,
    font: "inherit",
    background: "#fff",
  };
}

function toolbarButtonStyle(active: boolean, disabled: boolean): React.CSSProperties {
  return {
    padding: "4px 10px",
    background: active ? "#1967d2" : "#f5f7fb",
    color: active ? "#fff" : "#1a2333",
    border: "1px solid " + (active ? "#1967d2" : "#cdd6e2"),
    borderRadius: 3,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    font: "inherit",
  };
}

function checkerBg(): string {
  // 8x8 checkered pattern via a tiny inline SVG data URL.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">` +
    `<rect width="8" height="8" fill="#e0e4eb"/>` +
    `<rect x="8" y="8" width="8" height="8" fill="#e0e4eb"/>` +
    `<rect x="8" y="0" width="8" height="8" fill="#fff"/>` +
    `<rect x="0" y="8" width="8" height="8" fill="#fff"/>` +
    `</svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

function cursorFor(tool: Tool): string {
  switch (tool) {
    case "select":
      return "crosshair";
    case "eraser":
      return "cell";
    case "fill":
      return "copy";
    case "eyedropper":
      return "crosshair";
    case "text":
      return "text";
    default:
      return "crosshair";
  }
}

function labelFor(tool: Tool): string {
  switch (tool) {
    case "select":
      return "▢ Select";
    case "pen":
      return "✎ Pen";
    case "eraser":
      return "⌫ Eraser";
    case "line":
      return "／ Line";
    case "rect":
      return "▭ Rect";
    case "ellipse":
      return "○ Ellipse";
    case "fill":
      return "🪣 Fill";
    case "eyedropper":
      return "💧 Pick";
    case "text":
      return "T Text";
  }
}
