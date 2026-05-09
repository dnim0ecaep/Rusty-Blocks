import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Vector costume editor — Scratch-style.
 *
 * Vector costumes are stored as SVGs (base64 data URLs), the same format
 * the renderer + Slint codegen already accept for raster costumes via
 * the `<img>` element. The difference is *editability* — instead of a
 * bitmap that loses fidelity when scaled, we keep a structured list of
 * primitive shapes the user can move, edit, or delete.
 *
 * Scope is intentionally narrow for v1:
 *   - Tools: select / move, rectangle, ellipse, line, pen (polyline).
 *   - Stroke + fill colors, stroke width.
 *   - Click on a shape to select; drag to move; Delete to remove.
 *
 * Out of scope (revisit if the basic feature gets used):
 *   - Bezier curve editing
 *   - Text-as-vector
 *   - Group / ungroup
 *   - Path boolean operations
 */

export type VectorShape =
  | {
      id: string;
      kind: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      fill: string;
      stroke: string;
      strokeWidth: number;
    }
  | {
      id: string;
      kind: "ellipse";
      cx: number;
      cy: number;
      rx: number;
      ry: number;
      fill: string;
      stroke: string;
      strokeWidth: number;
    }
  | {
      id: string;
      kind: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      stroke: string;
      strokeWidth: number;
    }
  | {
      id: string;
      kind: "polyline";
      points: Array<{ x: number; y: number }>;
      stroke: string;
      strokeWidth: number;
    };

interface Props {
  title: string;
  /** Logical viewBox dimensions. Saved SVG uses these; sprites scale
   *  this independently via their own size %. */
  width: number;
  height: number;
  /** Optional: prior shape list (when re-editing a costume we created).
   *  If absent, the editor starts blank. */
  initialShapes?: VectorShape[];
  onCancel(): void;
  /**
   * Called on Save. Receives both:
   *   - `dataUrl`: the rendered SVG as a `data:image/svg+xml;base64,…` URL
   *     suitable for storing in the asset record's `path`.
   *   - `shapes`: the structured shape list — caller persists this in
   *     the asset's metadata so a future edit round-trips losslessly.
   */
  onSave(dataUrl: string, shapes: VectorShape[]): void;
}

type Tool = "select" | "rect" | "ellipse" | "line" | "pen";

const PALETTE = [
  "#000000",
  "#ffffff",
  "#e84a4a",
  "#f0a020",
  "#f0c020",
  "#7ac848",
  "#3a8af0",
  "#7a4ae8",
  "#f070a0",
  "#a06030",
];
const TRANSPARENT = "transparent";

export function VectorCostumeEditor({
  title,
  width,
  height,
  initialShapes,
  onCancel,
  onSave,
}: Props) {
  const [shapes, setShapes] = useState<VectorShape[]>(
    initialShapes ? initialShapes.map((s) => ({ ...s })) : [],
  );
  const [tool, setTool] = useState<Tool>("rect");
  const [fill, setFill] = useState<string>("#3a8af0");
  const [stroke, setStroke] = useState<string>("#000000");
  const [strokeWidth, setStrokeWidth] = useState<number>(2);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftShape, setDraftShape] = useState<VectorShape | null>(null);
  const [moveOrigin, setMoveOrigin] = useState<{
    pointerX: number;
    pointerY: number;
    shape: VectorShape;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Delete the selected shape on Backspace / Delete (when not typing
  // into a field — the dialog has number inputs that mustn't lose
  // their backspace handling).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId) {
          setShapes((curr) => curr.filter((s) => s.id !== selectedId));
          setSelectedId(null);
          e.preventDefault();
        }
      } else if (e.key === "Escape") {
        if (draftShape) {
          setDraftShape(null);
        } else if (selectedId) {
          setSelectedId(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, draftShape]);

  const newId = () => `vshape_${Math.random().toString(36).slice(2, 10)}`;

  const pointerToSvg = (e: React.PointerEvent<SVGSVGElement>): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * width,
      y: ((e.clientY - rect.top) / rect.height) * height,
    };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = pointerToSvg(e);
    if (tool === "select") {
      // Hit-test from topmost shape down.
      const hit = [...shapes].reverse().find((s) => hitTest(s, p));
      setSelectedId(hit?.id ?? null);
      if (hit) {
        setMoveOrigin({ pointerX: p.x, pointerY: p.y, shape: cloneShape(hit) });
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      return;
    }
    if (tool === "rect") {
      setDraftShape({
        id: newId(),
        kind: "rect",
        x: p.x,
        y: p.y,
        w: 0,
        h: 0,
        fill,
        stroke,
        strokeWidth,
      });
    } else if (tool === "ellipse") {
      setDraftShape({
        id: newId(),
        kind: "ellipse",
        cx: p.x,
        cy: p.y,
        rx: 0,
        ry: 0,
        fill,
        stroke,
        strokeWidth,
      });
    } else if (tool === "line") {
      setDraftShape({
        id: newId(),
        kind: "line",
        x1: p.x,
        y1: p.y,
        x2: p.x,
        y2: p.y,
        stroke,
        strokeWidth,
      });
    } else if (tool === "pen") {
      setDraftShape({
        id: newId(),
        kind: "polyline",
        points: [{ x: p.x, y: p.y }],
        stroke,
        strokeWidth,
      });
    }
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const p = pointerToSvg(e);
    if (tool === "select" && moveOrigin && selectedId) {
      const dx = p.x - moveOrigin.pointerX;
      const dy = p.y - moveOrigin.pointerY;
      setShapes((curr) =>
        curr.map((s) =>
          s.id === selectedId ? translateShape(moveOrigin.shape, dx, dy) : s,
        ),
      );
      return;
    }
    if (!draftShape) return;
    if (draftShape.kind === "rect") {
      const start = { x: draftShape.x, y: draftShape.y };
      // Allow dragging from any corner — normalize at commit time.
      setDraftShape({
        ...draftShape,
        x: Math.min(start.x, p.x) === draftShape.x ? draftShape.x : start.x,
        y: Math.min(start.y, p.y) === draftShape.y ? draftShape.y : start.y,
        w: p.x - start.x,
        h: p.y - start.y,
      });
    } else if (draftShape.kind === "ellipse") {
      const dx = p.x - draftShape.cx;
      const dy = p.y - draftShape.cy;
      setDraftShape({
        ...draftShape,
        rx: Math.abs(dx),
        ry: Math.abs(dy),
      });
    } else if (draftShape.kind === "line") {
      setDraftShape({ ...draftShape, x2: p.x, y2: p.y });
    } else if (draftShape.kind === "polyline") {
      // Throttle by minimum distance so we don't accumulate hundreds of
      // near-duplicate points along a slow drag.
      const last = draftShape.points[draftShape.points.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) >= 1.5) {
        setDraftShape({
          ...draftShape,
          points: [...draftShape.points, p],
        });
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (tool === "select") {
      setMoveOrigin(null);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }
    if (!draftShape) return;
    const committed = normalizeShape(draftShape);
    // Drop degenerate shapes (zero-size rectangles, near-coincident
    // line endpoints) — they're almost always accidental clicks.
    if (!isDegenerate(committed)) {
      setShapes((curr) => [...curr, committed]);
      setSelectedId(committed.id);
    }
    setDraftShape(null);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const save = () => {
    const svg = serializeShapes(shapes, width, height);
    const encoded = btoa(unescape(encodeURIComponent(svg)));
    onSave(`data:image/svg+xml;base64,${encoded}`, shapes);
  };

  // Compose the rendered list: existing shapes + the in-flight draft.
  const visualShapes = draftShape ? [...shapes, draftShape] : shapes;

  return (
    <Modal onClose={onCancel}>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, minWidth: 720 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ fontSize: 14 }}>{title}</strong>
          <button
            type="button"
            onClick={onCancel}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#5b6371" }}
            title="Close"
          >
            ×
          </button>
        </header>

        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {(["select", "rect", "ellipse", "line", "pen"] as Tool[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTool(t);
                setDraftShape(null);
              }}
              style={toolBtnStyle(t === tool)}
              title={toolLabel(t)}
            >
              {toolGlyph(t)} {toolLabel(t)}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <ColorRow label="Fill" value={fill} onChange={setFill} allowTransparent />
          <ColorRow label="Stroke" value={stroke} onChange={setStroke} allowTransparent />
          <label style={{ fontSize: 11, color: "#5b6371" }}>
            Stroke width
            <input
              type="number"
              min={0}
              max={32}
              step={1}
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(Math.max(0, Math.min(32, Number(e.target.value))))}
              style={{
                width: 50,
                marginLeft: 6,
                padding: "2px 5px",
                border: "1px solid #cdd6e2",
                borderRadius: 4,
                fontSize: 12,
              }}
            />
          </label>
          <span style={{ fontSize: 11, color: "#5b6371", marginLeft: "auto" }}>
            {shapes.length} shape{shapes.length === 1 ? "" : "s"} · {width} × {height}
          </span>
        </div>

        <div
          style={{
            background: "#fff",
            border: "1px solid #cdd6e2",
            borderRadius: 4,
            display: "inline-block",
            alignSelf: "flex-start",
            // Checkerboard via CSS so the user sees transparency.
            backgroundImage:
              "linear-gradient(45deg, #eef1f5 25%, transparent 25%), linear-gradient(-45deg, #eef1f5 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #eef1f5 75%), linear-gradient(-45deg, transparent 75%, #eef1f5 75%)",
            backgroundSize: "16px 16px",
            backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
          }}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            width={Math.min(640, Math.max(width, 400))}
            height={Math.min(480, Math.max(height, 300))}
            style={{
              touchAction: "none",
              display: "block",
              cursor: tool === "select" ? "default" : "crosshair",
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {visualShapes.map((s) => renderShape(s, s.id === selectedId))}
          </svg>
        </div>

        <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#5b6371" }}>
            {tool === "select"
              ? "Click a shape to select; drag to move. Delete or Backspace removes."
              : tool === "pen"
              ? "Click and drag to draw a freeform polyline."
              : "Click and drag to draw."}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onCancel} style={btnStyle(false)}>
              Cancel
            </button>
            <button type="button" onClick={save} style={btnStyle(true)}>
              Save
            </button>
          </div>
        </footer>
      </div>
    </Modal>
  );
}

// ── shape utilities ─────────────────────────────────────────────────

function cloneShape(s: VectorShape): VectorShape {
  if (s.kind === "polyline") {
    return { ...s, points: s.points.map((p) => ({ ...p })) };
  }
  return { ...s };
}

function translateShape(s: VectorShape, dx: number, dy: number): VectorShape {
  if (s.kind === "rect") return { ...s, x: s.x + dx, y: s.y + dy };
  if (s.kind === "ellipse") return { ...s, cx: s.cx + dx, cy: s.cy + dy };
  if (s.kind === "line")
    return { ...s, x1: s.x1 + dx, y1: s.y1 + dy, x2: s.x2 + dx, y2: s.y2 + dy };
  return { ...s, points: s.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
}

function normalizeShape(s: VectorShape): VectorShape {
  if (s.kind === "rect") {
    // Normalize negative w/h that arise when dragging back-and-up.
    const x = s.w < 0 ? s.x + s.w : s.x;
    const y = s.h < 0 ? s.y + s.h : s.y;
    return { ...s, x, y, w: Math.abs(s.w), h: Math.abs(s.h) };
  }
  return s;
}

function isDegenerate(s: VectorShape): boolean {
  if (s.kind === "rect") return s.w < 1 || s.h < 1;
  if (s.kind === "ellipse") return s.rx < 1 || s.ry < 1;
  if (s.kind === "line") return Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < 1;
  return s.points.length < 2;
}

function hitTest(s: VectorShape, p: { x: number; y: number }): boolean {
  // Generous hit zones — Scratch's vector mode prioritizes ease of
  // selection over pixel-perfect bounds.
  if (s.kind === "rect") {
    return p.x >= s.x - 4 && p.x <= s.x + s.w + 4 && p.y >= s.y - 4 && p.y <= s.y + s.h + 4;
  }
  if (s.kind === "ellipse") {
    if (s.rx <= 0 || s.ry <= 0) return false;
    const dx = (p.x - s.cx) / (s.rx + 4);
    const dy = (p.y - s.cy) / (s.ry + 4);
    return dx * dx + dy * dy <= 1;
  }
  if (s.kind === "line") {
    return distanceToSegment(p, { x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 }) <= 6;
  }
  for (let i = 1; i < s.points.length; i++) {
    if (distanceToSegment(p, s.points[i - 1], s.points[i]) <= 6) return true;
  }
  return false;
}

function distanceToSegment(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const px = a.x + t * dx;
  const py = a.y + t * dy;
  return Math.hypot(p.x - px, p.y - py);
}

function renderShape(s: VectorShape, selected: boolean): ReactNode {
  const selStroke = selected ? "#1967d2" : null;
  const selWidth = selected ? 2 : null;
  if (s.kind === "rect") {
    return (
      <g key={s.id}>
        <rect
          x={s.x}
          y={s.y}
          width={s.w}
          height={s.h}
          fill={s.fill}
          stroke={s.stroke}
          strokeWidth={s.strokeWidth}
        />
        {selected ? (
          <rect
            x={s.x}
            y={s.y}
            width={s.w}
            height={s.h}
            fill="none"
            stroke={selStroke!}
            strokeWidth={selWidth!}
            strokeDasharray="4 3"
          />
        ) : null}
      </g>
    );
  }
  if (s.kind === "ellipse") {
    return (
      <g key={s.id}>
        <ellipse
          cx={s.cx}
          cy={s.cy}
          rx={s.rx}
          ry={s.ry}
          fill={s.fill}
          stroke={s.stroke}
          strokeWidth={s.strokeWidth}
        />
        {selected ? (
          <ellipse
            cx={s.cx}
            cy={s.cy}
            rx={s.rx}
            ry={s.ry}
            fill="none"
            stroke={selStroke!}
            strokeWidth={selWidth!}
            strokeDasharray="4 3"
          />
        ) : null}
      </g>
    );
  }
  if (s.kind === "line") {
    return (
      <line
        key={s.id}
        x1={s.x1}
        y1={s.y1}
        x2={s.x2}
        y2={s.y2}
        stroke={selected ? "#1967d2" : s.stroke}
        strokeWidth={s.strokeWidth + (selected ? 2 : 0)}
        strokeLinecap="round"
      />
    );
  }
  return (
    <polyline
      key={s.id}
      points={s.points.map((p) => `${p.x},${p.y}`).join(" ")}
      fill="none"
      stroke={selected ? "#1967d2" : s.stroke}
      strokeWidth={s.strokeWidth + (selected ? 2 : 0)}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

/**
 * Flatten the shape list into a standalone SVG document. Public so
 * tests can verify the round-trip without instantiating the editor.
 */
export function serializeShapes(
  shapes: VectorShape[],
  width: number,
  height: number,
): string {
  const body = shapes.map(shapeToSvg).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${body}</svg>`;
}

function shapeToSvg(s: VectorShape): string {
  if (s.kind === "rect") {
    return `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"/>`;
  }
  if (s.kind === "ellipse") {
    return `<ellipse cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}" fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"/>`;
  }
  if (s.kind === "line") {
    return `<line x1="${s.x1}" y1="${s.y1}" x2="${s.x2}" y2="${s.y2}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}" stroke-linecap="round"/>`;
  }
  const pts = s.points.map((p) => `${round(p.x)},${round(p.y)}`).join(" ");
  return `<polyline points="${pts}" fill="none" stroke="${s.stroke}" stroke-width="${s.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── small UI helpers ────────────────────────────────────────────────

function ColorRow({
  label,
  value,
  onChange,
  allowTransparent,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  allowTransparent?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#5b6371" }}>
      <span>{label}</span>
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`${label} ${c}`}
          style={{
            width: 18,
            height: 18,
            border: value === c ? "2px solid #1967d2" : "1px solid #cdd6e2",
            borderRadius: 3,
            background: c,
            padding: 0,
            cursor: "pointer",
          }}
        />
      ))}
      {allowTransparent ? (
        <button
          type="button"
          onClick={() => onChange(TRANSPARENT)}
          aria-label={`${label} transparent`}
          title="Transparent"
          style={{
            width: 18,
            height: 18,
            border: value === TRANSPARENT ? "2px solid #1967d2" : "1px solid #cdd6e2",
            borderRadius: 3,
            backgroundImage:
              "linear-gradient(45deg, #ddd 25%, transparent 25%), linear-gradient(-45deg, #ddd 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ddd 75%), linear-gradient(-45deg, transparent 75%, #ddd 75%)",
            backgroundSize: "8px 8px",
            backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0",
            cursor: "pointer",
          }}
        />
      ) : null}
    </div>
  );
}

function toolLabel(t: Tool): string {
  switch (t) {
    case "select":
      return "Select";
    case "rect":
      return "Rectangle";
    case "ellipse":
      return "Ellipse";
    case "line":
      return "Line";
    case "pen":
      return "Pen";
  }
}

function toolGlyph(t: Tool): string {
  switch (t) {
    case "select":
      return "▢";
    case "rect":
      return "▭";
    case "ellipse":
      return "◯";
    case "line":
      return "╱";
    case "pen":
      return "✎";
  }
}

function toolBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: "5px 10px",
    border: "1px solid",
    borderColor: active ? "#1967d2" : "#cdd6e2",
    borderRadius: 4,
    background: active ? "#1967d2" : "#f5f7fb",
    color: active ? "#fff" : "#1a2333",
    cursor: "pointer",
    font: "inherit",
    fontSize: 12,
  };
}

function btnStyle(primary: boolean): React.CSSProperties {
  return {
    padding: "5px 14px",
    border: "1px solid",
    borderColor: primary ? "#1967d2" : "#cdd6e2",
    borderRadius: 4,
    background: primary ? "#1967d2" : "#f5f7fb",
    color: primary ? "#fff" : "#1a2333",
    cursor: "pointer",
    font: "inherit",
    fontSize: 12,
  };
}

function Modal({ children, onClose }: { children: ReactNode; onClose(): void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20, 28, 44, 0.55)",
        zIndex: 1000,
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
          minWidth: 740,
          maxWidth: "94vw",
          maxHeight: "92vh",
          overflow: "auto",
        }}
      >
        {children}
      </div>
    </div>
  );
}
