import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

const quota = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock("@/store/quota", () => ({ useQuotaQuery: () => ({ data: quota.data }) }));

import { useSpaceBatchLimit } from "@/hooks/useSpaceBatchLimit";

describe("useSpaceBatchLimit", () => {
  beforeEach(() => {
    quota.data = undefined;
  });

  it("defaults to 200 files while quota is unknown", () => {
    expect(renderHook(() => useSpaceBatchLimit()).result.current).toBe(200);
  });

  it("defaults to 200 when the plan carries no limit field", () => {
    quota.data = { max_space_batch_files: null };
    expect(renderHook(() => useSpaceBatchLimit()).result.current).toBe(200);
    quota.data = {};
    expect(renderHook(() => useSpaceBatchLimit()).result.current).toBe(200);
  });

  it("treats 0 as unlimited", () => {
    quota.data = { max_space_batch_files: 0 };
    expect(renderHook(() => useSpaceBatchLimit()).result.current).toBe(Infinity);
  });

  it("returns the plan's own limit", () => {
    quota.data = { max_space_batch_files: 50 };
    expect(renderHook(() => useSpaceBatchLimit()).result.current).toBe(50);
  });
});
