import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
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
    // minimal IDB whose read rejects — the caller must degrade to "not stored"
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
// WebCrypto master key. A non-extractable key left over from an older build
// must be migrated once — otherwise it prompts for the Mac login password on
// every use, forever.
describe("device-vault (Tauri shell) — legacy key migration", () => {
  const DB = "zcrypt-device-vault";
  const STORE = "kv";

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
  async function seedLegacy(passphrase?: string): Promise<CryptoKey> {
    const legacy = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
      "encrypt",
      "decrypt",
    ]);
    await put("device-key", legacy);
    if (passphrase !== undefined) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        legacy,
        new TextEncoder().encode(passphrase),
      );
      await put("passphrase", { iv, ct });
    }
    return legacy;
  }
  async function mod() {
    vi.resetModules();
    return import("@/lib/device-vault");
  }

  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  });
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    vi.resetModules();
  });

  it("generates an extractable key on a fresh install", async () => {
    const m = await mod();
    await m.persistPassphrase("fresh");
    const key = await get<CryptoKey>("device-key");
    expect(key?.extractable).toBe(true);
    expect(await m.loadPassphrase()).toBe("fresh");
  });

  it("re-wraps the stored passphrase under a new extractable key on load, then stops touching the legacy key", async () => {
    await seedLegacy("keep-me");
    const m = await mod();
    expect(await m.loadPassphrase()).toBe("keep-me");
    const key = await get<CryptoKey>("device-key");
    expect(key?.extractable).toBe(true);
    // Second load hits the already-migrated branch and still decrypts.
    expect(await m.loadPassphrase()).toBe("keep-me");
  });

  it("drops an unreadable record during migration instead of failing forever", async () => {
    await seedLegacy("secret");
    const rec = (await get<{ iv: Uint8Array; ct: ArrayBuffer }>("passphrase"))!;
    new Uint8Array(rec.ct)[0] ^= 0xff;
    await put("passphrase", rec);
    const m = await mod();
    expect(await m.loadPassphrase()).toBeNull();
    expect(await get("passphrase")).toBeUndefined();
    expect((await get<CryptoKey>("device-key"))?.extractable).toBe(true);
  });

  it("migrates a legacy key that has no stored passphrase yet", async () => {
    await seedLegacy();
    const m = await mod();
    await m.persistPassphrase("later");
    expect((await get<CryptoKey>("device-key"))?.extractable).toBe(true);
    expect(await m.loadPassphrase()).toBe("later");
  });
});
