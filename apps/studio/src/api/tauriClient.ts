import { invoke } from "@tauri-apps/api/core";
import type { ProjectFile, AssetRecord } from "../types/workspace";
import type {
  AiRunOutput,
  AiRunRequest,
  ExportOutput,
  PipelineGenerateOutput,
  PipelineParseOutput,
  PipelineValidateOutput
} from "./contracts";

export async function projectNew(templateId: string, appName: string): Promise<ProjectFile> {
  return invoke("project_new", { templateId, appName });
}

export async function projectOpen(path: string): Promise<ProjectFile> {
  return invoke("project_open", { path });
}

export async function projectSave(path: string, project: ProjectFile): Promise<string> {
  return invoke("project_save", { path, project });
}

export async function pipelineParse(project: ProjectFile): Promise<PipelineParseOutput> {
  return invoke("pipeline_parse", { project });
}

export async function pipelineValidate(project: ProjectFile): Promise<PipelineValidateOutput> {
  return invoke("pipeline_validate", { project });
}

export async function pipelineGenerate(
  project: ProjectFile,
  outputDir?: string
): Promise<PipelineGenerateOutput> {
  return invoke("pipeline_generate", { project, outputDir });
}

export async function aiRunMode(request: AiRunRequest & {
  providerUrl?: string;
  model?: string;
  apiKey?: string;
}): Promise<AiRunOutput> {
  return invoke("ai_run_mode", { request });
}

export async function assetImport(
  projectRoot: string,
  sourcePath: string,
  kind: string
): Promise<AssetRecord> {
  return invoke("asset_import", { projectRoot, sourcePath, kind });
}

export async function assetList(): Promise<AssetRecord[]> {
  return invoke("asset_list");
}

export async function exportSource(
  project: ProjectFile,
  exportsRoot: string
): Promise<ExportOutput> {
  return invoke("export_source", { project, exportsRoot });
}

export async function exportBundle(
  project: ProjectFile,
  exportsRoot: string
): Promise<ExportOutput> {
  return invoke("export_bundle", { project, exportsRoot });
}

export interface RunAppOutput {
  pid: number;
  binary_path: string;
  source_dir: string;
}

export async function runGeneratedApp(project: ProjectFile): Promise<RunAppOutput> {
  return invoke("run_generated_app", { project });
}

export interface KillAppOutput {
  killed_pid: number | null;
}

export async function killRunningApp(): Promise<KillAppOutput> {
  return invoke("kill_running_app");
}

export async function rustImportFile(path: string): Promise<ProjectFile> {
  return invoke("rust_import_file", { path });
}

export async function moduleExport(path: string, content: string): Promise<void> {
  return invoke("module_export", { path, content });
}

export async function moduleImport(path: string): Promise<string> {
  return invoke("module_import", { path });
}

export interface CompileSpriteAppOutput {
  source_dir: string;
  binary_path: string;
  log: string;
}

export async function compileSpriteApp(
  project: ProjectFile,
  exportsRoot: string
): Promise<CompileSpriteAppOutput> {
  return invoke("compile_sprite_app", { project, exportsRoot });
}
