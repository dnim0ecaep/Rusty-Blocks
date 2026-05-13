import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { TopToolbar } from "./shell/TopToolbar";
import { EditorPanel } from "./shell/EditorPanel";
import { RightInspector } from "./shell/RightInspector";
import { BottomPanel } from "./shell/BottomPanel";
import { AiSidePanel } from "./shell/AiSidePanel";
import { StagePanel } from "./shell/StagePanel";
import { VibeDialog } from "./shell/VibeDialog";
import { AiSettingsDialog } from "./shell/AiSettingsDialog";
import { AssetManager } from "./shell/AssetManager";
import { WelcomeScreen } from "./shell/WelcomeScreen";
import { FileManagerDialog } from "./shell/FileManagerDialog";
import { ModulesManagerDialog } from "./shell/ModulesManagerDialog";
import { useUiStore } from "./store/uiStore";
import { useProjectStore } from "./store/projectStore";
import { sharedScheduler } from "./runtime/scheduler";
import {
  DEFAULT_STAGE_HEIGHT,
  DEFAULT_STAGE_WIDTH,
  setStageDimensions,
} from "./types/workspace";

export function App() {
  const { showAssetManager, showFileManager, fileManagerInitialTab, showAiPanel, showInspector, showBottomPanel, showStage, showVibeDialog, showModulesDialog, darkMode, playerMode } = useUiStore();
  const targetFps = useUiStore((state) => state.targetFps);
  const toggleFileManager = useUiStore((state) => state.toggleFileManager);
  const toggleVibeDialog = useUiStore((state) => state.toggleVibeDialog);
  const toggleModulesDialog = useUiStore((state) => state.toggleModulesDialog);
  const togglePlayerMode = useUiStore((state) => state.togglePlayerMode);
  const project = useProjectStore((state) => state.project);
  const isBusy = useProjectStore((state) => state.isBusy);
  const createProject = useProjectStore((state) => state.createProject);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  // Stream compile-log events from `run_generated_app` into the bottom
  // panel's Logs tab. The Tauri command emits one event per stage and
  // one event per line of cargo stdout/stderr; we mirror each into the
  // project store's log array so the panel auto-scrolls them in live.
  useEffect(() => {
    const addLog = useProjectStore.getState().addLog;
    let cleanup: (() => void) | undefined;
    listen<{ kind: string; message: string }>("compile_log", (event) => {
      const { kind, message } = event.payload;
      // Prefix stage markers and errors so the user can skim the log
      // and find phase boundaries quickly.
      const prefix =
        kind === "stage" ? "▸ " :
        kind === "error" ? "✗ " :
        kind === "done"  ? "✓ " :
        "  ";
      addLog(prefix + message);
    }).then((un) => { cleanup = un; });
    return () => cleanup?.();
  }, []);

  // Push the user's framerate preference into the shared scheduler.
  // Done in an effect (not at module load) so the persisted value is
  // picked up after Zustand rehydrates.
  useEffect(() => {
    sharedScheduler.setTargetFramerate(targetFps);
  }, [targetFps]);

  // Mirror the project's custom stage size into the runtime's live
  // STAGE_WIDTH / STAGE_HEIGHT bindings. We do this inline during render
  // (rather than in an effect) so children that read STAGE_WIDTH at
  // render time — most importantly StagePanel's <canvas width={...} />
  // — see the right value on the same commit. setStageDimensions is
  // idempotent and never triggers a re-render, so it's safe here.
  setStageDimensions(
    project?.project.stage_width ?? DEFAULT_STAGE_WIDTH,
    project?.project.stage_height ?? DEFAULT_STAGE_HEIGHT,
  );

  // ESC exits player mode. Listen on document so the binding stays alive
  // even when the canvas itself doesn't have focus.
  useEffect(() => {
    if (!playerMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        togglePlayerMode();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [playerMode, togglePlayerMode]);

  // Auto-bootstrap: when the studio launches with no project loaded,
  // synthesize a default one named "project" so the user lands directly
  // in the editor instead of the WelcomeScreen. The user can rename via
  // the toolbar title (double-click), or open a different project from
  // the File menu, at any time.
  const bootstrappedRef = useRef(false);
  useEffect(() => {
    if (project || isBusy || bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    void createProject("notes", "project");
  }, [project, isBusy, createProject]);

  if (!project) {
    // Briefly show nothing while createProject resolves. WelcomeScreen
    // is still kept as a fallback for cases where bootstrap fails.
    return bootstrappedRef.current ? null : <WelcomeScreen />;
  }

  // Player mode: render only the StagePanel, centered, with all editor
  // chrome hidden. The same StagePanel component is reused — its header
  // already has a Run button and now also a "✕ Exit" button (gated on
  // playerMode) so the user can drop back to the editor.
  if (playerMode) {
    return (
      <div className="studio-root studio-player-mode">
        <StagePanel />
      </div>
    );
  }

  return (
    <div className={`studio-root${showBottomPanel ? "" : " no-bottom-panel"}`}>
      <TopToolbar />
      <div className="studio-main">
        <EditorPanel />
        {showStage ? <StagePanel /> : null}
        {showInspector ? <RightInspector /> : null}
        {showAiPanel ? <AiSidePanel /> : null}
      </div>
      {showBottomPanel ? <BottomPanel /> : null}
      {showAssetManager ? <AssetManager /> : null}
      {showFileManager ? (
        <FileManagerDialog
          onClose={toggleFileManager}
          initialTab={fileManagerInitialTab}
        />
      ) : null}
      {showVibeDialog ? <VibeDialog onClose={toggleVibeDialog} /> : null}
      {showModulesDialog ? <ModulesManagerDialog onClose={toggleModulesDialog} /> : null}
      <AiSettingsDialog />
    </div>
  );
}
