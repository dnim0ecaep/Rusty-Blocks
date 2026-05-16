import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * User-imported sprite + backdrop library, persisted to localStorage so
 * imported assets are available across projects and app restarts.
 *
 * Entries store the image as a `data:` URL (base64) — same shape the
 * costume cache + AssetRecord pipeline already consumes, so picking a
 * user entry from the LibraryGallery is a drop-in replacement for
 * picking a built-in entry.
 *
 * Browser localStorage caps at ~5–10 MB. We don't aggressively enforce a
 * size here, but the import path rejects very large files to keep a
 * single bad import from blowing the quota for the whole library.
 */
export type UserLibraryKind = "sprite" | "backdrop" | "sound";

export interface UserLibraryEntry {
  id: string;
  name: string;
  kind: UserLibraryKind;
  /** Free-form categories — drive the LibraryGallery tag filter the
   *  same way built-in entries' tags do, but the user controls them. */
  tags: string[];
  /** `data:` URL — PNG/JPEG/GIF/SVG for sprite & backdrop, audio/* for
   *  sound. The base64 form keeps assets self-contained inside the
   *  persisted store. */
  dataUrl: string;
  createdAt: number;
}

interface UserLibraryStore {
  entries: UserLibraryEntry[];
  add(input: {
    name: string;
    kind: UserLibraryKind;
    dataUrl: string;
    tags?: string[];
  }): UserLibraryEntry;
  remove(id: string): void;
  rename(id: string, name: string): void;
  setTags(id: string, tags: string[]): void;
}

function makeId(): string {
  return `usr_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

export const useUserLibraryStore = create<UserLibraryStore>()(
  persist(
    (set, get) => ({
      entries: [],

      add({ name, kind, dataUrl, tags }) {
        const entry: UserLibraryEntry = {
          id: makeId(),
          name,
          kind,
          tags: tags ? normalizeTags(tags) : [],
          dataUrl,
          createdAt: Date.now(),
        };
        set({ entries: [entry, ...get().entries] });
        return entry;
      },

      remove(id) {
        set({ entries: get().entries.filter((e) => e.id !== id) });
      },

      rename(id, name) {
        set({
          entries: get().entries.map((e) => (e.id === id ? { ...e, name } : e)),
        });
      },

      setTags(id, tags) {
        const next = normalizeTags(tags);
        set({
          entries: get().entries.map((e) =>
            e.id === id ? { ...e, tags: next } : e,
          ),
        });
      },
    }),
    {
      name: "rustyblocks-user-library",
      // Old entries persisted before tags landed have `tags === undefined`.
      // Coerce on load so callers can rely on the field being an array.
      migrate: (state) => {
        const s = state as { entries?: Partial<UserLibraryEntry>[] } | undefined;
        if (!s?.entries) return state;
        return {
          ...s,
          entries: s.entries.map((e) => ({
            ...e,
            tags: Array.isArray(e.tags) ? e.tags : [],
          })) as UserLibraryEntry[],
        };
      },
    },
  ),
);

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  for (const raw of tags) {
    const trimmed = raw.trim().toLowerCase();
    if (trimmed) seen.add(trimmed);
  }
  return [...seen].sort();
}
