import { describe, expect, it } from "vitest";
import { resolveRouteId, shellHref } from "@/lib/route-shell";
import { adminUserHref } from "@/lib/admin-routes";

describe("shellHref", () => {
  it("points at the prerendered shell with the id in ?id=", () => {
    expect(shellHref("/spaces", "a/b", "/add", "#x")).toBe("/spaces/_/add?id=a%2Fb#x");
    expect(adminUserHref("u1")).toBe("/admin/users/_?id=u1");
  });
});

describe("resolveRouteId", () => {
  it("prefers a real param, else ?id=, never the shell id", () => {
    expect(resolveRouteId("abc", "id=zzz")).toBe("abc");
    expect(resolveRouteId("_", "id=zzz")).toBe("zzz");
    expect(resolveRouteId("_", "id=_")).toBe("");
    expect(resolveRouteId(undefined, "")).toBe("");
  });
});
