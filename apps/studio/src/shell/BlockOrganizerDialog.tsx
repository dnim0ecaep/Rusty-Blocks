import { FormEvent, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";

import {
  BUILTIN_BLOCK_LABELS,
  BUILTIN_CATEGORY_NAMES,
  LAYOUT_PRESET_SCHEMA_VERSION,
  displayCategoryName,
  orderCategoryNames,
  type LayoutPreset,
  useBlockOrgStore,
} from "../store/blockOrgStore";
import { BLOCK_REGISTRY } from "../blocks/blockRegistry";
import { moduleExport, moduleImport } from "../api/tauriClient";
import { useCustomBlocksStore } from "../store/customBlocksStore";
import {
  TURBOWARP_MODULES,
  turboWarpModuleBlockType,
} from "../blocks/turbowarpModules";
import { SCRATCH_PRIMITIVE_LABEL } from "../blocks/scratchPrimitiveBlocks";

const TURBOWARP_LABEL_BY_TYPE = new Map(
  TURBOWARP_MODULES.map((m) => [turboWarpModuleBlockType(m.id), m.name])
);

function normalizeFilesystemPath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed.startsWith("file://")) return trimmed;
  try {
    const url = new URL(trimmed);
    let pathname = decodeURIComponent(url.pathname);
    if (/^\/[A-Za-z]:\//.test(pathname)) pathname = pathname.slice(1);
    return pathname;
  } catch {
    return trimmed;
  }
}

function slugifyFilename(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "layout"
  );
}

function blockLabel(blockType: string, customLabel?: string): string {
  if (customLabel) return customLabel;
  const meta = BLOCK_REGISTRY.find((b) => b.type === blockType);
  if (meta) return meta.label;
  const tw = TURBOWARP_LABEL_BY_TYPE.get(blockType);
  if (tw) return tw;
  const scratch = SCRATCH_PRIMITIVE_LABEL[blockType];
  if (scratch) return scratch;
  return BUILTIN_BLOCK_LABELS[blockType] ?? blockType;
}

interface Props {
  onClose(): void;
}

export function BlockOrganizerDialog({ onClose }: Props) {
  const {
    assignments,
    customCategories,
    categoryRenames,
    categoryOrder,
    presets,
    moveBlock,
    addCategory,
    removeCategory,
    renameCategory,
    moveCategoryUp,
    moveCategoryDown,
    setCategoryIndex,
    categoryColors,
    setCategoryColor,
    resetToDefaults,
    savePreset,
    loadPreset,
    deletePreset,
    exportPreset,
    importPreset,
  } = useBlockOrgStore();

  const customBlocks = useCustomBlocksStore((s) => s.blocks);
  const customBlockLabels = new Map(customBlocks.map((b) => [b.type, b.label]));

  const [newCatName, setNewCatName] = useState("");
  const [newCatError, setNewCatError] = useState("");
  const draggedBlock = useRef<string | null>(null);
  const [dragOverCat, setDragOverCat] = useState<string | null>(null);
  const [presetName, setPresetName] = useState("");
  const [presetStatus, setPresetStatus] = useState<{ kind: "info" | "error"; text: string } | null>(null);
  // Category currently being renamed (canonical name) and its in-progress draft.
  const [renamingCat, setRenamingCat] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameError, setRenameError] = useState("");
  // Search query for filtering blocks across categories. Matches against
  // the displayed block label (case-insensitive substring); also matches
  // the raw block-type identifier so power users can find by type.
  const [search, setSearch] = useState("");
  // Per-category in-progress edit of the order number. While the input
  // is focused we let the user type freely; commit on blur or Enter.
  const [orderDraft, setOrderDraft] = useState<Record<string, string>>({});

  const commitOrderDraft = (canonical: string, totalCats: number) => {
    const draft = orderDraft[canonical];
    if (draft === undefined) return;
    setOrderDraft((prev) => {
      const next = { ...prev };
      delete next[canonical];
      return next;
    });
    const parsed = Number.parseInt(draft, 10);
    if (Number.isNaN(parsed)) return;
    // 1-indexed in the UI, 0-indexed in the store.
    const target = Math.max(1, Math.min(totalCats, parsed)) - 1;
    setCategoryIndex(canonical, target);
  };

  // All user-visible categories in user-chosen display order (built-ins +
  // custom, with the saved categoryOrder applied — newly-added categories
  // not yet in the order list are appended in their natural position).
  const naturalOrder = [
    ...BUILTIN_CATEGORY_NAMES,
    ...customCategories.map((c) => c.name),
  ];
  const allCategories = orderCategoryNames(naturalOrder, categoryOrder);

  // Group blocks by current category
  const grouped: Record<string, string[]> = {};
  for (const name of allCategories) {
    grouped[name] = [];
  }
  for (const [blockType, catName] of Object.entries(assignments)) {
    if (grouped[catName] !== undefined) {
      grouped[catName].push(blockType);
    }
  }
  for (const name of allCategories) {
    grouped[name].sort((a, b) =>
      blockLabel(a, customBlockLabels.get(a)).localeCompare(
        blockLabel(b, customBlockLabels.get(b))
      )
    );
  }

  // Apply the search filter. Empty query → show everything; otherwise keep
  // only blocks whose label or block-type contains the query (case-insensitive).
  const trimmedSearch = search.trim().toLowerCase();
  const filtered: Record<string, string[]> = {};
  let totalMatches = 0;
  let totalBlocks = 0;
  for (const name of allCategories) {
    const all = grouped[name] ?? [];
    totalBlocks += all.length;
    if (!trimmedSearch) {
      filtered[name] = all;
      totalMatches += all.length;
      continue;
    }
    const hits = all.filter((blockType) => {
      const label = blockLabel(blockType, customBlockLabels.get(blockType)).toLowerCase();
      return label.includes(trimmedSearch) || blockType.toLowerCase().includes(trimmedSearch);
    });
    filtered[name] = hits;
    totalMatches += hits.length;
  }

  // Drag handlers
  const onDragStart = (e: React.DragEvent, blockType: string) => {
    draggedBlock.current = blockType;
    // Firefox refuses to start a drag unless dataTransfer has data set.
    // Also signal the move intent so the OS shows the right cursor.
    try {
      e.dataTransfer.setData("text/plain", blockType);
      e.dataTransfer.effectAllowed = "move";
    } catch {
      // Some browsers throw on drag image setup in obscure cases — ignore.
    }
  };

  const onDragOver = (e: React.DragEvent, catName: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.dataTransfer.dropEffect = "move";
    } catch {
      // Ignore.
    }
    setDragOverCat(catName);
  };

  const onDragLeave = (e: React.DragEvent) => {
    // Only clear the visual highlight when the cursor truly leaves the
    // section, not just when it crosses between child elements (which fires
    // dragleave on the parent). `relatedTarget` is where the cursor is
    // headed; if it's still inside our currentTarget, ignore the event.
    const next = e.relatedTarget as Node | null;
    if (next && e.currentTarget.contains(next)) return;
    setDragOverCat(null);
  };

  const onDrop = (e: React.DragEvent, catName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverCat(null);
    if (draggedBlock.current && assignments[draggedBlock.current] !== catName) {
      moveBlock(draggedBlock.current, catName);
    }
    draggedBlock.current = null;
  };

  const onDragEnd = () => {
    draggedBlock.current = null;
    setDragOverCat(null);
  };

  // New category form
  const submitNewCategory = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = newCatName.trim();
    if (!trimmed) {
      setNewCatError("Name cannot be empty.");
      return;
    }
    const exists = allCategories.some((n) => n.toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      setNewCatError("A category with that name already exists.");
      return;
    }
    addCategory(trimmed);
    setNewCatName("");
    setNewCatError("");
  };

  const handleRemoveCategory = (name: string) => {
    const blockCount = Object.values(assignments).filter((c) => c === name).length;
    if (blockCount > 0) {
      window.alert(`Move all ${blockCount} block(s) out of "${name}" before deleting it.`);
      return;
    }
    removeCategory(name);
  };

  const handleReset = () => {
    if (window.confirm("Reset all blocks to their default categories and remove custom categories?")) {
      resetToDefaults();
    }
  };

  const isCustom = (name: string) => customCategories.some((c) => c.name === name);

  const startRename = (canonical: string) => {
    setRenamingCat(canonical);
    setRenameDraft(displayCategoryName(canonical, categoryRenames));
    setRenameError("");
  };

  const cancelRename = () => {
    setRenamingCat(null);
    setRenameDraft("");
    setRenameError("");
  };

  const commitRename = () => {
    if (!renamingCat) return;
    const error = renameCategory(renamingCat, renameDraft);
    if (error) {
      setRenameError(error);
      return;
    }
    cancelRename();
  };

  const presetNames = Object.keys(presets).sort((a, b) => a.localeCompare(b));

  const handleSavePreset = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = presetName.trim();
    if (!trimmed) {
      setPresetStatus({ kind: "error", text: "Layout name cannot be empty." });
      return;
    }
    if (presets[trimmed] && !window.confirm(`Overwrite layout "${trimmed}"?`)) {
      return;
    }
    savePreset(trimmed);
    setPresetName("");
    setPresetStatus({ kind: "info", text: `Saved layout "${trimmed}".` });
  };

  const handleLoadPreset = (name: string) => {
    if (!window.confirm(`Replace current layout with "${name}"?`)) return;
    loadPreset(name);
    setPresetStatus({ kind: "info", text: `Loaded layout "${name}".` });
  };

  const handleDeletePreset = (name: string) => {
    if (!window.confirm(`Delete saved layout "${name}"?`)) return;
    deletePreset(name);
    setPresetStatus({ kind: "info", text: `Deleted layout "${name}".` });
  };

  const handleExportPreset = async (name: string) => {
    const preset = exportPreset(name);
    if (!preset) {
      setPresetStatus({ kind: "error", text: `Layout "${name}" not found.` });
      return;
    }
    try {
      const selected = await save({
        defaultPath: `${slugifyFilename(name)}.warpforge-layout.json`,
        filters: [{ name: "WarpForge Layout", extensions: ["json"] }],
      });
      const path = typeof selected === "string" ? selected : null;
      if (!path) return;
      await moduleExport(normalizeFilesystemPath(path), JSON.stringify(preset, null, 2));
      setPresetStatus({ kind: "info", text: `Exported layout to ${path}.` });
    } catch (error) {
      setPresetStatus({ kind: "error", text: `Export failed: ${String(error)}` });
    }
  };

  const handleImportPreset = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "WarpForge Layout", extensions: ["json"] }],
        title: "Import block layout",
      });
      const picked =
        Array.isArray(selected) && typeof selected[0] === "string"
          ? selected[0]
          : typeof selected === "string"
          ? selected
          : null;
      if (!picked) return;
      const content = await moduleImport(normalizeFilesystemPath(picked));
      const parsed = JSON.parse(content) as LayoutPreset;
      if (!parsed?.name || !parsed?.assignments) {
        setPresetStatus({ kind: "error", text: "File is not a valid layout (missing name or assignments)." });
        return;
      }
      if (parsed.schemaVersion !== LAYOUT_PRESET_SCHEMA_VERSION) {
        setPresetStatus({
          kind: "info",
          text: `Imported layout "${parsed.name}" (schema ${parsed.schemaVersion} differs from current ${LAYOUT_PRESET_SCHEMA_VERSION}).`,
        });
      } else {
        setPresetStatus({ kind: "info", text: `Imported layout "${parsed.name}".` });
      }
      importPreset(parsed);
    } catch (error) {
      setPresetStatus({ kind: "error", text: `Import failed: ${String(error)}` });
    }
  };

  return (
    <section
      className="new-project-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Organize Blocks"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="block-organizer-dialog">
        <header className="block-organizer-header">
          <h3>Organize Blocks</h3>
          <div className="block-organizer-header-actions">
            <button type="button" className="organizer-reset-btn" onClick={handleReset}>
              Reset to Defaults
            </button>
            <button type="button" className="organizer-close-btn" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </header>

        <div className="block-organizer-search">
          <input
            type="search"
            className="org-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape" && search) {
                e.preventDefault();
                setSearch("");
              }
            }}
            placeholder="Search blocks by name or type…"
            aria-label="Search blocks"
          />
          {search ? (
            <button
              type="button"
              className="org-search-clear"
              onClick={() => setSearch("")}
              title="Clear search (Esc)"
            >
              ✕
            </button>
          ) : null}
          {trimmedSearch ? (
            <span className="org-search-status">
              {totalMatches} of {totalBlocks} block{totalBlocks === 1 ? "" : "s"} match
            </span>
          ) : null}
        </div>

        <div className="block-organizer-body">
          {trimmedSearch && totalMatches === 0 ? (
            <p className="org-empty-hint">
              No blocks match “{search}”. Try a different search or{" "}
              <button
                type="button"
                className="org-inline-link-btn"
                onClick={() => setSearch("")}
              >
                clear the search
              </button>
              .
            </p>
          ) : null}
          {allCategories.map((catName, catIndex) => {
            const blocks = filtered[catName] ?? [];
            // While searching, hide categories that have no matches so the
            // dialog focuses attention on hits.
            if (trimmedSearch && blocks.length === 0) return null;
            const isOver = dragOverCat === catName;
            const display = displayCategoryName(catName, categoryRenames);
            const isRenaming = renamingCat === catName;
            const isFirst = catIndex === 0;
            const isLast = catIndex === allCategories.length - 1;
            return (
              <section
                key={catName}
                className={`org-category-section${isOver ? " org-drop-target" : ""}`}
                onDragOver={(e) => onDragOver(e, catName)}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e, catName)}
              >
                <h4 className="org-category-name">
                  {isRenaming ? (
                    <form
                      className="org-rename-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        commitRename();
                      }}
                    >
                      <input
                        className="org-rename-input"
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => {
                          setRenameDraft(e.target.value);
                          setRenameError("");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            e.preventDefault();
                            cancelRename();
                          }
                        }}
                        maxLength={40}
                        aria-label={`Rename category ${catName}`}
                      />
                      <button
                        type="submit"
                        className="org-rename-save-btn"
                        title="Save name"
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        className="org-rename-cancel-btn"
                        onClick={cancelRename}
                        title="Cancel"
                      >
                        ✕
                      </button>
                    </form>
                  ) : (
                    <>
                      <span className="org-cat-title">{display}</span>
                      <span className="org-category-count">{blocks.length}</span>
                      <input
                        type="number"
                        className="org-order-input"
                        min={1}
                        max={allCategories.length}
                        value={orderDraft[catName] ?? String(catIndex + 1)}
                        onChange={(e) =>
                          setOrderDraft((prev) => ({ ...prev, [catName]: e.target.value }))
                        }
                        onBlur={() => commitOrderDraft(catName, allCategories.length)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            (e.currentTarget as HTMLInputElement).blur();
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            setOrderDraft((prev) => {
                              const next = { ...prev };
                              delete next[catName];
                              return next;
                            });
                            (e.currentTarget as HTMLInputElement).blur();
                          }
                        }}
                        title={`Position ${catIndex + 1} of ${allCategories.length} — type to reorder`}
                        aria-label={`Position of ${display}`}
                      />
                      <button
                        type="button"
                        className="org-reorder-btn"
                        onClick={() => moveCategoryUp(catName)}
                        disabled={isFirst}
                        title="Move category up"
                        aria-label={`Move ${display} up`}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        className="org-reorder-btn"
                        onClick={() => moveCategoryDown(catName)}
                        disabled={isLast}
                        title="Move category down"
                        aria-label={`Move ${display} down`}
                      >
                        ▼
                      </button>
                      <button
                        type="button"
                        className="org-rename-cat-btn"
                        onClick={() => startRename(catName)}
                        title={`Rename "${display}"`}
                        aria-label={`Rename category ${display}`}
                      >
                        ✎
                      </button>
                      <label
                        className={`org-color-swatch${
                          categoryColors[catName] ? " is-set" : ""
                        }`}
                        title={
                          categoryColors[catName]
                            ? `Recolor blocks in "${display}" (current: ${categoryColors[catName]})`
                            : `Recolor all blocks in "${display}"`
                        }
                        style={{
                          backgroundColor: categoryColors[catName] ?? undefined,
                        }}
                      >
                        <input
                          type="color"
                          value={categoryColors[catName] ?? "#888888"}
                          onChange={(e) => setCategoryColor(catName, e.target.value)}
                          aria-label={`Color for ${display}`}
                        />
                      </label>
                      {categoryColors[catName] ? (
                        <button
                          type="button"
                          className="org-color-clear-btn"
                          onClick={() => setCategoryColor(catName, null)}
                          title="Restore default colors"
                          aria-label={`Clear color override for ${display}`}
                        >
                          ↺
                        </button>
                      ) : null}
                      {isCustom(catName) && (
                        <button
                          type="button"
                          className="org-delete-cat-btn"
                          onClick={() => handleRemoveCategory(catName)}
                          title="Delete category"
                        >
                          ✕
                        </button>
                      )}
                    </>
                  )}
                </h4>
                {isRenaming && renameError ? (
                  <p className="org-new-cat-error">{renameError}</p>
                ) : null}
                {blocks.length === 0 ? (
                  <p className="org-empty-hint">
                    {isOver ? "Drop here" : "Drop blocks here"}
                  </p>
                ) : (
                  <ul className="org-block-list">
                    {blocks.map((blockType) => (
                      <li
                        key={blockType}
                        className="org-block-chip"
                        draggable
                        onDragStart={(e) => onDragStart(e, blockType)}
                        onDragEnd={onDragEnd}
                        title="Drag to move to another category"
                      >
                        <span className="org-drag-handle">⠿</span>
                        <span className="org-block-label">
                          {blockLabel(blockType, customBlockLabels.get(blockType))}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}

          {/* New category card */}
          <section className="org-category-section org-new-category-section">
            <h4 className="org-category-name">New Category</h4>
            <form className="org-new-cat-form" onSubmit={submitNewCategory}>
              <input
                className="org-new-cat-input"
                value={newCatName}
                onChange={(e) => { setNewCatName(e.target.value); setNewCatError(""); }}
                placeholder="Category name…"
                maxLength={40}
              />
              <button type="submit" className="org-new-cat-btn">Add</button>
            </form>
            {newCatError ? <p className="org-new-cat-error">{newCatError}</p> : null}
          </section>
        </div>

        <section className="org-layouts-panel" aria-label="Saved layouts">
          <div className="org-layouts-header">
            <h4>Saved Layouts</h4>
            <form className="org-layouts-save-form" onSubmit={handleSavePreset}>
              <input
                className="org-new-cat-input"
                value={presetName}
                onChange={(e) => {
                  setPresetName(e.target.value);
                  setPresetStatus(null);
                }}
                placeholder="Layout name…"
                maxLength={60}
              />
              <button type="submit" className="org-new-cat-btn">
                Save Current
              </button>
              <button type="button" className="organizer-reset-btn" onClick={handleImportPreset}>
                Import…
              </button>
            </form>
          </div>
          {presetNames.length === 0 ? (
            <p className="org-empty-hint">
              No saved layouts yet. Type a name above and click Save Current to capture the current
              category arrangement.
            </p>
          ) : (
            <ul className="org-layouts-list">
              {presetNames.map((name) => {
                const p = presets[name];
                return (
                  <li key={name} className="org-layout-row">
                    <div className="org-layout-meta">
                      <span className="org-layout-name">{name}</span>
                      <span className="org-layout-sub">
                        {Object.keys(p.assignments).length} block(s),{" "}
                        {p.customCategories.length} custom cat(s) · saved{" "}
                        {new Date(p.savedAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="org-layout-actions">
                      <button type="button" onClick={() => handleLoadPreset(name)}>
                        Load
                      </button>
                      <button type="button" onClick={() => handleExportPreset(name)}>
                        Export…
                      </button>
                      <button type="button" onClick={() => handleDeletePreset(name)}>
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {presetStatus ? (
            <p
              className={
                presetStatus.kind === "error" ? "org-new-cat-error" : "org-footer-hint"
              }
            >
              {presetStatus.text}
            </p>
          ) : null}
        </section>

        <footer className="block-organizer-footer">
          <p className="org-footer-hint">Drag blocks between categories. Changes apply instantly.</p>
          <button type="button" onClick={onClose}>Done</button>
        </footer>
      </div>
    </section>
  );
}
