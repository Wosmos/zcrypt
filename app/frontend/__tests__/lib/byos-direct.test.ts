import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlatformStatus, RepoInfo } from "@/types";

const m = vi.hoisted(() => ({
  getPlatformCredentials: vi.fn(),
  listRepos: vi.fn(),
  registerRepo: vi.fn(),
  deactivateRepo: vi.fn(),
  probeTelegram: vi.fn(),
  ensurePlatformStatus: vi.fn(),
  uploadTelegramChunk: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  getPlatformCredentials: m.getPlatformCredentials,
  listRepos: m.listRepos,
  registerRepo: m.registerRepo,
  deactivateRepo: m.deactivateRepo,
}));
vi.mock("@/lib/telegram-reach", () => ({ probeTelegram: m.probeTelegram }));
vi.mock("@/store/platform", () => ({ ensurePlatformStatus: m.ensurePlatformStatus }));
vi.mock("@/lib/telegram-direct", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telegram-direct")>()),
  uploadTelegramChunk: m.uploadTelegramChunk,
}));

async function load() {
  vi.resetModules();
  const direct = await import("@/lib/byos-direct");
  const cache = await import("@/lib/platform-credentials");
  return { ...direct, ...cache };
}

const OWN_TELEGRAM: PlatformStatus = {
  platform: "telegram",
  connected: true,
  username: "vault_bot",
  is_global: false,
};
const CREDS = { platform: "telegram", token: "123:SECRET|-100777", account: "vault_bot" };
const TARGET = {
  platform: "telegram",
  account: "vault_bot",
  telegram: { botToken: "123:SECRET", chatId: "-100777" },
};

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
  m.ensurePlatformStatus.mockResolvedValue([OWN_TELEGRAM]);
  m.probeTelegram.mockResolvedValue("ok");
  m.getPlatformCredentials.mockResolvedValue(CREDS);
  m.registerRepo.mockResolvedValue({ stored: true });
  m.deactivateRepo.mockResolvedValue({ deactivated: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("resolveWebDirect", () => {
  it("goes direct when Telegram is chosen, owned, reachable and the token loads", async () => {
    const d = await load();
    expect(await d.resolveWebDirect("telegram")).toEqual(TARGET);
    expect(await d.resolveWebDirect(undefined)).toEqual(TARGET);
    expect(m.getPlatformCredentials).toHaveBeenCalledTimes(1);
    expect(m.getPlatformCredentials).toHaveBeenCalledWith("telegram");
  });

  it("relays when another platform is chosen", async () => {
    const d = await load();
    expect(await d.resolveWebDirect("github")).toBeNull();
    expect(m.ensurePlatformStatus).not.toHaveBeenCalled();
  });

  it("relays when the only Telegram is a shared or disconnected one", async () => {
    const d = await load();
    m.ensurePlatformStatus.mockResolvedValue([
      { ...OWN_TELEGRAM, is_global: true },
      { ...OWN_TELEGRAM, connected: false },
      { platform: "github", connected: true, is_global: false },
    ]);
    expect(await d.resolveWebDirect("telegram")).toBeNull();
    expect(m.probeTelegram).not.toHaveBeenCalled();
  });

  it("relays when this browser cannot reach Telegram", async () => {
    const d = await load();
    m.probeTelegram.mockResolvedValue("blocked");
    expect(await d.resolveWebDirect("telegram")).toBeNull();
    expect(m.getPlatformCredentials).not.toHaveBeenCalled();
  });

  it("relays when the token cannot be fetched or is malformed, and retries the fetch later", async () => {
    const d = await load();
    m.getPlatformCredentials.mockRejectedValueOnce(new Error("404"));
    expect(await d.resolveWebDirect("telegram")).toBeNull();
    m.getPlatformCredentials.mockResolvedValueOnce({ ...CREDS, token: "no-separator" });
    expect(await d.resolveWebDirect("telegram")).toBeNull();
    expect(m.getPlatformCredentials).toHaveBeenCalledTimes(2);
  });

  it("stays relay for the rest of the page session once switched off", async () => {
    const d = await load();
    expect(d.isWebDirectDisabled()).toBe(false);
    d.disableWebDirect();
    expect(d.isWebDirectDisabled()).toBe(true);
    expect(await d.resolveWebDirect("telegram")).toBeNull();
  });

  it("refetches the token after sign-out cleared it", async () => {
    const d = await load();
    await d.resolveWebDirect("telegram");
    d.forgetPlatformCredentials();
    await d.resolveWebDirect("telegram");
    expect(m.getPlatformCredentials).toHaveBeenCalledTimes(2);
  });

  it("drops a token that arrives after sign-out", async () => {
    const d = await load();
    let finish: (v: unknown) => void = () => {};
    m.getPlatformCredentials.mockReturnValueOnce(new Promise((r) => (finish = r)));
    const pending = d.resolveWebDirect("telegram");
    await vi.waitFor(() => expect(m.getPlatformCredentials).toHaveBeenCalled());
    d.forgetPlatformCredentials();
    finish(CREDS);
    expect(await pending).toEqual(TARGET);
    expect(d.cachedPlatformCredentials("telegram")).toBeUndefined();
  });
});

describe("directTargetForResume", () => {
  it("continues a Telegram session without probing, and refuses other platforms", async () => {
    const d = await load();
    m.probeTelegram.mockResolvedValue("blocked");
    d.disableWebDirect();
    expect(await d.directTargetForResume("telegram")).toEqual(TARGET);
    expect(await d.directTargetForResume("github")).toBeNull();
    expect(m.probeTelegram).not.toHaveBeenCalled();
  });
});

describe("resolveDirectRepo", () => {
  const existing: RepoInfo = {
    id: "telegram_vault_bot_core-cache-v1_aaaaaaaaaaaa",
    platform: "telegram",
    account: "vault_bot",
    name: "core-cache-v1",
    url: "tg:-100777/core-cache-v1",
    used_bytes: 10,
    max_bytes: 0,
    active: true,
  };

  it("reuses the active repo of this account while it has room", async () => {
    const d = await load();
    m.listRepos.mockResolvedValue([
      { ...existing, id: "other-account", account: "someone" },
      { ...existing, id: "inactive", active: false },
      existing,
    ]);
    expect(await d.resolveDirectRepo(TARGET as never)).toBe(existing);
    expect(m.registerRepo).not.toHaveBeenCalled();
  });

  it("registers a disguised repo in the user's chat when there is none", async () => {
    const d = await load();
    m.listRepos.mockResolvedValue([]);
    const repo = await d.resolveDirectRepo(TARGET as never);
    expect(repo.name).toMatch(/^[a-z]+-[a-z]+-v1$/);
    expect(repo.url).toBe(`tg:-100777/${repo.name}`);
    expect(repo.id).toMatch(new RegExp(`^telegram_vault_bot_${repo.name}_[0-9a-f]{12}$`));
    expect(repo).toMatchObject({
      platform: "telegram",
      account: "vault_bot",
      used_bytes: 0,
      max_bytes: d.TELEGRAM_REPO_THRESHOLD,
      active: true,
    });
    expect(m.registerRepo).toHaveBeenCalledWith(repo);
  });

  it("retires a full repo and rotates to the next one", async () => {
    const d = await load();
    m.listRepos.mockResolvedValue([{ ...existing, used_bytes: d.TELEGRAM_REPO_THRESHOLD }]);
    const repo = await d.resolveDirectRepo(TARGET as never);
    expect(m.deactivateRepo).toHaveBeenCalledWith(existing.id);
    expect(repo.name).toMatch(/-v2$/);
  });

  it("shares one lookup between files resolving at the same time", async () => {
    const d = await load();
    m.listRepos.mockResolvedValue([]);
    const [a, b] = await Promise.all([
      d.resolveDirectRepo(TARGET as never),
      d.resolveDirectRepo(TARGET as never),
    ]);
    expect(a).toBe(b);
    expect(m.registerRepo).toHaveBeenCalledTimes(1);
    await d.resolveDirectRepo(TARGET as never);
    expect(m.listRepos).toHaveBeenCalledTimes(2);
  });
});

describe("pushDirectChunk", () => {
  const data = new Uint8Array([1, 2]);

  it("pushes with the user's own bot and returns the locator", async () => {
    const d = await load();
    m.uploadTelegramChunk.mockResolvedValue("5:F");
    const onProgress = vi.fn();
    const signal = new AbortController().signal;
    expect(await d.pushDirectChunk(TARGET as never, data, { onProgress, signal })).toBe("5:F");
    expect(m.uploadTelegramChunk).toHaveBeenCalledWith(TARGET.telegram, data, {
      onProgress,
      signal,
      failFastOnTransport: undefined,
    });
  });

  it("tries the whole push twice, half a second apart", async () => {
    vi.useFakeTimers();
    const d = await load();
    m.uploadTelegramChunk.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("6:G");
    const pending = d.pushDirectChunk(TARGET as never, data);
    await vi.advanceTimersByTimeAsync(500);
    expect(await pending).toBe("6:G");

    m.uploadTelegramChunk.mockRejectedValue(new Error("still down"));
    const failing = d.pushDirectChunk(TARGET as never, data).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(500);
    expect(((await failing) as Error).message).toBe("still down");
  });

  it("fails a first chunk fast when Telegram never answers", async () => {
    const d = await load();
    m.uploadTelegramChunk.mockRejectedValue(new TypeError("Network request failed"));
    const err = await d.pushDirectChunk(TARGET as never, data, { probe: true }).catch((e) => e);
    expect(d.isDirectUnreachable(err)).toBe(true);
    expect(m.uploadTelegramChunk).toHaveBeenCalledTimes(1);
    expect(m.uploadTelegramChunk.mock.calls[0][2]).toMatchObject({ failFastOnTransport: true });
  });

  it("never retries a pause", async () => {
    const d = await load();
    m.uploadTelegramChunk.mockRejectedValue(new Error("Upload paused"));
    await expect(d.pushDirectChunk(TARGET as never, data)).rejects.toThrow("Upload paused");
    expect(m.uploadTelegramChunk).toHaveBeenCalledTimes(1);
    expect(d.isDirectUnreachable(new Error("Upload paused"))).toBe(false);
  });
});
