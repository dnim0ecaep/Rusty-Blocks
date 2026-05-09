import { FormEvent, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { documentDir, join } from "@tauri-apps/api/path";
import { useProjectStore } from "../store/projectStore";
import { useRecentFilesStore } from "../store/recentFilesStore";

function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
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

function withJsonExtension(path: string): string {
  return path.toLowerCase().endsWith(".json") ? path : `${path}.json`;
}

async function inferDefaultSavePath(appName: string): Promise<string> {
  const filename = `${slugify(appName) || "project"}.warpforge.json`;
  try {
    const docs = await documentDir();
    return await join(docs, filename);
  } catch {
    return `./${filename}`;
  }
}

function formatDate(ts: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  }).format(new Date(ts));
}

function basename(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() ?? path;
}

function dirname(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const idx = normalized.lastIndexOf("/");
  return idx >= 0 ? normalized.slice(0, idx) : "";
}

export type FileManagerTab = "project" | "new" | "open";

interface Props {
  onClose(): void;
  initialTab?: FileManagerTab;
}

export function FileManagerDialog({ onClose, initialTab }: Props) {
  const { project, projectPath, isBusy, createProject, openProject, saveProject, addLog } =
    useProjectStore();
  const { recents, remove: removeRecent, clear: clearRecents } = useRecentFilesStore();

  const [tab, setTab] = useState<FileManagerTab>(
    initialTab ?? (project ? "project" : "new")
  );
  const [newAppName, setNewAppName] = useState("WarpForge App");
  const [openPathInput, setOpenPathInput] = useState("");
  const [error, setError] = useState("");

  // ── New project ────────────────────────────────────────────────────────────
  const submitNew = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = newAppName.trim();
    if (!trimmed) { setError("App name cannot be empty."); return; }
    setError("");
    try {
      await createProject("notes", trimmed);
      onClose();
    } catch (err) {
      setError(`Create failed: ${String(err)}`);
      addLog(`New project failed: ${String(err)}`);
    }
  };

  // ── Open via native dialog ──────────────────────────────────────────────────
  const onBrowse = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "WarpForge Project", extensions: ["json"] }],
      });
      let path: string | null = null;
      if (Array.isArray(selected)) path = typeof selected[0] === "string" ? selected[0] : null;
      else if (typeof selected === "string") path = selected;
      if (path) await doOpen(path);
    } catch (err) {
      setError(`Open dialog failed: ${String(err)}`);
    }
  };

  const doOpen = async (path: string) => {
    const normalized = normalizeFilesystemPath(path);
    if (!normalized) return;
    setError("");
    try {
      await openProject(normalized);
      onClose();
    } catch (err) {
      setError(`Open failed: ${String(err)}`);
      addLog(`Open failed: ${String(err)}`);
    }
  };

  const submitOpenPath = async (e: FormEvent) => {
    e.preventDefault();
    await doOpen(openPathInput);
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const onSave = async () => {
    if (!project) return;
    if (projectPath) {
      try {
        await saveProject(projectPath);
      } catch (err) {
        setError(`Save failed: ${String(err)}`);
      }
      return;
    }
    await onSaveAs();
  };

  const onSaveAs = async () => {
    if (!project) return;
    try {
      const selected = await save({
        defaultPath: await inferDefaultSavePath(project.project.app_name),
        filters: [{ name: "WarpForge Project", extensions: ["json"] }],
      });
      let path: string | null = null;
      if (Array.isArray(selected)) path = typeof selected[0] === "string" ? selected[0] : null;
      else if (typeof selected === "string") path = selected;
      if (path) {
        const normalized = normalizeFilesystemPath(withJsonExtension(path));
        try {
          await saveProject(normalized);
        } catch (err) {
          setError(`Save failed: ${String(err)}`);
        }
      }
    } catch (err) {
      setError(`Save dialog failed: ${String(err)}`);
    }
  };

  return (
    <section
      className="new-project-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="File Manager"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="file-manager-dialog">
        {/* Sidebar */}
        <nav className="fm-sidebar">
          <div className="fm-logo">Files</div>
          <button
            type="button"
            className={`fm-nav-btn${tab === "project" ? " active" : ""}`}
            onClick={() => setTab("project")}
          >
            Current Project
          </button>
          <button
            type="button"
            className={`fm-nav-btn${tab === "new" ? " active" : ""}`}
            onClick={() => { setTab("new"); setError(""); }}
          >
            New Project
          </button>
          <button
            type="button"
            className={`fm-nav-btn${tab === "open" ? " active" : ""}`}
            onClick={() => { setTab("open"); setError(""); }}
          >
            Open Project
          </button>
          <button type="button" className="fm-close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </nav>

        {/* Main panel */}
        <main className="fm-main">
          {/* ── Current Project ── */}
          {tab === "project" && (
            <div className="fm-panel">
              <h3 className="fm-panel-title">Current Project</h3>
              {project ? (
                <>
                  <div className="fm-project-info">
                    <div className="fm-info-row">
                      <span className="fm-info-label">Name</span>
                      <span className="fm-info-value">{project.project.app_name}</span>
                    </div>
                    <div className="fm-info-row">
                      <span className="fm-info-label">Version</span>
                      <span className="fm-info-value">{project.project.version}</span>
                    </div>
                    {projectPath && (
                      <>
                        <div className="fm-info-row">
                          <span className="fm-info-label">File</span>
                          <span className="fm-info-value fm-path-value">{basename(projectPath)}</span>
                        </div>
                        <div className="fm-info-row">
                          <span className="fm-info-label">Folder</span>
                          <span className="fm-info-value fm-path-value fm-muted">{dirname(projectPath)}</span>
                        </div>
                      </>
                    )}
                    {!projectPath && (
                      <div className="fm-info-row">
                        <span className="fm-info-label">File</span>
                        <span className="fm-info-value fm-muted">Not saved yet</span>
                      </div>
                    )}
                  </div>
                  <div className="fm-action-row">
                    <button type="button" className="fm-btn fm-btn-primary" disabled={isBusy} onClick={onSave}>
                      {isBusy ? "Saving…" : projectPath ? "Save" : "Save…"}
                    </button>
                    <button type="button" className="fm-btn" disabled={isBusy || !project} onClick={onSaveAs}>
                      Save As…
                    </button>
                  </div>
                </>
              ) : (
                <p className="fm-empty">No project is open. Create or open one to get started.</p>
              )}
            </div>
          )}

          {/* ── New Project ── */}
          {tab === "new" && (
            <div className="fm-panel">
              <h3 className="fm-panel-title">New Project</h3>
              <form onSubmit={submitNew} className="fm-form">
                <label htmlFor="fm-new-app-name" className="fm-label">App Name</label>
                <input
                  id="fm-new-app-name"
                  className="fm-input"
                  value={newAppName}
                  onChange={(e) => { setNewAppName(e.target.value); setError(""); }}
                  placeholder="WarpForge App"
                  autoFocus
                  disabled={isBusy}
                />
                <div className="fm-action-row">
                  <button type="submit" className="fm-btn fm-btn-primary" disabled={isBusy}>
                    {isBusy ? "Creating…" : "Create Project"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ── Open Project ── */}
          {tab === "open" && (
            <div className="fm-panel">
              <h3 className="fm-panel-title">Open Project</h3>
              <button type="button" className="fm-btn fm-btn-primary fm-browse-btn" disabled={isBusy} onClick={onBrowse}>
                Browse for File…
              </button>

              <form onSubmit={submitOpenPath} className="fm-form fm-form-inline">
                <input
                  className="fm-input"
                  value={openPathInput}
                  onChange={(e) => { setOpenPathInput(e.target.value); setError(""); }}
                  placeholder="Or paste a file path here…"
                  disabled={isBusy}
                />
                <button type="submit" className="fm-btn" disabled={isBusy || !openPathInput.trim()}>
                  Open
                </button>
              </form>

              {recents.length > 0 && (
                <>
                  <div className="fm-section-header">
                    <span>Recent Projects</span>
                    <button type="button" className="fm-clear-btn" onClick={clearRecents}>Clear</button>
                  </div>
                  <ul className="fm-recent-list">
                    {recents.map((r) => (
                      <li key={r.path} className="fm-recent-item">
                        <button
                          type="button"
                          className="fm-recent-btn"
                          disabled={isBusy}
                          onClick={() => doOpen(r.path)}
                          title={r.path}
                        >
                          <span className="fm-recent-name">{r.appName}</span>
                          <span className="fm-recent-meta">
                            <span className="fm-recent-file">{basename(r.path)}</span>
                            <span className="fm-recent-date">{formatDate(r.openedAt)}</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="fm-recent-remove"
                          onClick={() => removeRecent(r.path)}
                          title="Remove from recents"
                          aria-label="Remove"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {recents.length === 0 && (
                <p className="fm-empty fm-empty-sm">No recent projects yet.</p>
              )}
            </div>
          )}

          {error && <p className="fm-error">{error}</p>}
        </main>
      </div>
    </section>
  );
}
