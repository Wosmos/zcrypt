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
