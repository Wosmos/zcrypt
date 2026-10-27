import { describe, it, expect, beforeEach, vi } from "vitest";

const { getState } = vi.hoisted(() => ({ getState: vi.fn(() => ({ accessToken: "t" })) }));
vi.mock("@/store/auth", () => ({ useAuthStore: { getState } }));
vi.mock("@/lib/auth-fetch", () => ({ tryRefreshToken: vi.fn() }));

import * as api from "@/lib/api";

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  getState.mockReturnValue({ accessToken: "t" });
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) } as Response);
  vi.stubGlobal("fetch", fetchMock);
});

const call = () => {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return {
    url: String(url),
    method: init.method,
    body: init.body ? JSON.parse(String(init.body)) : undefined,
  };
};

const notify = { notify: false, note: "see you" };
const reauth = { password: "pw", code: "123456" };

describe("single-user admin changes carry the notify options", () => {
  it("plan", async () => {
    await api.adminSetUserPlan("u1", "pro", notify);
    expect(call()).toMatchObject({ method: "PUT", body: { plan: "pro", ...notify } });
    expect(call().url).toContain("/api/admin/users/u1/plan");
  });

  it("quota", async () => {
    await api.adminSetUserQuota("u1", 5, notify);
    expect(call().body).toEqual({ quota_bytes: 5, ...notify });
  });

  it("role", async () => {
    await api.adminSetUserRole("u1", "admin", reauth, notify);
    expect(call().body).toEqual({ role: "admin", ...reauth, ...notify });
  });

  it("delete", async () => {
    await api.adminDeleteUser("u1", reauth, notify);
    expect(call()).toMatchObject({ method: "DELETE", body: { ...reauth, ...notify } });
  });

  it("omit notify when none is given", async () => {
    await api.adminSetUserPlan("u1", "pro");
    expect(call().body).toEqual({ plan: "pro" });
  });
});

describe("bulk user actions", () => {
  it("posts ids, action, value, notify and re-auth", async () => {
    await api.adminBulkUsers(["a", "b"], "set_role", "admin", notify, reauth);
    expect(call().url).toContain("/api/admin/users/bulk");
    expect(call()).toMatchObject({
      method: "POST",
      body: { ids: ["a", "b"], action: "set_role", value: "admin", ...notify, ...reauth },
    });
  });

  it("sends a null value for a reset quota and no re-auth for plan changes", async () => {
    await api.adminBulkUsers(["a"], "set_quota", null, { notify: true, note: "" });
    expect(call().body).toEqual({ ids: ["a"], action: "set_quota", value: null, notify: true, note: "" });
  });
});

describe("announcements", () => {
  const draft = { subject: "Hi", body: "Hello", audience: "plan:pro" };

  it("counts recipients with dry_run", async () => {
    await api.adminCountEmailRecipients(draft);
    expect(call()).toMatchObject({ method: "POST", body: { ...draft, dry_run: true } });
    expect(call().url).toContain("/api/admin/emails");
  });

  it("sends a test with test:true", async () => {
    await api.adminSendTestEmail(draft);
    expect(call().body).toEqual({ ...draft, test: true });
  });

  it("sends the campaign with the selected ids", async () => {
    await api.adminSendEmail({ ...draft, audience: "ids", ids: ["a"] });
    expect(call().body).toEqual({ ...draft, audience: "ids", ids: ["a"] });
  });

  it("lists and reads campaigns", async () => {
    await api.adminListEmails();
    expect(call()).toMatchObject({ method: undefined });
    expect(call().url).toMatch(/\/api\/admin\/emails$/);
    fetchMock.mockClear();
    await api.adminListEmails({ limit: 10, offset: 20, q: "launch" });
    expect(call().url).toContain("/api/admin/emails?limit=10&offset=20&q=launch");
    fetchMock.mockClear();
    await api.adminGetEmail("c1");
    expect(call().url).toContain("/api/admin/emails/c1");
  });
});

describe("email preference", () => {
  it("reads and writes opt-out", async () => {
    await api.getEmailPrefs();
    expect(call().url).toContain("/api/email/preferences");
    fetchMock.mockClear();
    await api.setEmailPrefs(true);
    expect(call()).toMatchObject({ method: "PUT", body: { email_opt_out: true } });
  });
});
