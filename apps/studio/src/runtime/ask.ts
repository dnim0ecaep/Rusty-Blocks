/**
 * Sensing — `ask "Q" and wait` / `answer` runtime.
 *
 * Scratch shows a prompt at the bottom of the stage when a script runs
 * `ask`, the script blocks until the user types an answer and presses
 * enter, then `answer` reads back the latest reply. We model this as a
 * tiny pub/sub module so:
 *
 *   - The interpreter pushes a question via `ask(spriteId, text)` and
 *     polls `isAnswered()` while yielding frames.
 *   - The StagePanel subscribes to changes via `subscribe(cb)` and
 *     renders an overlay matching the current pending question.
 *   - The user types and calls `submit(answer)`; the interpreter's poll
 *     loop sees `isAnswered()` flip true and continues.
 *
 * State is module-level (per-process). One question at a time — that's
 * Scratch's behavior; if a second sprite asks while one is pending the
 * second `ask` call replaces the first.
 */

interface PendingAsk {
  spriteId: string;
  question: string;
}

let pending: PendingAsk | null = null;
let lastAnswer = "";
const subscribers = new Set<() => void>();

export function ask(spriteId: string, question: string): void {
  pending = { spriteId, question };
  notify();
}

export function getPending(): PendingAsk | null {
  return pending;
}

export function submit(answer: string): void {
  lastAnswer = String(answer);
  pending = null;
  notify();
}

export function getLastAnswer(): string {
  return lastAnswer;
}

export function isAnswered(): boolean {
  return pending === null;
}

export function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

/** Test-only reset. Production code never needs this. */
export function _resetForTesting(): void {
  pending = null;
  lastAnswer = "";
  subscribers.clear();
}

function notify(): void {
  for (const s of subscribers) s();
}
