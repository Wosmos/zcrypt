"use client";

/**
 * device-vault — persist the vault passphrase ON THIS DEVICE so the user unlocks
 * once and is never re-prompted ("keep me unlocked on this device").
 *
 * The passphrase is encrypted at rest with a NON-EXTRACTABLE AES-GCM key kept in
 * IndexedDB: that key can be USED to decrypt but its raw bytes can never be read
 * back out (`extractable: false`), and the passphrase is never stored in
 * plaintext. This is meaningfully safer than a raw localStorage string and stays
 * fully client-side — the passphrase never touches the server. It is NOT a
 * defence against active malware/XSS already running on this device (such code
 * could call decrypt with the key); that is the inherent trade-off of staying
 * unlocked on a device, and it's strictly the user's opt-in choice.
 */

const DB_NAME = "zcrypt-device-vault";
const STORE = "kv";
const KEY_ID = "device-key";
const PP_ID = "passphrase";

interface StoredPassphrase {
  iv: Uint8Array;
  ct: ArrayBuffer;
}

function available(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof indexedDB !== "undefined" &&
    typeof crypto !== "undefined" &&
    !!crypto.subtle
  );
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result as T);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      })
  );
}

/** Load the device key, generating + storing a non-extractable one on first use. */
async function getDeviceKey(): Promise<CryptoKey> {
  const existing = await tx<CryptoKey | undefined>("readonly", (s) => s.get(KEY_ID));
  if (existing) return existing;
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    /* extractable */ false,
    ["encrypt", "decrypt"]
  );
  await tx("readwrite", (s) => s.put(key, KEY_ID));
  return key;
}

/** Encrypt + store the passphrase on this device. Best-effort (never throws). */
export async function persistPassphrase(passphrase: string): Promise<void> {
  if (!available()) return;
  try {
    const key = await getDeviceKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(passphrase)
    );
    await tx("readwrite", (s) => s.put({ iv, ct } satisfies StoredPassphrase, PP_ID));
  } catch {
    /* persistence is a convenience, never a hard requirement */
  }
}

/** Decrypt + return the device-persisted passphrase, or null if none / unreadable. */
export async function loadPassphrase(): Promise<string | null> {
  if (!available()) return null;
  try {
    const rec = await tx<StoredPassphrase | undefined>("readonly", (s) => s.get(PP_ID));
    const key = await tx<CryptoKey | undefined>("readonly", (s) => s.get(KEY_ID));
    if (!rec || !key) return null;
    // Re-wrap the IV in a fresh Uint8Array so its buffer is a definite
    // ArrayBuffer (IndexedDB structured-clone widens the type to ArrayBufferLike).
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(rec.iv) },
      key,
      rec.ct
    );
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

/** Forget the device-persisted passphrase (on lock / opt-out). Keeps the key. */
export async function clearPersistedPassphrase(): Promise<void> {
  if (!available()) return;
  try {
    await tx("readwrite", (s) => s.delete(PP_ID));
  } catch {
    /* ignore */
  }
}
