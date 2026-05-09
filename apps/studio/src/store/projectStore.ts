import { create } from "zustand";
import { produce } from "immer";

import type { Diagnostic } from "../types/diagnostics";
import type { ProjectFile } from "../types/workspace";
import {
  exportBundle,
  exportSource,
  killRunningApp,
  pipelineGenerate,
  pipelineValidate,
  projectNew,
  projectOpen,
  projectSave,
  runGeneratedApp,
  rustImportFile
} from "../api/tauriClient";
import { graphToBlocklyXml } from "../blocks/graphToBlocklyXml";
import { useRecentFilesStore } from "./recentFilesStore";
import { useStageStore } from "./stageStore";

interface ProjectStore {
  project?: ProjectFile;
  projectPath?: string;
  ir?: unknown;
  diagnostics: Diagnostic[];
  codePreview: Record<string, string>;
  generatedOutputDir?: string;
  logs: string[];
  isBusy: boolean;
  isRunning: boolean;
  runningAppPid?: number;
  createProject(templateId: string, appName: string): Promise<void>;
  openProject(path: string): Promise<void>;
  saveProject(path: string): Promise<void>;
  validateProject(): Promise<void>;
  generateProject(outputDir?: string): Promise<void>;
  runExportSource(exportsRoot: string): Promise<void>;
  runExportBundle(exportsRoot: string): Promise<void>;
  runApp(): Promise<void>;
  stopApp(): Promise<void>;
  importRustFile(path: string): Promise<void>;
  setProject(project: ProjectFile): void;
  addLog(message: string): void;
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  diagnostics: [],
  codePreview: {},
  logs: [],
  isBusy: false,
  isRunning: false,

  async createProject(templateId, appName) {
    set({ isBusy: true });
    try {
      const project = await projectNew(templateId, appName);
      set({
        project,
        projectPath: undefined,
        ir: undefined,
        diagnostics: [],
        codePreview: {},
        generatedOutputDir: undefined
      });
      useStageStore.getState().hydrate(project.stage_state);
      get().addLog(`Created project '${project.project.app_name}' from ${templateId}.`);
    } finally {
      set({ isBusy: false });
    }
  },

  async openProject(path) {
    set({ isBusy: true });
    try {
      const project = await projectOpen(path);
      // If the file has no blockly_xml (e.g., bundled examples or files
      // saved by tooling that only writes the normalized graph), synthesize
      // it so the workspace can hydrate from the graph.
      const needsXml =
        !project.workspace_state.blockly_xml &&
        project.normalized_graph.nodes.length > 0;
      const patched = needsXml
        ? {
            ...project,
            workspace_state: {
              ...project.workspace_state,
              blockly_xml: graphToBlocklyXml(project.normalized_graph)
            }
          }
        : project;
      set({
        project: patched,
        projectPath: path,
        ir: undefined,
        diagnostics: [],
        codePreview: {},
        generatedOutputDir: undefined
      });
      useStageStore.getState().hydrate(patched.stage_state);
      useRecentFilesStore.getState().push(path, patched.project.app_name);
      get().addLog(`Opened project at ${path}.`);
    } catch (error) {
      get().addLog(`Open failed for ${path}: ${String(error)}`);
      throw error;
    } finally {
      set({ isBusy: false });
    }
  },

  async saveProject(path) {
    const { project } = get();
    if (!project) {
      return;
    }

    // Snapshot the live stage state into the project file before writing.
    const projectWithStage: ProjectFile = {
      ...project,
      stage_state: useStageStore.getState().toStageState(),
    };

    set({ isBusy: true });
    try {
      await projectSave(path, projectWithStage);
      set({ project: projectWithStage, projectPath: path });
      useRecentFilesStore.getState().push(path, projectWithStage.project.app_name);
      get().addLog(`Saved project to ${path}.`);
    } catch (error) {
      get().addLog(`Save failed for ${path}: ${String(error)}`);
      throw error;
    } finally {
      set({ isBusy: false });
    }
  },

  async validateProject() {
    const { project } = get();
    if (!project) {
      return;
    }

    set({ isBusy: true });
    try {
      const result = await pipelineValidate(project);
      set({ ir: result.ir, diagnostics: result.diagnostics });
      get().addLog(`Validation finished with ${result.diagnostics.length} diagnostics.`);
    } catch (error) {
      const message = String(error);
      const normalized = message.toLowerCase();
      let diagnostic: Diagnostic = {
        code: "WFV000",
        severity: "error",
        message: `Validation pipeline failed: ${message}`,
        hint: "Add at least one window and one screen block, then run Validate again."
      };

      if (normalized.includes("missing screen nodes")) {
        diagnostic = {
          code: "WFS002",
          severity: "error",
          message: "Project must define at least one screen.",
          hint: "Add a Screen block in the Structure category and validate again."
        };
      } else if (normalized.includes("graph is empty")) {
        diagnostic = {
          code: "WFG001",
          severity: "error",
          message: "Workspace graph is empty.",
          hint: "Add a Window and Screen block, then run Validate again."
        };
      }

      set({
        ir: undefined,
        diagnostics: [diagnostic]
      });
      get().addLog(`Validation failed: ${message}`);
    } finally {
      set({ isBusy: false });
    }
  },

  async generateProject(outputDir) {
    const { project } = get();
    if (!project) {
      return;
    }

    set({ isBusy: true });
    try {
      const result = await pipelineGenerate(project, outputDir);
      set({
        ir: result.ir,
        diagnostics: result.diagnostics,
        codePreview: result.text_files,
        generatedOutputDir: result.written_to
      });
      get().addLog(`Generated ${Object.keys(result.text_files).length} source files.`);
      if (result.written_to) {
        get().addLog(
          `Wrote ${result.written_files.length} files to ${result.written_to}.`
        );
      }
    } finally {
      set({ isBusy: false });
    }
  },

  async runExportSource(exportsRoot) {
    const { project } = get();
    if (!project) {
      return;
    }

    set({ isBusy: true });
    try {
      const result = await exportSource(project, exportsRoot);
      get().addLog(`Source exported to ${result.source_dir}.`);
    } finally {
      set({ isBusy: false });
    }
  },

  async runExportBundle(exportsRoot) {
    const { project } = get();
    if (!project) {
      return;
    }

    set({ isBusy: true });
    try {
      const result = await exportBundle(project, exportsRoot);
      get().addLog(`Bundle export complete. Source: ${result.source_dir}`);
    } finally {
      set({ isBusy: false });
    }
  },

  setProject(project) {
    set({ project });
  },

  async runApp() {
    const { project } = get();
    if (!project) {
      return;
    }

    // Live sprite/backdrop edits (costume picks, new costumes, paint)
    // accumulate in `useStageStore` and only land back in
    // `project.stage_state` on save. ▶ Run must snapshot them before
    // shipping the project to the codegen pipeline, otherwise the
    // generated binary builds against the last *saved* stage state and
    // the user's most recent costume / backdrop change is invisible.
    const projectForRun: ProjectFile = {
      ...project,
      stage_state: useStageStore.getState().toStageState(),
    };

    set({ isBusy: true });
    get().addLog("Building and running app...");

    try {
      const result = await runGeneratedApp(projectForRun);
      set({ isRunning: true, runningAppPid: result.pid, project: projectForRun });
      get().addLog(`App is running (PID: ${result.pid})`);
      get().addLog(`Binary: ${result.binary_path}`);
      get().addLog(`Source: ${result.source_dir}`);
    } catch (error) {
      get().addLog(`Run failed: ${String(error)}`);
      throw error;
    } finally {
      set({ isBusy: false });
    }
  },

  async importRustFile(path) {
    set({ isBusy: true });
    get().addLog(`Importing Rust file from ${path}...`);
    try {
      const project = await rustImportFile(path);
      const xml = graphToBlocklyXml(project.normalized_graph);
      const patched: ProjectFile = {
        ...project,
        workspace_state: {
          ...project.workspace_state,
          blockly_xml: xml
        }
      };
      set({
        project: patched,
        projectPath: undefined,
        ir: undefined,
        diagnostics: [],
        codePreview: {},
        generatedOutputDir: undefined
      });
      useStageStore.getState().hydrate(patched.stage_state);
      get().addLog(
        `Imported '${patched.project.app_name}' with ${patched.normalized_graph.nodes.length} blocks. Note: this is a view-only outline; expressions are stored as source text and the file cannot yet be regenerated from blocks.`
      );
    } catch (error) {
      get().addLog(`Rust import failed: ${String(error)}`);
      throw error;
    } finally {
      set({ isBusy: false });
    }
  },

  async stopApp() {
    const { isRunning, runningAppPid } = get();
    if (!isRunning) {
      return;
    }

    set({ isBusy: true });
    try {
      const result = await killRunningApp();
      if (result.killed_pid != null) {
        get().addLog(`Stopped running app (PID: ${result.killed_pid}).`);
      } else {
        get().addLog(
          runningAppPid != null
            ? `No running child to stop (PID ${runningAppPid} may have already exited).`
            : "No running app to stop."
        );
      }
    } catch (error) {
      get().addLog(`Stop failed: ${String(error)}`);
      throw error;
    } finally {
      set({ isRunning: false, runningAppPid: undefined, isBusy: false });
    }
  },

  addLog(message) {
    set(
      produce<ProjectStore>((draft) => {
        draft.logs.push(`[${new Date().toISOString()}] ${message}`);
      })
    );
  }
}));
