import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectFile } from "../types/workspace";
import { TopToolbar } from "./TopToolbar";

const {
  openMock,
  saveMock,
  useProjectStoreMock,
  toggleAssetManagerMock,
  toggleFileManagerMock,
  setBottomTabMock,
  toggleAiSettingsMock
} = vi.hoisted(() => ({
  openMock: vi.fn(),
  saveMock: vi.fn(),
  useProjectStoreMock: vi.fn(),
  toggleAssetManagerMock: vi.fn(),
  toggleFileManagerMock: vi.fn(),
  setBottomTabMock: vi.fn(),
  toggleAiSettingsMock: vi.fn()
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: openMock,
  save: saveMock
}));

vi.mock("../store/projectStore", () => ({
  useProjectStore: () => useProjectStoreMock()
}));

const uiMockState = {
  toggleAssetManager: toggleAssetManagerMock,
  toggleFileManager: toggleFileManagerMock,
  setBottomTab: setBottomTabMock,
  darkMode: false,
  toggleDarkMode: vi.fn(),
  showAiPanel: false,
  toggleAiPanel: vi.fn(),
  showInspector: true,
  toggleInspector: vi.fn(),
  toggleVibeDialog: vi.fn(),
  showVibeDialog: false,
  toggleModulesDialog: vi.fn(),
  showModulesDialog: false,
  showAssetManager: false,
  showBlockOrganizer: false,
  showFileManager: false,
  activeBottomTab: "code" as const,
  selectedBlockId: undefined,
  toggleBlockOrganizer: vi.fn(),
  setSelectedBlockId: vi.fn(),
};

vi.mock("../store/uiStore", () => ({
  useUiStore: (selector?: (state: typeof uiMockState) => unknown) =>
    selector ? selector(uiMockState) : uiMockState
}));

vi.mock("../store/aiStore", () => ({
  useAiStore: (selector: (state: { toggleSettings: () => void }) => unknown) =>
    selector({ toggleSettings: toggleAiSettingsMock })
}));

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

function makeStoreState(overrides: Partial<ReturnType<typeof defaultStoreState>> = {}) {
  return {
    ...defaultStoreState(),
    ...overrides
  };
}

function defaultStoreState() {
  return {
    project: projectFixture,
    projectPath: undefined as string | undefined,
    isBusy: false,
    isRunning: false,
    createProject: vi.fn().mockResolvedValue(undefined),
    openProject: vi.fn().mockResolvedValue(undefined),
    saveProject: vi.fn().mockResolvedValue(undefined),
    validateProject: vi.fn().mockResolvedValue(undefined),
    generateProject: vi.fn().mockResolvedValue(undefined),
    runExportSource: vi.fn().mockResolvedValue(undefined),
    runExportBundle: vi.fn().mockResolvedValue(undefined),
    runApp: vi.fn().mockResolvedValue(undefined),
    stopApp: vi.fn().mockResolvedValue(undefined),
    importRustFile: vi.fn().mockResolvedValue(undefined),
    addLog: vi.fn()
  };
}

describe("TopToolbar buttons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStoreMock.mockReturnValue(defaultStoreState());
    openMock.mockResolvedValue(null);
    saveMock.mockResolvedValue(null);
    vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.spyOn(window, "prompt").mockImplementation(() => null);
  });

  // Helper: open a dropdown by its trigger label and click an item by label.
  // The caret span is aria-hidden so the trigger's accessible name is just the label.
  async function clickInMenu(menuLabel: string, itemLabel: string) {
    const trigger = screen.getByRole("button", { name: menuLabel });
    await userEvent.click(trigger);
    const item = await screen.findByRole("menuitem", { name: itemLabel });
    await userEvent.click(item);
  }

  it("opens File Manager from File ▾ menu", async () => {
    render(<TopToolbar />);
    await clickInMenu("File", "Files…");

    expect(toggleFileManagerMock).toHaveBeenCalledTimes(1);
  });

  it("saves to existing project path without opening a dialog", async () => {
    const state = makeStoreState({ projectPath: "/tmp/sample/project.warpforge.json" });
    useProjectStoreMock.mockReturnValue(state);

    render(<TopToolbar />);
    await clickInMenu("File", "Save");

    await waitFor(() => {
      expect(state.saveProject).toHaveBeenCalledWith("/tmp/sample/project.warpforge.json");
    });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("opens native save dialog when no project path is set", async () => {
    const state = makeStoreState({ projectPath: undefined });
    useProjectStoreMock.mockReturnValue(state);
    saveMock.mockResolvedValue("/tmp/sample/saved-project.warpforge.json");

    render(<TopToolbar />);
    await clickInMenu("File", "Save");

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalled();
      expect(state.saveProject).toHaveBeenCalledWith("/tmp/sample/saved-project.warpforge.json");
    });
  });

  it("Save As always opens the native dialog, even when a project path is set", async () => {
    const state = makeStoreState({ projectPath: "/tmp/sample/project.warpforge.json" });
    useProjectStoreMock.mockReturnValue(state);
    saveMock.mockResolvedValue("/tmp/sample/copy.warpforge.json");

    render(<TopToolbar />);
    await clickInMenu("File", "Save As…");

    await waitFor(() => {
      expect(saveMock).toHaveBeenCalled();
      expect(state.saveProject).toHaveBeenCalledWith("/tmp/sample/copy.warpforge.json");
    });
  });

  it("Save As appends .json when the user-chosen path lacks the extension", async () => {
    const state = makeStoreState({ projectPath: undefined });
    useProjectStoreMock.mockReturnValue(state);
    saveMock.mockResolvedValue("/tmp/sample/no-ext-name");

    render(<TopToolbar />);
    await clickInMenu("File", "Save As…");

    await waitFor(() => {
      expect(state.saveProject).toHaveBeenCalledWith("/tmp/sample/no-ext-name.json");
    });
  });

  it("falls back to in-app Save dialog when native save dialog is unavailable", async () => {
    const state = makeStoreState({ projectPath: undefined });
    useProjectStoreMock.mockReturnValue(state);
    saveMock.mockRejectedValue(new Error("dialog unavailable"));
    vi.spyOn(window, "alert").mockImplementation(() => {});

    render(<TopToolbar />);
    await clickInMenu("File", "Save");

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(expect.stringContaining("Failed to open save dialog"));
    });
  });

  it("runs Validate and Generate Source from Build ▾ menu", async () => {
    const state = makeStoreState({ projectPath: "/tmp/sample/project.warpforge.json" });
    useProjectStoreMock.mockReturnValue(state);
    openMock.mockResolvedValue("/tmp/sample/generated");

    render(<TopToolbar />);
    await clickInMenu("Build", "Validate");
    await clickInMenu("Build", "Generate Source…");

    await waitFor(() => {
      expect(setBottomTabMock).toHaveBeenCalledWith("diagnostics");
      expect(setBottomTabMock).toHaveBeenCalledWith("code");
      expect(state.validateProject).toHaveBeenCalledTimes(1);
      expect(state.generateProject).toHaveBeenCalledWith("/tmp/sample/generated");
    });
  });

  it("runs Generate Source in preview-only mode if directory is not selected", async () => {
    const state = makeStoreState({ projectPath: "/tmp/sample/project.warpforge.json" });
    useProjectStoreMock.mockReturnValue(state);
    openMock.mockResolvedValue(null);

    render(<TopToolbar />);
    await clickInMenu("Build", "Generate Source…");

    await waitFor(() => {
      expect(state.generateProject).toHaveBeenCalledWith(undefined);
      expect(state.addLog).toHaveBeenCalledWith(
        "Generate source ran in preview-only mode (no output directory selected)."
      );
      expect(setBottomTabMock).toHaveBeenCalledWith("code");
    });
  });

  it("runs Export Source and Export Bundle after directory selection", async () => {
    const state = makeStoreState({ projectPath: "/tmp/sample/project.warpforge.json" });
    useProjectStoreMock.mockReturnValue(state);
    openMock
      .mockResolvedValueOnce("/tmp/sample/exports")
      .mockResolvedValueOnce("/tmp/sample/exports");

    render(<TopToolbar />);
    await clickInMenu("Build", "Export Source…");
    await clickInMenu("Build", "Export Bundle…");

    await waitFor(() => {
      expect(state.runExportSource).toHaveBeenCalledWith("/tmp/sample/exports");
      expect(state.runExportBundle).toHaveBeenCalledWith("/tmp/sample/exports");
    });
  });

  it("opens Asset Manager from Tools ▾ menu", async () => {
    render(<TopToolbar />);
    await clickInMenu("Tools", "Assets…");

    expect(toggleAssetManagerMock).toHaveBeenCalledTimes(1);
  });
});
