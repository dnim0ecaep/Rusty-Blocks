import { useEffect, useRef, useState } from "react";

import {
  SOUND_LIBRARY,
  SOUND_LIBRARY_SAMPLE_RATE,
  entryToWavDataUrl,
  type SoundLibraryEntry,
} from "../data/builtInSounds";

/**
 * Built-in sound library picker. Differs from the sprite/backdrop
 * LibraryDialog in that each row has a play-preview button; the
 * synthesizer runs locally so we don't need to import the WAV before
 * the user has decided to add it.
 */
interface Props {
  onClose(): void;
  /** Caller receives the entry's name + a `data:audio/wav;base64,…`
   *  URL it stores as a normal sound asset record. */
  onPick(entry: SoundLibraryEntry, dataUrl: string): void;
}

export function SoundLibraryDialog({ onClose, onPick }: Props) {
  const [filter, setFilter] = useState("");
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playingRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    return () => {
      try {
        playingRef.current?.stop();
      } catch {
        /* ignore */
      }
      void audioCtxRef.current?.close();
    };
  }, []);

  const filtered = filter.trim()
    ? SOUND_LIBRARY.filter((e) =>
        e.name.toLowerCase().includes(filter.toLowerCase()),
      )
    : SOUND_LIBRARY;

  const preview = (entry: SoundLibraryEntry) => {
    if (typeof window === "undefined") return;
    const Ctor = (window as unknown as { AudioContext?: typeof AudioContext })
      .AudioContext;
    if (!Ctor) return;
    if (!audioCtxRef.current) audioCtxRef.current = new Ctor();
    const ctx = audioCtxRef.current;
    try {
      playingRef.current?.stop();
    } catch {
      /* ignore */
    }
    const samples = entry.synthesize();
    const buffer = ctx.createBuffer(1, samples.length, SOUND_LIBRARY_SAMPLE_RATE);
    buffer.getChannelData(0).set(samples);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.onended = () => {
      if (playingRef.current === src) playingRef.current = null;
    };
    playingRef.current = src;
    src.start();
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
          width: 480,
          maxWidth: "90vw",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
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
          <strong style={{ fontSize: 14 }}>Sound Library</strong>
          <input
            type="text"
            placeholder="Search…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              padding: "3px 8px",
              border: "1px solid #cdd6e2",
              borderRadius: 4,
              fontSize: 12,
              width: 160,
            }}
            autoFocus
          />
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 18,
              cursor: "pointer",
              color: "#5b6371",
              padding: "0 4px",
            }}
            title="Close"
          >
            ×
          </button>
        </header>
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            overflowY: "auto",
            flex: 1,
          }}
        >
          {filtered.length === 0 ? (
            <li
              style={{
                padding: 40,
                textAlign: "center",
                color: "#5b6371",
                fontSize: 13,
              }}
            >
              No matches for "{filter}".
            </li>
          ) : (
            filtered.map((entry) => (
              <li
                key={entry.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 14px",
                  borderBottom: "1px solid #eef1f5",
                  fontSize: 13,
                }}
              >
                <button
                  type="button"
                  onClick={() => preview(entry)}
                  title="Preview"
                  style={{
                    width: 28,
                    height: 28,
                    border: "1px solid #cdd6e2",
                    borderRadius: 14,
                    background: "#fff",
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  ▶
                </button>
                <span style={{ flex: 1 }}>{entry.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    onPick(entry, entryToWavDataUrl(entry));
                    onClose();
                  }}
                  style={{
                    padding: "4px 10px",
                    border: "1px solid #cdd6e2",
                    borderRadius: 4,
                    background: "#f5f7fb",
                    cursor: "pointer",
                    font: "inherit",
                  }}
                >
                  Add
                </button>
              </li>
            ))
          )}
        </ul>
        <footer
          style={{
            padding: "8px 14px",
            borderTop: "1px solid #cdd6e2",
            background: "#f5f7fb",
            fontSize: 11,
            color: "#5b6371",
          }}
        >
          Synthesized at import time — no CDN fetch needed.
        </footer>
      </div>
    </div>
  );
}
