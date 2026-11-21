import { describe, it, expect, vi, afterEach } from "vitest";
import { closeReason, explainClose, waitForBuffer } from "@/lib/transfer-socket";
import { StalledError } from "@/lib/transport";

afterEach(() => vi.useRealTimers());

const open = WebSocket.OPEN;

describe("explainClose / closeReason", () => {
  it("names the daily limit and the size cap, and nothing for other closes", () => {
    const a = {};
    const b = {};
    const c = {};
    expect(explainClose(a, 1008)).toBe("transfer.dailyLimit");
    expect(explainClose(b, 1009)).toBe("transfer.tooLarge");
    expect(explainClose(c, 1006)).toBeNull();
    expect(closeReason(a)).toBe("transfer.dailyLimit");
    expect(closeReason(b)).toBe("transfer.tooLarge");
    expect(closeReason(c)).toBeNull();
  });
});

describe("waitForBuffer", () => {
  it("fails with a StalledError when the buffer makes no progress for the idle limit", async () => {
    vi.useFakeTimers();
    const ws = { bufferedAmount: 100, readyState: open };
    const p = waitForBuffer(ws, 0, "lost", 60_000);
    const assertion = expect(p).rejects.toBeInstanceOf(StalledError);
    await vi.advanceTimersByTimeAsync(60_100);
    await assertion;
  });

  it("keeps waiting while bytes are still draining, however long it takes overall", async () => {
    vi.useFakeTimers();
    const ws = { bufferedAmount: 1000, readyState: open };
    const timer = setInterval(() => (ws.bufferedAmount -= 1), 1_000);
    const p = waitForBuffer(ws, 0, "lost", 60_000);
    await vi.advanceTimersByTimeAsync(1_000_100);
    clearInterval(timer);
    await expect(p).resolves.toBeUndefined();
  });

  it("fails at once when the socket closes", async () => {
    const ws = { bufferedAmount: 5, readyState: WebSocket.CLOSED };
    await expect(waitForBuffer(ws, 0, "lost")).rejects.toThrow("lost");
  });

  it("returns when already under the limit", async () => {
    await expect(waitForBuffer({ bufferedAmount: 0, readyState: open }, 0, "lost")).resolves.toBeUndefined();
  });

  it("fails if the socket closed after the buffer drained", async () => {
    await expect(
      waitForBuffer({ bufferedAmount: 0, readyState: WebSocket.CLOSED }, 0, "lost"),
    ).rejects.toThrow("lost");
  });
});
