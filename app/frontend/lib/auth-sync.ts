export interface SyncedTokens {
  accessToken: string;
  refreshToken: string;
}

const CHANNEL = "zcrypt-auth";

let channel: BroadcastChannel | null | undefined;

function open(): BroadcastChannel | null {
  if (channel === undefined) {
    channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
  }
  return channel;
}

/** Tell the other tabs of this browser profile about a freshly rotated pair. A
 *  refresh token is spent on use, so a tab still holding the previous one would
 *  be refused and logged out. */
export function broadcastTokens(tokens: SyncedTokens): void {
  open()?.postMessage(tokens);
}

/** Adopt pairs rotated by other tabs. Returns the unsubscribe. */
export function onTokensFromOtherTabs(handler: (tokens: SyncedTokens) => void): () => void {
  const ch = open();
  if (!ch) return () => {};
  const listener = (e: MessageEvent<SyncedTokens>) => {
    const d = e.data;
    if (d && typeof d.accessToken === "string" && typeof d.refreshToken === "string") handler(d);
  };
  ch.addEventListener("message", listener);
  return () => ch.removeEventListener("message", listener);
}

/** Run `fn` while no other tab is refreshing. Without Web Locks it just runs. */
export function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  return locks ? locks.request("zcrypt-refresh", fn) : fn();
}
