import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectFile } from "../types/workspace";

const pipelineValidateMock = vi.hoisted(() => vi.fn());
const runGeneratedAppMock = vi.hoisted(() => vi.fn());

vi.mock("../api/tauriClient", () => ({
  pipelineValidate: pipelineValidateMock,
  pipelineGenerate: vi.fn(),
  projectNew: vi.fn(),
  projectOpen: vi.fn(),
  projectSave: vi.fn(),
  exportSource: vi.fn(),
  exportBundle: vi.fn(),
  runGeneratedApp: runGeneratedAppMock,
  killRunningApp: vi.fn(),
  rustImportFile: vi.fn(),
}));

import { useProjectStore } from "./projectStore";
import { useStageStore } from "./stageStore";

const projectFixture: ProjectFile = {
  schema_version: 1,
  project: {
    id: "p_1",
    app_name: "QuickNotes",
    package_id: "com.warpforge.quicknotes",
    version: "0.1.0",
    author: "WarpForge",
    description: "notes",
    target_type: "desktop_slint",
    theme: "auto",
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z"
  },
  workspace_state: {
    zoom: 1,
    pan_x: 0,
    pan_y: 0,
    selected_block_ids: [],
    comments: [],
    groups: []
  },
  normalized_graph: {
    nodes: [],
    edges: []
  },
  assets: [],
  ai_history: [],
  settings: {
    autosave_interval_secs: 60,
    validate_on_change: false,
    codegen_deterministic: true,
    ai_default_text_provider: "ollama",
    ai_default_image_provider: "comfyui"
  }
};

describe("projectStore validateProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({
      project: projectFixture,
      projectPath: undefined,
      ir: undefined,
      diagnostics: [],
      codePreview: {},
      generatedOutputDir: undefined,
      logs: [],
      isBusy: false
    });
  });

  it("stores diagnostics on successful validation", async () => {
    pipelineValidateMock.mockResolvedValue({
      ir: { sample: true },
      diagnostics: [{ code: "WFS003", severity: "warning", message: "No event handlers defined." }]
    });

    await useProjectStore.getState().validateProject();

    const state = useProjectStore.getState();
    expect(state.diagnostics).toHaveLength(1);
    expect(state.diagnostics[0].code).toBe("WFS003");
    expect(state.logs.some((line) => line.includes("Validation finished with 1 diagnostics."))).toBe(true);
  });

  it("writes fallback diagnostics when pipeline throws", async () => {
    pipelineValidateMock.mockRejectedValue(new Error("failed to parse graph: graph is empty"));

    await useProjectStore.getState().validateProject();

    const state = useProjectStore.getState();
    expect(state.diagnostics).toHaveLength(1);
    expect(state.diagnostics[0].code).toBe("WFG001");
    expect(state.diagnostics[0].severity).toBe("error");
    expect(state.diagnostics[0].message).toContain("Workspace graph is empty");
    expect(state.logs.some((line) => line.includes("Validation failed:"))).toBe(true);
  });

  it("maps missing screen failures to WFS002 diagnostic", async () => {
    pipelineValidateMock.mockRejectedValue(new Error("failed to build IR: missing screen nodes"));

    await useProjectStore.getState().validateProject();

    const state = useProjectStore.getState();
    expect(state.diagnostics).toHaveLength(1);
    expect(state.diagnostics[0].code).toBe("WFS002");
    expect(state.diagnostics[0].severity).toBe("error");
    expect(state.diagnostics[0].message).toContain("at least one screen");
    expect(state.logs.some((line) => line.includes("Validation failed:"))).toBe(true);
  });
});

describe("projectStore runApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runGeneratedAppMock.mockResolvedValue({
      pid: 4242,
      binary_path: "/tmp/foo",
      source_dir: "/tmp/bar",
    });
    useProjectStore.setState({
      project: projectFixture,
      projectPath: undefined,
      ir: undefined,
      diagnostics: [],
      codePreview: {},
      generatedOutputDir: undefined,
      logs: [],
      isBusy: false,
      isRunning: false,
      runningAppPid: undefined,
    });
    // Seed the live stage store with one sprite + one backdrop so we
    // can assert they survive into the projected snapshot. Without the
    // snapshot, the user's most recent costume change is invisible to
    // the generated app.
    useStageStore.setState({
      sprites: [
        {
          id: "s1",
          name: "Friend",
          x: 0,
          y: 0,
          direction: 90,
          size: 100,
          visible: true,
          rotationStyle: "all-around",
          costumeIndex: 1, // user picked the second costume
          costumes: [
            { id: "c0", name: "old", assetId: "a0", centerX: 0, centerY: 0, width: 64, height: 64 },
            { id: "c1", name: "new", assetId: "a1", centerX: 0, centerY: 0, width: 64, height: 64 },
          ],
          sounds: [],
          scriptsXml: "",
          variables: {},
          lists: {},
          layer: 1,
          isClone: false,
        },
      ],
      selectedSpriteId: "s1",
      backdropIndex: 0,
      backdrops: [{ id: "b0", name: "stage", assetId: "ab0", centerX: 0, centerY: 0, width: 480, height: 360 }],
      globalVariables: {},
      globalLists: {},
    });
  });

  it("ships the live stage state to the run command (not the stale project)", async () => {
    await useProjectStore.getState().runApp();
    expect(runGeneratedAppMock).toHaveBeenCalledTimes(1);
    const sent = runGeneratedAppMock.mock.calls[0]?.[0] as ProjectFile;
    expect(sent.stage_state?.sprites?.[0]?.costumeIndex).toBe(1);
    expect(sent.stage_state?.sprites?.[0]?.costumes?.length).toBe(2);
    expect(sent.stage_state?.backdrops?.length).toBe(1);
  });

  it("flips isRunning + records the PID on success", async () => {
    await useProjectStore.getState().runApp();
    const state = useProjectStore.getState();
    expect(state.isRunning).toBe(true);
    expect(state.runningAppPid).toBe(4242);
  });
});
