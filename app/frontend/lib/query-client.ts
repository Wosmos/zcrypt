import { QueryClient, keepPreviousData, type Query } from "@tanstack/react-query";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { get, set, del } from "idb-keyval";

/**
 * Singleton QueryClient shared by the React provider AND by non-component code
 * (auth-guard prefetch, the download/transfer stores, folder-protection) that
 * needs to read or invalidate server-state outside of a hook. Importing this
 * module everywhere guarantees there is exactly ONE cache: which is the whole
 * point: one source of truth for files/trash, no second stale copy.
 */
export const PERSIST_MAX_AGE = 24 * 60 * 60_000;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A remount within 30s serves cache instantly and refetches in the
      // background. `invalidateQueries` after a mutation forces an immediate
      // refetch regardless of this. Data classes override it below.
      staleTime: 30_000,
      // Kept for a day so the persisted snapshot (same max age) can restore it.
      gcTime: PERSIST_MAX_AGE,
      retry: 1,
      // Do NOT refetch just because the window/tab regained focus. Focus and
      // visibilitychange events fire constantly during normal use (alt-tab,
      // clicking into DevTools, OS notifications), and refetching every active
      // query on each one hammers the API for no user-visible benefit. Freshness
      // is driven by staleTime + explicit invalidateQueries after mutations.
      refetchOnWindowFocus: false,
      // Only refetch on an actual network reconnect (rare, and genuinely useful).
      refetchOnReconnect: true,
    },
  },
});

// Per-class freshness. Files and folders are kept fresh by SSE events and
// mutation invalidation, and analytics windows are immutable once resolved, so
// neither ever goes stale on a timer.
const MIN = 60_000;
queryClient.setQueryDefaults(["files"], { staleTime: Infinity });
queryClient.setQueryDefaults(["folders"], { staleTime: Infinity });
queryClient.setQueryDefaults(["analytics"], { staleTime: Infinity });
queryClient.setQueryDefaults(["quota"], { staleTime: 5 * MIN });
queryClient.setQueryDefaults(["platforms"], { staleTime: 5 * MIN });
queryClient.setQueryDefaults(["repos"], { staleTime: 5 * MIN });
queryClient.setQueryDefaults(["spaces"], { staleTime: 2 * MIN });
queryClient.setQueryDefaults(["space"], { staleTime: 2 * MIN });
queryClient.setQueryDefaults(["trash"], { staleTime: 2 * MIN });
queryClient.setQueryDefaults(["admin"], { staleTime: 2 * MIN, placeholderData: keepPreviousData });

// ── Persistence ──────────────────────────────────────────────────────────────
// Only server data that is already ciphertext or non-secret is written to disk:
// the raw file/folder lists (names stay `encrypted_name`), quota, platforms,
// spaces, analytics and admin. Anything holding decrypted plaintext (settings,
// tools, share dialogs) lives in memory only.
const PERSIST_ROOTS = new Set([
  "files",
  "folders",
  "quota",
  "platforms",
  "spaces",
  "analytics",
  "admin",
]);
export const PERSIST_KEY = "zcrypt-query-cache";

export function shouldPersistQuery(query: Query): boolean {
  return query.state.status === "success" && PERSIST_ROOTS.has(String(query.queryKey[0]));
}

// Defense in depth: an optimistic row (e.g. a just-finished upload) may carry
// its plaintext name next to the ciphertext. Blank it before it touches disk.
function scrub(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((it) =>
    it && typeof it === "object" && (it as { encrypted_name?: string }).encrypted_name
      ? { ...it, original_name: "", style: null }
      : it,
  );
}

export function scrubPersistedClient(client: PersistedClient): PersistedClient {
  return {
    ...client,
    clientState: {
      ...client.clientState,
      queries: client.clientState.queries.map((q) => ({
        ...q,
        state: { ...q.state, data: scrub(q.state.data) },
      })),
    },
  };
}

// IndexedDB can be missing or blocked (private windows, SSR, tests): every call
// degrades to "no persisted cache" instead of throwing.
function idb<T>(op: () => Promise<T>): Promise<T | undefined> {
  try {
    return op().catch(() => undefined);
  } catch {
    return Promise.resolve(undefined);
  }
}

const WRITE_THROTTLE_MS = 1000;
let pending: PersistedClient | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
// The signed-in user the snapshot belongs to. Stamped as the buster at write
// time, so a snapshot only ever restores for the same user (store/auth sets it).
let persistUserId: string | null = null;

export function setPersistUser(id: string | null): void {
  persistUserId = id;
}

function flush(): Promise<void> {
  timer = null;
  const next = pending;
  pending = null;
  if (!next || !persistUserId) return Promise.resolve();
  const stamped = scrubPersistedClient({ ...next, buster: persistUserId });
  return idb(() => set(PERSIST_KEY, stamped)).then(() => undefined);
}

/** IndexedDB persister (idb-keyval), throttled to one write per second. */
export const queryPersister: Persister = {
  persistClient: (client) => {
    if (!persistUserId) return;
    pending = client;
    if (!timer) timer = setTimeout(() => void flush(), WRITE_THROTTLE_MS);
  },
  restoreClient: () => idb(() => get<PersistedClient>(PERSIST_KEY)),
  removeClient: () => {
    pending = null;
    if (timer) clearTimeout(timer);
    timer = null;
    return idb(() => del(PERSIST_KEY)).then(() => undefined);
  },
};

// Restored lists paint instantly but may predate changes made elsewhere while
// the tab was closed. The never-stale classes are marked stale once, so each
// refetches the first time it is active again.
const RESTORE_REVALIDATE = new Set(["files", "folders", "analytics"]);

export function revalidateRestored(): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (q) => RESTORE_REVALIDATE.has(String(q.queryKey[0])),
  });
}

/** Test hook: write any throttled snapshot now. */
export const flushPersistedCache = flush;

/** Drop every cached query in memory AND on disk (logout / user switch). */
export function wipeQueryCache(): Promise<void> {
  queryClient.clear();
  return Promise.resolve(queryPersister.removeClient());
}
