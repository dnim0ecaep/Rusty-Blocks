import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AiSidePanel } from "./AiSidePanel";

const setProviderMock = vi.fn();
const runPromptMock = vi.fn().mockResolvedValue(undefined);

const aiState = {
  messages: [],
  provider: "ollama",
  busy: false,
  setProvider: setProviderMock,
  runPrompt: runPromptMock
};

vi.mock("../store/aiStore", () => ({
  useAiStore: () => aiState
}));

describe("AiSidePanel buttons", () => {
  beforeEach(() => {
    setProviderMock.mockReset();
    runPromptMock.mockReset();
    runPromptMock.mockResolvedValue(undefined);
  });

  it("runs custom prompt from Run button", async () => {
    render(<AiSidePanel />);

    await userEvent.selectOptions(screen.getByLabelText("Mode"), "text");
    await userEvent.type(
      screen.getByPlaceholderText(
        "Generate an icon, rewrite copy, suggest layout, explain block flow..."
      ),
      "Rewrite my onboarding copy"
    );
    await userEvent.click(screen.getByRole("button", { name: "Run" }));

    await waitFor(() => {
      expect(runPromptMock).toHaveBeenCalledWith("text", "Rewrite my onboarding copy", {});
    });
  });

  it("runs quick action buttons", async () => {
    render(<AiSidePanel />);
    await userEvent.click(screen.getByRole("button", { name: "Generate App Icon" }));
    await userEvent.click(screen.getByRole("button", { name: "Onboarding Copy" }));
    await userEvent.click(screen.getByRole("button", { name: "Suggest Layout" }));
    await userEvent.click(screen.getByRole("button", { name: "Explain Block Flow" }));

    expect(runPromptMock).toHaveBeenCalledWith(
      "image",
      "Generate a clean app icon for a productivity desktop app.",
      {}
    );
    expect(runPromptMock).toHaveBeenCalledWith(
      "text",
      "Write onboarding copy in 4 short steps for first-time users.",
      {}
    );
    expect(runPromptMock).toHaveBeenCalledWith(
      "recommendation",
      "Suggest a better layout for a desktop app with sidebar, content, and details panel.",
      {}
    );
    expect(runPromptMock).toHaveBeenCalledWith(
      "explanation",
      "Explain what the currently selected block flow is doing in simple terms.",
      {}
    );
  });
});
