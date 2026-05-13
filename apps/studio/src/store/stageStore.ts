import { create } from "zustand";

import {
  emptyStageState,
  STAGE_STATE_SCHEMA_VERSION,
  type Costume,
  type Sprite,
  type StageState,
} from "../types/workspace";
import { derivePreviewFromScripts } from "../runtime/spriteTextPreview";

/**
 * Live runtime state for the sprite stage.
 *
 * This store is kept separate from `projectStore` so script execution can
 * mutate sprite state at high frequency (every animation frame) without
 * invalidating the project file's React subtree. The project store
 * snapshots stage state only when explicitly saving.
 */
interface StageStore {
  sprites: Sprite[];
  selectedSpriteId?: string;
  backdropIndex: number;
  /** Stage backdrops — same shape as a sprite costume. The active
   *  backdrop is `backdrops[backdropIndex]`; -1 means no backdrop
   *  (renderer falls back to plain white). */
  backdrops: Costume[];
  /** Mounted: true while the runtime player is mounted (i.e., StagePanel is visible). */
  mounted: boolean;
  /**
   * Stage-scope (global) variables and lists. Per-sprite scopes live on
   * the Sprite. Read order is per-sprite first, then stage; writes prefer
   * whichever scope already holds the name (and create per-sprite when
   * neither does).
   */
  globalVariables: Record<string, number | string>;
  globalLists: Record<string, Array<number | string>>;
  /**
   * Set of variable/list names whose monitor overlay is currently visible.
   * Toggled by `show variable` / `hide variable`. Stage-scope monitors and
   * per-sprite monitors share this set — name collisions are rare in
   * practice and Scratch itself uses a single visible-set per scope.
   */
  visibleMonitors: Set<string>;

  /** Add a new sprite with sensible defaults. Returns the created sprite. */
  addSprite(name?: string): Sprite;
  /** Remove a sprite by id; clears selection if it was selected. */
  removeSprite(id: string): void;
  /** Set or clear the current selection. */
  selectSprite(id?: string): void;
  /** Update a sprite's stage position (Scratch coords). */
  setSpritePosition(id: string, x: number, y: number): void;
  /** Generic single-prop update — used by the inspector and the runtime. */
  updateSprite(id: string, patch: Partial<Sprite>): void;
  /** Replace every sprite (used by hydrate). */
  setSprites(sprites: Sprite[]): void;
  /** Reset to the project's saved StageState (or empty if absent). */
  hydrate(state: StageState | undefined): void;
  /** Snapshot the current store as a serializable StageState. */
  toStageState(): StageState;
  /** Mark the stage as mounted/unmounted (UI hook lifecycle). */
  setMounted(mounted: boolean): void;

  /** Update one stage-scope variable. */
  setGlobalVariable(name: string, value: number | string): void;
  /** Replace one stage-scope list. */
  setGlobalList(name: string, list: Array<number | string>): void;
  /** Show / hide monitor for `name` (variable or list). */
  setMonitorVisible(name: string, visible: boolean): void;

  /** Stage backdrops — Scratch/TurboWarp-style stage backgrounds.
   *  Backdrops are full-stage images selected via `backdropIndex`. */
  addBackdrop(backdrop: Costume): void;
  removeBackdrop(index: number): void;
  /** Switch which backdrop is active (-1 means no backdrop, plain bg). */
  setBackdropIndex(index: number): void;

  /**
   * Clone a sprite by id. Returns the new clone (selected = no), or
   * `null` if the global clone cap (300) has been reached. The new
   * clone shares the parent's costumes/sounds (by reference — runtime
   * is read-only on these), inherits position/direction/size/visible/
   * costumeIndex, and gets fresh per-clone variables/lists initialized
   * from the parent's snapshot.
   */
  cloneSprite(parentId: string): Sprite | null;
}

/**
 * Total clone cap. Cheap protection against runaway scripts; matches the
 * Scratch convention. Counted globally across every sprite (not per-parent).
 */
export const CLONE_CAP = 300;

let nextLayer = 1;
function newSpriteId(): string {
  return `sprite_${Math.random().toString(36).slice(2, 10)}`;
}

function defaultSprite(name: string, layer: number): Sprite {
  return {
    id: newSpriteId(),
    name,
    x: 0,
    y: 0,
    direction: 90,
    size: 100,
    visible: true,
    rotationStyle: "all-around",
    costumeIndex: -1,
    costumes: [],
    sounds: [],
    scripts_xml: "",
    variables: {},
    lists: {},
    layer,
  };
}

export const useStageStore = create<StageStore>((set, get) => ({
  sprites: [],
  selectedSpriteId: undefined,
  backdropIndex: -1,
  backdrops: [],
  mounted: false,
  globalVariables: {},
  globalLists: {},
  visibleMonitors: new Set<string>(),

  addSprite(name) {
    const layer = nextLayer++;
    const baseName = name?.trim() || `Sprite${get().sprites.length + 1}`;
    const sprite = defaultSprite(baseName, layer);
    set((state) => ({
      sprites: [...state.sprites, sprite],
      selectedSpriteId: sprite.id,
    }));
    return sprite;
  },

  removeSprite(id) {
    set((state) => ({
      sprites: state.sprites.filter((s) => s.id !== id),
      selectedSpriteId: state.selectedSpriteId === id ? undefined : state.selectedSpriteId,
    }));
  },

  selectSprite(id) {
    set({ selectedSpriteId: id });
  },

  setSpritePosition(id, x, y) {
    set((state) => ({
      sprites: state.sprites.map((s) => (s.id === id ? { ...s, x, y } : s)),
    }));
  },

  updateSprite(id, patch) {
    set((state) => ({
      sprites: state.sprites.map((s) => {
        if (s.id !== id) return s;
        const merged = { ...s, ...patch };
        // When the script chain itself changed, derive a WYSIWYG
        // preview from any literal set_text_to / set_text_with_font /
        // set_text_size_to inputs and apply it immediately, so the
        // user sees the text/font/size on the stage as they author
        // without waiting for the green flag.
        if (typeof patch.scripts_xml === "string") {
          const preview = derivePreviewFromScripts(patch.scripts_xml);
          return { ...merged, ...preview };
        }
        return merged;
      }),
    }));
  },

  setSprites(sprites) {
    set({ sprites });
    // Bump nextLayer past whatever's loaded so newly-added sprites stack on top.
    const max = sprites.reduce((m, s) => Math.max(m, s.layer ?? 0), 0);
    nextLayer = max + 1;
  },

  hydrate(state) {
    if (!state) {
      set({
        sprites: [],
        selectedSpriteId: undefined,
        backdropIndex: -1,
        backdrops: [],
        globalVariables: {},
        globalLists: {},
        visibleMonitors: new Set<string>(),
      });
      nextLayer = 1;
      return;
    }
    set({
      sprites: state.sprites.map((s) => ({ ...s })),
      selectedSpriteId: state.selectedSpriteId,
      backdropIndex: state.backdropIndex,
      backdrops: (state.backdrops ?? []).map((b) => ({ ...b })),
      globalVariables: { ...state.globalVariables },
      globalLists: Object.fromEntries(
        Object.entries(state.globalLists).map(([k, v]) => [k, [...v]])
      ),
      visibleMonitors: new Set<string>(),
    });
    const max = state.sprites.reduce((m, s) => Math.max(m, s.layer ?? 0), 0);
    nextLayer = max + 1;
  },

  toStageState() {
    const {
      sprites,
      selectedSpriteId,
      backdropIndex,
      backdrops,
      globalVariables,
      globalLists,
    } = get();
    // Clones are a runtime-only concept — drop them on save.
    const persistable = sprites.filter((s) => !s.isClone);
    return {
      schema_version: STAGE_STATE_SCHEMA_VERSION,
      sprites: persistable.map((s) => ({ ...s })),
      selectedSpriteId:
        persistable.some((s) => s.id === selectedSpriteId) ? selectedSpriteId : undefined,
      backdropIndex,
      backdrops: backdrops.map((b) => ({ ...b })),
      globalVariables: { ...globalVariables },
      globalLists: Object.fromEntries(
        Object.entries(globalLists).map(([k, v]) => [k, [...v]])
      ),
    };
  },

  setMounted(mounted) {
    set({ mounted });
  },

  setGlobalVariable(name, value) {
    set((state) => ({
      globalVariables: { ...state.globalVariables, [name]: value },
    }));
  },

  setGlobalList(name, list) {
    set((state) => ({
      globalLists: { ...state.globalLists, [name]: list },
    }));
  },

  setMonitorVisible(name, visible) {
    set((state) => {
      const next = new Set(state.visibleMonitors);
      if (visible) next.add(name);
      else next.delete(name);
      return { visibleMonitors: next };
    });
  },

  addBackdrop(backdrop) {
    set((state) => ({
      backdrops: [...state.backdrops, backdrop],
      // First-import: switch to it so the user sees the backdrop right
      // away. Subsequent imports keep the current selection.
      backdropIndex: state.backdropIndex < 0 ? state.backdrops.length : state.backdropIndex,
    }));
  },

  removeBackdrop(index) {
    set((state) => {
      if (index < 0 || index >= state.backdrops.length) return state;
      const next = state.backdrops.filter((_, i) => i !== index);
      let newIndex = state.backdropIndex;
      if (newIndex === index) {
        newIndex = next.length > 0 ? 0 : -1;
      } else if (newIndex > index) {
        newIndex -= 1;
      }
      return { backdrops: next, backdropIndex: newIndex };
    });
  },

  setBackdropIndex(index) {
    set({ backdropIndex: index });
  },

  cloneSprite(parentId) {
    const state = get();
    const parent = state.sprites.find((s) => s.id === parentId);
    if (!parent) return null;
    const cloneCount = state.sprites.reduce((n, s) => n + (s.isClone ? 1 : 0), 0);
    if (cloneCount >= CLONE_CAP) return null;
    const layer = nextLayer++;
    const clone: Sprite = {
      ...parent,
      id: newSpriteId(),
      // Clone variable/list scopes are independent from the parent.
      variables: { ...parent.variables },
      lists: Object.fromEntries(
        Object.entries(parent.lists).map(([k, v]) => [k, [...v]])
      ),
      isClone: true,
      parentSpriteId: parent.isClone ? parent.parentSpriteId : parent.id,
      // Fresh layer at front so the clone is visible immediately.
      layer,
      // Bubble carries no clone semantics; let it inherit (often empty).
    };
    set((s) => ({ sprites: [...s.sprites, clone] }));
    return clone;
  },
}));
