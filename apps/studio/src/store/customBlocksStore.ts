import { create } from "zustand";
import { persist } from "zustand/middleware";

import type {
  BlockModule,
  CustomBlockDef,
  ModuleSnippet
} from "../blocks/customBlockTypes";
import { BLOCK_MODULE_SCHEMA_VERSION } from "../blocks/customBlockTypes";

interface CustomBlocksStore {
  blocks: CustomBlockDef[];
  snippets: ModuleSnippet[];

  /** Add or replace a custom block by `type`. */
  upsertBlock(def: CustomBlockDef): void;
  removeBlock(type: string): void;
  getBlock(type: string): CustomBlockDef | undefined;

  /** Add a snippet. Snippets are immutable once saved (delete + re-save to update). */
  addSnippet(snippet: ModuleSnippet): void;
  removeSnippet(id: string): void;

  /** Bulk import — merges defs by `type` and snippets by `id` (incoming wins). */
  importModule(module: BlockModule): { blocksAdded: number; snippetsAdded: number };

  /** Build a BlockModule from the current state (or a filtered subset). */
  exportModule(opts?: {
    name?: string;
    description?: string;
    blockTypes?: string[];
    snippetIds?: string[];
  }): BlockModule;

  clearAll(): void;
}

export const useCustomBlocksStore = create<CustomBlocksStore>()(
  persist(
    (set, get) => ({
      blocks: [],
      snippets: [],

      upsertBlock(def) {
        set((state) => {
          const existing = state.blocks.findIndex((b) => b.type === def.type);
          const next = [...state.blocks];
          if (existing >= 0) next[existing] = def;
          else next.push(def);
          return { blocks: next };
        });
      },

      removeBlock(type) {
        set((state) => ({ blocks: state.blocks.filter((b) => b.type !== type) }));
      },

      getBlock(type) {
        return get().blocks.find((b) => b.type === type);
      },

      addSnippet(snippet) {
        set((state) => {
          const existing = state.snippets.findIndex((s) => s.id === snippet.id);
          const next = [...state.snippets];
          if (existing >= 0) next[existing] = snippet;
          else next.push(snippet);
          return { snippets: next };
        });
      },

      removeSnippet(id) {
        set((state) => ({ snippets: state.snippets.filter((s) => s.id !== id) }));
      },

      importModule(module) {
        let blocksAdded = 0;
        let snippetsAdded = 0;
        set((state) => {
          const blockMap = new Map<string, CustomBlockDef>();
          for (const b of state.blocks) blockMap.set(b.type, b);
          for (const b of module.blocks ?? []) {
            if (!blockMap.has(b.type)) blocksAdded += 1;
            blockMap.set(b.type, b);
          }

          const snippetMap = new Map<string, ModuleSnippet>();
          for (const s of state.snippets) snippetMap.set(s.id, s);
          for (const s of module.snippets ?? []) {
            if (!snippetMap.has(s.id)) snippetsAdded += 1;
            snippetMap.set(s.id, s);
          }

          return {
            blocks: Array.from(blockMap.values()),
            snippets: Array.from(snippetMap.values())
          };
        });
        return { blocksAdded, snippetsAdded };
      },

      exportModule(opts = {}) {
        const state = get();
        const allBlocks = state.blocks;
        const allSnippets = state.snippets;
        const blocks = opts.blockTypes
          ? allBlocks.filter((b) => opts.blockTypes!.includes(b.type))
          : allBlocks;
        const snippets = opts.snippetIds
          ? allSnippets.filter((s) => opts.snippetIds!.includes(s.id))
          : allSnippets;
        return {
          schemaVersion: BLOCK_MODULE_SCHEMA_VERSION,
          name: opts.name ?? "WarpForge Block Module",
          description: opts.description ?? "",
          blocks,
          snippets,
          exportedAt: new Date().toISOString()
        };
      },

      clearAll() {
        set({ blocks: [], snippets: [] });
      }
    }),
    {
      name: "warpforge-custom-blocks",
      version: BLOCK_MODULE_SCHEMA_VERSION
    }
  )
);
