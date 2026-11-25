import { describe, it, expect, beforeEach, vi } from "vitest";
import type { IncompleteUpload } from "@/lib/api";

const tauriFlag = vi.hoisted(() => ({ isTauri: false }));
vi.mock("@/lib/tauri", () => ({
  get isTauri() {
    return tauriFlag.isTauri;
  },
}));

const known = vi.hoisted(() => new Map<string, string>());
vi.mock("@/lib/file-names", () => ({ peekName: (enc: string) => known.get(enc) }));

import { resolveUploadNames, startedOnThisDevice } from "@/lib/upload-origin";
import { rememberUploadPath } from "@/lib/desktop-paths";

const upload = { session_id: "s1", filename: "a.jpg" } as IncompleteUpload;

describe("startedOnThisDevice", () => {
  beforeEach(() => {
    localStorage.clear();
    tauriFlag.isTauri = false;
    vi.restoreAllMocks();
  });

  it("web: true only when a resume pointer here carries the session id", () => {
    localStorage.setItem("other", "x");
    localStorage.setItem("zc_upl:b.jpg:1:1", JSON.stringify({ sessionId: "s2" }));
    expect(startedOnThisDevice(upload)).toBe(false);
    localStorage.setItem("zc_upl:a.jpg:1:1", JSON.stringify({ sessionId: "s1" }));
    expect(startedOnThisDevice(upload)).toBe(true);
  });

  it("web: hides the upload when storage is unreadable", () => {
    localStorage.setItem("zc_upl:a.jpg:1:1", "{bad");
    expect(startedOnThisDevice(upload)).toBe(false);
  });

  it("desktop: true when this device remembers the source path", () => {
    tauriFlag.isTauri = true;
    expect(startedOnThisDevice(upload)).toBe(false);
    rememberUploadPath("/home/me/a.jpg");
    expect(startedOnThisDevice(upload)).toBe(true);
  });
});

describe("resolveUploadNames", () => {
  const sealed = { session_id: "s3", filename: "", encrypted_name: "ct" } as IncompleteUpload;

  beforeEach(() => known.clear());

  it("fills a sealed session's name from the decrypted name maps", () => {
    known.set("ct", "holiday.mp4");
    expect(resolveUploadNames([sealed], true)[0].filename).toBe("holiday.mp4");
  });

  it("reads as locked while the vault is locked, and blank while still decrypting", () => {
    known.set("ct", "holiday.mp4");
    expect(resolveUploadNames([sealed], false)[0].filename).toBe("[locked]");
    known.clear();
    expect(resolveUploadNames([sealed], true)[0].filename).toBe("");
  });

  it("leaves a legacy plaintext session untouched", () => {
    expect(resolveUploadNames([upload], true)[0]).toBe(upload);
  });
});
