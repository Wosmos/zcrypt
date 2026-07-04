import { describe, it, expect, beforeEach } from "vitest";
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
});
