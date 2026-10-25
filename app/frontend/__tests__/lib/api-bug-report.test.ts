import { describe, it, expect, beforeEach, vi } from "vitest";

const { getState } = vi.hoisted(() => ({
  getState: vi.fn<() => { accessToken: string | null }>(() => ({ accessToken: null })),
}));
vi.mock("@/store/auth", () => ({ useAuthStore: { getState } }));
const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("@/lib/auth-fetch", () => ({
  tryRefreshToken: refresh,
  shouldRefreshOn401: (token: string | null) => Boolean(token),
}));

import { submitBugReport } from "@/lib/api";

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 201,
    text: async () => '{"success":true}',
    json: async () => ({ success: true }),
  } as Response);
  vi.stubGlobal("fetch", fetchMock);
});

const input = {
  description: "d",
  kind: "idea" as const,
  contact_email: "a@b.co",
  website: "",
  elapsed_ms: 4200,
  app_version: "1",
  platform: "web",
  route: "/feedback",
  user_agent: "ua",
};

describe("submitBugReport", () => {
  it("posts the feedback fields without an Authorization header when signed out", async () => {
    getState.mockReturnValue({ accessToken: null });
    await expect(submitBugReport(input)).resolves.toEqual({ success: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/api/feedback/bug");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBeUndefined();
    expect(JSON.parse(init.body)).toEqual(input);
  });

  it("attaches the token when signed in", async () => {
    getState.mockReturnValue({ accessToken: "tok" });
    await submitBugReport(input);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });

  it("does not refresh or loop on a 401 when signed out", async () => {
    getState.mockReturnValue({ accessToken: null });
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"error":"nope"}',
    } as Response);
    await expect(submitBugReport(input)).rejects.toThrow("nope");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
  });
});
