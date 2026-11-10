import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  getFileThumbs: vi.fn(),
  getFileMetas: vi.fn(),
  getFileMeta: vi.fn(),
  putFileThumb: vi.fn(),
  resolveFileKey: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  getFileThumbs: m.getFileThumbs,
  getFileMetas: m.getFileMetas,
  getFileMeta: m.getFileMeta,
  putFileThumb: m.putFileThumb,
}));
vi.mock("@/lib/crypto", async (orig) => ({
  ...(await orig<typeof import("@/lib/crypto")>()),
  resolveFileKey: m.resolveFileKey,
}));
vi.mock("@/lib/decrypt-cache", () => ({
  cachedResolveCEK: (_id: string, _folder: string | null, resolve: () => Promise<ArrayBuffer>) => resolve(),
}));

const key = crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer;
const meta = (id: string) => ({ id, salt: "AAAA", wrapped_cek: "mk1:x" });

async function load() {
  vi.resetModules();
  return import("@/lib/server-thumbs");
}

async function sealedB64(webp: Uint8Array) {
  const { sealThumb } = await import("@/lib/thumb-seal");
  const { toBase64 } = await import("@/lib/crypto");
  return toBase64((await sealThumb(key, webp))!);
}

describe("server-thumbs", () => {
  beforeEach(() => {
    for (const fn of Object.values(m)) fn.mockReset();
    m.resolveFileKey.mockResolvedValue(key);
  });

  it("asks for many previews in one request and opens them with each file's key", async () => {
    const mod = await load();
    const webp = new Uint8Array([1, 2, 3]);
    m.getFileThumbs.mockResolvedValue({ a: await sealedB64(webp) });
    m.getFileMetas.mockResolvedValue([meta("a"), meta("ghost")]);
    const [a, b] = await Promise.all([
      mod.loadServerThumb("a", null, "pw"),
      mod.loadServerThumb("b", "folder", "pw"),
    ]);
    const again = mod.loadServerThumb("a", null, "pw");
    expect(m.getFileThumbs).toHaveBeenCalledTimes(1);
    expect(m.getFileThumbs).toHaveBeenCalledWith(["a", "b"]);
    expect(m.getFileMetas).toHaveBeenCalledWith(["a"]);
    expect(a).toBe((await import("@/lib/thumb-seal")).bytesToDataUrl(webp));
    expect(b).toBeNull();
    m.getFileThumbs.mockResolvedValue({});
    expect(await again).toBeNull();
    expect(m.getFileMetas).toHaveBeenCalledTimes(1);
  });

  it("joins callers asking for the same file, and splits big batches", async () => {
    const mod = await load();
    m.getFileThumbs.mockResolvedValue({});
    const ids = Array.from({ length: 250 }, (_, i) => `f${i}`);
    const results = await Promise.all([...ids, "f0"].map((id) => mod.loadServerThumb(id, null, "pw")));
    expect(results.every((r) => r === null)).toBe(true);
    expect(m.getFileThumbs).toHaveBeenCalledTimes(2);
    expect(m.getFileThumbs.mock.calls[0][0]).toHaveLength(200);
    expect(m.getFileThumbs.mock.calls[1][0]).toHaveLength(50);
  });

  it("returns null when a preview can't be opened", async () => {
    const mod = await load();
    m.getFileThumbs.mockResolvedValue({ a: await sealedB64(new Uint8Array([1])) });
    m.getFileMetas.mockResolvedValue([meta("a")]);
    m.resolveFileKey.mockResolvedValue(crypto.getRandomValues(new Uint8Array(32)).buffer);
    expect(await mod.loadServerThumb("a", null, "pw")).toBeNull();
  });

  it("stops asking a server that has no preview routes", async () => {
    const mod = await load();
    m.getFileThumbs.mockRejectedValue(Object.assign(new Error("not found"), { status: 404 }));
    expect(await mod.loadServerThumb("a", null, "pw")).toBeNull();
    expect(await mod.loadServerThumb("b", null, "pw")).toBeNull();
    expect(m.getFileThumbs).toHaveBeenCalledTimes(1);
    expect(await mod.publishThumb("a", null, "data:image/webp;base64,AQID", "pw")).toBe(false);
    expect(m.getFileMeta).not.toHaveBeenCalled();
  });

  it("keeps asking after a passing failure", async () => {
    const mod = await load();
    m.getFileThumbs.mockRejectedValueOnce(new Error("offline")).mockResolvedValue({});
    expect(await mod.loadServerThumb("a", null, "pw")).toBeNull();
    expect(await mod.loadServerThumb("a", null, "pw")).toBeNull();
    expect(m.getFileThumbs).toHaveBeenCalledTimes(2);
  });

  it("seals a preview made here with the file key and stores it", async () => {
    const mod = await load();
    m.getFileMeta.mockResolvedValue(meta("a"));
    m.putFileThumb.mockResolvedValue(undefined);
    expect(await mod.publishThumb("a", "folder", "data:image/webp;base64,AQID", "pw")).toBe(true);
    const [id, sealed] = m.putFileThumb.mock.calls[0];
    expect(id).toBe("a");
    const { openThumb } = await import("@/lib/thumb-seal");
    expect(await openThumb(key, sealed)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("stores nothing that isn't a WebP preview, too large, or refused", async () => {
    const mod = await load();
    m.getFileMeta.mockResolvedValue(meta("a"));
    expect(await mod.publishThumb("a", null, "data:image/png;base64,AQID", "pw")).toBe(false);
    const big = `data:image/webp;base64,${btoa("x".repeat(70_000))}`;
    expect(await mod.publishThumb("a", null, big, "pw")).toBe(false);
    m.putFileThumb.mockRejectedValueOnce(Object.assign(new Error("forbidden"), { status: 403 }));
    expect(await mod.publishThumb("a", null, "data:image/webp;base64,AQID", "pw")).toBe(false);
    m.putFileThumb.mockResolvedValue(undefined);
    expect(await mod.publishThumb("a", null, "data:image/webp;base64,AQID", "pw")).toBe(true);
    m.putFileThumb.mockRejectedValueOnce(Object.assign(new Error("gone"), { status: 405 }));
    expect(await mod.publishThumb("a", null, "data:image/webp;base64,AQID", "pw")).toBe(false);
    expect(await mod.publishThumb("a", null, "data:image/webp;base64,AQID", "pw")).toBe(false);
  });
});
