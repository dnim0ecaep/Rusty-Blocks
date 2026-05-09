import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface RecentFile {
  path: string;
  appName: string;
  openedAt: number; // timestamp ms
}

const MAX_RECENT = 10;

interface RecentFilesStore {
  recents: RecentFile[];
  push(path: string, appName: string): void;
  remove(path: string): void;
  clear(): void;
}

export const useRecentFilesStore = create<RecentFilesStore>()(
  persist(
    (set, get) => ({
      recents: [],

      push(path, appName) {
        const now = Date.now();
        const filtered = get().recents.filter((r) => r.path !== path);
        set({
          recents: [{ path, appName, openedAt: now }, ...filtered].slice(0, MAX_RECENT),
        });
      },

      remove(path) {
        set({ recents: get().recents.filter((r) => r.path !== path) });
      },

      clear() {
        set({ recents: [] });
      },
    }),
    { name: "rustyblocks-recent-files" }
  )
);
