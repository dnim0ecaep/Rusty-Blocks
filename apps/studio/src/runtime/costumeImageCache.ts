/**
 * In-memory cache of decoded costume images keyed by assetId.
 *
 * The stage canvas redraws on every sprite mutation, so we can't tolerate
 * an HTMLImageElement load every frame. This cache:
 *   1. Returns the loaded image immediately if cached.
 *   2. Returns null and kicks off a load if not yet decoded.
 *   3. Calls every registered listener once a load resolves so the canvas
 *      can re-render the (now-real) costume.
 *
 * SVG, PNG, JPEG, GIF — anything an `<img>` element accepts — works.
 */

import { maybeCurrentView } from "./stateView";

const cache = new Map<string, HTMLImageElement>();
const inflight = new Set<string>();
const listeners = new Set<() => void>();

/** Subscribe to "a costume finished loading"; returns an unsubscribe. */
export function onCostumeLoaded(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const fn of listeners) fn();
}

/**
 * Get the loaded HTMLImageElement for `assetId`, or `null` while a load
 * is in flight. Idempotent — safe to call every frame for every visible
 * sprite. The image element returned has `naturalWidth`/`naturalHeight`
 * available; callers should fall back to placeholder rendering when
 * those are zero (still loading).
 */
export function getCostumeImage(assetId: string): HTMLImageElement | null {
  const cached = cache.get(assetId);
  if (cached) return cached.naturalWidth > 0 ? cached : null;
  if (inflight.has(assetId)) return null;

  const view = maybeCurrentView();
  if (!view) return null;
  const asset = view.getAsset(assetId);
  if (!asset || asset.kind !== "costume") return null;
  if (typeof Image === "undefined") return null;

  inflight.add(assetId);
  const img = new Image();
  img.onload = () => {
    inflight.delete(assetId);
    cache.set(assetId, img);
    notify();
  };
  img.onerror = () => {
    inflight.delete(assetId);
    // Cache an empty entry so we don't keep retrying a broken asset.
    cache.set(assetId, img);
    notify();
  };
  // The path may be either a data URL or a raw base64 payload (Phase 8
  // writes data URLs; older asset records may be raw). Treat anything
  // that doesn't look like a URL as base64-png by default.
  img.src = asset.path.startsWith("data:") || /^https?:|^blob:/.test(asset.path)
    ? asset.path
    : `data:image/png;base64,${asset.path}`;
  return null;
}

/** Drop one entry; useful when an asset is replaced (e.g. edit-in-place
 *  via the costume editor). Fires `notify()` so subscribers — like the
 *  StagePanel canvas — can re-render. Without this notify, the canvas
 *  would keep drawing the now-stale cached image until something else
 *  forced a render. */
export function evictCostume(assetId: string): void {
  cache.delete(assetId);
  inflight.delete(assetId);
  notify();
}

/** Drop everything; called on project switch so old assets don't leak. */
export function clearCostumeCache(): void {
  cache.clear();
  inflight.clear();
}
