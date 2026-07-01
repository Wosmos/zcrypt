import { describe, it, expect, beforeEach, vi } from "vitest";

// The api client's private request<T>() carries all the cross-cutting logic:
// auth-header injection, 401 -> token-refresh -> retry, 5xx backoff-retry,
// error-body parsing, and abort-as-timeout. We exercise it through a thin
// exported wrapper (getConfig) with fetch + the auth store + the refresh helper
// mocked. The ~60 other endpoint wrappers are one-liners over the same core.

// vi.mock is hoisted above module init, so the mock fns must come from
// vi.hoisted() to exist when the factories run.
const { getState, tryRefreshToken } = vi.hoisted(() => ({
  getState: vi.fn(),
  tryRefreshToken: vi.fn(),
}));
vi.mock("@/store/auth", () => ({ useAuthStore: { getState } }));
vi.mock("@/lib/auth-fetch", () => ({ tryRefreshToken }));

import { getConfig } from "@/lib/api";

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
