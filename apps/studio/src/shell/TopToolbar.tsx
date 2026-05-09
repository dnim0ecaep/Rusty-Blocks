import { useEffect, useMemo, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { documentDir, join } from "@tauri-apps/api/path";

import { useProjectStore } from "../store/projectStore";
import { useUiStore } from "../store/uiStore";
import { Dropdown, DropdownItem, DropdownSeparator } from "./Dropdown";
import { StageSizeDialog } from "./StageSizeDialog";

const DEFAULT_EXPORTS_DIR = "./exports";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function inferGeneratedDir(projectPath: string | undefined, appName: string): string {
  if (!projectPath) {
    return `./generated/${slugify(appName) || "app"}`;
  }
  const separatorIndex = Math.max(projectPath.lastIndexOf("/"), projectPath.lastIndexOf("\\"));
  const baseDir = separatorIndex >= 0 ? projectPath.slice(0, separatorIndex) : ".";
  return `${baseDir}/generated/${slugify(appName) || "app"}`;
}

function inferExportsDir(projectPath: string | undefined): string {
  if (!projectPath) return DEFAULT_EXPORTS_DIR;
  const separatorIndex = Math.max(projectPath.lastIndexOf("/"), projectPath.lastIndexOf("\\"));
  const baseDir = separatorIndex >= 0 ? projectPath.slice(0, separatorIndex) : ".";
  return `${baseDir}/exports`;
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

export function TopToolbar() {
  const {
    project,
    projectPath,
    isBusy,
    isRunning,
    saveProject,
    validateProject,
    generateProject,
    runExportSource,
    runExportBundle,
    runApp,
    stopApp,
    importRustFile,
    setProject,
    addLog
  } = useProjectStore();
  const toggleAssetManager = useUiStore((state) => state.toggleAssetManager);
  const toggleFileManager = useUiStore((state) => state.toggleFileManager);
  const openFileManager = useUiStore((state) => state.openFileManager);
  const setBottomTab = useUiStore((state) => state.setBottomTab);
  const { darkMode, toggleDarkMode, showAiPanel, toggleAiPanel, showInspector, toggleInspector, showBottomPanel, toggleBottomPanel, showStage, toggleStage, toggleVibeDialog, toggleModulesDialog } = useUiStore();
  const targetFps = useUiStore((s) => s.targetFps);
  const setTargetFps = useUiStore((s) => s.setTargetFps);
  const togglePlayerMode = useUiStore((s) => s.togglePlayerMode);
  const [showStageSize, setShowStageSize] = useState(false);

  const title = useMemo(() => {
    if (!project) return "No project loaded";
    return `${project.project.app_name} (${project.project.version})`;
  }, [project]);

  const doSave = async (path: string) => {
    const normalized = normalizeFilesystemPath(withJsonExtension(path));
    if (!normalized) return;
    try {
      await saveProject(normalized);
    } catch (error) {
      addLog(`Save failed: ${String(error)}`);
      window.alert(`Save failed: ${String(error)}`);
    }
  };

  /** Always opens the OS save dialog and writes to the chosen path —
   *  the destination becomes the project's new path on success. Used by
   *  both `Save As…` and the first save of a never-saved project. */
  const promptAndSave = async () => {
    if (!project) return;
    try {
      const selected = await save({
        defaultPath: projectPath
          ? withJsonExtension(projectPath)
          : await inferDefaultSavePath(project.project.app_name),
        filters: [{ name: "WarpForge Project", extensions: ["json"] }],
      });
      let path: string | null = null;
      if (Array.isArray(selected)) path = typeof selected[0] === "string" ? selected[0] : null;
      else if (typeof selected === "string") path = selected;
      if (path) await doSave(path);
    } catch (error) {
      addLog(`Save dialog failed: ${String(error)}`);
      window.alert(`Failed to open save dialog: ${String(error)}`);
    }
  };

  const onSave = async () => {
    if (!project) return;
    if (projectPath) {
      await doSave(projectPath);
      return;
    }
    await promptAndSave();
  };

  const onSaveAs = async () => {
    if (!project) return;
    await promptAndSave();
  };

  const chooseDirectory = async (title: string, _fallbackPath: string): Promise<string | null> => {
    try {
      const selected = await open({ multiple: false, directory: true, title });
      if (typeof selected === "string") return normalizeFilesystemPath(selected);
      return null;
    } catch (error) {
      addLog(`Directory dialog failed: ${String(error)}`);
      return null;
    }
  };

  const onGenerate = async () => {
    if (!project) return;
    const defaultDir = inferGeneratedDir(projectPath, project.project.app_name);
    const outputDir = await chooseDirectory("Select generate source directory", defaultDir);
    try {
      await generateProject(outputDir ?? undefined);
      setBottomTab("code");
      if (!outputDir) addLog("Generate source ran in preview-only mode (no output directory selected).");
    } catch (error) {
      addLog(`Generate failed: ${String(error)}`);
      window.alert(`Generate failed: ${String(error)}`);
    }
  };

  const onValidate = async () => {
    setBottomTab("diagnostics");
    try {
      await validateProject();
    } catch (error) {
      addLog(`Validate failed: ${String(error)}`);
      window.alert(`Validate failed: ${String(error)}`);
    }
  };

  const onExportSource = async () => {
    const exportsRoot = await chooseDirectory("Select exports directory", inferExportsDir(projectPath));
    if (!exportsRoot) return;
    try {
      await runExportSource(exportsRoot);
    } catch (error) {
      addLog(`Export source failed: ${String(error)}`);
      window.alert(`Export source failed: ${String(error)}`);
    }
  };

  const onExportBundle = async () => {
    const exportsRoot = await chooseDirectory("Select exports directory", inferExportsDir(projectPath));
    if (!exportsRoot) return;
    try {
      await runExportBundle(exportsRoot);
    } catch (error) {
      addLog(`Export bundle failed: ${String(error)}`);
      window.alert(`Export bundle failed: ${String(error)}\n\nInstall cargo-bundle if missing:\ncargo install cargo-bundle`);
    }
  };

  // The "Compile Sprite App" macroquad path was removed in favor of the
  // unified ▶ Run Slint pipeline. The Tauri command (compile_sprite_app)
  // and the wf-sprite-runtime macroquad-app feature are kept for engine
  // debugging — they just no longer have a UI entry point.

  const onRun = async () => {
    setBottomTab("logs");
    try {
      await runApp();
    } catch (error) {
      addLog(`Run failed: ${String(error)}`);
      window.alert(`Run failed: ${String(error)}`);
    }
  };

  const onStop = async () => {
    setBottomTab("logs");
    try {
      await stopApp();
    } catch (error) {
      addLog(`Stop failed: ${String(error)}`);
      window.alert(`Stop failed: ${String(error)}`);
    }
  };

  const onImportRust = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        filters: [{ name: "Rust Source", extensions: ["rs"] }],
        title: "Select a Rust source file to import"
      });
      let picked: string | null = null;
      if (Array.isArray(selected)) {
        picked = typeof selected[0] === "string" ? selected[0] : null;
      } else if (typeof selected === "string") {
        picked = selected;
      }
      if (!picked) return;
      const path = normalizeFilesystemPath(picked);
      setBottomTab("logs");
      await importRustFile(path);
    } catch (error) {
      addLog(`Rust import failed: ${String(error)}`);
      window.alert(`Rust import failed: ${String(error)}`);
    }
  };

  return (
    <>
    <header className="top-toolbar">
      <div className="toolbar-group">
        <Dropdown label="File" disabled={isBusy}>
          <DropdownItem onClick={() => openFileManager("new")}>New Project…</DropdownItem>
          <DropdownItem onClick={() => openFileManager("open")}>Open Project…</DropdownItem>
          <DropdownSeparator />
          <DropdownItem onClick={onSave} disabled={!project}>
            Save
          </DropdownItem>
          <DropdownItem onClick={onSaveAs} disabled={!project}>
            Save As…
          </DropdownItem>
          <DropdownItem onClick={toggleFileManager}>Files…</DropdownItem>
          <DropdownSeparator />
          <DropdownItem
            onClick={onImportRust}
            title="Parse a .rs file and view it as Blockly blocks"
          >
            Import Rust File…
          </DropdownItem>
        </Dropdown>

        <Dropdown label="Build" disabled={isBusy || !project}>
          <DropdownItem onClick={onValidate}>Validate</DropdownItem>
          <DropdownItem onClick={onGenerate}>Generate Source…</DropdownItem>
          <DropdownItem onClick={onExportSource}>Export Source…</DropdownItem>
          <DropdownItem onClick={onExportBundle}>Export Bundle…</DropdownItem>
        </Dropdown>

        <Dropdown label="Tools" disabled={isBusy}>
          <DropdownItem onClick={toggleModulesDialog}>Modules…</DropdownItem>
          <DropdownItem onClick={toggleAssetManager}>Assets…</DropdownItem>
        </Dropdown>

        <Dropdown label="View" disabled={isBusy}>
          <DropdownItem onClick={toggleStage}>
            {showStage ? "Hide Stage" : "Show Stage"}
          </DropdownItem>
          <DropdownItem onClick={toggleInspector}>
            {showInspector ? "Hide Inspector" : "Show Inspector"}
          </DropdownItem>
          <DropdownItem onClick={toggleAiPanel}>
            {showAiPanel ? "Hide AI Copilot" : "Show AI Copilot"}
          </DropdownItem>
          <DropdownItem onClick={toggleBottomPanel}>
            {showBottomPanel ? "Hide Bottom Panel" : "Show Bottom Panel"}
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem onClick={() => setShowStageSize(true)} disabled={!project}>
            Stage Size…
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem onClick={togglePlayerMode}>
            ⛶ Player Mode
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem onClick={() => setTargetFps(30)}>
            {targetFps === 30 ? "✓ " : "  "}Framerate: 30 fps
          </DropdownItem>
          <DropdownItem onClick={() => setTargetFps(60)}>
            {targetFps === 60 ? "✓ " : "  "}Framerate: 60 fps
          </DropdownItem>
          <DropdownItem onClick={() => setTargetFps(120)}>
            {targetFps === 120 ? "✓ " : "  "}Framerate: 120 fps
          </DropdownItem>
          <DropdownItem onClick={() => setTargetFps(Infinity)}>
            {!Number.isFinite(targetFps) ? "✓ " : "  "}Framerate: Unlimited
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem onClick={toggleDarkMode}>
            {darkMode ? "☀️ Light Mode" : "🌙 Dark Mode"}
          </DropdownItem>
        </Dropdown>
      </div>

      <div className="toolbar-title">
        <ProjectTitle
          project={project}
          title={title}
          onRename={(newName) => {
            if (!project) return;
            const trimmed = newName.trim();
            if (!trimmed || trimmed === project.project.app_name) return;
            setProject({
              ...project,
              project: { ...project.project, app_name: trimmed },
            });
          }}
        />
      </div>

      <div className="toolbar-group">
        <button
          onClick={toggleVibeDialog}
          type="button"
          disabled={!project || isBusy}
          title="Open the Vibe dialog (AI-driven block authoring)"
        >
          ✨ Vibe
        </button>
        <button
          onClick={onRun}
          type="button"
          disabled={!project || isBusy || isRunning}
          title="Build and launch the app"
        >
          ▶ Run
        </button>
        <button
          onClick={onStop}
          type="button"
          disabled={isBusy || !isRunning}
          title="Stop the running app"
        >
          ■ Stop
        </button>
      </div>
    </header>
    {showStageSize ? <StageSizeDialog onClose={() => setShowStageSize(false)} /> : null}
    </>
  );
}

/**
 * Toolbar project title with double-click-to-rename. Reads the current
 * `app_name` from `project`, but lets the user enter a new value via an
 * inline `<input>`. Enter or blur commits; Escape cancels.
 */
function ProjectTitle({
  project,
  title,
  onRename,
}: {
  project: ReturnType<typeof useProjectStore.getState>["project"];
  title: string;
  onRename: (newName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto-focus + select-all when entering edit mode so the user can
  // overwrite or extend without an extra click.
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  if (!project) {
    return <strong>{title}</strong>;
  }

  if (editing) {
    const commit = () => {
      onRename(draft);
      setEditing(false);
    };
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
          }
        }}
        style={{
          font: "inherit",
          background: "transparent",
          border: "1px solid var(--border-color, #cdd6e2)",
          borderRadius: 3,
          padding: "1px 4px",
          minWidth: 80,
        }}
        aria-label="Project name"
      />
    );
  }

  return (
    <strong
      onDoubleClick={() => {
        setDraft(project.project.app_name);
        setEditing(true);
      }}
      title="Double-click to rename"
      style={{ cursor: "text", userSelect: "none" }}
    >
      {title}
    </strong>
  );
}
