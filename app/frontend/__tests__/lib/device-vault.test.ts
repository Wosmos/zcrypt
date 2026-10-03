import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";

const invokeMock = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
import {
  persistPassphrase,
  loadPassphrase,
  clearPersistedPassphrase,
} from "@/lib/device-vault";

// jsdom ships no IndexedDB, so the module's `available()` guard normally
// short-circuits everything. Supply an in-memory IndexedDB (fresh per test) and a
// real WebCrypto (Node's global) so the encrypt-at-rest paths actually run.
describe("device-vault", () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
  });

  it("persists and loads a passphrase round-trip (encrypted at rest)", async () => {
    await persistPassphrase("hunter2");
    expect(await loadPassphrase()).toBe("hunter2");
  });

  it("returns null when nothing is stored", async () => {
    expect(await loadPassphrase()).toBeNull();
  });

  it("reuses the existing device key across repeated persists", async () => {
    await persistPassphrase("first");
    await persistPassphrase("second"); // getDeviceKey hits the existing-key branch
    expect(await loadPassphrase()).toBe("second");
  });

  it("forgets the persisted passphrase on clear (key is kept)", async () => {
    await persistPassphrase("secret");
    await clearPersistedPassphrase();
    expect(await loadPassphrase()).toBeNull();
  });

  it("returns null when the stored record can't be decrypted (tampered/corrupt)", async () => {
    await persistPassphrase("secret");
    // Flip a byte of the stored ciphertext so AES-GCM auth fails on load,
    // exercising loadPassphrase's decrypt-failure catch.
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("zcrypt-device-vault", 1);
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction("kv", "readwrite");
        const store = tx.objectStore("kv");
        const getReq = store.get("passphrase");
        getReq.onsuccess = () => {
          const rec = getReq.result as { iv: Uint8Array; ct: ArrayBuffer };
          new Uint8Array(rec.ct)[0] ^= 0xff; // corrupt in place
          store.put(rec, "passphrase");
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      open.onerror = () => reject(open.error);
    });
    expect(await loadPassphrase()).toBeNull();
  });

  it("swallows an openDB failure (e.g. a version conflict) as a safe no-op", async () => {
    // The module always opens at version 1. Pre-opening the same DB at version 2
    // ourselves means the module's own indexedDB.open() then fails with a
    // VersionError instead of succeeding, exercising openDB's onerror -> reject
    // path (persistPassphrase's try/catch is what makes this a safe no-op).
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("zcrypt-device-vault", 2);
      req.onupgradeneeded = () => req.result.createObjectStore("kv");
      req.onsuccess = () => {
        req.result.close();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });

    await expect(persistPassphrase("x")).resolves.toBeUndefined();
    expect(await loadPassphrase()).toBeNull();
  });

  it("is a safe no-op when IndexedDB is unavailable", async () => {
    const saved = globalThis.indexedDB;
    // @ts-expect-error force the !available() branch
    delete globalThis.indexedDB;
    await expect(persistPassphrase("x")).resolves.toBeUndefined();
    expect(await loadPassphrase()).toBeNull();
    await expect(clearPersistedPassphrase()).resolves.toBeUndefined();
    globalThis.indexedDB = saved;
  });

  it("returns null when the store read itself errors", async () => {
    // fake-indexeddb has no way to fail an individual request, so stand in a
    // minimal IDB whose read rejects: the caller must degrade to "not stored"
    // rather than propagate, or an unreadable vault would break unlock entirely.
    const failingRequest = () => {
      const req = { error: new Error("read failed") } as unknown as IDBRequest & {
        onerror?: () => void;
      };
      setTimeout(() => req.onerror?.(), 0);
      return req;
    };
    const db = {
      transaction: () => ({ objectStore: () => ({ get: failingRequest }) }),
      close: () => {},
    };
    const saved = globalThis.indexedDB;
    globalThis.indexedDB = {
      open: () => {
        const req = { result: db } as unknown as IDBOpenDBRequest & { onsuccess?: () => void };
        setTimeout(() => req.onsuccess?.(), 0);
        return req;
      },
    } as unknown as IDBFactory;

    expect(await loadPassphrase()).toBeNull();
    globalThis.indexedDB = saved;
  });

  it("returns null when opening the database errors", async () => {
    const saved = globalThis.indexedDB;
    globalThis.indexedDB = {
      open: () => {
        const req = { error: new Error("blocked") } as unknown as IDBOpenDBRequest & {
          onerror?: () => void;
        };
        setTimeout(() => req.onerror?.(), 0);
        return req;
      },
    } as unknown as IDBFactory;

    expect(await loadPassphrase()).toBeNull();
    globalThis.indexedDB = saved;
  });
});

// The Tauri shell uses extractable keys to stay out of WebKit's keychain-backed
// The Tauri shell keeps the passphrase in the OS keychain. An IndexedDB record
// left by an older build is read once (migrating a legacy non-extractable key
// on the way, its last keychain prompt), moved into the keychain and deleted.
describe("device-vault (Tauri shell): OS keychain", () => {
  const DB = "zcrypt-device-vault";
  const STORE = "kv";
  const keychain = new Map<string, string>();

  function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function put(id: string, value: unknown): Promise<void> {
    return open().then(
      (db) =>
        new Promise((resolve, reject) => {
          const t = db.transaction(STORE, "readwrite");
          t.objectStore(STORE).put(value, id);
          t.oncomplete = () => {
            db.close();
            resolve();
          };
          t.onerror = () => reject(t.error);
        }),
    );
  }
  function get<T>(id: string): Promise<T | undefined> {
    return open().then(
      (db) =>
        new Promise((resolve, reject) => {
          const req = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
          req.onsuccess = () => {
            db.close();
            resolve(req.result as T | undefined);
          };
          req.onerror = () => reject(req.error);
        }),
    );
  }
  async function seedRecord(extractable: boolean, passphrase?: string): Promise<void> {
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, extractable, [
      "encrypt",
      "decrypt",
    ]);
    await put("device-key", key);
    if (passphrase !== undefined) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode(passphrase),
      );
      await put("passphrase", { iv, ct });
    }
  }
  async function mod() {
    vi.resetModules();
    return import("@/lib/device-vault");
  }

  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    keychain.clear();
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (cmd: string, args: { key: string; value?: string }) => {
      if (cmd === "keychain_set") keychain.set(args.key, args.value as string);
      if (cmd === "keychain_get") return keychain.get(args.key) ?? null;
      if (cmd === "keychain_delete") keychain.delete(args.key);
      return undefined;
    });
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  });
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    vi.resetModules();
  });

  it("stores the passphrase in the keychain and never in IndexedDB", async () => {
    const m = await mod();
    await m.persistPassphrase("fresh");
    expect(keychain.get("vault.passphrase")).toBe("fresh");
    expect(await get("passphrase")).toBeUndefined();
    expect(await m.loadPassphrase()).toBe("fresh");
  });

  it("returns null when neither the keychain nor IndexedDB holds a passphrase", async () => {
    const m = await mod();
    expect(await m.loadPassphrase()).toBeNull();
  });

  it("moves a record from a recent build into the keychain and deletes it", async () => {
    await seedRecord(true, "recent");
    const m = await mod();
    expect(await m.loadPassphrase()).toBe("recent");
    expect(keychain.get("vault.passphrase")).toBe("recent");
    expect(await get("passphrase")).toBeUndefined();
  });

  it("migrates a legacy non-extractable key to read the old record once", async () => {
    await seedRecord(false, "keep-me");
    const m = await mod();
    expect(await m.loadPassphrase()).toBe("keep-me");
    expect(keychain.get("vault.passphrase")).toBe("keep-me");
    expect(await get("passphrase")).toBeUndefined();
    expect((await get<CryptoKey>("device-key"))?.extractable).toBe(true);
  });

  it("drops an unreadable legacy record instead of failing forever", async () => {
    await seedRecord(false, "secret");
    const rec = (await get<{ iv: Uint8Array; ct: ArrayBuffer }>("passphrase"))!;
    new Uint8Array(rec.ct)[0] ^= 0xff;
    await put("passphrase", rec);
    const m = await mod();
    expect(await m.loadPassphrase()).toBeNull();
    expect(await get("passphrase")).toBeUndefined();
  });

  it("migrates a legacy key that has no stored passphrase", async () => {
    await seedRecord(false);
    const m = await mod();
    expect(await m.loadPassphrase()).toBeNull();
    expect((await get<CryptoKey>("device-key"))?.extractable).toBe(true);
  });

  it("stays unremembered when the keychain is unavailable", async () => {
    invokeMock.mockRejectedValue(new Error("no keychain"));
    const m = await mod();
    await expect(m.persistPassphrase("x")).resolves.toBeUndefined();
    expect(await get("passphrase")).toBeUndefined();
    expect(await m.loadPassphrase()).toBeNull();
    await expect(m.clearPersistedPassphrase()).resolves.toBeUndefined();
  });

  it("still unlocks from a legacy record when the keychain write fails", async () => {
    await seedRecord(true, "once");
    invokeMock.mockRejectedValue(new Error("no keychain"));
    const m = await mod();
    expect(await m.loadPassphrase()).toBe("once");
    expect(await get("passphrase")).toBeUndefined();
  });

  it("forgets the keychain entry and any legacy record on clear", async () => {
    await seedRecord(true, "legacy");
    keychain.set("vault.passphrase", "kept");
    const m = await mod();
    await m.clearPersistedPassphrase();
    expect(keychain.has("vault.passphrase")).toBe(false);
    expect(await get("passphrase")).toBeUndefined();
  });
});
