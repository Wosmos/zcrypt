import { IDLE_TIMEOUT_MS, StalledError } from "@/lib/transport";

/** Longest a sender waits for the receiver's ack once the last byte is sent.
 *  The server keeps the room open longer (transferAckWait, 45s). */
export const TRANSFER_ACK_WAIT_MS = 30_000;

/** WebSocket close codes the server uses to say why it ended a transfer. */
const CLOSE_POLICY = 1008;
const CLOSE_TOO_BIG = 1009;

const explained = new WeakMap<object, CloseReasonKey>();

export type CloseReasonKey = "transfer.dailyLimit" | "transfer.tooLarge";

/**
 * Record why the server closed `ws`, when its close code says: this network's
 * daily Device Transfer limit, or a transfer over the size cap. Returns the
 * tools message key, or null for a close with no stated reason.
 */
export function explainClose(ws: object, code: number): CloseReasonKey | null {
  const key =
    code === CLOSE_POLICY
      ? "transfer.dailyLimit"
      : code === CLOSE_TOO_BIG
        ? "transfer.tooLarge"
        : null;
  if (key) explained.set(ws, key);
  return key;
}

/** The reason recorded for `ws` by explainClose, if any. */
export function closeReason(ws: object): CloseReasonKey | null {
  return explained.get(ws) ?? null;
}

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
