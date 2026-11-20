import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  probeTelegram: vi.fn(),
  resetTelegramUnreachable: vi.fn(),
  isTauri: false,
  transferRetryNow: vi.fn(async () => {}),
}));
vi.mock("@/lib/tauri", () => ({
  get isTauri() {
    return h.isTauri;
  },
  transferRetryNow: h.transferRetryNow,
}));
vi.mock("@/lib/telegram-reach", () => ({ probeTelegram: h.probeTelegram }));
vi.mock("@/lib/telegram-download", () => ({ resetTelegramUnreachable: h.resetTelegramUnreachable }));

import {
  RECHECK_MS,
  cancelAllTransferWaits,
  hasTransferWaits,
  retryWaitingNow,
  tryAgainNow,
  waitForTelegram,
} from "@/lib/transfer-wait";
import { WaitReason, applyEngineWait, useTransferWait } from "@/store/transfer-wait";

const BLOCKED = WaitReason.TelegramBlocked;

beforeEach(() => {
  vi.useFakeTimers();
  h.probeTelegram.mockReset().mockResolvedValue("blocked");
  h.resetTelegramUnreachable.mockReset();
  h.transferRetryNow.mockReset().mockResolvedValue(undefined);
  h.isTauri = false;
});
afterEach(() => {
  cancelAllTransferWaits();
  vi.useRealTimers();
});

describe("waitForTelegram", () => {
  it("marks the row waiting with the reason", () => {
    void waitForTelegram("up:1", BLOCKED).catch(() => {});
    expect(useTransferWait.getState().waits["up:1"]).toBe(BLOCKED);
  });

  it("looks again every 10 seconds, forcing past the cache, and resumes the moment Telegram answers", async () => {
    let settled = false;
    const p = waitForTelegram("up:1", BLOCKED).then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(RECHECK_MS);
    expect(h.probeTelegram).toHaveBeenCalledWith(true);
    expect(settled).toBe(false);
    h.probeTelegram.mockResolvedValue("ok");
    await vi.advanceTimersByTimeAsync(RECHECK_MS);
    await p;
    expect(settled).toBe(true);
    expect(useTransferWait.getState().waits["up:1"]).toBeUndefined();
    expect(h.resetTelegramUnreachable).toHaveBeenCalled();
  });

  it("shares one poller across waiting transfers and stops it when none wait", async () => {
    const a = waitForTelegram("up:1", BLOCKED);
    const b = waitForTelegram("dl:2", BLOCKED);
    await vi.advanceTimersByTimeAsync(RECHECK_MS);
    expect(h.probeTelegram).toHaveBeenCalledTimes(1);
    h.probeTelegram.mockResolvedValue("ok");
    await vi.advanceTimersByTimeAsync(RECHECK_MS);
    await Promise.all([a, b]);
    expect(hasTransferWaits()).toBe(false);
    h.probeTelegram.mockClear();
    await vi.advanceTimersByTimeAsync(RECHECK_MS * 3);
    expect(h.probeTelegram).not.toHaveBeenCalled();
  });

  it("'Try again' checks now instead of at the next tick", async () => {
    const p = waitForTelegram("up:1", BLOCKED);
    h.probeTelegram.mockResolvedValue("ok");
    await retryWaitingNow();
    await p;
    expect(h.probeTelegram).toHaveBeenCalledWith(true);
    expect(useTransferWait.getState().waits).toEqual({});
  });

  it("does not stack checks when Try again is pressed twice", async () => {
    void waitForTelegram("up:1", BLOCKED).catch(() => {});
    await Promise.all([retryWaitingNow(), retryWaitingNow()]);
    expect(h.probeTelegram).toHaveBeenCalledTimes(1);
  });

  it("'Try again' with nothing waiting does not probe Telegram", async () => {
    await retryWaitingNow();
    expect(h.probeTelegram).not.toHaveBeenCalled();
    expect(h.resetTelegramUnreachable).not.toHaveBeenCalled();
  });

  it("an abort that arrives after the wait already resumed leaves a newer wait on the same row alone", async () => {
    const ctl = new AbortController();
    const first = waitForTelegram("up:1", BLOCKED, ctl.signal);
    h.probeTelegram.mockResolvedValue("ok");
    await retryWaitingNow();
    await first;

    h.probeTelegram.mockResolvedValue("blocked");
    void waitForTelegram("up:1", BLOCKED).catch(() => {});
    ctl.abort();

    expect(useTransferWait.getState().waits).toEqual({ "up:1": BLOCKED });
    expect(hasTransferWaits()).toBe(true);
  });

  it("stops waiting for a cancelled transfer and leaves the others waiting", async () => {
    const ctl = new AbortController();
    const a = waitForTelegram("up:1", BLOCKED, ctl.signal);
    void waitForTelegram("up:2", BLOCKED).catch(() => {});
    ctl.abort();
    await expect(a).rejects.toMatchObject({ name: "AbortError" });
    expect(useTransferWait.getState().waits).toEqual({ "up:2": BLOCKED });
    expect(hasTransferWaits()).toBe(true);
  });

  it("rejects at once for a signal that is already aborted", async () => {
    const ctl = new AbortController();
    ctl.abort();
    await expect(waitForTelegram("up:1", BLOCKED, ctl.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(hasTransferWaits()).toBe(false);
  });

  it("stops everything on logout", async () => {
    const a = waitForTelegram("up:1", BLOCKED);
    const b = waitForTelegram("dl:2", WaitReason.AllowanceUsedUp);
    cancelAllTransferWaits();
    await expect(a).rejects.toMatchObject({ name: "AbortError" });
    await expect(b).rejects.toMatchObject({ name: "AbortError" });
    expect(useTransferWait.getState().waits).toEqual({});
    h.probeTelegram.mockClear();
    await vi.advanceTimersByTimeAsync(RECHECK_MS * 2);
    expect(h.probeTelegram).not.toHaveBeenCalled();
  });
});

describe("applyEngineWait", () => {
  it("marks a row the engine reports as waiting, with its reason", () => {
    applyEngineWait("up:9", { stage: "waiting", waiting: "allowance_used_up" });
    expect(useTransferWait.getState().waits["up:9"]).toBe(WaitReason.AllowanceUsedUp);
  });

  it("assumes Telegram when the engine names no reason", () => {
    applyEngineWait("up:9", { stage: "waiting" });
    expect(useTransferWait.getState().waits["up:9"]).toBe(BLOCKED);
  });

  it("clears the row once the engine reports any other stage", () => {
    applyEngineWait("up:9", { stage: "waiting", waiting: "telegram_blocked" });
    applyEngineWait("up:9", { stage: "uploading" });
    expect(useTransferWait.getState().waits).toEqual({});
  });
});

describe("tryAgainNow", () => {
  it("in the browser, checks Telegram for this tab's waits and does not touch the engine", async () => {
    const p = waitForTelegram("up:1", BLOCKED);
    h.probeTelegram.mockResolvedValue("ok");
    await tryAgainNow();
    await p;
    expect(h.probeTelegram).toHaveBeenCalledWith(true);
    expect(h.transferRetryNow).not.toHaveBeenCalled();
  });

  it("in the desktop or Android app, also wakes the engine's own waiting transfers", async () => {
    h.isTauri = true;
    await tryAgainNow();
    expect(h.transferRetryNow).toHaveBeenCalledTimes(1);
  });

  it("still resolves and still checks Telegram when the engine call fails", async () => {
    h.isTauri = true;
    h.transferRetryNow.mockRejectedValue(new Error("engine gone"));
    const p = waitForTelegram("up:1", BLOCKED);
    h.probeTelegram.mockResolvedValue("ok");
    await expect(tryAgainNow()).resolves.toBeUndefined();
    await p;
  });
});
