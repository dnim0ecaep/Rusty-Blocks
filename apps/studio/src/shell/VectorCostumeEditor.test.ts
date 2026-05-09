import { describe, expect, it } from "vitest";

import { serializeShapes, type VectorShape } from "./VectorCostumeEditor";

/**
 * `serializeShapes` is the persistence boundary for vector costumes —
 * what it emits is what every consumer (renderer, Slint codegen, file
 * save, version-controlled diff) sees. A regression here corrupts saved
 * costumes silently, so pin the output shape with byte-level checks.
 */

describe("serializeShapes", () => {
  it("produces a self-contained SVG with the requested viewBox", () => {
    const svg = serializeShapes([], 480, 360);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0 480 360"');
    expect(svg).toContain('width="480"');
    expect(svg).toContain('height="360"');
  });

  it("emits each primitive with the expected attributes", () => {
    const shapes: VectorShape[] = [
      {
        id: "r",
        kind: "rect",
        x: 10,
        y: 20,
        w: 80,
        h: 40,
        fill: "#ff0000",
        stroke: "#000000",
        strokeWidth: 2,
      },
      {
        id: "e",
        kind: "ellipse",
        cx: 50,
        cy: 50,
        rx: 20,
        ry: 10,
        fill: "transparent",
        stroke: "#3a8af0",
        strokeWidth: 1,
      },
      {
        id: "l",
        kind: "line",
        x1: 0,
        y1: 0,
        x2: 100,
        y2: 100,
        stroke: "#000000",
        strokeWidth: 3,
      },
    ];
    const svg = serializeShapes(shapes, 100, 100);
    expect(svg).toContain(
      '<rect x="10" y="20" width="80" height="40" fill="#ff0000" stroke="#000000" stroke-width="2"/>',
    );
    expect(svg).toContain(
      '<ellipse cx="50" cy="50" rx="20" ry="10" fill="transparent" stroke="#3a8af0" stroke-width="1"/>',
    );
    expect(svg).toContain(
      '<line x1="0" y1="0" x2="100" y2="100" stroke="#000000" stroke-width="3" stroke-linecap="round"/>',
    );
  });

  it("rounds polyline coordinates to 2 decimals to keep the SVG diff-able", () => {
    const shape: VectorShape = {
      id: "p",
      kind: "polyline",
      points: [
        { x: 10.123456, y: 20 },
        { x: 30.987, y: 40.5 },
      ],
      stroke: "#000",
      strokeWidth: 2,
    };
    const svg = serializeShapes([shape], 100, 100);
    expect(svg).toContain('points="10.12,20 30.99,40.5"');
  });

  it("base64-encoding the SVG produces a valid data URL payload", () => {
    const shapes: VectorShape[] = [
      {
        id: "r",
        kind: "rect",
        x: 0,
        y: 0,
        w: 50,
        h: 50,
        fill: "#7ac848",
        stroke: "transparent",
        strokeWidth: 0,
      },
    ];
    const svg = serializeShapes(shapes, 50, 50);
    const dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
    expect(dataUrl.startsWith("data:image/svg+xml;base64,")).toBe(true);

    // Decoding should round-trip.
    const decoded = decodeURIComponent(
      escape(atob(dataUrl.replace("data:image/svg+xml;base64,", ""))),
    );
    expect(decoded).toBe(svg);
  });
});
