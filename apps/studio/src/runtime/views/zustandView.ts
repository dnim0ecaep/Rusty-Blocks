/**
 * StageStateView backed by the studio's zustand stores.
 *
 * Installed once at studio startup so every engine module reads/writes
 * via the live `useStageStore` / `useProjectStore` instead of importing
 * them directly. Behavior is unchanged from before the refactor — every
 * call here delegates to a method that already existed.
 */

import { useProjectStore } from "../../store/projectStore";
import { useStageStore } from "../../store/stageStore";
import type { AssetRecord, Sprite } from "../../types/workspace";
import type { StageStateView } from "../stateView";

export function makeZustandView(): StageStateView {
  return {
    getSprites(): readonly Sprite[] {
      return useStageStore.getState().sprites;
    },
    getSprite(id) {
      return useStageStore.getState().sprites.find((s) => s.id === id);
    },
    patchSprite(id, patch) {
      useStageStore.getState().updateSprite(id, patch);
    },
    addSprite(sprite) {
      // The view is responsible for layering; the existing addSprite
      // method allocates its own layer/id, so we set the sprites list
      // directly here to honor the caller's pre-built sprite.
      const store = useStageStore.getState();
      useStageStore.setState({ sprites: [...store.sprites, sprite] });
    },
    removeSprite(id) {
      useStageStore.getState().removeSprite(id);
    },
    getGlobalVariables() {
      return useStageStore.getState().globalVariables;
    },
    getGlobalLists() {
      return useStageStore.getState().globalLists;
    },
    setGlobalVariable(name, value) {
      useStageStore.getState().setGlobalVariable(name, value);
    },
    setGlobalList(name, list) {
      useStageStore.getState().setGlobalList(name, list);
    },
    setMonitorVisible(name, visible) {
      useStageStore.getState().setMonitorVisible(name, visible);
    },
    getAsset(assetId): AssetRecord | undefined {
      const project = useProjectStore.getState().project;
      if (!project) return undefined;
      return project.assets.find((a) => a.id === assetId);
    },
    cloneCount() {
      return useStageStore.getState().sprites.reduce(
        (n, s) => n + (s.isClone ? 1 : 0),
        0
      );
    },
    newSpriteId() {
      return `sprite_${Math.random().toString(36).slice(2, 10)}`;
    },
    nextLayer() {
      const sprites = useStageStore.getState().sprites;
      return sprites.reduce((m, s) => Math.max(m, s.layer ?? 0), 0) + 1;
    },
  };
}
