import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { ask } = vi.hoisted(() => ({ ask: vi.fn<() => Promise<string | undefined>>() }));
vi.mock("@/store/auth", () => ({ useAuthStore: { getState: () => ({ accessToken: "tok" }) } }));
vi.mock("@/lib/auth-fetch", () => ({
  tryRefreshToken: vi.fn(async () => null),
  shouldRefreshOn401: vi.fn(() => false),
  authedFetch: vi.fn(),
}));
vi.mock("@/store/human-check", () => ({ useHumanCheck: { getState: () => ({ ask }) } }));

import { apiRequest } from "@/lib/api";

const challenge = () =>
  new Response(JSON.stringify({ error: "confirm", code: "challenge_required" }), { status: 428 });
const ok = () => new Response(JSON.stringify({ id: "s1" }), { status: 200 });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  ask.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const sentToken = (call: number) =>
  (fetchMock.mock.calls[call][1].headers as Record<string, string>)["X-Turnstile-Token"];

describe("step-up check on a 428", () => {
  it("runs the check and resends the request with its token", async () => {
    fetchMock.mockResolvedValueOnce(challenge()).mockResolvedValueOnce(ok());
    ask.mockResolvedValue("good");
    await expect(apiRequest("/api/shares", { method: "POST" })).resolves.toEqual({ id: "s1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentToken(0)).toBeUndefined();
    expect(sentToken(1)).toBe("good");
  });

  it("gives up with the server's message when the check is closed", async () => {
    fetchMock.mockResolvedValueOnce(challenge());
    ask.mockResolvedValue(undefined);
    await expect(apiRequest("/api/shares", { method: "POST" })).rejects.toMatchObject({ status: 428 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks only once: a second 428 after the check is the answer", async () => {
    fetchMock.mockResolvedValueOnce(challenge()).mockResolvedValueOnce(challenge());
    ask.mockResolvedValue("bad");
    await expect(apiRequest("/api/shares", { method: "POST" })).rejects.toMatchObject({ status: 428 });
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("leaves other 428s alone", async () => {
    fetchMock.mockResolvedValueOnce(new Response("not json", { status: 428 }));
    await expect(apiRequest("/api/x")).rejects.toMatchObject({ status: 428 });
    expect(ask).not.toHaveBeenCalled();
  });
});
