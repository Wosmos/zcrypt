import { describe, it, expect, beforeEach, vi } from "vitest";

// Coverage for the api client's raw-fetch surface (public share / anonymous send
// / pad / clipboard content / plans) which bypasses the request() core, plus the
// optional-parameter and error branches the endpoint sweep doesn't reach.
const { getState } = vi.hoisted(() => ({ getState: vi.fn(() => ({ accessToken: "t" as string | null })) }));
vi.mock("@/store/auth", () => ({ useAuthStore: { getState } }));
vi.mock("@/lib/auth-fetch", () => ({ tryRefreshToken: vi.fn() }));

import * as api from "@/lib/api";

/** Response stand-in. jsonThrows simulates a non-JSON error body. */
function mk(
  status: number,
  opts: { json?: unknown; bytes?: ArrayBuffer; hdr?: Record<string, string>; jsonThrows?: boolean } = {}
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (opts.jsonThrows) throw new Error("not json");
      return opts.json ?? {};
    },
    text: async () => (typeof opts.json === "string" ? (opts.json as string) : JSON.stringify(opts.json ?? {})),
    arrayBuffer: async () => opts.bytes ?? new ArrayBuffer(4),
    headers: { get: (k: string) => (opts.hdr ?? {})[k] ?? null },
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  getState.mockReturnValue({ accessToken: "t" });
  fetchMock = vi.fn().mockResolvedValue(mk(200, {}));
  vi.stubGlobal("fetch", fetchMock);
});

function init(n = 0) {
  return (fetchMock.mock.calls[n][1] ?? {}) as RequestInit & { headers?: Record<string, string> };
}
function url(n = 0) {
  return String(fetchMock.mock.calls[n][0]);
}

describe("public share access", () => {
  it("getShareInfo returns json and throws a fixed message on failure", async () => {
    fetchMock.mockResolvedValueOnce(mk(200, { json: { id: "s1" } }));
    expect(await api.getShareInfo("tok")).toEqual({ id: "s1" });
    expect(url()).toContain("/api/share/tok");

    fetchMock.mockResolvedValueOnce(mk(404, {}));
    await expect(api.getShareInfo("tok")).rejects.toThrow("Share not found");
  });

  it("getShareFileMeta sends the password header only when given, and parses errors", async () => {
    fetchMock.mockResolvedValueOnce(mk(200, { json: { id: "f" } }));
    await api.getShareFileMeta("tok", "secret");
    expect(init().headers!["X-Share-Password"]).toBe("secret");

    fetchMock.mockResolvedValueOnce(mk(200, { json: { id: "f" } }));
    await api.getShareFileMeta("tok");
    expect(init(1).headers!["X-Share-Password"]).toBeUndefined();

    fetchMock.mockResolvedValueOnce(mk(403, { json: { error: "bad password" } }));
    await expect(api.getShareFileMeta("tok")).rejects.toThrow("bad password");
  });

  it("getShareChunk returns bytes + parsed headers (with optional password)", async () => {
    fetchMock.mockResolvedValueOnce(
      mk(200, { bytes: new Uint8Array([9, 9]).buffer, hdr: { "X-Chunk-SHA256": "h", "X-Chunk-Compressed": "true" } })
    );
    const out = await api.getShareChunk("tok", 3, "pw");
    expect(init().headers!["X-Share-Password"]).toBe("pw");
    expect(new Uint8Array(out.data)).toEqual(new Uint8Array([9, 9]));
    expect(out.sha256).toBe("h");
    expect(out.compressed).toBe(true);

    fetchMock.mockResolvedValueOnce(mk(500, {}));
    await expect(api.getShareChunk("tok", 3)).rejects.toThrow("Failed to download chunk");
  });
});

describe("anonymous send", () => {
  it("sendInit posts and parses error bodies", async () => {
    fetchMock.mockResolvedValueOnce(mk(200, { json: { session_id: "s" } }));
    await api.sendInit({} as never);
    expect(url()).toContain("/api/send/init");
    expect(init().method).toBe("POST");

    fetchMock.mockResolvedValueOnce(mk(400, { json: { error: "too big" } }));
    await expect(api.sendInit({} as never)).rejects.toThrow("too big");
  });

  it("sendChunkUpload sets the compressed header only when compressed", async () => {
    fetchMock.mockResolvedValueOnce(mk(200, {}));
    await api.sendChunkUpload("s", 0, new Uint8Array([1]), "sha", true);
    expect(init().method).toBe("PUT");
    expect(init().headers!["X-Chunk-Compressed"]).toBe("true");
    expect(init().headers!["X-Chunk-SHA256"]).toBe("sha");

    fetchMock.mockResolvedValueOnce(mk(200, {}));
    await api.sendChunkUpload("s", 1, new Uint8Array([1]), "sha", false);
    expect(init(1).headers!["X-Chunk-Compressed"]).toBeUndefined();

    fetchMock.mockResolvedValueOnce(mk(413, { json: { error: "chunk too large" } }));
    await expect(api.sendChunkUpload("s", 2, new Uint8Array([1]), "sha", false)).rejects.toThrow("chunk too large");
  });

  it("sendComplete returns the token; getSendInfo/Meta/Chunk read the transfer", async () => {
    fetchMock.mockResolvedValueOnce(mk(200, { json: { token: "T" } }));
    expect(await api.sendComplete("s")).toEqual({ token: "T" });

    fetchMock.mockResolvedValueOnce(mk(404, {}));
    await expect(api.getSendInfo("T")).rejects.toThrow("Transfer not found");

    // Error body that isn't valid JSON exercises the .catch(() => ({})) fallback.
    fetchMock.mockResolvedValueOnce(mk(500, { jsonThrows: true }));
    await expect(api.getSendMeta("T")).rejects.toThrow("Failed to get transfer metadata");

    fetchMock.mockResolvedValueOnce(mk(200, { bytes: new Uint8Array([7]).buffer, hdr: { "X-Chunk-SHA256": "z" } }));
    const chunk = await api.getSendChunk("T", 0);
    expect(chunk.sha256).toBe("z");
    expect(chunk.compressed).toBe(false);
  });

  it("sendComplete surfaces the error body on failure", async () => {
    fetchMock.mockResolvedValueOnce(mk(409, { json: { error: "already completed" } }));
    await expect(api.sendComplete("s")).rejects.toThrow("already completed");
  });

  it("getSendInfo / getSendMeta return the parsed body on success", async () => {
    fetchMock.mockResolvedValueOnce(mk(200, { json: { token: "T", file_count: 2 } }));
    expect(await api.getSendInfo("T")).toEqual({ token: "T", file_count: 2 });

    fetchMock.mockResolvedValueOnce(mk(200, { json: { name: "bundle.zip" } }));
    expect(await api.getSendMeta("T")).toEqual({ name: "bundle.zip" });
  });
});

describe("pad + clipboard + plans", () => {
  it("createPad posts and getPadInfo/Content read it", async () => {
    fetchMock.mockResolvedValueOnce(mk(200, { json: { token: "P" } }));
    expect(await api.createPad({} as never)).toEqual({ token: "P" });

    fetchMock.mockResolvedValueOnce(mk(404, {}));
    await expect(api.getPadInfo("P")).rejects.toThrow("Pad not found");

    fetchMock.mockResolvedValueOnce(mk(200, { bytes: new Uint8Array([1, 2, 3]).buffer }));
    expect(new Uint8Array(await api.getPadContent("P"))).toEqual(new Uint8Array([1, 2, 3]));

    fetchMock.mockResolvedValueOnce(mk(410, { json: { error: "expired" } }));
    await expect(api.getPadContent("P")).rejects.toThrow("expired");
  });

  it("createPad surfaces the error body; getPadInfo returns the parsed body on success", async () => {
    fetchMock.mockResolvedValueOnce(mk(400, { json: { error: "content too large" } }));
    await expect(api.createPad({} as never)).rejects.toThrow("content too large");

    fetchMock.mockResolvedValueOnce(mk(200, { json: { token: "P", has_password: false } }));
    expect(await api.getPadInfo("P")).toEqual({ token: "P", has_password: false });
  });

  it("getClipboardContent attaches the bearer token and returns bytes", async () => {
    fetchMock.mockResolvedValueOnce(mk(200, { bytes: new Uint8Array([5]).buffer, hdr: { "X-Content-Type": "text/plain" } }));
    const out = await api.getClipboardContent("cid");
    expect(init().headers!["Authorization"]).toBe("Bearer t");
    expect(new Uint8Array(out.data)).toEqual(new Uint8Array([5]));
    expect(out.contentType).toBe("text/plain");

    fetchMock.mockResolvedValueOnce(mk(404, {}));
    await expect(api.getClipboardContent("cid")).rejects.toThrow("Failed to get clipboard content");
  });

  it("getPlans fetches the public plans and throws on failure", async () => {
    fetchMock.mockResolvedValueOnce(mk(200, { json: { free: {} } }));
    expect(await api.getPlans()).toEqual({ free: {} });
    expect(url()).toContain("/api/plans");

    fetchMock.mockResolvedValueOnce(mk(503, {}));
    await expect(api.getPlans()).rejects.toThrow("Failed to fetch plans");
  });
});

describe("error-fallback + remaining branches", () => {
  it("getSendChunk throws a fixed message on a non-OK response", async () => {
    fetchMock.mockResolvedValueOnce(mk(500, {}));
    await expect(api.getSendChunk("T", 0)).rejects.toThrow("Failed to download chunk");
  });

  it("uses the hardcoded fallback message when an error body isn't JSON", async () => {
    // Each of these hits the `body.error || "<default>"` fallback (json rejects).
    fetchMock.mockResolvedValueOnce(mk(500, { jsonThrows: true }));
    await expect(api.sendComplete("s")).rejects.toThrow("Failed to complete send");

    fetchMock.mockResolvedValueOnce(mk(500, { jsonThrows: true }));
    await expect(api.createPad({} as never)).rejects.toThrow("Failed to create pad");

    fetchMock.mockResolvedValueOnce(mk(500, { jsonThrows: true }));
    await expect(api.getPadContent("P")).rejects.toThrow("Failed to get pad content");

    fetchMock.mockResolvedValueOnce(mk(500, { jsonThrows: true }));
    await expect(api.getShareFileMeta("t")).rejects.toThrow("Failed to get file metadata");

    fetchMock.mockResolvedValueOnce(mk(500, { jsonThrows: true }));
    await expect(api.sendInit({} as never)).rejects.toThrow("Failed to start send");

    fetchMock.mockResolvedValueOnce(mk(500, { jsonThrows: true }));
    await expect(api.sendChunkUpload("s", 0, new Uint8Array([1]), "sha", false)).rejects.toThrow("Failed to upload chunk");
  });

  it("getClipboardContent works without a token and defaults contentType to 'text'", async () => {
    getState.mockReturnValue({ accessToken: null }); // no-token branch
    fetchMock.mockResolvedValueOnce(mk(200, { bytes: new Uint8Array([1]).buffer })); // no X-Content-Type header
    const out = await api.getClipboardContent("cid");
    expect(init().headers!["Authorization"]).toBeUndefined();
    expect(out.contentType).toBe("text");
  });

  it("getShareChunk / getSendChunk default sha256 to '' when the header is absent", async () => {
    fetchMock.mockResolvedValueOnce(mk(200, { bytes: new Uint8Array([1]).buffer })); // no headers
    expect((await api.getShareChunk("t", 0)).sha256).toBe("");

    fetchMock.mockResolvedValueOnce(mk(200, { bytes: new Uint8Array([1]).buffer })); // no headers
    expect((await api.getSendChunk("t", 0)).sha256).toBe("");
  });

  it("request() falls back to the raw body when the error JSON has no .error field", async () => {
    // Valid JSON, but no `error` key -> `parsed.error || body` takes the body side.
    fetchMock.mockResolvedValueOnce(mk(400, { json: { message: "nope" } }));
    await expect(api.getConfig()).rejects.toThrow('{"message":"nope"}');
  });

  it("getFileChunk works without a token and falls back to the raw error body", async () => {
    getState.mockReturnValue({ accessToken: null }); // no-token branch (line 172)
    fetchMock.mockResolvedValueOnce(mk(200, { bytes: new Uint8Array([1]).buffer }));
    const out = await api.getFileChunk("f", 0);
    expect(init().headers ? (init().headers as Record<string, string>)["Authorization"] : undefined).toBeUndefined();
    expect(new Uint8Array(out.data)).toEqual(new Uint8Array([1]));

    // Error JSON without an `error` field -> raw-body fallback (line 183).
    fetchMock.mockResolvedValueOnce(mk(404, { json: { message: "gone" } }));
    await expect(api.getFileChunk("f", 1)).rejects.toThrow('{"message":"gone"}');
  });

  it("listFiles (no filter) and listFolders (with parentId) hit both optional-param sides", async () => {
    fetchMock.mockResolvedValueOnce(mk(200, { json: [] }));
    await api.listFiles(); // false side of the filter ternary (line 198)
    expect(url()).toContain("/api/files");
    expect(url()).not.toContain("?filter=");

    fetchMock.mockResolvedValueOnce(mk(200, { json: [] }));
    await api.listFolders("parent-1"); // true side of the parentId ternary (line 221)
    expect(url(1)).toContain("/api/folders"); // second fetch of this test
  });
});

describe("optional-parameter + error branches", () => {
  it("listShares includes ?file_id only when a fileId is given", async () => {
    fetchMock.mockResolvedValueOnce(mk(200, { json: [] }));
    await api.listShares("f9");
    expect(url()).toContain("/api/shares?file_id=f9");
  });

  it("listOfflinePins includes ?device_id only when given", async () => {
    fetchMock.mockResolvedValueOnce(mk(200, { json: [] }));
    await api.listOfflinePins("dev1");
    expect(url()).toContain("device_id=dev1");
  });

  it("unpinFileOffline appends the device query when given", async () => {
    fetchMock.mockResolvedValueOnce(mk(200, { json: { success: true } }));
    await api.unpinFileOffline("f", "dev1");
    expect(url()).toContain("/api/offline/f?device_id=dev1");
    expect(init().method).toBe("DELETE");
  });

  it("adminGetAuditLog builds a query from all provided filters", async () => {
    fetchMock.mockResolvedValueOnce(mk(200, { json: { events: [], total: 0 } }));
    await api.adminGetAuditLog({ limit: 10, offset: 5, event_type: "login", user_id: "u1" });
    const u = url();
    expect(u).toContain("limit=10");
    expect(u).toContain("offset=5");
    expect(u).toContain("event_type=login");
    expect(u).toContain("user_id=u1");
  });

  it("getFileChunk falls back to the raw body when the error isn't JSON", async () => {
    fetchMock.mockResolvedValueOnce(mk(500, { json: "raw server error", jsonThrows: true }));
    await expect(api.getFileChunk("f", 0)).rejects.toThrow("raw server error");
  });
});

describe("createEventSource", () => {
  class FakeEventSource {
    url: string;
    constructor(u: string) {
      this.url = u;
    }
    close() {}
  }
  beforeEach(() => vi.stubGlobal("EventSource", FakeEventSource as unknown as typeof EventSource));

  it("appends the auth token as a query param when present", () => {
    getState.mockReturnValue({ accessToken: "abc" });
    const es = api.createEventSource() as unknown as FakeEventSource;
    expect(es.url).toContain("/api/events?token=abc");
  });

  it("omits the token param when there is no session", () => {
    getState.mockReturnValue({ accessToken: null });
    const es = api.createEventSource() as unknown as FakeEventSource;
    expect(es.url).toContain("/api/events");
    expect(es.url).not.toContain("token=");
  });
});
