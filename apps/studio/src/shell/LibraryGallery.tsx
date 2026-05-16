import { useMemo, useRef, useState } from "react";

import {
  BACKDROP_LIBRARY,
  SPRITE_LIBRARY,
  svgToDataUrl,
  tagsFor,
} from "../data/builtInLibrary";
import { useUserLibraryStore } from "../store/userLibraryStore";

/**
 * Inline gallery of bundled sprites / backdrops + user-imported entries.
 * Identical browsing UX to [[LibraryDialog]] (search + tag chips + tile
 * grid) but renders in flow so it can fill empty space in a panel
 * instead of opening as a modal. User imports persist via
 * [[useUserLibraryStore]] and appear in front of the built-in catalog.
 */
export interface GalleryPick {
  id: string;
  name: string;
  source: "builtin" | "user";
  /** Tags (built-in only — used by callers that want to record them). */
  tags: string[];
  dataUrl: string;
}

interface Props {
  kind: "sprite" | "backdrop";
  onPick(pick: GalleryPick): void;
}

// Reject imports above ~2 MB so a single binary upload can't single-handedly
// blow through the localStorage quota that backs the user library.
const MAX_FILE_BYTES = 2 * 1024 * 1024;

export function LibraryGallery({ kind, onPick }: Props) {
  const builtIns = kind === "sprite" ? SPRITE_LIBRARY : BACKDROP_LIBRARY;
  // Subscribe to the stable `entries` array reference and derive the
  // kind-filtered slice in useMemo. Returning `entries.filter(...)`
  // directly from the selector creates a fresh array each render, which
  // trips useSyncExternalStore's getSnapshot caching and crashes the
  // tree (manifests as a white screen).
  const allEntries = useUserLibraryStore((s) => s.entries);
  const addUserEntry = useUserLibraryStore((s) => s.add);
  const removeUserEntry = useUserLibraryStore((s) => s.remove);
  const setUserEntryTags = useUserLibraryStore((s) => s.setTags);
  const userEntries = useMemo(
    () => allEntries.filter((e) => e.kind === kind),
    [allEntries, kind],
  );

  const [filter, setFilter] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [editingTagsFor, setEditingTagsFor] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const builtInTags = useMemo(() => tagsFor(kind), [kind]);

  // Merge built-in tags with user-defined categories so the chip strip
  // surfaces both vocabularies in one place. User-only tags get marked
  // so the chip can render with a subtle visual cue.
  const tags = useMemo(() => {
    const userTagSet = new Set<string>();
    for (const e of userEntries) for (const t of e.tags) userTagSet.add(t);
    const merged = new Set<string>([...builtInTags, ...userTagSet]);
    return [...merged].sort().map((name) => ({
      name,
      builtIn: builtInTags.includes(name),
      user: userTagSet.has(name),
    }));
  }, [builtInTags, userEntries]);

  const matchesSearch = (name: string) =>
    !filter.trim() || name.toLowerCase().includes(filter.toLowerCase());

  const filteredUserEntries = userEntries.filter((e) => {
    if (activeTag && !e.tags.includes(activeTag)) return false;
    return matchesSearch(e.name);
  });

  const filteredBuiltIns = builtIns.filter((e) => {
    if (activeTag && !e.tags.includes(activeTag)) return false;
    return matchesSearch(e.name);
  });

  const editingEntry = editingTagsFor
    ? userEntries.find((e) => e.id === editingTagsFor) ?? null
    : null;

  const onImportFiles = async (files: FileList | null) => {
    if (!files) return;
    setImportError(null);
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_BYTES) {
        setImportError(
          `"${file.name}" is too large (max ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB).`,
        );
        continue;
      }
      try {
        const dataUrl = await readFileAsDataURL(file);
        const name = file.name.replace(/\.[^.]+$/, "");
        addUserEntry({ name, kind, dataUrl });
      } catch {
        setImportError(`Failed to read "${file.name}".`);
      }
    }
  };

  return (
    <div
      className="library-gallery"
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        border: "1px solid #cdd6e2",
        borderRadius: 4,
        background: "#fff",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 10px",
          borderBottom: "1px solid #eef1f5",
          background: "#f5f7fb",
          gap: 8,
        }}
      >
        <strong style={{ fontSize: 12 }}>
          {kind === "sprite" ? "Sprite Library" : "Backdrop Library"}
        </strong>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="text"
            placeholder="Search…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              padding: "3px 8px",
              border: "1px solid #cdd6e2",
              borderRadius: 4,
              fontSize: 12,
              width: 160,
            }}
          />
          <button
            type="button"
            className="sprite-list-btn"
            onClick={() => fileInputRef.current?.click()}
            title={`Import an image into your ${kind} library (saved across projects)`}
          >
            + Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/gif"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              void onImportFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </header>
      {importError ? (
        <div
          style={{
            padding: "6px 10px",
            borderBottom: "1px solid #eef1f5",
            background: "#fff4f0",
            color: "#a04050",
            fontSize: 11,
          }}
        >
          {importError}
        </div>
      ) : null}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          padding: "6px 10px",
          borderBottom: "1px solid #eef1f5",
          background: "#fafbfd",
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTag(null)}
          style={chipStyle(activeTag === null)}
        >
          All
        </button>
        {tags.map((t) => (
          <button
            key={t.name}
            type="button"
            onClick={() =>
              setActiveTag(t.name === activeTag ? null : t.name)
            }
            style={chipStyle(activeTag === t.name, !t.builtIn)}
            title={
              t.user && !t.builtIn
                ? "Your category"
                : t.user && t.builtIn
                ? "Built-in and your category"
                : "Built-in category"
            }
          >
            {t.name}
          </button>
        ))}
      </div>
      <div
        style={{
          padding: 10,
          overflowY: "auto",
          display: "grid",
          gridTemplateColumns:
            kind === "sprite"
              ? "repeat(auto-fill, minmax(96px, 1fr))"
              : "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 10,
          flex: 1,
          minHeight: 0,
        }}
      >
        {filteredUserEntries.length === 0 && filteredBuiltIns.length === 0 ? (
          <div
            style={{
              gridColumn: "1 / -1",
              padding: 40,
              textAlign: "center",
              color: "#5b6371",
              fontSize: 13,
            }}
          >
            No matches for "{filter}".
          </div>
        ) : (
          <>
            {filteredUserEntries.map((entry) => (
              <Tile
                key={entry.id}
                name={entry.name}
                kind={kind}
                badge="mine"
                tags={entry.tags}
                onClick={() =>
                  onPick({
                    id: entry.id,
                    name: entry.name,
                    source: "user",
                    tags: entry.tags,
                    dataUrl: entry.dataUrl,
                  })
                }
                onRemove={() => removeUserEntry(entry.id)}
                onEditTags={() => setEditingTagsFor(entry.id)}
                preview={
                  <img
                    src={entry.dataUrl}
                    alt={entry.name}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                    }}
                  />
                }
              />
            ))}
            {/* built-in entries follow user entries so the user's own
                imports appear first */}
            {filteredBuiltIns.map((entry) => (
              <Tile
                key={entry.id}
                name={entry.name}
                kind={kind}
                onClick={() =>
                  onPick({
                    id: entry.id,
                    name: entry.name,
                    source: "builtin",
                    tags: entry.tags,
                    dataUrl: svgToDataUrl(entry.svg),
                  })
                }
                preview={
                  <div
                    style={{ width: "100%", height: "100%" }}
                    // Inline SVGs are authored in this repo, not user input.
                    dangerouslySetInnerHTML={{ __html: entry.svg }}
                  />
                }
              />
            ))}
          </>
        )}
      </div>
      {editingEntry ? (
        <TagEditor
          entryName={editingEntry.name}
          selected={editingEntry.tags}
          available={tags.map((t) => t.name)}
          onCancel={() => setEditingTagsFor(null)}
          onSave={(next) => {
            setUserEntryTags(editingEntry.id, next);
            setEditingTagsFor(null);
          }}
        />
      ) : null}
    </div>
  );
}

interface TileProps {
  name: string;
  kind: "sprite" | "backdrop";
  badge?: "mine";
  tags?: string[];
  preview: React.ReactNode;
  onClick(): void;
  onRemove?(): void;
  onEditTags?(): void;
}

function Tile({
  name,
  kind,
  badge,
  tags,
  preview,
  onClick,
  onRemove,
  onEditTags,
}: TileProps) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: 6,
        background: "#f5f7fb",
        border: "1px solid #cdd6e2",
        borderRadius: 4,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#e3eaf5")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "#f5f7fb")}
    >
      <button
        type="button"
        onClick={onClick}
        title={`Add ${name}`}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          font: "inherit",
          color: "inherit",
        }}
      >
        <div
          style={{
            width: kind === "sprite" ? 72 : 160,
            height: kind === "sprite" ? 72 : 100,
            background: "#fff",
            border: "1px solid #cdd6e2",
            borderRadius: 3,
            overflow: "hidden",
            marginBottom: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {preview}
        </div>
        <span style={{ fontSize: 11, color: "#1a2333", textAlign: "center" }}>
          {name}
        </span>
      </button>
      {tags && tags.length > 0 ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 3,
            justifyContent: "center",
            marginTop: 3,
          }}
        >
          {tags.map((t) => (
            <span
              key={t}
              style={{
                fontSize: 9,
                color: "#1967d2",
                background: "#eaf2fc",
                border: "1px dashed #1967d2",
                borderRadius: 6,
                padding: "0 4px",
                textTransform: "capitalize",
              }}
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}
      {badge === "mine" ? (
        <span
          title="Imported by you — stored in your library"
          style={{
            position: "absolute",
            top: 4,
            left: 4,
            background: "#1967d2",
            color: "#fff",
            fontSize: 9,
            padding: "1px 5px",
            borderRadius: 8,
            letterSpacing: 0.3,
          }}
        >
          MINE
        </span>
      ) : null}
      {onEditTags ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEditTags();
          }}
          title="Edit categories"
          style={{
            position: "absolute",
            top: 2,
            right: 22,
            background: "rgba(255, 255, 255, 0.85)",
            border: "1px solid #cdd6e2",
            borderRadius: 10,
            width: 18,
            height: 18,
            cursor: "pointer",
            color: "#1967d2",
            fontSize: 11,
            lineHeight: 1,
            padding: 0,
          }}
        >
          🏷
        </button>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title="Remove from your library"
          style={{
            position: "absolute",
            top: 2,
            right: 2,
            background: "rgba(255, 255, 255, 0.85)",
            border: "1px solid #cdd6e2",
            borderRadius: 10,
            width: 18,
            height: 18,
            cursor: "pointer",
            color: "#a04050",
            fontSize: 12,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}

/**
 * Modal for editing the category list on a single user-library entry.
 * Combines existing categories (built-in + already-used user tags) as
 * checkboxes with a freeform input for adding new ones — the same
 * "tags" array drives chip filtering in the gallery.
 */
interface TagEditorProps {
  entryName: string;
  selected: string[];
  available: string[];
  onCancel(): void;
  onSave(tags: string[]): void;
}

function TagEditor({
  entryName,
  selected,
  available,
  onCancel,
  onSave,
}: TagEditorProps) {
  const initial = useMemo(
    () => Array.from(new Set(selected.map((t) => t.toLowerCase()))),
    [selected],
  );
  const [picked, setPicked] = useState<string[]>(initial);
  const [draft, setDraft] = useState("");

  const toggle = (tag: string) => {
    const lower = tag.toLowerCase();
    setPicked((cur) =>
      cur.includes(lower) ? cur.filter((t) => t !== lower) : [...cur, lower],
    );
  };

  const addDraft = () => {
    const lower = draft.trim().toLowerCase();
    if (!lower) return;
    setPicked((cur) => (cur.includes(lower) ? cur : [...cur, lower]));
    setDraft("");
  };

  const merged = Array.from(new Set([...available, ...picked])).sort();

  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20, 28, 44, 0.55)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 6,
          boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
          width: 360,
          maxWidth: "90vw",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid #cdd6e2",
            background: "#f5f7fb",
            fontSize: 13,
          }}
        >
          <strong>Categories</strong>
          <span style={{ color: "#5b6371", marginLeft: 6 }}>— {entryName}</span>
        </header>
        <div
          style={{
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 6,
            overflowY: "auto",
            flex: 1,
            minHeight: 0,
          }}
        >
          {merged.length === 0 ? (
            <div style={{ fontSize: 12, color: "#5b6371" }}>
              No categories yet — add one below.
            </div>
          ) : (
            merged.map((t) => (
              <label
                key={t}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  textTransform: "capitalize",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={picked.includes(t)}
                  onChange={() => toggle(t)}
                />
                {t}
              </label>
            ))
          )}
        </div>
        <div
          style={{
            padding: "8px 12px",
            display: "flex",
            gap: 6,
            borderTop: "1px solid #eef1f5",
          }}
        >
          <input
            type="text"
            placeholder="New category…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addDraft();
              }
            }}
            style={{
              flex: 1,
              padding: "4px 8px",
              border: "1px solid #cdd6e2",
              borderRadius: 4,
              fontSize: 12,
              font: "inherit",
            }}
          />
          <button
            type="button"
            onClick={addDraft}
            disabled={!draft.trim()}
            className="sprite-list-btn"
          >
            Add
          </button>
        </div>
        <footer
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 6,
            padding: "8px 12px",
            borderTop: "1px solid #cdd6e2",
            background: "#f5f7fb",
          }}
        >
          <button type="button" className="sprite-list-btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="sprite-list-btn"
            onClick={() => onSave(picked)}
            style={{
              background: "#1967d2",
              color: "#fff",
              borderColor: "#1967d2",
            }}
          >
            Save
          </button>
        </footer>
      </div>
    </div>
  );
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function chipStyle(active: boolean, userOnly = false): React.CSSProperties {
  return {
    padding: "3px 10px",
    border: userOnly && !active ? "1px dashed" : "1px solid",
    borderColor: active ? "#1967d2" : userOnly ? "#1967d2" : "#cdd6e2",
    borderRadius: 999,
    background: active ? "#1967d2" : "#fff",
    color: active ? "#fff" : userOnly ? "#1967d2" : "#1a2333",
    fontSize: 11,
    cursor: "pointer",
    font: "inherit",
    textTransform: "capitalize",
  };
}
