import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

import {
  arrayBufferToDataUrl,
  audioBufferToFloat32,
  decodeSoundDataUrl,
  encodeWav,
} from "../data/wavEncoder";
import { evictDecoded } from "../runtime/audio";
import { useProjectStore } from "../store/projectStore";
import type { SpriteSound } from "../types/workspace";

/**
 * Sound editor — Scratch-style waveform UI.
 *
 * Decodes the asset bytes once on open, keeps the working sample buffer
 * in component state, and lets the user trim / reverse / normalize /
 * fade / adjust gain. Operations push the prior buffer onto a small
 * undo stack. Saving encodes the working buffer back as 16-bit PCM
 * WAV and patches `assets[i].path` in place.
 *
 * The asset's id is preserved across save, so all `play(name)` blocks
 * referring to this sound by name keep working without rewiring.
 */

interface Props {
  sound: SpriteSound;
  onClose(): void;
}

const CANVAS_W = 700;
const CANVAS_H = 200;

export function SoundEditor({ sound, onClose }: Props) {
  const project = useProjectStore((s) => s.project);
  const setProject = useProjectStore((s) => s.setProject);
  const asset = project?.assets.find((a) => a.id === sound.assetId) ?? null;

  const audioCtxRef = useRef<AudioContext | null>(null);
  const playingSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<"start" | "end" | "new" | null>(null);

  const [sampleRate, setSampleRate] = useState(44100);
  const [working, setWorking] = useState<Float32Array | null>(null);
  const [selStart, setSelStart] = useState(0);
  const [selEnd, setSelEnd] = useState(0);
  const [history, setHistory] = useState<Float32Array[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initial decode of the asset bytes into a working sample buffer.
  useEffect(() => {
    if (!asset) {
      setError("Sound asset is missing.");
      return;
    }
    if (asset.kind !== "sound") {
      setError("This asset is not a sound.");
      return;
    }
    const Ctor = (window as unknown as { AudioContext?: typeof AudioContext })
      .AudioContext;
    if (!Ctor) {
      setError("Audio is not supported in this environment.");
      return;
    }
    const ctx = new Ctor();
    audioCtxRef.current = ctx;
    let cancelled = false;
    void decodeSoundDataUrl(ctx, asset.path).then((buf) => {
      if (cancelled) return;
      if (!buf) {
        setError("Couldn't decode this sound.");
        return;
      }
      setSampleRate(buf.sampleRate);
      const samples = audioBufferToFloat32(buf);
      setWorking(samples);
      setSelStart(0);
      setSelEnd(samples.length);
    });
    return () => {
      cancelled = true;
      try {
        playingSourceRef.current?.stop();
      } catch {
        /* ignore */
      }
      void ctx.close();
      audioCtxRef.current = null;
    };
  }, [asset]);

  // Redraw waveform + selection overlay whenever the buffer or selection changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !working) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#0e1626";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const samplesPerPixel = Math.max(1, working.length / CANVAS_W);
    ctx.strokeStyle = "#5ac8e8";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < CANVAS_W; x++) {
      const start = Math.floor(x * samplesPerPixel);
      const end = Math.min(working.length, Math.floor((x + 1) * samplesPerPixel));
      let min = 1;
      let max = -1;
      for (let i = start; i < end; i++) {
        const v = working[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (min > max) {
        min = 0;
        max = 0;
      }
      const yMin = (1 - max) * 0.5 * CANVAS_H;
      const yMax = (1 - min) * 0.5 * CANVAS_H;
      ctx.moveTo(x + 0.5, yMin);
      ctx.lineTo(x + 0.5, yMax + 1);
    }
    ctx.stroke();

    // Zero line
    ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, CANVAS_H / 2);
    ctx.lineTo(CANVAS_W, CANVAS_H / 2);
    ctx.stroke();

    // Selection overlay
    const a = Math.min(selStart, selEnd);
    const b = Math.max(selStart, selEnd);
    if (b > a) {
      const x0 = (a / working.length) * CANVAS_W;
      const x1 = (b / working.length) * CANVAS_W;
      ctx.fillStyle = "rgba(120, 220, 255, 0.18)";
      ctx.fillRect(x0, 0, x1 - x0, CANVAS_H);
      ctx.strokeStyle = "#5ac8e8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x0, 0);
      ctx.lineTo(x0, CANVAS_H);
      ctx.moveTo(x1, 0);
      ctx.lineTo(x1, CANVAS_H);
      ctx.stroke();
    }
  }, [working, selStart, selEnd]);

  if (error || !asset) {
    return (
      <Modal onClose={onClose}>
        <div style={{ padding: 24, fontSize: 13 }}>{error ?? "Sound asset missing."}</div>
        <footer style={{ display: "flex", justifyContent: "flex-end", padding: 12 }}>
          <Btn onClick={onClose}>Close</Btn>
        </footer>
      </Modal>
    );
  }
  if (!working) {
    return (
      <Modal onClose={onClose}>
        <div style={{ padding: 24, fontSize: 13 }}>Loading…</div>
      </Modal>
    );
  }

  const buf = working;
  const sliceSelection = (): { start: number; end: number } => {
    const a = Math.min(selStart, selEnd);
    const b = Math.max(selStart, selEnd);
    if (b <= a) return { start: 0, end: buf.length };
    return { start: a, end: b };
  };

  const pushHistory = () => {
    setHistory((h) => [...h, new Float32Array(buf)].slice(-20));
  };

  const undo = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setWorking(prev);
    setSelStart(0);
    setSelEnd(prev.length);
    try {
      playingSourceRef.current?.stop();
    } catch {
      /* ignore */
    }
    setIsPlaying(false);
  };

  const reverseSelection = () => {
    pushHistory();
    const next = new Float32Array(buf);
    const { start, end } = sliceSelection();
    let l = start;
    let r = end - 1;
    while (l < r) {
      const tmp = next[l];
      next[l] = next[r];
      next[r] = tmp;
      l++;
      r--;
    }
    setWorking(next);
  };

  const normalizeSelection = () => {
    pushHistory();
    const next = new Float32Array(buf);
    const { start, end } = sliceSelection();
    let peak = 0;
    for (let i = start; i < end; i++) {
      const a = Math.abs(next[i]);
      if (a > peak) peak = a;
    }
    if (peak > 0) {
      const gain = 0.95 / peak;
      for (let i = start; i < end; i++) next[i] *= gain;
    }
    setWorking(next);
  };

  const fadeIn = () => {
    pushHistory();
    const next = new Float32Array(buf);
    const { start, end } = sliceSelection();
    const len = end - start;
    if (len > 0) {
      for (let i = 0; i < len; i++) next[start + i] *= i / len;
    }
    setWorking(next);
  };

  const fadeOut = () => {
    pushHistory();
    const next = new Float32Array(buf);
    const { start, end } = sliceSelection();
    const len = end - start;
    if (len > 0) {
      for (let i = 0; i < len; i++) next[start + i] *= 1 - i / len;
    }
    setWorking(next);
  };

  const trimToSelection = () => {
    const { start, end } = sliceSelection();
    if (end - start === buf.length) return;
    pushHistory();
    const next = buf.slice(start, end);
    setWorking(next);
    setSelStart(0);
    setSelEnd(next.length);
  };

  const adjustGain = (factor: number) => {
    pushHistory();
    const next = new Float32Array(buf);
    const { start, end } = sliceSelection();
    for (let i = start; i < end; i++) {
      next[i] = Math.max(-1, Math.min(1, next[i] * factor));
    }
    setWorking(next);
  };

  const play = () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    try {
      playingSourceRef.current?.stop();
    } catch {
      /* ignore */
    }
    const { start, end } = sliceSelection();
    const len = end - start;
    if (len <= 0) return;
    const audioBuf = ctx.createBuffer(1, len, sampleRate);
    audioBuf.getChannelData(0).set(buf.subarray(start, end));
    const src = ctx.createBufferSource();
    src.buffer = audioBuf;
    src.connect(ctx.destination);
    src.onended = () => {
      setIsPlaying(false);
      if (playingSourceRef.current === src) playingSourceRef.current = null;
    };
    playingSourceRef.current = src;
    src.start();
    setIsPlaying(true);
  };

  const stop = () => {
    try {
      playingSourceRef.current?.stop();
    } catch {
      /* ignore */
    }
    setIsPlaying(false);
  };

  const save = () => {
    if (!project) return;
    const wav = encodeWav(buf, sampleRate);
    const dataUrl = arrayBufferToDataUrl(wav);
    setProject({
      ...project,
      assets: project.assets.map((a) =>
        a.id === asset.id
          ? { ...a, path: dataUrl, version: a.version + 1 }
          : a,
      ),
    });
    evictDecoded(asset.id);
    onClose();
  };

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const sampleIdx = Math.max(0, Math.min(buf.length, Math.floor((x / CANVAS_W) * buf.length)));
    const a = Math.min(selStart, selEnd);
    const b = Math.max(selStart, selEnd);
    if (b > a) {
      const x0 = (a / buf.length) * CANVAS_W;
      const x1 = (b / buf.length) * CANVAS_W;
      if (Math.abs(x - x0) < 6) {
        dragRef.current = "start";
        setSelStart(b);
        setSelEnd(a);
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
      if (Math.abs(x - x1) < 6) {
        dragRef.current = "end";
        setSelStart(a);
        setSelEnd(b);
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
    }
    dragRef.current = "new";
    setSelStart(sampleIdx);
    setSelEnd(sampleIdx);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(CANVAS_W, e.clientX - rect.left));
    const sampleIdx = Math.max(0, Math.min(buf.length, Math.floor((x / CANVAS_W) * buf.length)));
    if (dragRef.current === "start") {
      setSelEnd(sampleIdx);
    } else {
      setSelEnd(sampleIdx);
    }
  };

  const onPointerUp = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!dragRef.current) return;
    if (selEnd < selStart) {
      const a = selStart;
      setSelStart(selEnd);
      setSelEnd(a);
    }
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const duration = buf.length / sampleRate;
  const sel = sliceSelection();
  const selSec = (sel.end - sel.start) / sampleRate;

  return (
    <Modal onClose={onClose}>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ fontSize: 14 }}>Sound Editor — {sound.name}</strong>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#5b6371" }}
            title="Close"
          >
            ×
          </button>
        </header>

        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          style={{
            border: "1px solid #cdd6e2",
            borderRadius: 4,
            cursor: "crosshair",
            touchAction: "none",
            display: "block",
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />

        <div style={{ fontSize: 11, color: "#5b6371" }}>
          Length: {duration.toFixed(2)}s · Selection: {selSec.toFixed(2)}s · {sampleRate} Hz · Drag on the waveform to select a region.
        </div>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {!isPlaying ? (
            <Btn onClick={play}>▶ Play</Btn>
          ) : (
            <Btn onClick={stop}>■ Stop</Btn>
          )}
          <Btn onClick={trimToSelection}>Trim</Btn>
          <Btn onClick={reverseSelection}>Reverse</Btn>
          <Btn onClick={normalizeSelection}>Normalize</Btn>
          <Btn onClick={fadeIn}>Fade In</Btn>
          <Btn onClick={fadeOut}>Fade Out</Btn>
          <Btn onClick={() => adjustGain(1.4)}>Louder</Btn>
          <Btn onClick={() => adjustGain(0.7)}>Softer</Btn>
          <Btn onClick={undo} disabled={history.length === 0}>Undo</Btn>
          <Btn
            onClick={() => {
              setSelStart(0);
              setSelEnd(buf.length);
            }}
          >
            Select All
          </Btn>
        </div>

        <footer style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn onClick={save} primary>
            Save
          </Btn>
        </footer>
      </div>
    </Modal>
  );
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

function Btn({
  children,
  onClick,
  primary = false,
  disabled = false,
}: {
  children: ReactNode;
  onClick(): void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "5px 12px",
        border: "1px solid #cdd6e2",
        borderRadius: 4,
        background: primary ? "#1967d2" : "#f5f7fb",
        color: primary ? "#fff" : "#1a2333",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        font: "inherit",
        fontSize: 12,
      }}
    >
      {children}
    </button>
  );
}
