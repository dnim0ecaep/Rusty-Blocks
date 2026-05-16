import { useEffect, useMemo, useRef, useState } from "react";

import {
  SOUND_LIBRARY,
  SOUND_LIBRARY_SAMPLE_RATE,
  entryToWavDataUrl,
  tagsForSounds,
} from "../data/builtInSounds";
import { useUserLibraryStore } from "../store/userLibraryStore";

/**
 * Inline sound library — list-style sibling of [[LibraryGallery]].
 *
 * Built-in synthesized clips and user-imported audio assets share one
 * scrolling list. Each row has a play-preview button (built-ins
 * synthesize live; user uploads decode their `data:` URL) and an Add
 * button that hands the picked clip to the caller as a WAV/audio
 * data-URL. User entries also get a category-edit popover and a remove
 * button so the same "categorize and reuse" workflow that exists for
 * sprites/backdrops applies here.
 */
export interface SoundGalleryPick {
  id: string;
  name: string;
  source: "builtin" | "user";
  tags: string[];
  dataUrl: string;
}

interface Props {
  onPick(pick: SoundGalleryPick): void;
}

const MAX_FILE_BYTES = 2 * 1024 * 1024;

export function SoundLibraryGallery({ onPick }: Props) {
  const allEntries = useUserLibraryStore((s) => s.entries);
  const addUserEntry = useUserLibraryStore((s) => s.add);
  const removeUserEntry = useUserLibraryStore((s) => s.remove);
  const setUserEntryTags = useUserLibraryStore((s) => s.setTags);
  const userEntries = useMemo(
    () => allEntries.filter((e) => e.kind === "sound"),
    [allEntries],
  );

  const [filter, setFilter] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [editingTagsFor, setEditingTagsFor] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // One AudioContext for the lifetime of the gallery. Reusing it keeps
  // preview latency low and avoids the Chrome warning about creating
  // contexts on every click.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const playingRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    return () => {
      try {
        playingRef.current?.stop();
      } catch {
        /* ignore */
      }
      void audioCtxRef.current?.close();
    };
  }, []);

  const getCtx = (): AudioContext | null => {
    if (typeof window === "undefined") return null;
    const Ctor = (window as unknown as { AudioContext?: typeof AudioContext })
      .AudioContext;
    if (!Ctor) return null;
    if (!audioCtxRef.current) audioCtxRef.current = new Ctor();
    return audioCtxRef.current;
  };

  const playBuffer = (buffer: AudioBuffer) => {
    const ctx = getCtx();
    if (!ctx) return;
    try {
      playingRef.current?.stop();
    } catch {
      /* ignore */
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.onended = () => {
      if (playingRef.current === src) playingRef.current = null;
    };
    playingRef.current = src;
    src.start();
  };

  const previewBuiltIn = (id: string) => {
    const entry = SOUND_LIBRARY.find((e) => e.id === id);
    if (!entry) return;
    const ctx = getCtx();
    if (!ctx) return;
    const samples = entry.synthesize();
    const buffer = ctx.createBuffer(
      1,
      samples.length,
      SOUND_LIBRARY_SAMPLE_RATE,
    );
    buffer.getChannelData(0).set(samples);
    playBuffer(buffer);
  };

  const previewUser = async (dataUrl: string) => {
    const ctx = getCtx();
    if (!ctx) return;
    try {
      const response = await fetch(dataUrl);
      const arrayBuf = await response.arrayBuffer();
      const buffer = await ctx.decodeAudioData(arrayBuf);
      playBuffer(buffer);
    } catch {
      // Decoding can fail for unusual formats — silently skip preview.
    }
  };

  const builtInTags = useMemo(() => tagsForSounds(), []);

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

  const filteredBuiltIns = SOUND_LIBRARY.filter((e) => {
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
        addUserEntry({ name, kind: "sound", dataUrl });
      } catch {
        setImportError(`Failed to read "${file.name}".`);
      }
    }
  };

  return (
    <div
      className="sound-library-gallery"
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
        <strong style={{ fontSize: 12 }}>Sound Library</strong>
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
            title="Import a sound into your library (saved across projects)"
          >
            + Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
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
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          overflowY: "auto",
          flex: 1,
          minHeight: 0,
        }}
      >
        {filteredUserEntries.length === 0 && filteredBuiltIns.length === 0 ? (
          <li
            style={{
              padding: 40,
              textAlign: "center",
              color: "#5b6371",
              fontSize: 13,
            }}
          >
            No matches for "{filter}".
          </li>
        ) : (
          <>
            {filteredUserEntries.map((entry) => (
              <Row
                key={entry.id}
                name={entry.name}
                tags={entry.tags}
                badge="mine"
                onPlay={() => void previewUser(entry.dataUrl)}
                onAdd={() =>
                  onPick({
                    id: entry.id,
                    name: entry.name,
                    source: "user",
                    tags: entry.tags,
                    dataUrl: entry.dataUrl,
                  })
                }
                onEditTags={() => setEditingTagsFor(entry.id)}
                onRemove={() => removeUserEntry(entry.id)}
              />
            ))}
            {filteredBuiltIns.map((entry) => (
              <Row
                key={entry.id}
                name={entry.name}
                tags={entry.tags}
                onPlay={() => previewBuiltIn(entry.id)}
                onAdd={() =>
                  onPick({
                    id: entry.id,
                    name: entry.name,
                    source: "builtin",
                    tags: entry.tags,
                    dataUrl: entryToWavDataUrl(entry),
                  })
                }
              />
            ))}
          </>
        )}
      </ul>
      {editingEntry ? (
        <SoundTagEditor
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

interface RowProps {
  name: string;
  tags: string[];
  badge?: "mine";
  onPlay(): void;
  onAdd(): void;
  onEditTags?(): void;
  onRemove?(): void;
}

function Row({
  name,
  tags,
  badge,
  onPlay,
  onAdd,
  onEditTags,
  onRemove,
}: RowProps) {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        borderBottom: "1px solid #eef1f5",
        fontSize: 12,
      }}
    >
      <button
        type="button"
        onClick={onPlay}
        title="Preview"
        style={{
          width: 26,
          height: 26,
          border: "1px solid #cdd6e2",
          borderRadius: 13,
          background: "#fff",
          cursor: "pointer",
          fontSize: 11,
          color: "#1967d2",
        }}
      >
        ▶
      </button>
      <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
        <span>{name}</span>
        {badge === "mine" ? (
          <span
            title="Imported by you — stored in your library"
            style={{
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
        {tags.length > 0 ? (
          <span style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            {tags.map((t) => (
              <span
                key={t}
                style={{
                  fontSize: 9,
                  color: "#1967d2",
                  background: "#eaf2fc",
                  border: badge === "mine" ? "1px dashed #1967d2" : "1px solid #cdd6e2",
                  borderRadius: 6,
                  padding: "0 4px",
                  textTransform: "capitalize",
                }}
              >
                {t}
              </span>
            ))}
          </span>
        ) : null}
      </span>
      {onEditTags ? (
        <button
          type="button"
          onClick={onEditTags}
          title="Edit categories"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#1967d2",
            fontSize: 12,
            padding: 0,
          }}
        >
          🏷
        </button>
      ) : null}
      <button
        type="button"
        onClick={onAdd}
        style={{
          padding: "3px 10px",
          border: "1px solid #cdd6e2",
          borderRadius: 4,
          background: "#f5f7fb",
          cursor: "pointer",
          font: "inherit",
          fontSize: 11,
        }}
      >
        Add
      </button>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          title="Remove from your library"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#a04050",
            fontSize: 14,
            padding: 0,
          }}
        >
          ×
        </button>
      ) : null}
    </li>
  );
}

interface SoundTagEditorProps {
  entryName: string;
  selected: string[];
  available: string[];
  onCancel(): void;
  onSave(tags: string[]): void;
}

function SoundTagEditor({
  entryName,
  selected,
  available,
  onCancel,
  onSave,
}: SoundTagEditorProps) {
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
