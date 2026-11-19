import { describe, it, expect, beforeEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  getQuota: vi.fn(),
  setQueryData: vi.fn(),
  cached: null as unknown,
}));
vi.mock("@/lib/api", () => ({ getQuota: h.getQuota }));
vi.mock("@/lib/query-client", () => ({ queryClient: { setQueryData: h.setQueryData } }));
vi.mock("@/store/quota", () => ({ getQuotaData: () => h.cached }));

import { freshQuota, relayFitsNow } from "@/lib/relay-gate";

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
