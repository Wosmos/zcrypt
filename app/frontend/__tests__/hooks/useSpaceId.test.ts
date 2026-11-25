import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const nav = vi.hoisted(() => ({ id: "abc", search: "" }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: nav.id }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

import { useSpaceId } from "@/hooks/useSpaceId";

describe("useSpaceId", () => {
  it("returns the route param", () => {
    expect(renderHook(() => useSpaceId()).result.current).toBe("abc");
  });

  it("reads ?id= on the shell path", () => {
    nav.id = "_";
    nav.search = "id=xyz";
    expect(renderHook(() => useSpaceId()).result.current).toBe("xyz");
  });
});
