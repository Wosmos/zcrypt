import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FileMetadata } from "@/types";

const { sqlJsInit, dbState } = vi.hoisted(() => {
  type Row = {
    id: string;
    user_id: string;
    original_name: string;
    original_size: number;
    compressed_size: number;
    encrypted_size: number;
    chunk_count: number;
    sha256: string;
    created_at: string;
    folder_id: string | null;
  };

  const dbState: { throwOnAlter: boolean; instances: FakeDatabase[] } = {
    throwOnAlter: true,
    instances: [],
  };

  class FakeDatabase {
    fileCache = new Map<string, Row>();
    cacheMeta = new Map<string, string>();
    closed = false;
    exported = false;
    seededWith: Uint8Array | undefined;

    constructor(data?: Uint8Array) {
      this.seededWith = data;
      dbState.instances.push(this);
    }

    run(sql: string, params: unknown[] = []) {
      const q = sql.trim();
      if (q.startsWith("CREATE TABLE")) return;
      if (q.startsWith("ALTER TABLE")) {
        if (dbState.throwOnAlter) {
          throw new Error("duplicate column name: folder_id");
        }
        return;
      }
      if (q.startsWith("DELETE FROM file_cache")) {
        const [userId] = params as [string];
        for (const [id, row] of this.fileCache) {
          if (row.user_id === userId) this.fileCache.delete(id);
        }
        return;
      }
      if (q.startsWith("INSERT OR REPLACE INTO file_cache")) {
        const [
          id,
          user_id,
          original_name,
          original_size,
          compressed_size,
          encrypted_size,
          chunk_count,
          sha256,
          created_at,
          folder_id,
        ] = params as [
          string,
          string,
          string,
          number,
          number,
          number,
          number,
          string,
          string,
          string | null,
        ];
        this.fileCache.set(id, {
          id,
          user_id,
          original_name,
          original_size,
          compressed_size,
          encrypted_size,
          chunk_count,
          sha256,
          created_at,
          folder_id,
        });
        return;
      }
      if (q.startsWith("INSERT OR REPLACE INTO cache_meta")) {
        const [key, value] = params as [string, string];
        this.cacheMeta.set(key, value);
        return;
      }
      throw new Error(`FakeDatabase.run: unhandled query ${q}`);
    }

    exec(sql: string, params: unknown[] = []) {
      const q = sql.trim();
      if (q.startsWith("SELECT id, original_name")) {
        const [userId] = params as [string];
        const rows = [...this.fileCache.values()]
          .filter((r) => r.user_id === userId)
          .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
          .map((r) => [
            r.id,
            r.original_name,
            r.original_size,
            r.compressed_size,
            r.encrypted_size,
            r.chunk_count,
            r.sha256,
            r.created_at,
            r.folder_id,
          ]);
        return rows.length ? [{ values: rows }] : [];
      }
      if (q.startsWith("SELECT value FROM cache_meta")) {
        const [key] = params as [string];
        if (key === "files_updated_EMPTY_VALUES_MARKER") {
          return [{ values: [] }];
        }
        const value = this.cacheMeta.get(key);
        return value === undefined ? [] : [{ values: [[value]] }];
      }
      throw new Error(`FakeDatabase.exec: unhandled query ${q}`);
    }

    export() {
      this.exported = true;
      return new Uint8Array([9, 9, 9]);
    }

    close() {
      this.closed = true;
    }
  }

  const sqlJsInit = vi.fn(async (_opts: { locateFile: () => string }) => ({
    Database: FakeDatabase,
  }));
  return { sqlJsInit, dbState };
});

vi.mock("sql.js", () => ({ default: sqlJsInit }));

function file(overrides: Partial<FileMetadata> = {}): FileMetadata {
  return {
    id: "f1",
    original_name: "a.txt",
    original_size: 10,
    compressed_size: 8,
    encrypted_size: 12,
    chunk_count: 1,
    sha256: "deadbeef",
    created_at: "2026-01-01T00:00:00Z",
    folder_id: null,
    ...overrides,
  };
}

function flush() {
  return new Promise((r) => setTimeout(r, 0));
}

describe("offline-cache", () => {
  const originalStorage = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(navigator) as object,
    "storage"
  );

  beforeEach(() => {
    vi.resetModules();
    sqlJsInit.mockClear();
    dbState.throwOnAlter = true;
    dbState.instances = [];
    // jsdom doesn't define navigator.storage at all; delete any per-test override.
    delete (navigator as unknown as Record<string, unknown>).storage;
  });

  afterEach(() => {
    delete (navigator as unknown as Record<string, unknown>).storage;
    if (originalStorage) {
      Object.defineProperty(
        Object.getPrototypeOf(navigator) as object,
        "storage",
        originalStorage
      );
    }
  });

  describe("isOPFSAvailable", () => {
    it("is false when navigator.storage is absent", async () => {
      const { isOPFSAvailable } = await import("@/lib/offline-cache");
      expect(isOPFSAvailable()).toBe(false);
    });

    it("is true when navigator.storage.getDirectory exists", async () => {
      (navigator as unknown as { storage: unknown }).storage = {
        getDirectory: vi.fn(),
      };
      const { isOPFSAvailable } = await import("@/lib/offline-cache");
      expect(isOPFSAvailable()).toBe(true);
    });
  });

  describe("without OPFS", () => {
    it("creates a fresh in-memory db and round-trips files", async () => {
      const { getOfflineCache } = await import("@/lib/offline-cache");
      const cache = await getOfflineCache();

      expect(sqlJsInit).toHaveBeenCalledTimes(1);
      const initArg = sqlJsInit.mock.calls[0][0] as { locateFile: () => string };
      expect(initArg.locateFile()).toBe("/sql-wasm.wasm");
      expect(dbState.instances[0].seededWith).toBeUndefined();

      cache.setFiles("u1", [file()]);
      expect(cache.getFiles("u1")).toEqual([file()]);
      await flush();
    });

    it("caches the singleton — a second call reuses the same instance", async () => {
      const { getOfflineCache } = await import("@/lib/offline-cache");
      const a = await getOfflineCache();
      const b = await getOfflineCache();
      expect(a).toBe(b);
      expect(sqlJsInit).toHaveBeenCalledTimes(1);
    });

    it("getFiles returns [] for a user with no cached rows", async () => {
      const { getOfflineCache } = await import("@/lib/offline-cache");
      const cache = await getOfflineCache();
      expect(cache.getFiles("nobody")).toEqual([]);
    });

    it("getLastUpdate returns null before any files are set", async () => {
      const { getOfflineCache } = await import("@/lib/offline-cache");
      const cache = await getOfflineCache();
      expect(cache.getLastUpdate("u1")).toBeNull();
    });

    it("getLastUpdate returns an ISO timestamp after setFiles", async () => {
      const { getOfflineCache } = await import("@/lib/offline-cache");
      const cache = await getOfflineCache();
      cache.setFiles("u1", [file()]);
      await flush();
      expect(cache.getLastUpdate("u1")).toEqual(expect.any(String));
    });

    it("getLastUpdate returns null when the result row has no values", async () => {
      const { getOfflineCache } = await import("@/lib/offline-cache");
      const cache = await getOfflineCache();
      expect(cache.getLastUpdate("EMPTY_VALUES_MARKER")).toBeNull();
    });

    it("setFiles replaces the previous set and orders by created_at desc", async () => {
      const { getOfflineCache } = await import("@/lib/offline-cache");
      const cache = await getOfflineCache();
      cache.setFiles("u1", [
        file({ id: "old", created_at: "2026-01-01T00:00:00Z" }),
      ]);
      await flush();
      cache.setFiles("u1", [
        file({ id: "new", created_at: "2026-02-01T00:00:00Z", folder_id: "fold-1" }),
      ]);
      await flush();
      expect(cache.getFiles("u1")).toEqual([
        file({ id: "new", created_at: "2026-02-01T00:00:00Z", folder_id: "fold-1" }),
      ]);
    });

    it("runs the ALTER TABLE migration successfully on a pre-migration schema", async () => {
      dbState.throwOnAlter = false;
      const { getOfflineCache } = await import("@/lib/offline-cache");
      const cache = await getOfflineCache();
      expect(cache.getFiles("u1")).toEqual([]);
    });

    it("close() closes the underlying database", async () => {
      const { getOfflineCache } = await import("@/lib/offline-cache");
      const cache = await getOfflineCache();
      cache.close();
      expect(dbState.instances[0].closed).toBe(true);
    });
  });

  describe("with OPFS", () => {
    function fakeOPFS(opts: {
      existingData?: Uint8Array;
      getFileHandleReadThrows?: unknown;
      writeThrows?: unknown;
    }) {
      const writable = {
        write: vi.fn(async (data: ArrayBuffer) => {
          if (opts.writeThrows) throw opts.writeThrows;
          void data;
        }),
        close: vi.fn(async () => {}),
      };
      const fileHandle = {
        getFile: vi.fn(async () => ({
          arrayBuffer: async () =>
            (opts.existingData ?? new Uint8Array()).buffer,
        })),
        createWritable: vi.fn(async () => writable),
      };
      const root = {
        getFileHandle: vi.fn(async (_name: string, createOpts?: { create?: boolean }) => {
          if (!createOpts?.create) {
            if (opts.getFileHandleReadThrows) throw opts.getFileHandleReadThrows;
            if (!opts.existingData) throw new Error("NotFoundError");
          }
          return fileHandle;
        }),
      };
      (navigator as unknown as { storage: unknown }).storage = {
        getDirectory: vi.fn(async () => root),
      };
      return { root, fileHandle, writable };
    }

    it("loads existing data from OPFS and seeds the database with it", async () => {
      const existing = new Uint8Array([1, 2, 3]);
      fakeOPFS({ existingData: existing });
      const { getOfflineCache } = await import("@/lib/offline-cache");
      await getOfflineCache();
      expect(dbState.instances[0].seededWith).toBeInstanceOf(Uint8Array);
    });

    it("starts with a fresh database when no OPFS file exists yet", async () => {
      fakeOPFS({});
      const { getOfflineCache } = await import("@/lib/offline-cache");
      await getOfflineCache();
      expect(dbState.instances[0].seededWith).toBeUndefined();
    });

    it("loadFromOPFS swallows a generic read error and starts fresh", async () => {
      fakeOPFS({ getFileHandleReadThrows: new Error("boom") });
      const { getOfflineCache } = await import("@/lib/offline-cache");
      await getOfflineCache();
      expect(dbState.instances[0].seededWith).toBeUndefined();
    });

    it("persists to OPFS after setFiles", async () => {
      const { writable } = fakeOPFS({});
      const { getOfflineCache } = await import("@/lib/offline-cache");
      const cache = await getOfflineCache();
      cache.setFiles("u1", [file()]);
      await flush();
      expect(writable.write).toHaveBeenCalledTimes(1);
      expect(writable.close).toHaveBeenCalledTimes(1);
    });

    it("swallows a write failure during persist without throwing", async () => {
      fakeOPFS({ writeThrows: new Error("disk full") });
      const { getOfflineCache } = await import("@/lib/offline-cache");
      const cache = await getOfflineCache();
      expect(() => cache.setFiles("u1", [file()])).not.toThrow();
      await flush();
    });
  });

  it("persist() is a no-op when the cache isn't dirty", async () => {
    const { getOfflineCache } = await import("@/lib/offline-cache");
    const cache = await getOfflineCache();
    const instance = dbState.instances[0];
    // `dirty` and `persist` are TS-private only (soft, erased at runtime);
    // reaching in here is the only way to exercise persist()'s early-return
    // guard, since every public call site (setFiles) sets dirty=true just
    // before invoking it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyCache = cache as any;
    anyCache.dirty = false;
    await anyCache.persist();
    expect(instance.exported).toBe(false);
  });
});
