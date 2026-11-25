import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

const h = vi.hoisted(() => ({
  quota: undefined as unknown,
  statuses: [] as unknown[],
}));
vi.mock("@/store/quota", () => ({ useQuotaQuery: () => ({ data: h.quota }) }));
vi.mock("@/hooks/usePlatformHealth", () => ({
  usePlatformHealth: () => ({ statuses: h.statuses }),
}));

import { WebTransfers } from "@/components/settings/web-transfers";

const GIB = 1024 ** 3;
const base = {
  used_bytes: 0,
  quota_bytes: 0,
  has_personal_key: true,
  is_unlimited: false,
  plan: "free",
  max_concurrent_uploads: 3,
  max_file_size: 0,
  can_upload: true,
  allows_byob: true,
};

beforeEach(() => {
  h.statuses = [];
});
afterEach(cleanup);

describe("Usage & limits", () => {
  it("explains storage, the allowance, what counts and the blocked-Telegram pause", () => {
    h.quota = base;
    render(<WebTransfers />);
    expect(screen.getByText("Usage & limits")).toBeInTheDocument();
    expect(screen.getByText(/zcrypt doesn't cap them/)).toBeInTheDocument();
    expect(screen.getByText(/Storage isn't capped, but what passes through our server is/)).toBeInTheDocument();
    expect(screen.getByText(/People downloading your share links/)).toBeInTheDocument();
    expect(screen.getByText(/free on every app/)).toBeInTheDocument();
    expect(screen.getByText(/turn on a VPN, then continues by itself/)).toBeInTheDocument();
    expect(screen.queryByText(/desktop app has no limit/i)).toBeNull();
  });

  it("says there are no limits when the account has none", () => {
    h.quota = base;
    render(<WebTransfers />);
    expect(screen.getByText("No limits on this account.")).toBeInTheDocument();
    expect(screen.queryByRole("meter", { name: "Today" })).toBeNull();
  });

  it("shows the daily and monthly meters, reset times, per-file cap, reserved and remaining", () => {
    h.quota = {
      ...base,
      relay_day_used_bytes: 1 * GIB,
      relay_day_limit_bytes: 5 * GIB,
      relay_day_resets_at: "2026-11-20T00:00:00Z",
      relay_used_bytes: 10 * GIB,
      relay_limit_bytes: 20 * GIB,
      relay_resets_at: "2026-12-01T00:00:00Z",
      relay_reserved_bytes: 1 * GIB,
      relay_max_file_bytes: 2 * GIB,
    };
    render(<WebTransfers />);
    expect(screen.getByRole("meter", { name: "Today" })).toHaveAttribute("aria-valuenow", "40");
    expect(screen.getByRole("meter", { name: "This month" })).toHaveAttribute("aria-valuenow", "55");
    expect(screen.getByText("2 GB of 5 GB")).toBeInTheDocument();
    expect(screen.getByText("Resets at 12:00 AM UTC")).toBeInTheDocument();
    expect(screen.getByText("Resets on December 1")).toBeInTheDocument();
    const facts = screen.getByText("Biggest file through our server").closest("dl") as HTMLElement;
    expect(within(facts).getByText("2 GB")).toBeInTheDocument();
    expect(within(facts).getByText("Held for uploads in progress").nextSibling).toHaveTextContent("1 GB");
    expect(within(facts).getByText("Left right now").nextSibling).toHaveTextContent("3 GB");
  });

  it("shows the shared storage meter only for someone using zcrypt's shared storage", () => {
    h.quota = { ...base, used_bytes: 1 * GIB, quota_bytes: 4 * GIB };
    const { unmount } = render(<WebTransfers />);
    expect(screen.queryByRole("meter", { name: "zcrypt shared storage" })).toBeNull();
    unmount();
    h.statuses = [{ platform: "github", connected: true, is_global: true }];
    render(<WebTransfers />);
    expect(screen.getByRole("meter", { name: "zcrypt shared storage" })).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByText("1 GB of 4 GB")).toBeInTheDocument();
  });
});
