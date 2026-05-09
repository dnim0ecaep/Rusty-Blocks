/**
 * Built-in sound library.
 *
 * Every entry is a tiny synth function that produces a Float32 mono
 * sample buffer. Calling `entryToWavDataUrl` runs the synth, encodes
 * the buffer as a 16-bit PCM WAV, and returns a `data:` URL the
 * SoundPicker imports as a normal sound asset.
 *
 * Why synthesize at runtime instead of bundling .wav files?
 *   - Ships zero binary blobs — the catalog is pure code, easily
 *     diff-able and tree-shakeable.
 *   - 13 sounds × ~0.3s × 22kHz × 2B ≈ 170 KB total, which is cheaper
 *     to compute on demand than to embed as base64 strings everyone
 *     loads on app boot.
 */

import { arrayBufferToDataUrl, encodeWav } from "./wavEncoder";

const SAMPLE_RATE = 22050;

export const SOUND_LIBRARY_SAMPLE_RATE = SAMPLE_RATE;

export interface SoundLibraryEntry {
  id: string;
  name: string;
  /** Mono PCM samples in [-1, 1] at SOUND_LIBRARY_SAMPLE_RATE. */
  synthesize(): Float32Array;
}

// ── envelopes ───────────────────────────────────────────────────────

function envExpDecay(t: number, decay: number): number {
  return Math.exp(-t * decay);
}

function envADSR(
  t: number,
  duration: number,
  attack = 0.01,
  release = 0.1,
): number {
  if (t < attack) return t / attack;
  if (t > duration - release) {
    return Math.max(0, (duration - t) / release);
  }
  return 1;
}

// ── synths ──────────────────────────────────────────────────────────

function synthClick(): Float32Array {
  const duration = 0.03;
  const n = Math.floor(duration * SAMPLE_RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    out[i] = (Math.random() * 2 - 1) * envExpDecay(t, 80) * 0.7;
  }
  return out;
}

function synthPop(): Float32Array {
  const duration = 0.2;
  const n = Math.floor(duration * SAMPLE_RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const f = 600 - t * 1200;
    out[i] = Math.sin(2 * Math.PI * f * t) * envExpDecay(t, 14) * 0.6;
  }
  return out;
}

function synthBeep(): Float32Array {
  return tone(523.25, 0.18);
}

function synthBoop(): Float32Array {
  return tone(196, 0.22);
}

function synthChime(): Float32Array {
  const duration = 0.7;
  const n = Math.floor(duration * SAMPLE_RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const a = Math.sin(2 * Math.PI * 880 * t) * 0.35;
    const b = Math.sin(2 * Math.PI * 1320 * t) * 0.25;
    out[i] = (a + b) * envExpDecay(t, 3);
  }
  return out;
}

function synthBell(): Float32Array {
  const duration = 1.5;
  const f = 660;
  const n = Math.floor(duration * SAMPLE_RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const modIdx = 4 * envExpDecay(t, 2);
    const mod = Math.sin(2 * Math.PI * f * 2 * t) * modIdx;
    out[i] = Math.sin(2 * Math.PI * f * t + mod) * envExpDecay(t, 1.5) * 0.4;
  }
  return out;
}

function synthWhistle(): Float32Array {
  const duration = 0.4;
  const n = Math.floor(duration * SAMPLE_RATE);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const f = 600 + t * 800;
    phase += (2 * Math.PI * f) / SAMPLE_RATE;
    out[i] = Math.sin(phase) * envADSR(t, duration, 0.05, 0.1) * 0.4;
  }
  return out;
}

function synthBuzzer(): Float32Array {
  const duration = 0.3;
  const n = Math.floor(duration * SAMPLE_RATE);
  const out = new Float32Array(n);
  const f = 110;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const phase = t * f - Math.floor(0.5 + t * f);
    out[i] = 2 * phase * envADSR(t, duration) * 0.4;
  }
  return out;
}

function synthDrum(): Float32Array {
  const duration = 0.4;
  const n = Math.floor(duration * SAMPLE_RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const f = Math.max(40, 150 - t * 300);
    out[i] = Math.sin(2 * Math.PI * f * t) * envExpDecay(t, 8) * 0.7;
  }
  // Brief noise transient on the attack
  const clickN = Math.min(n, Math.floor(0.005 * SAMPLE_RATE));
  for (let i = 0; i < clickN; i++) {
    out[i] += (Math.random() * 2 - 1) * 0.4;
  }
  return out;
}

function synthSnare(): Float32Array {
  const duration = 0.2;
  const n = Math.floor(duration * SAMPLE_RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const noise = (Math.random() * 2 - 1) * 0.5;
    const body = Math.sin(2 * Math.PI * 200 * t) * 0.3;
    out[i] = (noise + body) * envExpDecay(t, 12);
  }
  return out;
}

function synthMagic(): Float32Array {
  // C-E-G-C ascending arpeggio
  const notes = [523.25, 659.25, 783.99, 1046.5];
  const noteDur = 0.18;
  const total = Math.floor(noteDur * notes.length * SAMPLE_RATE);
  const out = new Float32Array(total);
  for (let n = 0; n < notes.length; n++) {
    const start = Math.floor(n * noteDur * SAMPLE_RATE);
    const end = Math.min(total, Math.floor((n + 1) * noteDur * SAMPLE_RATE));
    const f = notes[n];
    for (let i = start; i < end; i++) {
      const t = (i - start) / SAMPLE_RATE;
      out[i] = Math.sin(2 * Math.PI * f * t) * envADSR(t, noteDur, 0.01, 0.04) * 0.35;
    }
  }
  return out;
}

function synthWhoosh(): Float32Array {
  const duration = 0.5;
  const n = Math.floor(duration * SAMPLE_RATE);
  const out = new Float32Array(n);
  // One-pole low-pass with falling cutoff
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const noise = Math.random() * 2 - 1;
    const alpha = 0.05 + 0.6 * (1 - t / duration);
    prev = prev + alpha * (noise - prev);
    out[i] = prev * envADSR(t, duration, 0.05, 0.15) * 0.6;
  }
  return out;
}

function synthMeow(): Float32Array {
  const duration = 0.5;
  const n = Math.floor(duration * SAMPLE_RATE);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const tn = t / duration;
    const f = 380 + 280 * Math.sin(Math.PI * tn);
    phase += (2 * Math.PI * f) / SAMPLE_RATE;
    const sample = Math.sin(phase) * 0.5 + Math.sin(phase * 2) * 0.2;
    out[i] = sample * envADSR(t, duration, 0.03, 0.1);
  }
  return out;
}

function tone(freq: number, duration: number, gain = 0.4): Float32Array {
  const n = Math.floor(duration * SAMPLE_RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    out[i] = Math.sin(2 * Math.PI * freq * t) * gain * envADSR(t, duration);
  }
  return out;
}

// ── catalog ─────────────────────────────────────────────────────────

export const SOUND_LIBRARY: SoundLibraryEntry[] = [
  { id: "lib_snd_click", name: "Click", synthesize: synthClick },
  { id: "lib_snd_pop", name: "Pop", synthesize: synthPop },
  { id: "lib_snd_beep", name: "Beep", synthesize: synthBeep },
  { id: "lib_snd_boop", name: "Boop", synthesize: synthBoop },
  { id: "lib_snd_chime", name: "Chime", synthesize: synthChime },
  { id: "lib_snd_bell", name: "Bell", synthesize: synthBell },
  { id: "lib_snd_whistle", name: "Whistle", synthesize: synthWhistle },
  { id: "lib_snd_buzzer", name: "Buzzer", synthesize: synthBuzzer },
  { id: "lib_snd_drum", name: "Drum", synthesize: synthDrum },
  { id: "lib_snd_snare", name: "Snare", synthesize: synthSnare },
  { id: "lib_snd_magic", name: "Magic", synthesize: synthMagic },
  { id: "lib_snd_whoosh", name: "Whoosh", synthesize: synthWhoosh },
  { id: "lib_snd_meow", name: "Meow", synthesize: synthMeow },
];

/** Synthesize and encode a library entry as a `data:audio/wav;base64,…` URL. */
export function entryToWavDataUrl(entry: SoundLibraryEntry): string {
  const samples = entry.synthesize();
  return arrayBufferToDataUrl(encodeWav(samples, SAMPLE_RATE));
}
