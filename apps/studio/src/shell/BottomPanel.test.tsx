import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BottomPanel } from "./BottomPanel";

const setBottomTabMock = vi.fn();
const uiState = {
  activeBottomTab: "code" as const,
  setBottomTab: setBottomTabMock
};

vi.mock("../store/uiStore", () => ({
  useUiStore: (
    selector: (state: {
      activeBottomTab: "code" | "diagnostics" | "logs" | "files" | "ir";
      setBottomTab: (tab: "code" | "diagnostics" | "logs" | "files" | "ir") => void;
    }) => unknown
  ) => selector(uiState)
}));

vi.mock("../panels/CodePreviewPanel", () => ({
  CodePreviewPanel: () => <div>Code Panel</div>
}));
vi.mock("../panels/DiagnosticsPanel", () => ({
  DiagnosticsPanel: () => <div>Diagnostics Panel</div>
}));
vi.mock("../panels/LogsPanel", () => ({
  LogsPanel: () => <div>Logs Panel</div>
}));
vi.mock("../panels/FileTreePanel", () => ({
  FileTreePanel: () => <div>Files Panel</div>
}));
vi.mock("../panels/IrViewPanel", () => ({
  IrViewPanel: () => <div>IR Panel</div>
}));

describe("BottomPanel tabs", () => {
  beforeEach(() => {
    setBottomTabMock.mockReset();
  });

  it("switches tabs when each button is clicked", async () => {
    render(<BottomPanel />);

    await userEvent.click(screen.getByRole("button", { name: "Code" }));
    await userEvent.click(screen.getByRole("button", { name: "Diagnostics" }));
    await userEvent.click(screen.getByRole("button", { name: "Logs" }));
    await userEvent.click(screen.getByRole("button", { name: "File Tree" }));
    await userEvent.click(screen.getByRole("button", { name: "IR" }));

    expect(setBottomTabMock).toHaveBeenCalledWith("code");
    expect(setBottomTabMock).toHaveBeenCalledWith("diagnostics");
    expect(setBottomTabMock).toHaveBeenCalledWith("logs");
    expect(setBottomTabMock).toHaveBeenCalledWith("files");
    expect(setBottomTabMock).toHaveBeenCalledWith("ir");
  });
});
