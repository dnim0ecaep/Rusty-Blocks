import { useEffect, useState } from "react";

import { useProjectStore } from "../store/projectStore";
import { DEFAULT_STAGE_HEIGHT, DEFAULT_STAGE_WIDTH } from "../types/workspace";

/**
 * Stage Size dialog — TurboWarp-style.
 *
 * Lets the user pick a preset (Scratch default, common 16:9 sizes) or
 * type custom width/height values. Persists onto `project.project`
 * (`stage_width`/`stage_height`); App.tsx mirrors those values into
 * the runtime's live STAGE_WIDTH / STAGE_HEIGHT bindings on the next
 * render.
 */
interface Props {
  onClose(): void;
}

const PRESETS: Array<{ label: string; width: number; height: number }> = [
  { label: "Scratch (480 × 360)", width: 480, height: 360 },
  { label: "Square (480 × 480)", width: 480, height: 480 },
  { label: "16:9 small (640 × 360)", width: 640, height: 360 },
  { label: "16:9 (854 × 480)", width: 854, height: 480 },
  { label: "16:9 large (1280 × 720)", width: 1280, height: 720 },
  { label: "Tall (360 × 640)", width: 360, height: 640 },
];

export function StageSizeDialog({ onClose }: Props) {
  const project = useProjectStore((s) => s.project);
  const setProject = useProjectStore((s) => s.setProject);

  const initialW = project?.project.stage_width ?? DEFAULT_STAGE_WIDTH;
  const initialH = project?.project.stage_height ?? DEFAULT_STAGE_HEIGHT;

  const [width, setWidth] = useState(initialW);
  const [height, setHeight] = useState(initialH);

  // Re-sync if the project changes underneath the open dialog.
  useEffect(() => {
    setWidth(initialW);
    setHeight(initialH);
  }, [initialW, initialH]);

  const apply = (w: number, h: number) => {
    if (!project) return;
    setProject({
      ...project,
      project: { ...project.project, stage_width: w, stage_height: h },
    });
    onClose();
  };

  const onSubmit = () => {
    const w = clamp(width, 60, 4096, DEFAULT_STAGE_WIDTH);
    const h = clamp(height, 60, 4096, DEFAULT_STAGE_HEIGHT);
    apply(w, h);
  };

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
          width: 380,
          maxWidth: "92vw",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ fontSize: 14 }}>Stage Size</strong>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#5b6371" }}
            title="Close"
          >
            ×
          </button>
        </header>

        <section>
          <h4 style={{ fontSize: 11, color: "#5b6371", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Presets
          </h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => apply(p.width, p.height)}
                style={{
                  padding: "6px 10px",
                  border: "1px solid #cdd6e2",
                  borderRadius: 4,
                  background: "#f5f7fb",
                  cursor: "pointer",
                  textAlign: "left",
                  font: "inherit",
                  fontSize: 12,
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </section>

        <section>
          <h4 style={{ fontSize: 11, color: "#5b6371", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: 0.5 }}>
            Custom
          </h4>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <label style={{ fontSize: 12, color: "#1a2333" }}>
              W{" "}
              <input
                type="number"
                value={width}
                min={60}
                max={4096}
                step={10}
                onChange={(e) => setWidth(Number(e.target.value))}
                style={{
                  width: 80,
                  padding: "3px 6px",
                  border: "1px solid #cdd6e2",
                  borderRadius: 4,
                  fontSize: 12,
                }}
              />
            </label>
            <label style={{ fontSize: 12, color: "#1a2333" }}>
              H{" "}
              <input
                type="number"
                value={height}
                min={60}
                max={4096}
                step={10}
                onChange={(e) => setHeight(Number(e.target.value))}
                style={{
                  width: 80,
                  padding: "3px 6px",
                  border: "1px solid #cdd6e2",
                  borderRadius: 4,
                  fontSize: 12,
                }}
              />
            </label>
          </div>
          <p style={{ fontSize: 11, color: "#5b6371", margin: "6px 0 0" }}>
            Range 60–4096. The compiled-Rust window scales these
            dimensions by 2× for the actual Slint window.
          </p>
        </section>

        <footer style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "5px 12px",
              border: "1px solid #cdd6e2",
              borderRadius: 4,
              background: "#f5f7fb",
              cursor: "pointer",
              font: "inherit",
              fontSize: 12,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!project}
            style={{
              padding: "5px 12px",
              border: "1px solid #1967d2",
              borderRadius: 4,
              background: "#1967d2",
              color: "#fff",
              cursor: project ? "pointer" : "not-allowed",
              font: "inherit",
              fontSize: 12,
            }}
          >
            Apply
          </button>
        </footer>
      </div>
    </div>
  );
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}
