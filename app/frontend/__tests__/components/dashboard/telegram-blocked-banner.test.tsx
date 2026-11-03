import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PlatformStatus } from "@/types";

const statuses: { current: PlatformStatus[] } = { current: [] };
const probe = vi.fn();
vi.mock("@/hooks/usePlatformHealth", () => ({
  usePlatformHealth: () => ({ statuses: statuses.current }),
}));
vi.mock("@/lib/telegram-reach", () => ({
  probeTelegram: (force?: boolean) => probe(force),
}));

import { TelegramBlockedBanner } from "@/components/dashboard/telegram-blocked-banner";

const ownTelegram: PlatformStatus = { platform: "telegram", connected: true, is_global: false };

describe("TelegramBlockedBanner", () => {
  beforeEach(() => {
    localStorage.clear();
    probe.mockReset();
  });
  afterEach(cleanup);

  it("warns a user on their own Telegram when the network blocks it", async () => {
    statuses.current = [ownTelegram];
    probe.mockResolvedValue("blocked");
    render(<TelegramBlockedBanner />);
    expect(await screen.findByText("Telegram looks blocked on this network.")).toBeInTheDocument();
  });

  it("stays hidden when Telegram is reachable", async () => {
    statuses.current = [ownTelegram];
    probe.mockResolvedValue("ok");
    render(<TelegramBlockedBanner />);
    await waitFor(() => expect(probe).toHaveBeenCalled());
    expect(screen.queryByText(/blocked on this network/)).not.toBeInTheDocument();
  });

  it("never checks for users on shared storage or other platforms", () => {
    statuses.current = [
      { platform: "telegram", connected: true, is_global: true },
      { platform: "github", connected: true, is_global: false },
    ];
    render(<TelegramBlockedBanner />);
    expect(probe).not.toHaveBeenCalled();
  });

  it("hides after the VPN goes on and the user checks again", async () => {
    statuses.current = [ownTelegram];
    probe.mockResolvedValueOnce("blocked").mockResolvedValueOnce("ok");
    render(<TelegramBlockedBanner />);
    fireEvent.click(await screen.findByRole("button", { name: /Check again/ }));
    await waitFor(() =>
      expect(screen.queryByText(/blocked on this network/)).not.toBeInTheDocument(),
    );
    expect(probe).toHaveBeenLastCalledWith(true);
  });

  it("stays dismissed for a day", async () => {
    statuses.current = [ownTelegram];
    probe.mockResolvedValue("blocked");
    localStorage.setItem("zcrypt:telegram-blocked-banner-dismissed-at", String(Date.now()));
    render(<TelegramBlockedBanner />);
    await waitFor(() => expect(probe).toHaveBeenCalled());
    expect(screen.queryByText(/blocked on this network/)).not.toBeInTheDocument();
  });
});
