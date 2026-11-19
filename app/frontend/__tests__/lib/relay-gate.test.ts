import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  getQuota: vi.fn(),
  setQueryData: vi.fn(),
  cached: null as unknown,
}));
vi.mock("@/lib/api", () => ({ getQuota: h.getQuota }));
vi.mock("@/lib/query-client", () => ({ queryClient: { setQueryData: h.setQueryData } }));
vi.mock("@/store/quota", () => ({ getQuotaData: () => h.cached }));

import { freshQuota, relayFitsNow, relayShortfall } from "@/lib/relay-gate";
import { WebTransferLimitCode } from "@/lib/web-transfer-limit";

const quota = {
  relay_day_used_bytes: 400,
  relay_day_limit_bytes: 1000,
  relay_used_bytes: 0,
  relay_limit_bytes: 100000,
};

beforeEach(() => {
  h.getQuota.mockReset();
  h.setQueryData.mockReset();
  h.cached = null;
});

describe("relayFitsNow", () => {
  it("judges on the quota the server has right now, not a stale cached one", async () => {
    h.cached = { ...quota, relay_day_used_bytes: 0 };
    h.getQuota.mockResolvedValue(quota);
    expect(await relayFitsNow(700)).toBe(false);
    expect(await relayFitsNow(600)).toBe(true);
    expect(h.getQuota).toHaveBeenCalledTimes(2);
  });

  it("keeps the fresh quota in the shared cache", async () => {
    h.getQuota.mockResolvedValue(quota);
    await freshQuota();
    expect(h.setQueryData).toHaveBeenCalledWith(["quota"], quota);
  });

  it("falls back to the cached quota when the call fails", async () => {
    h.getQuota.mockRejectedValue(new Error("offline"));
    h.cached = quota;
    expect(await relayFitsNow(700)).toBe(false);
  });

  it("leaves the decision to the server when there is no quota at all", async () => {
    h.getQuota.mockRejectedValue(new Error("offline"));
    expect(await relayFitsNow(1e12)).toBe(true);
  });
});

describe("relayShortfall", () => {
  const windows = {
    ...quota,
    relay_day_resets_at: "2026-11-20T00:00:00Z",
    relay_used_bytes: 99000,
    relay_resets_at: "2026-12-01T00:00:00Z",
  };

  it("names today's window, with what was needed, when today runs short first", async () => {
    h.getQuota.mockResolvedValue(windows);
    const err = await relayShortfall(700);
    expect(err?.code).toBe(WebTransferLimitCode.DailyExceeded);
    expect(err?.info).toEqual({
      limitBytes: 1000,
      usedBytes: 400,
      resetsAt: "2026-11-20T00:00:00Z",
      neededBytes: 700,
    });
  });

  it("names the month when only the month runs short", async () => {
    h.getQuota.mockResolvedValue({ ...windows, relay_used_bytes: 99800 });
    const err = await relayShortfall(500);
    expect(err?.code).toBe(WebTransferLimitCode.AllowanceExceeded);
    expect(err?.info.resetsAt).toBe("2026-12-01T00:00:00Z");
  });

  it("is null when the rest fits both windows", async () => {
    h.getQuota.mockResolvedValue(windows);
    expect(await relayShortfall(600)).toBeNull();
  });

  it("is null for an account with no allowance", async () => {
    h.getQuota.mockResolvedValue({ relay_day_limit_bytes: 0, relay_limit_bytes: 0 });
    expect(await relayShortfall(10 ** 12)).toBeNull();
  });
});
