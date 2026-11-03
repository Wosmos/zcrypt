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

  it("does not call Telegram blocked while the device is offline", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(navigator, "onLine", "get").mockReturnValueOnce(false);
    expect(await probeTelegram(true)).toBe("ok");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
