import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CodePreviewPanel } from "./CodePreviewPanel";

const projectState = {
  codePreview: {
    "src/main.rs": "fn main() {}",
    "src/app/mod.rs": "pub mod app;"
  }
};

vi.mock("../store/projectStore", () => ({
  useProjectStore: (selector: (state: typeof projectState) => unknown) => selector(projectState)
}));

describe("CodePreviewPanel file buttons", () => {
  it("switches active file content", async () => {
    render(<CodePreviewPanel />);

    expect(screen.getByText("fn main() {}")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "src/app/mod.rs" }));
    expect(screen.getByText("pub mod app;")).toBeInTheDocument();
  });
});
