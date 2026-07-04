import { describe, it, expect, beforeEach, vi } from "vitest";

// The api client's private request<T>() carries all the cross-cutting logic:
// auth-header injection, 401 -> token-refresh -> retry, 5xx backoff-retry,
// error-body parsing, and abort-as-timeout. We exercise it through a thin
// exported wrapper (getConfig) with fetch + the auth store + the refresh helper
// mocked. The ~60 other endpoint wrappers are one-liners over the same core.

// vi.mock is hoisted above module init, so the mock fns must come from
// vi.hoisted() to exist when the factories run.
const { getState, tryRefreshToken, authedFetch } = vi.hoisted(() => {
  const getState = vi.fn();
  const tryRefreshToken = vi.fn();
  // Mirror the real authedFetch (lib/auth-fetch): attach the access token and,
  // on a 401, refresh once and retry with the new token — against the mocked
  // global fetch. getFileChunk now goes through this, so it must exercise the
  // same header + refresh behavior the request() core does.
  const authedFetch = vi.fn(async (input: string, init?: RequestInit) => {
    const { accessToken } = getState();
    const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) };
    if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
    let res = await fetch(input, { ...init, headers });
    if (res.status === 401 && accessToken) {
      const newToken = await tryRefreshToken();
      if (newToken) {
        headers["Authorization"] = `Bearer ${newToken}`;
        res = await fetch(input, { ...init, headers });
      }
    }
    return res;
  });
  return { getState, tryRefreshToken, authedFetch };
});
vi.mock("@/store/auth", () => ({ useAuthStore: { getState } }));
vi.mock("@/lib/auth-fetch", () => ({ tryRefreshToken, authedFetch }));

import {
  getConfig,
  getFileChunk,
  listFiles,
  deleteFile,
  bulkDeleteFiles,
  getDevicePreference,
  getMyKey,
  publishKey,
  getUserPublicKey,
  getFileMeta,
  listSharedVaults,
  createSharedVault,
  getSharedVault,
  addSharedVaultMember,
  lookupUserKey,
  removeSharedVaultMember,
  deleteSharedVault,
  addFileToSpace,
  removeFileFromSpace,
  rotateSpace,
} from "@/lib/api";

/** A minimal Response stand-in matching what request() reads. */
function resp(status: number, body: unknown) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => (typeof body === "string" ? JSON.parse(text) : body),
  } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  getState.mockReturnValue({ accessToken: "access-tok" });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

describe("api request core", () => {
  it("injects the bearer token and returns parsed JSON on success", async () => {
    fetchMock.mockResolvedValueOnce(resp(200, { setting: "value" }));

    const result = await getConfig();

    expect(result).toEqual({ setting: "value" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/config");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer access-tok");
  });

  it("omits the Authorization header when there is no token", async () => {
    getState.mockReturnValue({ accessToken: null });
    fetchMock.mockResolvedValueOnce(resp(200, {}));

    await getConfig();

    const init = fetchMock.mock.calls[0][1];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("on 401, refreshes the token and retries with the new one", async () => {
    fetchMock
      .mockResolvedValueOnce(resp(401, { error: "expired" }))
      .mockResolvedValueOnce(resp(200, { ok: true }));
    tryRefreshToken.mockResolvedValueOnce("fresh-tok");

    const result = await getConfig();

    expect(result).toEqual({ ok: true });
    expect(tryRefreshToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryInit = fetchMock.mock.calls[1][1];
    expect((retryInit.headers as Record<string, string>).Authorization).toBe("Bearer fresh-tok");
  });

  it("surfaces the error when a 401 refresh fails", async () => {
    fetchMock.mockResolvedValueOnce(resp(401, { error: "expired" }));
    tryRefreshToken.mockResolvedValueOnce(null);

    await expect(getConfig()).rejects.toThrow("expired");
    expect(fetchMock).toHaveBeenCalledTimes(1); // no retry without a fresh token
  });

  it("parses the {error} field from a non-OK JSON body", async () => {
    fetchMock.mockResolvedValueOnce(resp(400, { error: "bad request details" }));
    await expect(getConfig()).rejects.toThrow("bad request details");
  });

  it("falls back to the raw body when the error response isn't JSON", async () => {
    fetchMock.mockResolvedValueOnce(resp(400, "plain text failure"));
    await expect(getConfig()).rejects.toThrow("plain text failure");
  });

  it("retries once on a 5xx and succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(resp(503, { error: "unavailable" }))
      .mockResolvedValueOnce(resp(200, { recovered: true }));

    const result = await getConfig();

    expect(result).toEqual({ recovered: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("maps an aborted fetch to a timeout error", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("aborted", "AbortError"));
    await expect(getConfig()).rejects.toThrow("Request timed out");
  });

  it("propagates a non-abort network error as-is", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await expect(getConfig()).rejects.toThrow("network down");
  });
});

describe("getFileChunk (custom download path)", () => {
  function chunkResp(status: number, opts: { body?: unknown; bytes?: ArrayBuffer; hdr?: Record<string, string> } = {}) {
    const text = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body ?? {});
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => text,
      arrayBuffer: async () => opts.bytes ?? new ArrayBuffer(8),
      headers: { get: (k: string) => (opts.hdr ?? {})[k] ?? null },
    } as unknown as Response;
  }

  it("returns the bytes and parses the chunk metadata headers", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    fetchMock.mockResolvedValueOnce(
      chunkResp(200, { bytes, hdr: { "X-Chunk-SHA256": "abc123", "X-Chunk-Compressed": "true" } })
    );

    const out = await getFileChunk("file-1", 2);

    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/files/file-1/chunks/2");
    expect(new Uint8Array(out.data)).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(out.sha256).toBe("abc123");
    expect(out.compressed).toBe(true);
  });

  it("defaults compressed=false and sha256='' when headers are absent", async () => {
    fetchMock.mockResolvedValueOnce(chunkResp(200, {}));
    const out = await getFileChunk("f", 0);
    expect(out.sha256).toBe("");
    expect(out.compressed).toBe(false);
  });

  it("throws the parsed error on a non-OK chunk response", async () => {
    fetchMock.mockResolvedValueOnce(chunkResp(404, { body: { error: "chunk not found" } }));
    await expect(getFileChunk("f", 9)).rejects.toThrow("chunk not found");
  });

  it("attaches the bearer token when present", async () => {
    fetchMock.mockResolvedValueOnce(chunkResp(200, {}));
    await getFileChunk("f", 0);
    const init = fetchMock.mock.calls[0][1];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer access-tok");
  });

  it("forwards a caller-provided signal instead of creating its own timeout controller", async () => {
    fetchMock.mockResolvedValueOnce(chunkResp(200, {}));
    const controller = new AbortController();
    await getFileChunk("f", 0, controller.signal);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBe(controller.signal);
  });

  it("maps an aborted chunk fetch to a chunk-specific timeout error", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("aborted", "AbortError"));
    await expect(getFileChunk("f", 4)).rejects.toThrow("chunk 4 download timed out");
  });

  it("refreshes the token on a 401 and retries the chunk (long/stale-token downloads)", async () => {
    fetchMock
      .mockResolvedValueOnce(chunkResp(401, { body: { error: "expired" } }))
      .mockResolvedValueOnce(chunkResp(200, { bytes: new Uint8Array([9]).buffer }));
    tryRefreshToken.mockResolvedValueOnce("fresh-tok");

    const out = await getFileChunk("f", 0);

    expect(tryRefreshToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1][1].headers as Record<string, string>).Authorization).toBe("Bearer fresh-tok");
    expect(new Uint8Array(out.data)).toEqual(new Uint8Array([9]));
  });
});

// The spaces + keys endpoints are this feature's API surface: a wrong verb,
// path, or body shape is a silent break, so pin each one down explicitly.
describe("shared-space + key API wrappers", () => {
  interface Case {
    name: string;
    run: () => Promise<unknown>;
    path: string;
    method?: string;
    body?: Record<string, unknown>;
  }
  const cases: Case[] = [
    { name: "listSharedVaults", run: () => listSharedVaults(), path: "/api/shared-vaults" },
    { name: "getSharedVault", run: () => getSharedVault("v1"), path: "/api/shared-vaults/v1" },
    { name: "createSharedVault", run: () => createSharedVault({ name: "n", description: "d", file_ids: ["a"], wrapped_space_key: "w", size_limit_bytes: 10 }), path: "/api/shared-vaults", method: "POST", body: { name: "n", description: "d", file_ids: ["a"], wrapped_space_key: "w", size_limit_bytes: 10 } },
    { name: "addSharedVaultMember", run: () => addSharedVaultMember("v1", "e@x.com", "editor", "grant"), path: "/api/shared-vaults/v1/members", method: "POST", body: { email: "e@x.com", role: "editor", wrapped_space_key: "grant" } },
    { name: "addSharedVaultMember (default grant)", run: () => addSharedVaultMember("v1", "e@x.com", "viewer"), path: "/api/shared-vaults/v1/members", method: "POST", body: { email: "e@x.com", role: "viewer", wrapped_space_key: "" } },
    { name: "removeSharedVaultMember", run: () => removeSharedVaultMember("v1", "u9"), path: "/api/shared-vaults/v1/members/u9", method: "DELETE" },
    { name: "deleteSharedVault", run: () => deleteSharedVault("v1"), path: "/api/shared-vaults/v1", method: "DELETE" },
    { name: "addFileToSpace", run: () => addFileToSpace("v1", "f2", "cek"), path: "/api/shared-vaults/v1/files", method: "POST", body: { file_id: "f2", wrapped_cek: "cek" } },
    { name: "removeFileFromSpace", run: () => removeFileFromSpace("v1", "f2"), path: "/api/shared-vaults/v1/files/f2", method: "DELETE" },
    { name: "rotateSpace", run: () => rotateSpace("v1", [{ user_id: "u", wrapped_space_key: "k" }], [{ file_id: "f", wrapped_cek: "c" }]), path: "/api/shared-vaults/v1/rotate", method: "POST", body: { members: [{ user_id: "u", wrapped_space_key: "k" }], files: [{ file_id: "f", wrapped_cek: "c" }] } },
    { name: "getMyKey", run: () => getMyKey(), path: "/api/keys/me" },
    { name: "publishKey", run: () => publishKey({ public_key: "p", wrapped_private_key: "w", kdf_salt: "s", fingerprint: "f" }), path: "/api/keys", method: "POST", body: { public_key: "p", wrapped_private_key: "w", kdf_salt: "s", fingerprint: "f" } },
    { name: "getUserPublicKey", run: () => getUserPublicKey("u 1"), path: "/api/keys/user/u%201" },
    { name: "lookupUserKey", run: () => lookupUserKey("a@b.com"), path: "/api/keys/lookup?identifier=a%40b.com" },
    { name: "getFileMeta", run: () => getFileMeta("f5"), path: "/api/files/f5/meta" },
    { name: "listFiles (filtered)", run: () => listFiles("trash"), path: "/api/files?filter=trash" },
    { name: "deleteFile", run: () => deleteFile("f5"), path: "/api/files/f5", method: "DELETE" },
    { name: "bulkDeleteFiles", run: () => bulkDeleteFiles(["a", "b"]), path: "/api/files/bulk-delete", method: "POST", body: { ids: ["a", "b"] } },
    { name: "getDevicePreference", run: () => getDevicePreference("dev 1"), path: "/api/preferences?device_id=dev%201" },
  ];

  it.each(cases)("$name -> $method $path", async (c) => {
    fetchMock.mockResolvedValueOnce(resp(200, {}));
    await c.run();
    expect(String(fetchMock.mock.calls[0][0])).toContain(c.path);
    const init = fetchMock.mock.calls[0][1];
    expect(init.method).toBe(c.method);
    if (c.body) expect(JSON.parse(init.body as string)).toEqual(c.body);
  });
});
