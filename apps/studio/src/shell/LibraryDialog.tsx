import { useMemo, useState } from "react";

import {
  BACKDROP_LIBRARY,
  SPRITE_LIBRARY,
  svgToDataUrl,
  tagsFor,
  type LibraryEntry,
} from "../data/builtInLibrary";

/**
 * Built-in sprite + backdrop library. Modeled after Scratch's choose-a-
 * sprite-from-library flow: the user clicks a tile and the asset gets
 * imported into the project with a single round-trip — the SVG body
 * becomes a `data:` URL stored in the project's `assets[]`, and the
 * caller decides what to do with it (`onPick` callback).
 */
type LibraryKind = "sprite" | "backdrop";

interface Props {
  /** Which catalog to show. The dialog hides the kind switcher when
   *  this is set; the caller already knows what they want. */
  kind: LibraryKind;
  onClose(): void;
  /** Called once the user picks a tile. Receives the entry (so the
   *  caller can read its `name`) and the entry's SVG-as-data-URL. */
  onPick(entry: LibraryEntry, dataUrl: string): void;
}

export function LibraryDialog({ kind, onClose, onPick }: Props) {
  const items = kind === "sprite" ? SPRITE_LIBRARY : BACKDROP_LIBRARY;
  const [filter, setFilter] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const tags = useMemo(() => tagsFor(kind), [kind]);

  const filtered = items.filter((e) => {
    if (activeTag && !e.tags.includes(activeTag)) return false;
    if (filter.trim()) {
      return e.name.toLowerCase().includes(filter.toLowerCase());
    }
    return true;
  });

  return (
    <div
      className="library-dialog-backdrop"
      onClick={onClose}
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
        className="library-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 6,
          boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
          width: 640,
          maxWidth: "90vw",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 14px",
            borderBottom: "1px solid #cdd6e2",
            background: "#f5f7fb",
          }}
        >
          <strong style={{ fontSize: 14 }}>
            {kind === "sprite" ? "Sprite Library" : "Backdrop Library"}
          </strong>
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
            autoFocus
          />
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 18,
              cursor: "pointer",
              color: "#5b6371",
              padding: "0 4px",
            }}
            title="Close"
          >
            ×
          </button>
        </header>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
            padding: "8px 14px",
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
              key={t}
              type="button"
              onClick={() => setActiveTag(t === activeTag ? null : t)}
              style={chipStyle(activeTag === t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div
          style={{
            padding: 12,
            overflowY: "auto",
            display: "grid",
            gridTemplateColumns:
              kind === "sprite" ? "repeat(5, 1fr)" : "repeat(3, 1fr)",
            gap: 12,
          }}
        >
          {filtered.length === 0 ? (
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
            filtered.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  onPick(entry, svgToDataUrl(entry.svg));
                  onClose();
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  padding: 8,
                  background: "#f5f7fb",
                  border: "1px solid #cdd6e2",
                  borderRadius: 4,
                  cursor: "pointer",
                  font: "inherit",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "#e3eaf5")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "#f5f7fb")
                }
              >
                <div
                  style={{
                    width: kind === "sprite" ? 80 : 160,
                    height: kind === "sprite" ? 80 : 100,
                    background: "#fff",
                    border: "1px solid #cdd6e2",
                    borderRadius: 3,
                    overflow: "hidden",
                    marginBottom: 6,
                  }}
                  // We trust the inline SVG strings — they're authored
                  // in this repo, not user input.
                  dangerouslySetInnerHTML={{ __html: entry.svg }}
                />
                <span style={{ fontSize: 11, color: "#1a2333" }}>
                  {entry.name}
                </span>
              </button>
            ))
          )}
        </div>
        <footer
          style={{
            padding: "8px 14px",
            borderTop: "1px solid #cdd6e2",
            background: "#f5f7fb",
            fontSize: 11,
            color: "#5b6371",
          }}
        >
          Bundled assets — the project file stays self-contained, no CDN
          fetch needed.
        </footer>
      </div>
    </div>
  );
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding: "3px 10px",
    border: "1px solid",
    borderColor: active ? "#1967d2" : "#cdd6e2",
    borderRadius: 999,
    background: active ? "#1967d2" : "#fff",
    color: active ? "#fff" : "#1a2333",
    fontSize: 11,
    cursor: "pointer",
    font: "inherit",
    textTransform: "capitalize",
  };
}
