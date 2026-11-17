import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { QuotaInfo } from "@/types";

const h = vi.hoisted(() => ({
  quota: undefined as QuotaInfo | undefined,
  full: vi.fn(),
}));
vi.mock("@/store/quota", () => ({ useQuotaQuery: () => ({ data: h.quota }) }));
vi.mock("@/lib/announce", () => ({ announceStorageFull: h.full }));

import { isStorageFull, useAlertEvents } from "@/hooks/useAlertEvents";

function quota(used: number, cap: number, unlimited = false): QuotaInfo {
  return {
    used_bytes: used,
    quota_bytes: cap,
    is_unlimited: unlimited,
    has_personal_key: false,
    plan: "free",
    max_concurrent_uploads: 2,
    max_file_size: 0,
    can_upload: true,
    allows_byob: true,
  };
}

beforeEach(() => {
  h.quota = undefined;
  h.full.mockClear();
});

describe("isStorageFull", () => {
  it("is true only for a capped account at or over its cap", () => {
    expect(isStorageFull(null)).toBe(false);
    expect(isStorageFull(quota(10, 10, true))).toBe(false);
    expect(isStorageFull(quota(10, 0))).toBe(false);
    expect(isStorageFull(quota(9, 10))).toBe(false);
    expect(isStorageFull(quota(10, 10))).toBe(true);
  });
});

describe("useAlertEvents", () => {
  it("announces storage full only when it fills up while watched", () => {
    h.quota = quota(10, 10);
    const { rerender } = renderHook(() => useAlertEvents());
    expect(h.full).not.toHaveBeenCalled();

    h.quota = quota(5, 10);
    rerender();
    h.quota = quota(10, 10);
    rerender();
    expect(h.full).toHaveBeenCalledTimes(1);

    h.quota = { ...quota(11, 10) };
    rerender();
    expect(h.full).toHaveBeenCalledTimes(1);
  });

  it("waits for the quota to load", () => {
    renderHook(() => useAlertEvents());
    expect(h.full).not.toHaveBeenCalled();
  });
});
