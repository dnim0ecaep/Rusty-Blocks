import type { BlockLike } from "./compileScripts";
import { findHats, runHat, sharedScheduler } from "./scheduler";
import type { ExecContext } from "./scriptInterpreter";
import { makeSharedWorkspace, materializeSpriteWorkspace } from "./spriteWorkspaces";
import { currentView } from "./stateView";
import type { Sprite } from "../types/workspace";

/**
 * High-level coordinator for "fire a hat across every sprite".
 *
 * For each sprite, this materializes a transient workspace from
 * `sprite.scripts_xml`, finds hats matching `hatType`, and queues a
 * generator per hat onto the shared scheduler. The transient workspace is
 * disposed automatically once the last script using it ends — driven by
 * the scheduler's `onEnd` hook on each `RunningScript`.
 *
 * Nothing happens for sprites with no matching hats. The caller can pass
 * `predicate(hat)` to filter (e.g. only hats with the right key dropdown).
 */
export interface FireHatOptions {
  hatType: string;
  /** Filter hats — receives the hat block, returns true to fire it. */
  predicate?: (hat: BlockLike, sprite: Sprite) => boolean;
  /** Optional script-id prefix; useful for debugging. */
  labelPrefix?: string;
}

export function fireHatAcrossSprites(options: FireHatOptions): number {
  const sprites = currentView().getSprites();
  let fired = 0;
  for (const sprite of sprites) {
    fired += fireHatForSprite(sprite, options);
  }
  if (fired > 0) sharedScheduler.start();
  return fired;
}

/**
 * Fire `hatType` for one specific sprite. Useful for `when this sprite
 * clicked` (where the click hit-tested a single sprite) and broadcasts.
 *
 * Returns the number of scripts queued.
 */
export function fireHatForSprite(sprite: Sprite, options: FireHatOptions): number {
  const ws = materializeSpriteWorkspace(sprite);
  const shared = makeSharedWorkspace(ws);
  const hats = findHats(ws, options.hatType).filter(
    (h) => !options.predicate || options.predicate(h, sprite)
  );
  if (hats.length === 0) {
    shared.release();
    return 0;
  }
  for (const hat of hats) {
    shared.addRef();
    const ctx: ExecContext = makeRuntimeContext(sprite.id);
    sharedScheduler.addScript({
      id: `script_${sprite.id}_${hat.id}_${Math.random().toString(36).slice(2, 8)}`,
      spriteId: sprite.id,
      label: `${options.labelPrefix ?? options.hatType} → ${sprite.name}/${hat.id}`,
      gen: runHat(hat, ctx),
      onEnd: () => shared.release(),
    });
  }
  return hats.length;
}

/**
 * Default ExecContext that reads/writes through the active StageStateView.
 * Used by every queued script — keeps the green flag, broadcasts, key
 * presses, and clone hats consistent with whatever host (studio or
 * standalone player) is in charge.
 */
export function makeRuntimeContext(spriteId: string): ExecContext {
  const view = currentView();
  const getSprite = () => view.getSprite(spriteId);
  const patchSprite = (patch: Partial<Sprite>) => view.patchSprite(spriteId, patch);

  return {
    spriteId,
    getSprite,
    patchSprite,
    getSprites: () => view.getSprites().slice(),
    dispatchBroadcast: (name) => dispatchBroadcast(name),
    hasActiveScripts: (ids) => sharedScheduler.hasActiveScripts(ids),

    // Variable resolution: per-sprite first, stage-scope fallback.
    getVariable(name) {
      const sprite = getSprite();
      if (sprite && Object.prototype.hasOwnProperty.call(sprite.variables, name)) {
        return sprite.variables[name];
      }
      const stage = view.getGlobalVariables();
      if (Object.prototype.hasOwnProperty.call(stage, name)) return stage[name];
      return 0;
    },
    setVariable(name, value) {
      const sprite = getSprite();
      const stage = view.getGlobalVariables();
      // Existing scope wins. New names land per-sprite.
      if (sprite && Object.prototype.hasOwnProperty.call(sprite.variables, name)) {
        patchSprite({ variables: { ...sprite.variables, [name]: value } });
      } else if (Object.prototype.hasOwnProperty.call(stage, name)) {
        view.setGlobalVariable(name, value);
      } else if (sprite) {
        patchSprite({ variables: { ...sprite.variables, [name]: value } });
      }
    },
    getList(name) {
      const sprite = getSprite();
      if (sprite && Object.prototype.hasOwnProperty.call(sprite.lists, name)) {
        return sprite.lists[name];
      }
      const stage = view.getGlobalLists();
      if (Object.prototype.hasOwnProperty.call(stage, name)) return [...stage[name]];
      return [];
    },
    setList(name, list) {
      const sprite = getSprite();
      const stage = view.getGlobalLists();
      if (sprite && Object.prototype.hasOwnProperty.call(sprite.lists, name)) {
        patchSprite({ lists: { ...sprite.lists, [name]: list } });
      } else if (Object.prototype.hasOwnProperty.call(stage, name)) {
        view.setGlobalList(name, list);
      } else if (sprite) {
        patchSprite({ lists: { ...sprite.lists, [name]: list } });
      }
    },
    setMonitorVisible(name, visible) {
      view.setMonitorVisible(name, visible);
    },

    // ── Cloning ───────────────────────────────────────────────────────
    cloneSprite(target) {
      const self = getSprite();
      const lower = target.trim().toLowerCase();
      let parent: Sprite | undefined;
      if (lower === "myself" || lower === "") {
        parent = self;
      } else {
        parent = view.getSprites().find((s) => s.name.toLowerCase() === lower);
      }
      if (!parent) return undefined;
      // For "myself" on a clone, clone the original parent (Scratch
      // semantics — clones can't be parents).
      const sourceId = parent.isClone && parent.parentSpriteId ? parent.parentSpriteId : parent.id;
      const clone = cloneSpriteInView(sourceId);
      if (!clone) return undefined;
      // Fire any `when_i_start_as_clone` hats on the parent's scripts,
      // running against the new clone.
      const sourceSprite = view.getSprite(sourceId) ?? parent;
      fireHatForSprite(
        // The new clone runs the parent's xml, so route the spriteId
        // through a synthetic Sprite object pointing at the clone but
        // using the parent's scripts_xml.
        { ...sourceSprite, id: clone.id, scripts_xml: sourceSprite.scripts_xml },
        {
          hatType: "scratch_control_when_i_start_as_clone",
          labelPrefix: `clone:${clone.name}`,
        }
      );
      sharedScheduler.start();
      return clone.id;
    },
    deleteThisClone() {
      const self = getSprite();
      if (!self?.isClone) return; // delete_this_clone on a non-clone is a no-op.
      sharedScheduler.stopForSprite(spriteId);
      view.removeSprite(spriteId);
    },
  };
}

/**
 * Total clone cap. Cheap protection against runaway scripts; matches the
 * Scratch convention. Counted globally across every sprite.
 */
const CLONE_CAP = 300;

/**
 * Build a fresh clone sprite from `sourceId` and add it to the view.
 * Returns the new sprite, or `null` if the cap was hit / source missing.
 *
 * Centralizing this here (rather than a view method) means hosts that
 * implement StageStateView only need to provide primitive add/remove +
 * id/layer allocators — they don't need to know about clone semantics.
 */
function cloneSpriteInView(sourceId: string): Sprite | null {
  const view = currentView();
  const parent = view.getSprite(sourceId);
  if (!parent) return null;
  if (view.cloneCount() >= CLONE_CAP) return null;
  const clone: Sprite = {
    ...parent,
    id: view.newSpriteId(),
    variables: { ...parent.variables },
    lists: Object.fromEntries(
      Object.entries(parent.lists).map(([k, v]) => [k, [...v]])
    ),
    isClone: true,
    parentSpriteId: parent.isClone ? parent.parentSpriteId : parent.id,
    layer: view.nextLayer(),
  };
  view.addSprite(clone);
  return clone;
}

/**
 * Dispatch a broadcast to every sprite. Each `when_i_receive` hat whose
 * BROADCAST field matches `name` (case-insensitive, trimmed) gets queued
 * onto the shared scheduler. Returns the queued script ids so callers
 * (broadcast_and_wait) can poll for completion.
 */
export function dispatchBroadcast(name: string): string[] {
  const target = name.trim().toLowerCase();
  if (!target) return [];
  const sprites = currentView().getSprites();
  const fired: string[] = [];
  for (const sprite of sprites) {
    const ws = materializeSpriteWorkspace(sprite);
    const shared = makeSharedWorkspace(ws);
    const matching = findHats(ws, "scratch_event_when_i_receive").filter((h) => {
      const value = String(h.getFieldValue("BROADCAST") ?? "").trim().toLowerCase();
      return value === target;
    });
    if (matching.length === 0) {
      shared.release();
      continue;
    }
    for (const hat of matching) {
      shared.addRef();
      const id = `script_${sprite.id}_${hat.id}_${Math.random().toString(36).slice(2, 8)}`;
      fired.push(id);
      sharedScheduler.addScript({
        id,
        spriteId: sprite.id,
        label: `recv ${name} → ${sprite.name}`,
        gen: runHat(hat, makeRuntimeContext(sprite.id)),
        onEnd: () => shared.release(),
      });
    }
  }
  if (fired.length > 0) sharedScheduler.start();
  return fired;
}

/**
 * Fire `when_key_pressed` hats across every sprite for a discrete key
 * press. The "any" key dropdown matches every press (Scratch convention).
 */
export function dispatchKeyPress(scratchKey: string): number {
  return fireHatAcrossSprites({
    hatType: "scratch_event_when_key_pressed",
    predicate: (hat) => {
      const slot = String(hat.getFieldValue("KEY") ?? "any");
      return slot === "any" || slot === scratchKey;
    },
    labelPrefix: `key:${scratchKey}`,
  });
}

/** Fire `when_this_sprite_clicked` hats for the clicked sprite only. */
export function dispatchSpriteClicked(sprite: Sprite): number {
  const fired = fireHatForSprite(sprite, {
    hatType: "scratch_event_when_this_sprite_clicked",
    labelPrefix: `click:${sprite.name}`,
  });
  if (fired > 0) sharedScheduler.start();
  return fired;
}
