import { describe, it, expect, beforeEach, vi } from "vitest";

// authedFetch/tryRefreshToken are the shared auth plumbing used by both the
// JSON api client (lib/api.ts) and the chunked-upload path (lib/upload-session.ts).
// Mock the auth store and the refresh HTTP call so we can drive every branch
// directly, rather than through a caller.
const { getState, refreshTokenApi, refreshSession, tauriFlag } = vi.hoisted(() => ({
  getState: vi.fn(),
  refreshTokenApi: vi.fn(),
  refreshSession: vi.fn(),
  // Mutable box so individual tests can flip isTauri without needing
  // vi.resetModules()+dynamic import for every test in this file.
  tauriFlag: { isTauri: false },
}));
vi.mock("@/store/auth", () => ({ useAuthStore: { getState } }));
vi.mock("@/lib/auth-api", () => ({ refreshToken: refreshTokenApi }));
vi.mock("@/lib/tauri", () => ({
  get isTauri() {
    return tauriFlag.isTauri;
  },
  refreshSession,
}));

vi.mock("@/lib/auth-sync", () => ({ withRefreshLock: (fn: () => Promise<unknown>) => fn() }));

import { authedFetch, refreshSessionToken, tryRefreshToken } from "@/lib/auth-fetch";

function resp(status: number) {
  return { status } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;
let setTokens: ReturnType<typeof vi.fn>;
let clearAuth: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  tauriFlag.isTauri = false;
  setTokens = vi.fn();
  clearAuth = vi.fn();
  getState.mockReturnValue({
    accessToken: "access-tok",
    refreshTokenValue: "refresh-tok",
    setTokens,
    clearAuth,
  });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

describe("tryRefreshToken", () => {
  it("desktop (Tauri): returns null immediately when there is no refresh token, no cookie fallback exists", async () => {
    tauriFlag.isTauri = true;
    getState.mockReturnValue({ refreshTokenValue: null, setTokens, clearAuth });
    const result = await tryRefreshToken();
    expect(result).toBeNull();
    expect(refreshTokenApi).not.toHaveBeenCalled();
  });

  it("web: attempts the refresh even with no in-memory token (relies on the httpOnly cookie)", async () => {
    tauriFlag.isTauri = false;
    getState.mockReturnValue({ refreshTokenValue: null, setTokens, clearAuth });
    refreshTokenApi.mockResolvedValueOnce({ access_token: "new-access", refresh_token: "new-refresh" });

    const result = await tryRefreshToken();

    expect(refreshTokenApi).toHaveBeenCalledWith(null);
    expect(result).toBe("new-access");
    expect(setTokens).toHaveBeenCalledWith("new-access", "new-refresh");
  });

  it("refreshes and stores the new tokens on success", async () => {
    refreshTokenApi.mockResolvedValueOnce({ access_token: "new-access", refresh_token: "new-refresh" });

    const result = await tryRefreshToken();

    expect(result).toBe("new-access");
    expect(setTokens).toHaveBeenCalledWith("new-access", "new-refresh");
    expect(clearAuth).not.toHaveBeenCalled();
  });

  it("does NOT clear auth on a transient refresh failure (network/timeout/5xx): keeps the session so a long upload survives", async () => {
    refreshTokenApi.mockRejectedValueOnce(new Error("network error")); // no .status => transient

    const result = await tryRefreshToken();

    expect(result).toBeNull();
    expect(clearAuth).not.toHaveBeenCalled(); // the fix: a blip must not log the user out mid-transfer
    expect(setTokens).not.toHaveBeenCalled();
  });

  it("clears auth and returns null only when the refresh is DEFINITIVELY rejected (401/403)", async () => {
    const err = new Error("invalid refresh token") as Error & { status?: number };
    err.status = 401;
    refreshTokenApi.mockRejectedValueOnce(err);

    const result = await tryRefreshToken();

    expect(result).toBeNull();
    expect(clearAuth).toHaveBeenCalledTimes(1);
    expect(setTokens).not.toHaveBeenCalled();
  });

  it("dedupes concurrent refresh calls into a single underlying request", async () => {
    let resolveRefresh!: (v: { access_token: string; refresh_token: string }) => void;
    refreshTokenApi.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      })
    );

    const p1 = tryRefreshToken();
    const p2 = tryRefreshToken();
    expect(refreshTokenApi).toHaveBeenCalledTimes(1);

    resolveRefresh({ access_token: "tok-a", refresh_token: "tok-b" });
    const [r1, r2] = await Promise.all([p1, p2]);

    expect(r1).toBe("tok-a");
    expect(r2).toBe("tok-a");
  });

  it("issues a fresh request after the previous refresh has settled", async () => {
    refreshTokenApi.mockResolvedValueOnce({ access_token: "first", refresh_token: "r1" });
    await tryRefreshToken();

    refreshTokenApi.mockResolvedValueOnce({ access_token: "second", refresh_token: "r2" });
    const result = await tryRefreshToken();

    expect(result).toBe("second");
    expect(refreshTokenApi).toHaveBeenCalledTimes(2);
  });
});

describe("refreshSessionToken", () => {
  it("reports the new token on success", async () => {
    refreshTokenApi.mockResolvedValueOnce({ access_token: "a", refresh_token: "r" });
    expect(await refreshSessionToken()).toEqual({ token: "a", rejected: false });
  });

  it("tells a definitive rejection apart from a transient miss", async () => {
    refreshTokenApi.mockRejectedValueOnce(Object.assign(new Error("gone"), { status: 403 }));
    expect(await refreshSessionToken()).toEqual({ token: null, rejected: true });

    refreshTokenApi.mockRejectedValueOnce(new Error("offline"));
    expect(await refreshSessionToken()).toEqual({ token: null, rejected: false });
  });

  it("desktop with no refresh token has no session to recover", async () => {
    tauriFlag.isTauri = true;
    getState.mockReturnValue({ refreshTokenValue: null, setTokens, clearAuth });
    expect(await refreshSessionToken()).toEqual({ token: null, rejected: true });
  });
});

describe("authedFetch", () => {
  it("attaches the bearer token and returns the response on success", async () => {
    fetchMock.mockResolvedValueOnce(resp(200));

    const res = await authedFetch("/api/thing");

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit & { headers: Record<string, string> };
    expect(init.headers.Authorization).toBe("Bearer access-tok");
  });

  it("omits the Authorization header when there is no access token", async () => {
    getState.mockReturnValue({ accessToken: null, refreshTokenValue: "refresh-tok", setTokens, clearAuth });
    fetchMock.mockResolvedValueOnce(resp(200));

    await authedFetch("/api/thing");

    const init = fetchMock.mock.calls[0][1] as RequestInit & { headers: Record<string, string> };
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("preserves caller-supplied headers alongside the bearer token", async () => {
    fetchMock.mockResolvedValueOnce(resp(200));

    await authedFetch("/api/thing", { headers: { "X-Foo": "bar" } });

    const init = fetchMock.mock.calls[0][1] as RequestInit & { headers: Record<string, string> };
    expect(init.headers["X-Foo"]).toBe("bar");
    expect(init.headers.Authorization).toBe("Bearer access-tok");
  });

  it("on a 401, refreshes the token once and retries with the new one", async () => {
    fetchMock.mockResolvedValueOnce(resp(401)).mockResolvedValueOnce(resp(200));
    refreshTokenApi.mockResolvedValueOnce({ access_token: "fresh-tok", refresh_token: "r2" });

    const res = await authedFetch("/api/thing");

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryInit = fetchMock.mock.calls[1][1] as RequestInit & { headers: Record<string, string> };
    expect(retryInit.headers.Authorization).toBe("Bearer fresh-tok");
  });

  it("gives up and returns the original 401 when the refresh fails", async () => {
    fetchMock.mockResolvedValueOnce(resp(401));
    refreshTokenApi.mockRejectedValueOnce(new Error("refresh dead"));

    const res = await authedFetch("/api/thing");

    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no retry without a fresh token
  });

  it("on the web, refreshes a 401 without a token through the session cookie", async () => {
    getState.mockReturnValue({ accessToken: null, refreshTokenValue: null, setTokens, clearAuth });
    fetchMock.mockResolvedValueOnce(resp(401)).mockResolvedValueOnce(resp(200));
    refreshTokenApi.mockResolvedValueOnce({ access_token: "cookie-at", refresh_token: "cookie-rt" });

    const res = await authedFetch("/api/thing");

    expect(res.status).toBe(200);
    expect(refreshTokenApi).toHaveBeenCalledWith(null);
    expect((fetchMock.mock.calls[1][1].headers as Record<string, string>).Authorization).toBe(
      "Bearer cookie-at",
    );
  });

  it("on desktop, does not attempt a refresh on 401 without a token", async () => {
    tauriFlag.isTauri = true;
    getState.mockReturnValue({ accessToken: null, refreshTokenValue: "refresh-tok", setTokens, clearAuth });
    fetchMock.mockResolvedValueOnce(resp(401));

    const res = await authedFetch("/api/thing");

    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refreshTokenApi).not.toHaveBeenCalled();
    expect(refreshSession).not.toHaveBeenCalled();
  });
});

describe("tryRefreshToken on desktop", () => {
  beforeEach(() => {
    tauriFlag.isTauri = true;
  });

  it("rotates through the engine instead of calling the API itself", async () => {
    refreshSession.mockResolvedValueOnce({ access_token: "a2", refresh_token: "r2" });
    await expect(tryRefreshToken()).resolves.toBe("a2");
    expect(setTokens).toHaveBeenCalledWith("a2", "r2");
    expect(refreshTokenApi).not.toHaveBeenCalled();
  });

  it("falls back to the API before the engine is connected", async () => {
    refreshSession.mockRejectedValueOnce("engine not connected. Call start_sync first");
    refreshTokenApi.mockResolvedValueOnce({ access_token: "a3", refresh_token: "r3" });
    await expect(tryRefreshToken()).resolves.toBe("a3");
    expect(refreshTokenApi).toHaveBeenCalledWith("refresh-tok");
  });

  it("logs out when the engine's refresh was rejected by the server", async () => {
    refreshSession.mockRejectedValueOnce(new Error("unauthorized, token refresh failed"));
    await expect(tryRefreshToken()).resolves.toBeNull();
    expect(clearAuth).toHaveBeenCalled();
  });

  it("keeps the session on a transient engine failure", async () => {
    refreshSession.mockRejectedValueOnce(new Error("network: timed out"));
    await expect(tryRefreshToken()).resolves.toBeNull();
    expect(clearAuth).not.toHaveBeenCalled();
  });
});

describe("tryRefreshToken across tabs", () => {
  it("adopts the pair another tab stored while this one waited its turn, without spending the token", async () => {
    getState
      .mockReturnValueOnce({ accessToken: "old", refreshTokenValue: "old-rt", setTokens, clearAuth })
      .mockReturnValue({ accessToken: "from-tab", refreshTokenValue: "new-rt", setTokens, clearAuth });

    expect(await tryRefreshToken()).toBe("from-tab");
    expect(refreshTokenApi).not.toHaveBeenCalled();
    expect(setTokens).not.toHaveBeenCalled();
  });

  it("does not log out when the server rejects a token another tab already replaced", async () => {
    getState
      .mockReturnValueOnce({ accessToken: "old", refreshTokenValue: "old-rt", setTokens, clearAuth })
      .mockReturnValueOnce({ accessToken: "old", refreshTokenValue: "old-rt", setTokens, clearAuth })
      .mockReturnValue({ accessToken: "from-tab", refreshTokenValue: "new-rt", setTokens, clearAuth });
    refreshTokenApi.mockRejectedValueOnce(Object.assign(new Error("no"), { status: 401 }));

    expect(await refreshSessionToken()).toEqual({ token: "from-tab", rejected: false });
    expect(clearAuth).not.toHaveBeenCalled();
  });
});
