import { describe, it, expect } from "vitest";
import type { QuotaInfo } from "@/types";
import { webTransferUsage } from "@/lib/web-transfer-usage";

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
      percent: 25,
      nearlyUsed: false,
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
