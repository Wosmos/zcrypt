import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const nav = vi.hoisted(() => ({ id: "abc" }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: nav.id }) }));

import { useSpaceId } from "@/hooks/useSpaceId";

describe("useSpaceId", () => {
  it("returns the route param", () => {
    expect(renderHook(() => useSpaceId()).result.current).toBe("abc");
  });

  it("falls back to ?id= on the desktop export path", () => {
    nav.id = "_";
    window.history.replaceState(null, "", "/spaces/_?id=xyz");
    expect(renderHook(() => useSpaceId()).result.current).toBe("xyz");
  });
});

describe("useSpaceId on the server", () => {
  it("renders without a URL and cleans up its subscription", async () => {
    const { renderToString } = await import("react-dom/server");
    const { createElement } = await import("react");
    nav.id = "_";
    const Probe = () => createElement("span", null, useSpaceId() || "none");
    expect(renderToString(createElement(Probe))).toContain("none");
    renderHook(() => useSpaceId()).unmount();
  });
});
