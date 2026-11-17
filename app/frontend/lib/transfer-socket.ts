import { IDLE_TIMEOUT_MS, StalledError } from "@/lib/transport";

/** Longest a sender waits for the receiver's ack once the last byte is sent. */
export const TRANSFER_ACK_WAIT_MS = 30_000;

/** Largest file the receiving page holds in memory before saving it. */
export const TRANSFER_MAX_RECEIVE_BYTES = 1024 * 1024 * 1024;

/**
 * Wait until the socket's send buffer drains to `limit`. The wait fails with a
 * StalledError when the buffer makes no progress for the shared idle limit, so a
 * peer that stopped reading cannot hang the sender forever.
 */
export async function waitForBuffer(
  ws: Pick<WebSocket, "bufferedAmount" | "readyState">,
  limit: number,
  connLost: string,
  idleMs = IDLE_TIMEOUT_MS,
): Promise<void> {
  let last = ws.bufferedAmount;
  let movedAt = Date.now();
  while (ws.bufferedAmount > limit) {
    if (ws.readyState !== WebSocket.OPEN) throw new Error(connLost);
    if (ws.bufferedAmount < last) movedAt = Date.now();
    last = ws.bufferedAmount;
    if (Date.now() - movedAt >= idleMs) {
      throw new StalledError(`Transfer stalled: no bytes moved for ${Math.round(idleMs / 1000)}s`);
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  if (ws.readyState !== WebSocket.OPEN) throw new Error(connLost);
}
