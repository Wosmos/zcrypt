import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const setMock = vi.hoisted(() => vi.fn());
const delMock = vi.hoisted(() => vi.fn());
const getMock = vi.hoisted(() => vi.fn());
const credsMock = vi.hoisted(() => vi.fn());
const statusMock = vi.hoisted(() => vi.fn());

function load(tauri: boolean) {
  vi.resetModules();
  vi.doMock("@/lib/tauri", () => ({
    isTauri: tauri,
    keychainGet: getMock,
    keychainSet: setMock,
    keychainDelete: delMock,
  }));
  vi.doMock("@/lib/api", () => ({ getPlatformCredentials: credsMock }));
  vi.doMock("@/store/platform", () => ({ ensurePlatformStatus: statusMock }));
  return import("@/lib/desktop-creds");
}

describe("desktop-creds", () => {
  beforeEach(() => {
    setMock.mockReset().mockResolvedValue(undefined);
    delMock.mockReset().mockResolvedValue(undefined);
    getMock.mockReset().mockResolvedValue(null);
    credsMock.mockReset();
    statusMock.mockReset().mockResolvedValue([]);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing outside Tauri", async () => {
    const m = await load(false);
    await m.storeDesktopPlatformCreds("github", "tok", "me");
    await m.clearDesktopPlatformCreds("github");
    expect(setMock).not.toHaveBeenCalled();
    expect(delMock).not.toHaveBeenCalled();
  });

  it("stores token and account", async () => {
    const m = await load(true);
    await m.storeDesktopPlatformCreds("github", "tok", "me");
    expect(setMock).toHaveBeenCalledWith("platform.github.token", "tok");
    expect(setMock).toHaveBeenCalledWith("platform.github.account", "me");
  });

  it("stores only the token when there is no account", async () => {
    const m = await load(true);
    await m.storeDesktopPlatformCreds("github", "tok");
    expect(setMock).toHaveBeenCalledTimes(1);
  });

  it("splits a telegram BOT|CHAT token", async () => {
    const m = await load(true);
    await m.storeDesktopPlatformCreds("telegram", "bot|123", "ignored");
    expect(setMock).toHaveBeenCalledWith("platform.telegram.token", "bot");
    expect(setMock).toHaveBeenCalledWith("platform.telegram.account", "123");
  });

  it("falls back to the raw telegram token when unparsable", async () => {
    const m = await load(true);
    await m.storeDesktopPlatformCreds("telegram", "plain", "u");
    expect(setMock).toHaveBeenCalledWith("platform.telegram.token", "plain");
    expect(setMock).toHaveBeenCalledWith("platform.telegram.account", "u");
  });

  it("swallows keychain store failures", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    setMock.mockRejectedValue(new Error("x"));
    const m = await load(true);
    await expect(m.storeDesktopPlatformCreds("github", "t")).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
  });

  it("clears both entries", async () => {
    const m = await load(true);
    await m.clearDesktopPlatformCreds("github");
    expect(delMock).toHaveBeenCalledWith("platform.github.token");
    expect(delMock).toHaveBeenCalledWith("platform.github.account");
  });

  it("swallows keychain clear failures", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    delMock.mockRejectedValue(new Error("x"));
    const m = await load(true);
    await expect(m.clearDesktopPlatformCreds("github")).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
  });

  describe("pickUpDesktopPlatformCreds", () => {
    const own = (platform: string) => ({ platform, connected: true, is_global: false });

    it("copies a token connected on the web into an empty keychain", async () => {
      statusMock.mockResolvedValue([own("telegram")]);
      credsMock.mockResolvedValue({ platform: "telegram", token: "bot|-100", account: "vault_bot" });
      const m = await load(true);
      await m.pickUpDesktopPlatformCreds("user-1");
      expect(getMock).toHaveBeenCalledWith("platform.telegram.token");
      expect(credsMock).toHaveBeenCalledWith("telegram");
      expect(setMock).toHaveBeenCalledWith("platform.telegram.token", "bot");
      expect(setMock).toHaveBeenCalledWith("platform.telegram.account", "-100");
    });

    it("never overwrites a token the keychain already holds", async () => {
      statusMock.mockResolvedValue([own("github")]);
      getMock.mockResolvedValue("ghp_local");
      const m = await load(true);
      await m.pickUpDesktopPlatformCreds("user-1");
      expect(credsMock).not.toHaveBeenCalled();
      expect(setMock).not.toHaveBeenCalled();
    });

    it("skips shared, disconnected and unconnected platforms", async () => {
      statusMock.mockResolvedValue([
        { platform: "telegram", connected: true, is_global: true },
        { platform: "github", connected: false },
      ]);
      const m = await load(true);
      await m.pickUpDesktopPlatformCreds("user-1");
      expect(getMock).not.toHaveBeenCalled();
      expect(credsMock).not.toHaveBeenCalled();
    });

    it("runs once per user and keeps going past a failing platform", async () => {
      const err = vi.spyOn(console, "error").mockImplementation(() => {});
      statusMock.mockResolvedValue([own("github"), own("gitlab")]);
      credsMock
        .mockRejectedValueOnce(new Error("404"))
        .mockResolvedValueOnce({ platform: "gitlab", token: "glpat", account: "me" });
      const m = await load(true);
      await m.pickUpDesktopPlatformCreds("user-1");
      await m.pickUpDesktopPlatformCreds("user-1");
      expect(credsMock).toHaveBeenCalledTimes(2);
      expect(setMock).toHaveBeenCalledWith("platform.gitlab.token", "glpat");
      expect(err).toHaveBeenCalled();
    });

    it("does nothing outside Tauri or without a user", async () => {
      statusMock.mockResolvedValue([own("telegram")]);
      const web = await load(false);
      await web.pickUpDesktopPlatformCreds("user-1");
      const desktop = await load(true);
      await desktop.pickUpDesktopPlatformCreds("");
      expect(statusMock).not.toHaveBeenCalled();
    });
  });
});
