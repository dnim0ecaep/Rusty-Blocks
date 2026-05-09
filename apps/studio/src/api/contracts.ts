import type { Diagnostic } from "../types/diagnostics";
import type { ProjectFile } from "../types/workspace";

export interface PipelineParseOutput {
  graph: {
    nodes: Array<{ id: string; kind: string; category: string; props: Record<string, unknown> }>;
    edges: Array<{ id: string; from: string; to: string; edge_type: string }>;
  };
}

export interface PipelineValidateOutput {
  ir: unknown;
  diagnostics: Diagnostic[];
}

export interface PipelineGenerateOutput extends PipelineValidateOutput {
  text_files: Record<string, string>;
  written_to?: string;
  written_files: string[];
}

export interface AiRunRequest {
  mode: "text" | "image" | "recommendation" | "explanation";
  prompt: string;
  provider?: string;
  context?: Record<string, unknown>;
}

export interface AiRunOutput {
  mode: string;
  provider: string;
  output: unknown;
  created_at: string;
}

export interface ExportOutput {
  source_dir: string;
  bundle_path?: string;
  manifest_path: string;
}

export interface ProjectApi {
  newProject(templateId: string, appName: string): Promise<ProjectFile>;
  openProject(path: string): Promise<ProjectFile>;
  saveProject(path: string, project: ProjectFile): Promise<string>;
}
