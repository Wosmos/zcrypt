import { afterEach, describe, expect, it, vi } from "vitest";

const tauri = vi.hoisted(() => ({ isTauri: false }));
vi.mock("@/lib/tauri", () => tauri);

import { SPACE_EXPORT_ID, resolveSpaceId, spaceHref } from "@/lib/space-routes";

afterEach(() => {
  tauri.isTauri = false;
});

describe("spaceHref", () => {
  it("uses the real id on the web", () => {
    expect(spaceHref("abc")).toBe("/spaces/abc");
    expect(spaceHref("abc", "/settings", "#rotate")).toBe("/spaces/abc/settings#rotate");
  });

  it("uses the single exported path with ?id= in the desktop app", () => {
    tauri.isTauri = true;
    expect(spaceHref("a b", "/add")).toBe(`/spaces/${SPACE_EXPORT_ID}/add?id=a%20b`);
  });
});

describe("resolveSpaceId", () => {
  it("prefers a real route param", () => {
    expect(resolveSpaceId("abc", "?id=zzz")).toBe("abc");
  });

  it("reads ?id= on the export path, or returns empty", () => {
    expect(resolveSpaceId(SPACE_EXPORT_ID, "?id=zzz")).toBe("zzz");
    expect(resolveSpaceId(undefined, "")).toBe("");
  });
});
