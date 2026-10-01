import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const getAppVersion = vi.hoisted(() => vi.fn());
const tauri = vi.hoisted(() => ({ isTauri: false }));
vi.mock("@/lib/tauri", () => ({
  getAppVersion,
  get isTauri() {
    return tauri.isTauri;
  },
}));

import { collectBugContext, downscaleToJpeg, SHOT_MAX_BYTES, SHOT_MAX_DIM } from "@/lib/bug-report";

interface Canvas {
  width: number;
  height: number;
  getContext: ReturnType<typeof vi.fn>;
  toBlob: (cb: (b: Blob | null) => void, type: string, q: number) => void;
}

let canvas: Canvas;
let ctx: { fillStyle: string; fillRect: ReturnType<typeof vi.fn>; drawImage: ReturnType<typeof vi.fn> };
let close: ReturnType<typeof vi.fn>;
let blobs: Array<Blob | null>;

beforeEach(() => {
  close = vi.fn();
  ctx = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
  blobs = [new Blob(["jpeg"], { type: "image/jpeg" })];
  canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ctx),
    toBlob: (cb) => cb(blobs.shift() ?? null),
  };
  vi.spyOn(document, "createElement").mockReturnValue(canvas as unknown as HTMLCanvasElement);
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 3200, height: 1600, close })));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  tauri.isTauri = false;
});

describe("downscaleToJpeg", () => {
  it("caps the long edge and returns a JPEG data URL", async () => {
    const out = await downscaleToJpeg(new Blob(["png"]));
    expect(out.startsWith("data:image/jpeg;base64,")).toBe(true);
    expect(canvas.width).toBe(SHOT_MAX_DIM);
    expect(canvas.height).toBe(SHOT_MAX_DIM / 2);
    expect(ctx.drawImage).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it("never upscales a small image", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 0, height: 10, close })));
    await downscaleToJpeg(new Blob(["png"]));
    expect(canvas.width).toBe(1);
    expect(canvas.height).toBe(10);
  });

  it("rejects an unreadable image", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn(async () => Promise.reject(new Error("bad"))));
    await expect(downscaleToJpeg(new Blob(["x"]))).rejects.toThrow("not a readable image");
  });

  it("rejects when no 2d context is available", async () => {
    canvas.getContext.mockReturnValue(null);
    await expect(downscaleToJpeg(new Blob(["x"]))).rejects.toThrow("unavailable");
    expect(close).toHaveBeenCalled();
  });

  it("retries at lower quality when the first encode is too large", async () => {
    const big = { size: SHOT_MAX_BYTES + 1 } as Blob;
    blobs = [big, new Blob(["ok"], { type: "image/jpeg" })];
    await expect(downscaleToJpeg(new Blob(["x"]))).resolves.toContain("base64");
  });

  it("gives up when every quality is too large or encoding fails", async () => {
    const big = { size: SHOT_MAX_BYTES + 1 } as Blob;
    blobs = [big, null, big];
    await expect(downscaleToJpeg(new Blob(["x"]))).rejects.toThrow("too large");
  });

  it("surfaces a FileReader failure", async () => {
    class FailingReader {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() {
        this.onerror?.();
      }
    }
    vi.stubGlobal("FileReader", FailingReader);
    await expect(downscaleToJpeg(new Blob(["x"]))).rejects.toThrow("Could not read");
  });
});

describe("collectBugContext", () => {
  it("uses the Tauri shell version on desktop", async () => {
    tauri.isTauri = true;
    getAppVersion.mockResolvedValue("0.1.6");
    const ctxOut = await collectBugContext("/dashboard");
    expect(ctxOut.app_version).toBe("0.1.6");
    expect(ctxOut.platform.startsWith("desktop")).toBe(true);
    expect(ctxOut.route).toBe("/dashboard");
    expect(ctxOut.user_agent).toBe(navigator.userAgent);
  });

  it("falls back to the build version on the web", async () => {
    getAppVersion.mockResolvedValue(null);
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "0.2.0");
    const out = await collectBugContext("/x".repeat(400));
    expect(out.app_version).toBe("0.2.0");
    expect(out.platform.startsWith("web")).toBe(true);
    expect(out.route.length).toBe(512);
  });

  it("reports unknown when no version is available", async () => {
    getAppVersion.mockRejectedValue(new Error("nope"));
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "");
    expect((await collectBugContext("/")).app_version).toBe("unknown");
  });
});
