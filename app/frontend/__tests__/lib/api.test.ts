import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// @/lib/api pulls in store/auth, which reads localStorage unguarded at module
// load; this env's global localStorage is non-functional without a stub.
vi.hoisted(() => {
  const backing = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (backing.has(k) ? backing.get(k)! : null),
      setItem: (k: string, v: string) => void backing.set(k, String(v)),
      removeItem: (k: string) => void backing.delete(k),
      clear: () => backing.clear(),
    },
  });
});

import {
  listFolderSubtree,
  updateFolderStyle,
  updateFileStyle,
  bulkPurgeFiles,
  getFolderShareFileMeta,
} from "@/lib/api";

type FetchMock = ReturnType<typeof vi.fn>;
let fetchMock: FetchMock;

function jsonRes(body: unknown, init: { status?: number; ok?: boolean } = {}) {
  const status = init.status ?? 200;
  return {
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    headers: { get: () => null },
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

function res429(retryAfter?: string) {
  return {
    ok: false,
    status: 429,
    headers: { get: (h: string) => (h === "Retry-After" ? (retryAfter ?? null) : null) },
    json: async () => ({}),
    arrayBuffer: async () => new ArrayBuffer(0),
  };
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("api thin request wrappers", () => {
  it("listFolderSubtree GETs the tree endpoint with the encoded root", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes([]));
    await listFolderSubtree("root-1");
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/folders/tree?root=root-1");
  });

  it("updateFolderStyle PATCHes the style endpoint with the encrypted blob", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ success: true }));
    await updateFolderStyle("f1", "ENCSTYLE");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/folders/f1/style");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ encrypted_style: "ENCSTYLE" });
  });

  it("updateFolderStyle sends null to clear the style", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ success: true }));
    await updateFolderStyle("f1", null);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ encrypted_style: null });
  });

  it("updateFileStyle PATCHes the file style endpoint", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ success: true }));
    await updateFileStyle("file-9", "ST");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/files/file-9/style");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ encrypted_style: "ST" });
  });

  it("bulkPurgeFiles POSTs the id list to bulk-purge", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ deleted: 2, failed: 0 }));
    const out = await bulkPurgeFiles(["a", "b"]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/files/bulk-purge");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ ids: ["a", "b"] });
    expect(out).toEqual({ deleted: 2, failed: 0 });
  });
});

describe("shareFetchRetry (via getFolderShareFileMeta)", () => {
  it("returns immediately on a first-try success", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ id: "m1" }));
    await expect(getFolderShareFileMeta("tok", "f1")).resolves.toEqual({ id: "m1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 (honoring Retry-After) then succeeds", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(res429("1")).mockResolvedValueOnce(jsonRes({ id: "ok" }));
    const p = getFolderShareFileMeta("tok", "f1");
    await vi.advanceTimersByTimeAsync(2000); // flush the Retry-After wait
    await expect(p).resolves.toEqual({ id: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a 429 without Retry-After using exponential backoff", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(res429()).mockResolvedValueOnce(jsonRes({ id: "ok2" }));
    const p = getFolderShareFileMeta("tok", "f1");
    await vi.advanceTimersByTimeAsync(9000);
    await expect(p).resolves.toEqual({ id: "ok2" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries a transient network error, then succeeds", async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValueOnce(new TypeError("network down")).mockResolvedValueOnce(jsonRes({ id: "recovered" }));
    const p = getFolderShareFileMeta("tok", "f1");
    await vi.advanceTimersByTimeAsync(5000);
    await expect(p).resolves.toEqual({ id: "recovered" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up and rethrows once network errors exceed the transient cap", async () => {
    vi.useFakeTimers();
    fetchMock.mockRejectedValue(new TypeError("still down"));
    const p = getFolderShareFileMeta("tok", "f1");
    const assertion = expect(p).rejects.toThrow("still down");
    await vi.advanceTimersByTimeAsync(20000); // flush every backoff until it throws
    await assertion;
  });
});
