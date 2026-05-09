import { useState } from "react";
import * as Blockly from "blockly";
import { open, save } from "@tauri-apps/plugin-dialog";

import type { BlockModule, CustomBlockDef } from "../blocks/customBlockTypes";
import {
  BLOCK_MODULE_SCHEMA_VERSION,
  CUSTOM_BLOCK_TYPE_PREFIX
} from "../blocks/customBlockTypes";
import { moduleExport, moduleImport } from "../api/tauriClient";
import { MY_BLOCKS_CATEGORY } from "../store/blockOrgStore";
import { useCustomBlocksStore } from "../store/customBlocksStore";
import { BlockDesignerDialog } from "./BlockDesignerDialog";

function slugifyForBlockType(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function countBlocksInXml(xml: string): number {
  // Count <block ...> opening tags. Self-closed <block .../> counts too.
  return (xml.match(/<block\b/g) ?? []).length;
}

interface Props {
  onClose(): void;
}

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

export function ModulesManagerDialog({ onClose }: Props) {
  const blocks = useCustomBlocksStore((s) => s.blocks);
  const snippets = useCustomBlocksStore((s) => s.snippets);
  const removeBlock = useCustomBlocksStore((s) => s.removeBlock);
  const removeSnippet = useCustomBlocksStore((s) => s.removeSnippet);
  const upsertBlock = useCustomBlocksStore((s) => s.upsertBlock);
  const getBlock = useCustomBlocksStore((s) => s.getBlock);
  const importModule = useCustomBlocksStore((s) => s.importModule);
  const exportModule = useCustomBlocksStore((s) => s.exportModule);

  const [editing, setEditing] = useState<CustomBlockDef | null>(null);
  const [creating, setCreating] = useState(false);
  const [status, setStatus] = useState("");

  const onImport = async () => {
    setStatus("");
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "WarpForge Block Module", extensions: ["json"] }],
        title: "Import block module"
      });
      const path =
        Array.isArray(selected) && typeof selected[0] === "string"
          ? selected[0]
          : typeof selected === "string"
          ? selected
          : null;
      if (!path) return;
      const content = await moduleImport(normalizeFilesystemPath(path));
      const parsed = JSON.parse(content) as BlockModule;
      if (parsed.schemaVersion !== BLOCK_MODULE_SCHEMA_VERSION) {
        setStatus(
          `Warning: module schema version ${parsed.schemaVersion} differs from current (${BLOCK_MODULE_SCHEMA_VERSION}). Importing anyway.`
        );
      }
      const result = importModule(parsed);
      setStatus(
        `Imported ${result.blocksAdded} new block(s) and ${result.snippetsAdded} snippet(s).`
      );
    } catch (error) {
      setStatus(`Import failed: ${String(error)}`);
    }
  };

  const onExport = async () => {
    setStatus("");
    try {
      const selected = await save({
        defaultPath: "module.warpforge-blocks.json",
        filters: [{ name: "WarpForge Block Module", extensions: ["json"] }]
      });
      const path = typeof selected === "string" ? selected : null;
      if (!path) return;
      const module = exportModule({});
      await moduleExport(normalizeFilesystemPath(path), JSON.stringify(module, null, 2));
      setStatus(
        `Exported ${module.blocks.length} block(s) and ${module.snippets.length} snippet(s) to ${path}.`
      );
    } catch (error) {
      setStatus(`Export failed: ${String(error)}`);
    }
  };

  const onInsertSnippet = (snippetId: string) => {
    const snippet = snippets.find((s) => s.id === snippetId);
    if (!snippet) return;
    // Append the snippet's blocks to whatever main workspace is active.
    const workspace = Blockly.getMainWorkspace() as Blockly.WorkspaceSvg | null;
    if (!workspace) {
      setStatus("No active workspace to insert into.");
      return;
    }
    try {
      const dom = Blockly.utils.xml.textToDom(snippet.xml);
      Blockly.Xml.appendDomToWorkspace(dom, workspace);
      setStatus(`Inserted snippet "${snippet.name}".`);
    } catch (error) {
      setStatus(`Insert failed: ${String(error)}`);
    }
  };

  const onPromoteSnippetToBlock = (snippetId: string) => {
    const snippet = snippets.find((s) => s.id === snippetId);
    if (!snippet) return;

    const defaultName = snippet.name || snippetId;
    const name = window.prompt(
      "Block name (becomes a single block in the toolbox):",
      defaultName
    );
    if (!name) return;
    const trimmed = name.trim();
    const slug = slugifyForBlockType(trimmed);
    if (!slug) {
      setStatus("Block name must contain at least one letter or digit.");
      return;
    }

    const newType = `${CUSTOM_BLOCK_TYPE_PREFIX}${slug}`;
    if (
      getBlock(newType) &&
      !window.confirm(
        `A custom block named "${newType}" already exists. Overwrite?`
      )
    ) {
      return;
    }

    const blockCount = countBlocksInXml(snippet.xml);
    const now = new Date().toISOString();
    upsertBlock({
      type: newType,
      kindKind: "composite",
      label: trimmed,
      tooltip: `Composite module wrapping ${blockCount} block(s) — right-click to expand.`,
      category: MY_BLOCKS_CATEGORY,
      color: "#7b61ff",
      fields: [],
      hasPrevious: true,
      hasNext: true,
      createdAt: now,
      updatedAt: now,
      subgraphXml: snippet.xml,
      subgraphBlockCount: blockCount
    });
    setStatus(
      `Promoted snippet "${snippet.name}" to composite block "${trimmed}". It now appears in the ${MY_BLOCKS_CATEGORY} category.`
    );
  };

  if (creating) {
    return <BlockDesignerDialog onClose={() => setCreating(false)} />;
  }
  if (editing) {
    return <BlockDesignerDialog initial={editing} onClose={() => setEditing(null)} />;
  }

  return (
    <div className="modules-manager-overlay" onClick={onClose}>
      <div className="modules-manager-dialog" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>Custom Blocks &amp; Modules</h2>
          <button type="button" className="dialog-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>

        <div className="modules-manager-toolbar">
          <button type="button" onClick={() => setCreating(true)}>
            + New Block
          </button>
          <button type="button" onClick={onImport}>
            Import Module…
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={blocks.length === 0 && snippets.length === 0}
          >
            Export All…
          </button>
        </div>

        <div className="form-section">
          <div className="form-section-header">
            <h3>Custom Blocks ({blocks.length})</h3>
          </div>
          {blocks.length === 0 ? (
            <p className="muted">
              No custom blocks yet. Click "New Block" to design one, right-click any
              workspace block and choose "Save as Composite Block…" to wrap a group as a
              single block, or import a module file.
            </p>
          ) : (
            <ul className="modules-list">
              {blocks.map((b) => {
                const icon =
                  b.kindKind === "composite"
                    ? "📦"
                    : b.kindKind === "code_import"
                    ? "📋"
                    : "🧩";
                const kindLabel =
                  b.kindKind === "composite"
                    ? "Composite"
                    : b.kindKind === "code_import"
                    ? "Code import"
                    : "Designed";
                const detail =
                  b.kindKind === "composite"
                    ? `${b.subgraphBlockCount ?? 0} block(s) wrapped`
                    : `${b.fields.length} field(s)`;
                return (
                  <li key={b.type} className="module-row">
                    <span title={kindLabel}>{icon}</span>
                    <div className="module-meta">
                      <span className="module-title">{b.label}</span>
                      <span className="module-sub">
                        {b.type} · {b.category} · {detail}
                      </span>
                    </div>
                    <div className="module-actions">
                      <button
                        type="button"
                        onClick={() => setEditing(b)}
                        disabled={b.kindKind === "composite"}
                        title={
                          b.kindKind === "composite"
                            ? "Composite blocks can't be edited in the designer — recreate from a workspace selection."
                            : "Edit this block"
                        }
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Delete custom block "${b.label}"?`)) {
                            removeBlock(b.type);
                          }
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="form-section">
          <div className="form-section-header">
            <h3>Snippets ({snippets.length})</h3>
          </div>
          {snippets.length === 0 ? (
            <p className="muted">
              No snippets yet. Right-click a block in the workspace and choose "Save as Module
              Snippet…" to capture it. From here you can Insert it back, or click Make Block to
              wrap it as a single composite block in the toolbox.
            </p>
          ) : (
            <ul className="modules-list">
              {snippets.map((s) => (
                <li key={s.id} className="module-row">
                  <span title="Snippet">📦</span>
                  <div className="module-meta">
                    <span className="module-title">{s.name}</span>
                    <span className="module-sub">
                      {s.description || "(no description)"} · saved{" "}
                      {new Date(s.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="module-actions">
                    <button
                      type="button"
                      onClick={() => onPromoteSnippetToBlock(s.id)}
                      title="Wrap this snippet as a single composite block in the toolbox"
                    >
                      Make Block
                    </button>
                    <button type="button" onClick={() => onInsertSnippet(s.id)}>
                      Insert
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`Delete snippet "${s.name}"?`)) {
                          removeSnippet(s.id);
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {status ? <p className="form-error" style={{ color: "inherit" }}>{status}</p> : null}
      </div>
    </div>
  );
}
