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
  listFiles,
  getChanges,
  getAnalyticsSummary,
  getAnalyticsTimeseries,
  getAnalyticsStorageGrowth,
  getAnalyticsFileTypes,
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

  it("still retries a 429 when draining the throttled body fails", async () => {
    vi.useFakeTimers();
    // The body is drained only to free the connection; a torn stream there must
    // not abort the retry that the 429 is specifically telling us to make.
    const undrainable = {
      ...res429("1"),
      arrayBuffer: async () => {
        throw new TypeError("stream closed");
      },
    };
    fetchMock.mockResolvedValueOnce(undrainable).mockResolvedValueOnce(jsonRes({ id: "ok3" }));

    const p = getFolderShareFileMeta("tok", "f1");
    await vi.advanceTimersByTimeAsync(2000);

    await expect(p).resolves.toEqual({ id: "ok3" });
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

describe("listFiles", () => {
  it("GETs the file list with no query params by default", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes([]));
    await listFiles();
    const [url] = fetchMock.mock.calls[0];
    expect(url).not.toContain("?");
  });

  it("follows X-Next-Cursor pages until the last one and concatenates them", async () => {
    const page = (ids: string[], next: string | null) => ({
      ...jsonRes(ids.map((id) => ({ id }))),
      headers: { get: (h: string) => (h === "X-Next-Cursor" ? next : null) },
    });
    fetchMock
      .mockResolvedValueOnce(page(["a", "b"], "c/1+"))
      .mockResolvedValueOnce(page(["c", "d"], "c2"))
      .mockResolvedValueOnce(page(["e"], null));
    const files = await listFiles();
    expect(files.map((f) => f.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toContain("/api/files?cursor=c%2F1%2B");
    expect(fetchMock.mock.calls[2][0]).toContain("/api/files?cursor=c2");
  });

  it("includes the limit param when given and fetches a single page", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes([]));
    await listFiles(8);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("limit=8");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("getChanges", () => {
  it("GETs the delta since the given rev", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ changes: [], cursor: 4 }));
    await expect(getChanges(4)).resolves.toEqual({ changes: [], cursor: 4 });
    expect(fetchMock.mock.calls[0][0]).toContain("/api/changes?since=4");
  });
});

describe("analytics endpoints", () => {
  it("getAnalyticsSummary sends start/end for a bounded range", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ file_count: 1 }));
    await getAnalyticsSummary({ start: "2026-01-01", end: "2026-01-31" });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/analytics/summary?");
    expect(url).toContain("start=2026-01-01");
    expect(url).toContain("end=2026-01-31");
  });

  it("getAnalyticsSummary omits start when it's empty, even for a bounded range", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ file_count: 1 }));
    await getAnalyticsSummary({ start: "", end: "2026-01-31" });
    const [url] = fetchMock.mock.calls[0];
    expect(url).not.toContain("start=");
    expect(url).toContain("end=2026-01-31");
  });

  it("getAnalyticsSummary omits end when it's missing, even for a bounded range", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ file_count: 1 }));
    await getAnalyticsSummary({ start: "2026-01-01" });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("start=2026-01-01");
    expect(url).not.toContain("end=");
  });

  it("getAnalyticsSummary sends range=all and omits start/end for allTime", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ file_count: 1 }));
    await getAnalyticsSummary({ allTime: true });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("range=all");
    expect(url).not.toContain("start=");
    expect(url).not.toContain("end=");
  });

  it("getAnalyticsTimeseries sends start/end/bucket", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ bucket: "day", points: [] }));
    await getAnalyticsTimeseries("2026-01-01", "2026-01-31", "day");
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/analytics/timeseries?");
    expect(url).toContain("start=2026-01-01");
    expect(url).toContain("end=2026-01-31");
    expect(url).toContain("bucket=day");
  });

  it("getAnalyticsStorageGrowth GETs the storage-growth endpoint", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes([]));
    await getAnalyticsStorageGrowth();
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/analytics/storage-growth");
  });

  it("getAnalyticsFileTypes sends start/end for a bounded range", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes([]));
    await getAnalyticsFileTypes({ start: "2026-01-01", end: "2026-01-31" });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/analytics/file-types?");
    expect(url).toContain("start=2026-01-01");
    expect(url).toContain("end=2026-01-31");
  });

  it("getAnalyticsFileTypes sends range=all for allTime", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes([]));
    await getAnalyticsFileTypes({ allTime: true });
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("range=all");
  });
});

describe("admin health API", () => {
  it("adminGetHealthDetails GETs the health/details endpoint", async () => {
    const data = {
      users: [{ user_id: "u1", email: "a@b", username: "alice", degraded_files: 1, damaged_files: 0, stuck_chunks: 2 }],
      totals: { degraded_files: 1, damaged_files: 0, stuck_chunks: 2 },
      sample_files: [],
    };
    fetchMock.mockResolvedValueOnce(jsonRes(data));
    const { adminGetHealthDetails } = await import("@/lib/api");
    const result = await adminGetHealthDetails();
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/admin/health/details");
    expect(result).toEqual(data);
  });

  it("adminRunReconcile GETs the reconcile endpoint without user_id", async () => {
    const data = { total_orphans: 0, total_missing: 5, note: "done" };
    fetchMock.mockResolvedValueOnce(jsonRes(data));
    const { adminRunReconcile } = await import("@/lib/api");
    const result = await adminRunReconcile();
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/admin/reconcile");
    expect(url).not.toContain("user_id");
    expect(result).toEqual(data);
  });

  it("adminRunReconcile includes user_id when provided", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ total_orphans: 0, total_missing: 0, note: "" }));
    const { adminRunReconcile } = await import("@/lib/api");
    await adminRunReconcile("user-abc");
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("user_id=user-abc");
  });
});

describe("send admin API", () => {
  it("adminGetSendStorage GETs the send/storage endpoint", async () => {
    const data = {
      platform_setting: "telegram",
      options: [{ key: "tg:bot1", platform: "telegram", account: "bot1" }],
      active: { platform: "telegram", account: "bot1", repo: "ch1" },
      usage: {
        transfers: 2,
        chunks: 20,
        bytes: 1048576,
        oldest_expires_at: null,
        by_location: [
          {
            platform: "telegram",
            account: "bot1",
            repo: "ch1",
            transfers: 2,
            chunks: 20,
            bytes: 1048576,
          },
        ],
      },
      limits: {
        max_file_bytes: 52428800,
        anon_daily_bytes: 524288000,
        user_daily_bytes: 5368709120,
      },
    };
    fetchMock.mockResolvedValueOnce(jsonRes(data));
    const { adminGetSendStorage } = await import("@/lib/api");
    const result = await adminGetSendStorage();
    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/admin/send/storage");
    expect(result).toEqual(data);
  });

  it("adminSetSendPlatform PUTs to the send/platform endpoint", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ success: true }));
    const { adminSetSendPlatform } = await import("@/lib/api");
    await adminSetSendPlatform("github");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/admin/send/platform");
    expect(init.method).toBe("PUT");
    const body = JSON.parse(init.body as string);
    expect(body.platform).toBe("github");
  });
});

describe("send init error handling", () => {
  it("sendInit throws SendInitError with 429 status and code", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({
        error: "daily send limit reached; log in to send more",
        code: "send_daily_limit",
        login_required: true,
      }),
    });
    const { sendInit } = await import("@/lib/api");
    try {
      await sendInit({
        filename: "test.txt",
        original_size: 100,
        sha256: "hash",
        salt: "salt",
        chunk_count: 1,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect((err as any).status).toBe(429);
      expect((err as any).code).toBe("send_daily_limit");
      expect((err as any).loginRequired).toBe(true);
    }
  });

  it("sendInit preserves error message from response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({
        error: "daily send limit reached; log in to send more",
        code: "send_daily_limit",
        login_required: true,
      }),
    });
    const { sendInit } = await import("@/lib/api");
    try {
      await sendInit({
        filename: "test.txt",
        original_size: 100,
        sha256: "hash",
        salt: "salt",
        chunk_count: 1,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as any).message).toBe(
        "daily send limit reached; log in to send more",
      );
    }
  });

  it("sendInit handles 503 with default message", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({}),
    });
    const { sendInit } = await import("@/lib/api");
    try {
      await sendInit({
        filename: "test.txt",
        original_size: 100,
        sha256: "hash",
        salt: "salt",
        chunk_count: 1,
      });
      expect.fail("should have thrown");
    } catch (err) {
      expect((err as any).message).toBe("Send is temporarily unavailable.");
      expect((err as any).status).toBe(503);
    }
  });
});
