import { describe, it, expect, vi, afterEach } from "vitest";
import { waitForBuffer } from "@/lib/transfer-socket";
import { StalledError } from "@/lib/transport";

afterEach(() => vi.useRealTimers());

const open = WebSocket.OPEN;

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
