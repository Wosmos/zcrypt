import { describe, it, expect } from "vitest";
import type { QuotaInfo } from "@/types";
import { lowestWindow, relayFits, transferAllowance, webTransferUsage } from "@/lib/web-transfer-usage";

const base: QuotaInfo = {
  used_bytes: 0,
  quota_bytes: 0,
  has_personal_key: true,
  is_unlimited: true,
  plan: "free",
  max_concurrent_uploads: 0,
  max_file_size: 0,
  can_upload: true,
  allows_byob: true,
};

describe("webTransferUsage", () => {
  it("is hidden without a quota or a limit (admins, or no limit on the server)", () => {
    expect(webTransferUsage(null)).toBeNull();
    expect(webTransferUsage(undefined)).toBeNull();
    expect(webTransferUsage(base)).toBeNull();
    expect(webTransferUsage({ ...base, relay_limit_bytes: 0, relay_used_bytes: 5 })).toBeNull();
  });

  it("reports what is used of the allowance and when it resets", () => {
    expect(
      webTransferUsage({
        ...base,
        relay_used_bytes: 250,
        relay_limit_bytes: 1000,
        relay_resets_at: "2026-12-01T00:00:00Z",
      }),
    ).toEqual({
      used: 250,
      limit: 1000,
      reserved: 0,
      remaining: 750,
      percent: 25,
      nearlyUsed: false,
      low: false,
      usedUp: false,
      resetsAt: "2026-12-01T00:00:00Z",
    });
  });

  it("treats a missing used figure as nothing used", () => {
    expect(webTransferUsage({ ...base, relay_limit_bytes: 1000 })).toMatchObject({ used: 0, percent: 0 });
  });

  it("warns from 90% and caps the meter at 100%", () => {
    expect(webTransferUsage({ ...base, relay_used_bytes: 900, relay_limit_bytes: 1000 })?.nearlyUsed).toBe(true);
    expect(webTransferUsage({ ...base, relay_used_bytes: 5000, relay_limit_bytes: 1000 })).toMatchObject({
      percent: 100,
      nearlyUsed: true,
      usedUp: true,
    });
  });

  it("calls the allowance used up once it is all gone, never more than all of it", () => {
    expect(webTransferUsage({ ...base, relay_used_bytes: 999, relay_limit_bytes: 1000 })?.usedUp).toBe(false);
    expect(webTransferUsage({ ...base, relay_used_bytes: 1000, relay_limit_bytes: 1000 })?.usedUp).toBe(true);
  });
});

describe("transferAllowance", () => {
  const q: QuotaInfo = {
    ...base,
    relay_day_used_bytes: 400,
    relay_day_limit_bytes: 1000,
    relay_day_resets_at: "2026-11-20T00:00:00Z",
    relay_used_bytes: 100,
    relay_limit_bytes: 5000,
    relay_resets_at: "2026-12-01T00:00:00Z",
    relay_reserved_bytes: 100,
    relay_max_file_bytes: 800,
  };

  it("builds the daily and monthly meters with reserved bytes counted in both", () => {
    const a = transferAllowance(q);
    expect(a?.daily).toMatchObject({ used: 400, reserved: 100, remaining: 500, percent: 50 });
    expect(a?.monthly).toMatchObject({ used: 100, reserved: 100, remaining: 4800 });
    expect(a?.reserved).toBe(100);
    expect(a?.maxFileBytes).toBe(800);
  });

  it("takes the smaller remainder of the two windows", () => {
    expect(transferAllowance(q)?.remaining).toBe(500);
    expect(transferAllowance({ ...q, relay_used_bytes: 4800 })?.remaining).toBe(100);
  });

  it("skips a window with no cap and is null with no limits at all", () => {
    const a = transferAllowance({ ...q, relay_day_limit_bytes: 0 });
    expect(a?.daily).toBeNull();
    expect(a?.remaining).toBe(4800);
    expect(transferAllowance(base)).toBeNull();
  });

  it("never reports a negative remainder", () => {
    expect(transferAllowance({ ...q, relay_day_used_bytes: 5000 })?.daily?.remaining).toBe(0);
  });
});

describe("relayFits", () => {
  const q: QuotaInfo = {
    ...base,
    relay_day_used_bytes: 400,
    relay_day_limit_bytes: 1000,
    relay_used_bytes: 0,
    relay_limit_bytes: 100000,
    relay_max_file_bytes: 800,
  };

  it("fits when the rest of the transfer is within what is left", () => {
    expect(relayFits(q, 600)).toBe(true);
    expect(relayFits(q, 601)).toBe(false);
  });

  it("is limited by the daily window even when the monthly one has room", () => {
    expect(relayFits({ ...q, relay_day_used_bytes: 950 }, 100)).toBe(false);
  });

  it("is limited by the monthly window even when the daily one has room", () => {
    expect(relayFits({ ...q, relay_used_bytes: 99900 }, 200)).toBe(false);
  });

  it("counts reserved bytes against what is left", () => {
    expect(relayFits({ ...q, relay_reserved_bytes: 300 }, 400)).toBe(false);
  });

  it("refuses a file over the per-file cap however much allowance is left", () => {
    expect(relayFits({ ...q, relay_day_limit_bytes: 0 }, 100, 900)).toBe(false);
  });

  it("says yes with no limits or no quota, and leaves it to the server", () => {
    expect(relayFits(base, 1e15)).toBe(true);
    expect(relayFits(null, 1e15)).toBe(true);
  });
});

describe("lowestWindow", () => {
  it("is null while both windows have at least a tenth left", () => {
    expect(
      lowestWindow({ ...base, relay_used_bytes: 800, relay_limit_bytes: 1000 }),
    ).toBeNull();
  });

  it("returns the window with the least left once either is under a tenth", () => {
    const w = lowestWindow({
      ...base,
      relay_used_bytes: 100,
      relay_limit_bytes: 1000,
      relay_day_used_bytes: 950,
      relay_day_limit_bytes: 1000,
      relay_day_resets_at: "2026-11-20T00:00:00Z",
    });
    expect(w?.limit).toBe(1000);
    expect(w?.resetsAt).toBe("2026-11-20T00:00:00Z");
  });
});
