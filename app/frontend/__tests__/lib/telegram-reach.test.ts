import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { probeTelegram } from "@/lib/telegram-reach";

describe("probeTelegram", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("reports ok when Telegram answers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null)));
    expect(await probeTelegram()).toBe("ok");
  });

  it("reports blocked when the connection fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await probeTelegram()).toBe("blocked");
  });

  it("reuses a recent result unless forced", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    await probeTelegram();
    await probeTelegram();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValue(new Response(null));
    expect(await probeTelegram(true)).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("checks again once the cached result is old", async () => {
    sessionStorage.setItem(
      "zcrypt:telegram-reach",
      JSON.stringify({ at: Date.now() - 11 * 60 * 1000, reach: "blocked" }),
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null)));
    expect(await probeTelegram()).toBe("ok");
  });

  it("calls Telegram blocked when it never answers", async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          (_url: string, init: RequestInit) =>
            new Promise((_resolve, reject) => {
              init.signal?.addEventListener("abort", () => reject(new DOMException("aborted")));
            }),
        ),
      );
      const reach = probeTelegram(true);
      await vi.advanceTimersByTimeAsync(6000);
      expect(await reach).toBe("blocked");
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores a corrupt cached result and checks again", async () => {
    sessionStorage.setItem("zcrypt:telegram-reach", "{not json");
    const fetchMock = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchMock);
    expect(await probeTelegram()).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still answers when the result cannot be stored", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    try {
      expect(await probeTelegram(true)).toBe("blocked");
    } finally {
      setItem.mockRestore();
    }
  });

  it("does not call Telegram blocked while the device is offline", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(navigator, "onLine", "get").mockReturnValueOnce(false);
    expect(await probeTelegram(true)).toBe("ok");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
