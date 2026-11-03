import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const tauri = vi.hoisted(() => ({
  getInstallChannel: vi.fn(),
  checkForUpdates: vi.fn(),
}));

vi.mock("@/lib/tauri", () => ({
  getInstallChannel: tauri.getInstallChannel,
  checkForUpdates: tauri.checkForUpdates,
  checkAndroidUpdate: vi.fn(),
  installUpdate: vi.fn(),
  openExternal: vi.fn(),
  onUpdateProgress: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { AppUpdates } from "@/components/settings/app-updates";

describe("AppUpdates", () => {
  afterEach(cleanup);

  beforeEach(() => {
    tauri.getInstallChannel.mockReset();
    tauri.checkForUpdates.mockReset();
  });

  it("explains that the Store handles updates and offers no update controls", async () => {
    tauri.getInstallChannel.mockResolvedValue("store");
    render(<AppUpdates />);
    expect(await screen.findByText("storeManaged")).toBeInTheDocument();
    expect(tauri.checkForUpdates).not.toHaveBeenCalled();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("checks and offers the update controls for a direct install", async () => {
    tauri.getInstallChannel.mockResolvedValue("direct");
    tauri.checkForUpdates.mockResolvedValue({
      available: true,
      current_version: "0.2.0",
      version: "0.3.0",
      updatable: true,
    });
    render(<AppUpdates />);
    expect(await screen.findByText("installRestart")).toBeInTheDocument();
    await waitFor(() => expect(tauri.checkForUpdates).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("storeManaged")).toBeNull();
  });
});
