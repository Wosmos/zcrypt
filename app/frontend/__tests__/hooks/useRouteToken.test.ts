import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const nav = vi.hoisted(() => ({ token: "_", search: "id=real-token" }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ token: nav.token }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));

import { useRouteToken } from "@/hooks/useRouteToken";

describe("useRouteToken", () => {
  it("reads ?id= on the prerendered shell page", () => {
    expect(renderHook(() => useRouteToken()).result.current).toBe("real-token");
  });

  it("prefers a token in the path", () => {
    nav.token = "path-token";
    expect(renderHook(() => useRouteToken()).result.current).toBe("path-token");
  });
});
