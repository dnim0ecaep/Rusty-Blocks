import { create } from "zustand";

import { assetList } from "../api/tauriClient";
import type { AssetRecord } from "../types/workspace";

interface AssetStore {
  assets: AssetRecord[];
  loading: boolean;
  refresh(): Promise<void>;
  upsert(asset: AssetRecord): void;
}

export const useAssetStore = create<AssetStore>((set) => ({
  assets: [],
  loading: false,

  async refresh() {
    set({ loading: true });
    try {
      const assets = await assetList();
      set({ assets });
    } finally {
      set({ loading: false });
    }
  },

  upsert(asset) {
    set((state) => {
      const index = state.assets.findIndex((existing) => existing.id === asset.id);
      if (index === -1) {
        return { assets: [...state.assets, asset] };
      }
      const clone = [...state.assets];
      clone[index] = asset;
      return { assets: clone };
    });
  }
}));
