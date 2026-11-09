import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config")>()),
  API_BASE: "https://api.example.com",
}));

import * as authApi from "@/lib/auth-api";

function resp(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

const url = (n: number) => String(fetchMock.mock.calls[n][0]);
const body = (n: number) => JSON.parse(String((fetchMock.mock.calls[n][1] as RequestInit).body));

describe("web session cookie", () => {
  it("refreshes and logs out through the site's own origin, not the API host", async () => {
    fetchMock.mockResolvedValue(resp(200, { access_token: "a", refresh_token: "r" }));
    await authApi.refreshToken(null);
    await authApi.logout(null);
    expect(url(0)).toBe("/api/auth/refresh");
    expect(url(1)).toBe("/api/auth/logout");
  });

  it("re-issues a sign-in's tokens through the site so the cookie is first-party", async () => {
    fetchMock
      .mockResolvedValueOnce(resp(200, { access_token: "a1", refresh_token: "r1", user: { id: "u" } }))
      .mockResolvedValueOnce(resp(200, { access_token: "a2", refresh_token: "r2" }));

    const out = await authApi.login("e@x.com", "pw");

    expect(url(0)).toBe("https://api.example.com/api/auth/login");
    expect(url(1)).toBe("/api/auth/refresh");
    expect(body(1)).toEqual({ refresh_token: "r1" });
    expect(out).toEqual({ access_token: "a2", refresh_token: "r2", user: { id: "u" } });
  });

  it("keeps the original tokens when planting the cookie fails", async () => {
    fetchMock
      .mockResolvedValueOnce(resp(200, { access_token: "a1", refresh_token: "r1" }))
      .mockResolvedValueOnce(resp(502, { error: "bad gateway" }));

    expect(await authApi.login("e@x.com", "pw")).toEqual({ access_token: "a1", refresh_token: "r1" });
  });

  it("does not plant anything for responses without a token pair", async () => {
    fetchMock.mockResolvedValueOnce(resp(200, { requires_2fa: true, temp_token: "t" }));
    await authApi.login("e@x.com", "pw");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the original tokens when the site is unreachable", async () => {
    fetchMock
      .mockResolvedValueOnce(resp(200, { access_token: "a1", refresh_token: "r1" }))
      .mockRejectedValueOnce(new TypeError("offline"));

    expect(await authApi.login("e@x.com", "pw")).toEqual({ access_token: "a1", refresh_token: "r1" });
  });
});
