import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const tauri = vi.hoisted(() => ({
  isTauri: true,
  checkForUpdates: vi.fn(),
  getInstallChannel: vi.fn(),
}));
vi.mock("@/lib/tauri", () => ({
  get isTauri() {
    return tauri.isTauri;
  },
  checkForUpdates: tauri.checkForUpdates,
  getInstallChannel: tauri.getInstallChannel,
}));

import { UpdatePill } from "@/components/ui/update-pill";

describe("UpdatePill", () => {
  afterEach(cleanup);

  beforeEach(() => {
    tauri.isTauri = true;
    tauri.checkForUpdates.mockReset();
    tauri.getInstallChannel.mockReset();
    tauri.getInstallChannel.mockResolvedValue("direct");
  });

  it("shows nothing in the browser and never checks", () => {
    tauri.isTauri = false;
    const { container } = render(<UpdatePill />);
    expect(container).toBeEmptyDOMElement();
    expect(tauri.checkForUpdates).not.toHaveBeenCalled();
  });

  it("links to the updates settings when a newer version exists", async () => {
    tauri.checkForUpdates.mockResolvedValue({ available: true, version: "0.1.7", updatable: true });
    render(<UpdatePill />);
    const link = await screen.findByRole("link", { name: /0\.1\.7.*available/i });
    expect(link).toHaveAttribute("href", "/settings?tab=updates");
    expect(link).toHaveTextContent("New version 0.1.7 is out");
  });

  it("copes with a version-less update", async () => {
    tauri.checkForUpdates.mockResolvedValue({ available: true, updatable: true });
    render(<UpdatePill />);
    expect(await screen.findByRole("link")).toHaveTextContent("New version is out");
  });

  it("stays hidden when up to date, on mobile shells, and when the check fails", async () => {
    tauri.checkForUpdates.mockResolvedValueOnce({ available: false, updatable: true });
    const first = render(<UpdatePill />);
    await waitFor(() => expect(tauri.checkForUpdates).toHaveBeenCalledTimes(1));
    expect(first.container).toBeEmptyDOMElement();
    first.unmount();

    tauri.checkForUpdates.mockResolvedValueOnce({ available: true, version: "0.1.7", channel: "android", updatable: false });
    const second = render(<UpdatePill />);
    await waitFor(() => expect(tauri.checkForUpdates).toHaveBeenCalledTimes(2));
    expect(second.container).toBeEmptyDOMElement();
    second.unmount();

    tauri.checkForUpdates.mockRejectedValueOnce(new Error("offline"));
    const third = render(<UpdatePill />);
    await waitFor(() => expect(tauri.checkForUpdates).toHaveBeenCalledTimes(3));
    expect(third.container).toBeEmptyDOMElement();
  });

  it("never checks, and stays hidden, for a Microsoft Store install", async () => {
    tauri.getInstallChannel.mockResolvedValue("store");
    tauri.checkForUpdates.mockResolvedValue({ available: true, version: "9.9.9", updatable: true });
    const { container, unmount } = render(<UpdatePill />);
    await waitFor(() => expect(tauri.getInstallChannel).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(tauri.checkForUpdates).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
    unmount();
  });

  it("does not start checking if it unmounts before the channel is known", async () => {
    let resolveChannel: (c: string) => void = () => {};
    tauri.getInstallChannel.mockReturnValue(new Promise((r) => (resolveChannel = r)));
    const { unmount } = render(<UpdatePill />);
    unmount();
    resolveChannel("direct");
    await Promise.resolve();
    await Promise.resolve();
    expect(tauri.checkForUpdates).not.toHaveBeenCalled();
  });
});
