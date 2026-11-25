import { describe, expect, it } from "vitest";
import { SPACE_EXPORT_ID, resolveSpaceId, spaceHref } from "@/lib/space-routes";

describe("spaceHref", () => {
  it("points at the one prerendered Space page with the id in ?id=", () => {
    expect(spaceHref("a b", "/add")).toBe(`/spaces/${SPACE_EXPORT_ID}/add?id=a%20b`);
    expect(spaceHref("abc", "/settings", "#rotate")).toBe("/spaces/_/settings?id=abc#rotate");
  });
});

describe("resolveSpaceId", () => {
  it("prefers a real route param", () => {
    expect(resolveSpaceId("abc", "?id=zzz")).toBe("abc");
  });

  it("reads ?id= on the shell path, or returns empty", () => {
    expect(resolveSpaceId(SPACE_EXPORT_ID, "?id=zzz")).toBe("zzz");
    expect(resolveSpaceId(SPACE_EXPORT_ID, "?id=_")).toBe("");
    expect(resolveSpaceId(undefined, "")).toBe("");
  });
});
