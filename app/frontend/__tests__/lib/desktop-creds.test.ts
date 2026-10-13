import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const setMock = vi.hoisted(() => vi.fn());
const delMock = vi.hoisted(() => vi.fn());

function load(tauri: boolean) {
  vi.resetModules();
  vi.doMock("@/lib/tauri", () => ({
    isTauri: tauri,
    keychainSet: setMock,
    keychainDelete: delMock,
  }));
  return import("@/lib/desktop-creds");
}

describe("desktop-creds", () => {
  beforeEach(() => {
    setMock.mockReset().mockResolvedValue(undefined);
    delMock.mockReset().mockResolvedValue(undefined);
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
});
