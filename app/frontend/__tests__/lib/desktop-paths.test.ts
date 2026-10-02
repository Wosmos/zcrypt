import { describe, it, expect, beforeEach, vi } from "vitest";
import { rememberUploadPath, forgetUploadPath, uploadPathFor } from "@/lib/desktop-paths";

describe("desktop-paths", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("remembers a path by file name and forgets it once done", () => {
    rememberUploadPath("/home/me/photos/a.jpg");
    expect(uploadPathFor("a.jpg")).toBe("/home/me/photos/a.jpg");
    forgetUploadPath("/home/me/photos/a.jpg");
    expect(uploadPathFor("a.jpg")).toBeUndefined();
  });

  it("handles Windows paths", () => {
    rememberUploadPath("C:\\Users\\me\\b.mov");
    expect(uploadPathFor("b.mov")).toBe("C:\\Users\\me\\b.mov");
  });

  it("keeps a newer same-named path when an older one finishes", () => {
    rememberUploadPath("/a/x.bin");
    rememberUploadPath("/b/x.bin");
    forgetUploadPath("/a/x.bin");
    expect(uploadPathFor("x.bin")).toBe("/b/x.bin");
  });

  it("ignores paths with no file name", () => {
    rememberUploadPath("/dir/");
    forgetUploadPath("/dir/");
    expect(localStorage.getItem("zcrypt-desktop-upload-paths")).toBeNull();
  });

  it("degrades to no entries when storage is unreadable or blocked", () => {
    localStorage.setItem("zcrypt-desktop-upload-paths", "{not json");
    expect(uploadPathFor("a.jpg")).toBeUndefined();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => rememberUploadPath("/a/c.txt")).not.toThrow();
  });
});
