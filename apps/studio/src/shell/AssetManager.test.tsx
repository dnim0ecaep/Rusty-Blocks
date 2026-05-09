import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AssetRecord } from "../types/workspace";
import { AssetManager } from "./AssetManager";

const toggleAssetManagerMock = vi.fn();
const refreshMock = vi.fn().mockResolvedValue(undefined);

const assetsFixture: AssetRecord[] = [
  {
    id: "asset_1",
    kind: "icon",
    path: "assets/icons/one.png",
    metadata: { source: "gen" },
    created_at: "2026-03-01T00:00:00Z",
    version: 1
  },
  {
    id: "asset_2",
    kind: "image",
    path: "assets/images/two.png",
    metadata: { source: "gen" },
    created_at: "2026-03-01T00:00:00Z",
    version: 2
  }
];

vi.mock("../store/assetStore", () => ({
  useAssetStore: () => ({
    assets: assetsFixture,
    loading: false,
    refresh: refreshMock
  })
}));

vi.mock("../store/uiStore", () => ({
  useUiStore: (selector: (state: { toggleAssetManager: () => void }) => unknown) =>
    selector({ toggleAssetManager: toggleAssetManagerMock })
}));

describe("AssetManager buttons", () => {
  beforeEach(() => {
    toggleAssetManagerMock.mockReset();
    refreshMock.mockReset();
    refreshMock.mockResolvedValue(undefined);
  });

  it("refreshes assets on mount and closes from Close button", async () => {
    render(<AssetManager />);
    expect(refreshMock).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(toggleAssetManagerMock).toHaveBeenCalledTimes(1);
  });

  it("selects asset cards via grid buttons", async () => {
    render(<AssetManager />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "icon" })).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /assets\/images\/two\.png/i }));
    expect(screen.getByRole("heading", { name: "image" })).toBeInTheDocument();
    expect(screen.getByText("v2")).toBeInTheDocument();
  });
});
