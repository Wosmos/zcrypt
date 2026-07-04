import { describe, it, expect, beforeEach, vi } from "vitest";
import * as authApi from "@/lib/auth-api";

// auth-api.ts is a small authRequest() core (json headers, 15s timeout, error
// parsing, abort->timeout) plus thin per-endpoint wrappers. We assert the core
// behavior and then sweep every wrapper for the exact method / path / body /
// auth header it must send — a wrong verb or path is a real, silent bug class.

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
  fetchMock = vi.fn().mockResolvedValue(resp(200, { ok: true }));
  vi.stubGlobal("fetch", fetchMock);
});

/** Parsed init of the Nth fetch call. */
function callInit(n = 0) {
  return fetchMock.mock.calls[n][1] as RequestInit & { headers: Record<string, string> };
}
function callUrl(n = 0) {
  return String(fetchMock.mock.calls[n][0]);
}

describe("authRequest core", () => {
  it("sends a JSON content-type and returns the parsed body", async () => {
    fetchMock.mockResolvedValueOnce(resp(200, { access_token: "a", refresh_token: "r" }));
    const out = await authApi.login("e@x.com", "pw");
    expect(out).toEqual({ access_token: "a", refresh_token: "r" });
    expect(callInit().headers["Content-Type"]).toBe("application/json");
  });

  it("merges an Authorization header without dropping content-type", async () => {
    await authApi.setup2FA("my-token");
    const h = callInit().headers;
    expect(h["Authorization"]).toBe("Bearer my-token");
    expect(h["Content-Type"]).toBe("application/json");
  });

  it("throws the {error} field from a non-OK JSON response", async () => {
    fetchMock.mockResolvedValueOnce(resp(400, { error: "email already used" }));
    await expect(authApi.register("e", "u", "p")).rejects.toThrow("email already used");
  });

  it("throws the raw body when the error response isn't JSON", async () => {
    fetchMock.mockResolvedValueOnce(resp(500, "upstream exploded"));
    await expect(authApi.login("e", "p")).rejects.toThrow("upstream exploded");
  });

  it("falls back to the raw body when the error JSON has no .error field", async () => {
    fetchMock.mockResolvedValueOnce(resp(400, { message: "nope" }));
    await expect(authApi.login("e", "p")).rejects.toThrow('{"message":"nope"}');
  });

  it("maps an aborted request to a backend-down timeout message", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("aborted", "AbortError"));
    await expect(authApi.login("e", "p")).rejects.toThrow(/Request timed out/);
  });

  it("propagates a non-abort network error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("connection refused"));
    await expect(authApi.login("e", "p")).rejects.toThrow("connection refused");
  });
});

describe("auth-api endpoint wrappers", () => {
  interface Case {
    name: string;
    run: () => Promise<unknown>;
    path: string;
    method?: string; // undefined => default GET
    body?: Record<string, unknown>;
    auth?: string; // expected bearer token
  }

  const cases: Case[] = [
    { name: "register", run: () => authApi.register("e@x.com", "user", "pw"), path: "/api/auth/register", method: "POST", body: { email: "e@x.com", username: "user", password: "pw" } },
    { name: "login", run: () => authApi.login("e@x.com", "pw"), path: "/api/auth/login", method: "POST", body: { email: "e@x.com", password: "pw" } },
    { name: "refreshToken", run: () => authApi.refreshToken("rt"), path: "/api/auth/refresh", method: "POST", body: { refresh_token: "rt" } },
    { name: "logout", run: () => authApi.logout("rt"), path: "/api/auth/logout", method: "POST", body: { refresh_token: "rt" } },
    { name: "forgotPassword", run: () => authApi.forgotPassword("e@x.com"), path: "/api/auth/forgot-password", method: "POST", body: { email: "e@x.com" } },
    { name: "resetPassword", run: () => authApi.resetPassword("tok", "newpw"), path: "/api/auth/reset-password", method: "POST", body: { token: "tok", new_password: "newpw" } },
    { name: "verifyEmail", run: () => authApi.verifyEmail("tok"), path: "/api/auth/verify-email", method: "POST", body: { token: "tok" } },
    { name: "resendVerification", run: () => authApi.resendVerification("e@x.com"), path: "/api/auth/resend-verification", method: "POST", body: { email: "e@x.com" } },
    { name: "setup2FA", run: () => authApi.setup2FA("at"), path: "/api/auth/2fa/setup", method: "POST", auth: "at" },
    { name: "enable2FA", run: () => authApi.enable2FA("at", "123456"), path: "/api/auth/2fa/enable", method: "POST", body: { code: "123456" }, auth: "at" },
    { name: "verify2FA", run: () => authApi.verify2FA("tt", "123456"), path: "/api/auth/2fa/verify", method: "POST", body: { temp_token: "tt", code: "123456" } },
    { name: "disable2FA", run: () => authApi.disable2FA("at", "pw", "123456"), path: "/api/auth/2fa/disable", method: "POST", body: { password: "pw", code: "123456" }, auth: "at" },
    { name: "getMe", run: () => authApi.getMe("at"), path: "/api/auth/me", auth: "at" },
    { name: "requestMagicLink", run: () => authApi.requestMagicLink("e@x.com"), path: "/api/auth/magic-link", method: "POST", body: { email: "e@x.com" } },
    { name: "verifyMagicLink", run: () => authApi.verifyMagicLink("tok"), path: "/api/auth/magic-link/verify", method: "POST", body: { token: "tok" } },
    { name: "registerWithBreachCheck", run: () => authApi.registerWithBreachCheck("e@x.com", "user", "pw", true), path: "/api/auth/register", method: "POST", body: { email: "e@x.com", username: "user", password: "pw", force: true } },
    { name: "resetPasswordWithBreachCheck", run: () => authApi.resetPasswordWithBreachCheck("tok", "newpw", true), path: "/api/auth/reset-password", method: "POST", body: { token: "tok", new_password: "newpw", force: true } },
    { name: "getLinkedAccounts", run: () => authApi.getLinkedAccounts("at"), path: "/api/auth/linked-accounts", auth: "at" },
    { name: "unlinkAccount", run: () => authApi.unlinkAccount("at", "google"), path: "/api/auth/linked-accounts/google", method: "DELETE", auth: "at" },
    { name: "getUserActivity", run: () => authApi.getUserActivity("at"), path: "/api/auth/activity", auth: "at" },
  ];

  it.each(cases)("$name hits $method $path", async (c) => {
    await c.run();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(callUrl()).toContain(c.path);
    const init = callInit();
    expect(init.method).toBe(c.method); // undefined for the GET wrappers
    if (c.body) {
      expect(JSON.parse(init.body as string)).toEqual(c.body);
    }
    if (c.auth) {
      expect(init.headers["Authorization"]).toBe(`Bearer ${c.auth}`);
    }
  });
});

describe("getOAuthURL", () => {
  it("builds the provider start URL (no fetch)", () => {
    expect(authApi.getOAuthURL("github")).toContain("/api/auth/oauth/github");
  });
});
