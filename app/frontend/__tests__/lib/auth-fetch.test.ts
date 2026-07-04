import { describe, it, expect, beforeEach, vi } from "vitest";

// authedFetch/tryRefreshToken are the shared auth plumbing used by both the
// JSON api client (lib/api.ts) and the chunked-upload path (lib/upload-session.ts).
// Mock the auth store and the refresh HTTP call so we can drive every branch
// directly, rather than through a caller.
const { getState, refreshTokenApi } = vi.hoisted(() => ({
  getState: vi.fn(),
  refreshTokenApi: vi.fn(),
}));
vi.mock("@/store/auth", () => ({ useAuthStore: { getState } }));
vi.mock("@/lib/auth-api", () => ({ refreshToken: refreshTokenApi }));

import { authedFetch, tryRefreshToken } from "@/lib/auth-fetch";

function resp(status: number) {
  return { status } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;
let setTokens: ReturnType<typeof vi.fn>;
let clearAuth: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
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
  it("returns null immediately when there is no refresh token", async () => {
    getState.mockReturnValue({ refreshTokenValue: null, setTokens, clearAuth });
    const result = await tryRefreshToken();
    expect(result).toBeNull();
    expect(refreshTokenApi).not.toHaveBeenCalled();
  });

  it("refreshes and stores the new tokens on success", async () => {
    refreshTokenApi.mockResolvedValueOnce({ access_token: "new-access", refresh_token: "new-refresh" });

    const result = await tryRefreshToken();

    expect(result).toBe("new-access");
    expect(setTokens).toHaveBeenCalledWith("new-access", "new-refresh");
    expect(clearAuth).not.toHaveBeenCalled();
  });

  it("clears auth and returns null when the refresh call fails", async () => {
    refreshTokenApi.mockRejectedValueOnce(new Error("refresh failed"));

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

  it("does not attempt a refresh on 401 when there was no access token to begin with", async () => {
    getState.mockReturnValue({ accessToken: null, refreshTokenValue: "refresh-tok", setTokens, clearAuth });
    fetchMock.mockResolvedValueOnce(resp(401));

    const res = await authedFetch("/api/thing");

    expect(res.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refreshTokenApi).not.toHaveBeenCalled();
  });
});
