import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { QueryClient, keepPreviousData, type Query } from "@tanstack/react-query";
import type { PersistedClient } from "@tanstack/react-query-persist-client";

const idb = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  throwSync: false,
}));
vi.mock("idb-keyval", () => {
  const guard = () => {
    if (idb.throwSync) throw new ReferenceError("indexedDB is not defined");
  };
  return {
    get: vi.fn((k: string) => {
      guard();
      return Promise.resolve(idb.store.get(k));
    }),
    set: vi.fn((k: string, v: unknown) => {
      guard();
      idb.store.set(k, v);
      return Promise.resolve();
    }),
    del: vi.fn((k: string) => {
      guard();
      idb.store.delete(k);
      return Promise.resolve();
    }),
  };
});

import {
  queryClient,
  queryPersister,
  shouldPersistQuery,
  scrubPersistedClient,
  setPersistUser,
  flushPersistedCache,
  wipeQueryCache,
  revalidateRestored,
  PERSIST_KEY,
  PERSIST_MAX_AGE,
} from "@/lib/query-client";
import { set as idbSet } from "idb-keyval";

function snapshot(queries: { key: unknown[]; data: unknown }[]): PersistedClient {
  return {
    timestamp: 1,
    buster: "",
    clientState: {
      mutations: [],
      queries: queries.map((q) => ({
        queryKey: q.key,
        queryHash: JSON.stringify(q.key),
        state: { data: q.data, status: "success" },
      })),
    },
  } as unknown as PersistedClient;
}

beforeEach(() => {
  idb.store.clear();
  idb.throwSync = false;
  setPersistUser(null);
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("queryClient", () => {
  it("is a QueryClient instance and a singleton", async () => {
    expect(queryClient).toBeInstanceOf(QueryClient);
    const mod = await import("@/lib/query-client");
    expect(mod.queryClient).toBe(queryClient);
  });

  it("keeps a 30s default freshness, a day of gc (the persist max age), one retry", () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(30_000);
    expect(defaults.queries?.gcTime).toBe(PERSIST_MAX_AGE);
    expect(PERSIST_MAX_AGE).toBe(24 * 60 * 60_000);
    expect(defaults.queries?.retry).toBe(1);
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
    expect(defaults.queries?.refetchOnReconnect).toBe(true);
  });

  it("sets per-class stale times", () => {
    const stale = (key: unknown[]) => queryClient.getQueryDefaults(key).staleTime;
    expect(stale(["files"])).toBe(Infinity);
    expect(stale(["folders", null])).toBe(Infinity);
    expect(stale(["analytics", "summary", "x"])).toBe(Infinity);
    expect(stale(["quota"])).toBe(5 * 60_000);
    expect(stale(["platforms"])).toBe(5 * 60_000);
    expect(stale(["repos"])).toBe(5 * 60_000);
    expect(stale(["spaces"])).toBe(2 * 60_000);
    expect(stale(["space", "id"])).toBe(2 * 60_000);
    expect(stale(["trash"])).toBe(2 * 60_000);
    expect(stale(["admin", "users"])).toBe(2 * 60_000);
    expect(queryClient.getQueryDefaults(["admin", "users"]).placeholderData).toBe(keepPreviousData);
  });
});

describe("persistence policy", () => {
  const q = (key: unknown[], status = "success") =>
    ({ queryKey: key, state: { status } }) as unknown as Query;

  it("persists only ciphertext / non-secret roots, and only settled data", () => {
    for (const root of ["files", "folders", "quota", "platforms", "spaces", "analytics", "admin"]) {
      expect(shouldPersistQuery(q([root]))).toBe(true);
    }
    for (const root of ["tools", "settings", "shares", "file-meta", "space", "trash"]) {
      expect(shouldPersistQuery(q([root]))).toBe(false);
    }
    expect(shouldPersistQuery(q(["files"], "pending"))).toBe(false);
  });

  it("scrubs any plaintext name riding next to a ciphertext before it is written", () => {
    const out = scrubPersistedClient(
      snapshot([
        {
          key: ["files"],
          data: [
            { id: "1", encrypted_name: "CT", original_name: "leak.txt", style: { icon: "x" } },
            { id: "2", encrypted_name: "", original_name: "legacy.txt" },
            null,
          ],
        },
        { key: ["quota"], data: { used_bytes: 1 } },
      ]),
    );
    const files = out.clientState.queries[0].state.data as Record<string, unknown>[];
    expect(files[0]).toMatchObject({ original_name: "", style: null, encrypted_name: "CT" });
    expect(files[1]).toMatchObject({ original_name: "legacy.txt" });
    expect(files[2]).toBeNull();
    expect(out.clientState.queries[1].state.data).toEqual({ used_bytes: 1 });
  });
});

describe("queryPersister (IndexedDB)", () => {
  it("writes nothing while no user is signed in", async () => {
    await queryPersister.persistClient(snapshot([{ key: ["files"], data: [] }]));
    await flushPersistedCache();
    expect(idb.store.has(PERSIST_KEY)).toBe(false);
  });

  it("throttles writes and stamps the signed-in user as the buster", async () => {
    vi.useFakeTimers();
    setPersistUser("user-1");
    queryPersister.persistClient(snapshot([{ key: ["files"], data: [1] }]));
    queryPersister.persistClient(snapshot([{ key: ["files"], data: [2] }]));
    expect(idb.store.has(PERSIST_KEY)).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    const saved = idb.store.get(PERSIST_KEY) as PersistedClient;
    expect(saved.buster).toBe("user-1");
    expect(saved.clientState.queries[0].state.data).toEqual([2]);
    expect(idbSet).toHaveBeenCalledTimes(1);
  });

  it("flush with nothing pending is a no-op", async () => {
    setPersistUser("user-1");
    await expect(flushPersistedCache()).resolves.toBeUndefined();
    expect(idb.store.has(PERSIST_KEY)).toBe(false);
  });

  it("restores what was written", async () => {
    idb.store.set(PERSIST_KEY, snapshot([{ key: ["quota"], data: 5 }]));
    const restored = await queryPersister.restoreClient();
    expect(restored?.clientState.queries[0].state.data).toBe(5);
  });

  it("removeClient drops the snapshot and any pending write", async () => {
    vi.useFakeTimers();
    setPersistUser("user-1");
    idb.store.set(PERSIST_KEY, snapshot([]));
    queryPersister.persistClient(snapshot([{ key: ["files"], data: [1] }]));
    await queryPersister.removeClient();
    await vi.advanceTimersByTimeAsync(2000);
    expect(idb.store.has(PERSIST_KEY)).toBe(false);
    await queryPersister.removeClient(); // nothing pending, no timer
  });

  it("degrades to no cache when IndexedDB throws synchronously or rejects", async () => {
    idb.throwSync = true;
    await expect(queryPersister.restoreClient()).resolves.toBeUndefined();
    await expect(queryPersister.removeClient()).resolves.toBeUndefined();
    setPersistUser("user-1");
    queryPersister.persistClient(snapshot([]));
    await expect(flushPersistedCache()).resolves.toBeUndefined();
    idb.throwSync = false;
    vi.mocked(idbSet).mockRejectedValueOnce(new Error("quota"));
    queryPersister.persistClient(snapshot([]));
    await expect(flushPersistedCache()).resolves.toBeUndefined();
  });

  it("wipeQueryCache clears memory and disk", async () => {
    idb.store.set(PERSIST_KEY, snapshot([]));
    queryClient.setQueryData(["files"], [1]);
    await wipeQueryCache();
    expect(queryClient.getQueryData(["files"])).toBeUndefined();
    expect(idb.store.has(PERSIST_KEY)).toBe(false);
  });
});

describe("revalidateRestored", () => {
  it("marks restored files, folders and analytics stale and leaves other classes fresh", async () => {
    queryClient.clear();
    queryClient.setQueryData(["files"], []);
    queryClient.setQueryData(["folders", "root"], []);
    queryClient.setQueryData(["analytics", "insights", "7d"], {});
    queryClient.setQueryData(["quota"], {});
    await revalidateRestored();
    const stale = (k: unknown[]) => queryClient.getQueryState(k)?.isInvalidated;
    expect(stale(["files"])).toBe(true);
    expect(stale(["folders", "root"])).toBe(true);
    expect(stale(["analytics", "insights", "7d"])).toBe(true);
    expect(stale(["quota"])).toBe(false);
    queryClient.clear();
  });
});
