/**
 * Minimal WebAudio sound engine for sprite scripts.
 *
 * - One AudioContext, lazily created on first play (browsers block
 *   AudioContext creation until a user gesture; the green-flag click is
 *   that gesture).
 * - Decoded AudioBuffers are cached per assetId so re-plays don't hit the
 *   decoder twice.
 * - Active sources tracked in a Set so `stopAllSounds` can cancel them.
 *
 * In test environments (no `window.AudioContext`), every function
 * gracefully no-ops — interpreter tests for sound blocks rely on this.
 */

import { maybeCurrentView } from "./stateView";
import type { Sprite, SpriteSound } from "../types/workspace";

let audioCtx: AudioContext | null = null;
const decoded = new Map<string, AudioBuffer>();
const activeSources = new Set<AudioBufferSourceNode>();
/** Tokens from `playSound`/`playSoundUntilDone`. Maps token → live source. */
const liveTokens = new Map<number, AudioBufferSourceNode>();
let nextToken = 1;

function getCtx(): AudioContext | null {
  if (audioCtx) return audioCtx;
  // SSR / test environments without AudioContext bail out silently.
  const Ctor = (typeof window !== "undefined"
    ? (window as unknown as { AudioContext?: typeof AudioContext })
        .AudioContext
    : undefined);
  if (!Ctor) return null;
  audioCtx = new Ctor();
  return audioCtx;
}

function findSound(sprite: Sprite, name: string): SpriteSound | null {
  const lower = name.toLowerCase();
  return sprite.sounds.find((s) => s.name.toLowerCase() === lower) ?? null;
}

function findAsset(assetId: string) {
  return maybeCurrentView()?.getAsset(assetId) ?? null;
}

/**
 * Decode the asset's base64-encoded data into an AudioBuffer. Returns
 * `null` if the asset is missing, isn't a sound, or decoding fails.
 *
 * Caller is responsible for awaiting; callers in the interpreter run
 * synchronously and use a token-based "is it done?" poll instead of
 * awaiting directly.
 */
async function decodeAsset(assetId: string): Promise<AudioBuffer | null> {
  if (decoded.has(assetId)) return decoded.get(assetId)!;
  const ctx = getCtx();
  if (!ctx) return null;
  const asset = findAsset(assetId);
  if (!asset || asset.kind !== "sound") return null;
  // The asset's `path` may be either a data URL or a raw base64 string.
  // Phase 8 picks one convention; until then accept both.
  const raw = asset.path;
  let bytes: ArrayBuffer | null = null;
  try {
    if (raw.startsWith("data:")) {
      const comma = raw.indexOf(",");
      if (comma < 0) return null;
      bytes = base64ToArrayBuffer(raw.slice(comma + 1));
    } else {
      bytes = base64ToArrayBuffer(raw);
    }
    const buf = await ctx.decodeAudioData(bytes.slice(0));
    decoded.set(assetId, buf);
    return buf;
  } catch {
    return null;
  }
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const len = bin.length;
  const buf = new Uint8Array(len);
  for (let i = 0; i < len; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

export function volumeOf(sprite: Sprite): number {
  const v = sprite.volume;
  if (typeof v !== "number" || Number.isNaN(v)) return 100;
  return Math.max(0, Math.min(100, v));
}

/**
 * Start playing a sound by name on the given sprite. Returns a token the
 * interpreter can poll via `isPlaying(token)` to implement
 * `play_until_done`. Returns 0 when the sound can't be played
 * (no AudioContext, missing asset, decode failure, etc.).
 */
export function playSound(sprite: Sprite, name: string): number {
  const ctx = getCtx();
  if (!ctx) return 0;
  const sound = findSound(sprite, name);
  if (!sound?.assetId) return 0;
  const token = nextToken++;
  // Decode is async; start playback once it resolves. The token is
  // already valid — a poll for it before playback starts will return
  // "still playing" (the source map is empty but the token isn't in
  // `endedTokens`). Once the source ends, the token is removed.
  void decodeAsset(sound.assetId).then((buf) => {
    if (!buf) {
      // Decoding failed — surface as "ended" so play_until_done unblocks.
      liveTokens.delete(token);
      return;
    }
    const source = ctx.createBufferSource();
    source.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = volumeOf(sprite) / 100;
    source.connect(gain).connect(ctx.destination);
    source.onended = () => {
      activeSources.delete(source);
      liveTokens.delete(token);
    };
    activeSources.add(source);
    liveTokens.set(token, source);
    try {
      source.start();
    } catch {
      // Some browsers throw if start is called after dispose; ignore.
      activeSources.delete(source);
      liveTokens.delete(token);
    }
  });
  // Optimistically register the token so a fast `isPlaying` poll returns
  // true before decoding completes.
  liveTokens.set(token, undefined as unknown as AudioBufferSourceNode);
  return token;
}

/** True if the playback registered as `token` is still active. */
export function isPlaying(token: number): boolean {
  if (token === 0) return false;
  return liveTokens.has(token);
}

/** Stop every active sound across every sprite. */
export function stopAllSounds(): void {
  for (const source of activeSources) {
    try {
      source.stop();
    } catch {
      // Already ended.
    }
  }
  activeSources.clear();
  liveTokens.clear();
}

/** Drop the cached decoded AudioBuffer for an asset. Called after the
 *  SoundEditor saves new bytes to that asset, so the next playback
 *  re-decodes from the updated data URL instead of replaying the
 *  pre-edit audio. */
export function evictDecoded(assetId: string): void {
  decoded.delete(assetId);
}

/** Set the per-sprite volume (clamped 0..100). Persists via the active view. */
export function setSpriteVolume(spriteId: string, volume: number): void {
  const v = Math.max(0, Math.min(100, volume));
  maybeCurrentView()?.patchSprite(spriteId, { volume: v });
}
