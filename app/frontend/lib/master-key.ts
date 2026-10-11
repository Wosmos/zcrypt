/**
 * Account master key (mk1), docs/CRYPTO_FORMAT.md section 2.1.
 *
 * One random 32-byte MK per account, wrapped under the account KEK (the same
 * KEK that wraps the X25519 private key) and stored set-once on the server.
 * A file whose `wrapped_cek` starts with "mk1:" is unwrapped with MK instead of
 * a per-file PBKDF2 derivation.
 *
 * MK lives in the keys store (memory only) next to the private key. A file
 * becomes unreadable if MK is lost, so this module never generates a second MK
 * once the server has one: a lost set-once race always adopts the server's.
 */
import {
  IncorrectPassphraseError,
  deriveKeyBytesCached,
  fromBase64,
  toBase64,
  toArrayBuffer,
  unwrapKey,
  wrapKey,
} from "@/lib/crypto";
import { getMyKey, putMasterKey, type UserKeyRecord } from "@/lib/api";
import { ApiError } from "@/lib/http-error";
import { onDecryptCacheClear } from "@/lib/decrypt-cache";
import { useKeysStore } from "@/store/keys";
import { usePassphraseStore } from "@/store/passphrase";
import { useFolderRegistry } from "@/store/folder-registry";

export const MK1_PREFIX = "mk1:";
const MK_SIZE = 32;

export class MasterKeyUnavailableError extends Error {
  constructor(message = "The account master key is not loaded yet.") {
    super(message);
    this.name = "MasterKeyUnavailableError";
  }
}

export function isMk1(wrappedCek: string | null | undefined): boolean {
  return !!wrappedCek && wrappedCek.startsWith(MK1_PREFIX);
}

/** "mk1:" + base64(AESGCM(MK, CEK)). */
export async function wrapCekWithMasterKey(mk: Uint8Array, cek: Uint8Array): Promise<string> {
  return MK1_PREFIX + toBase64(await wrapKey(toArrayBuffer(mk), cek));
}

/** Inverse of wrapCekWithMasterKey. Throws if the value is not a valid mk1
 *  envelope under this MK. */
export async function unwrapCekWithMasterKey(
  mk: Uint8Array,
  wrappedCek: string,
): Promise<Uint8Array> {
  return unwrapKey(toArrayBuffer(mk), fromBase64(wrappedCek.slice(MK1_PREFIX.length)));
}

async function unwrapMasterKey(kek: ArrayBuffer, wrappedMasterKey: string): Promise<Uint8Array> {
  let mk: Uint8Array;
  try {
    mk = await unwrapKey(kek, fromBase64(wrappedMasterKey));
  } catch {
    throw new IncorrectPassphraseError();
  }
  if (mk.length !== MK_SIZE) throw new MasterKeyUnavailableError("Stored master key is malformed.");
  return mk;
}

function publishMasterKey(mk: Uint8Array, writes: boolean): Uint8Array {
  useKeysStore.setState({ masterKey: mk, masterKeyWrites: writes });
  return mk;
}

/**
 * Load (or, if the account has none, create) MK using an account KEK that the
 * caller has ALREADY proven correct by unwrapping the private key with it.
 * Creating MK under an unproven KEK would lock the user out of mk1 files, so
 * never call this with an unverified KEK.
 */
export async function loadMasterKey(kek: ArrayBuffer, record: UserKeyRecord): Promise<Uint8Array> {
  const writes = record.master_key_writes === true;
  if (record.wrapped_master_key) {
    return publishMasterKey(await unwrapMasterKey(kek, record.wrapped_master_key), writes);
  }
  const fresh = crypto.getRandomValues(new Uint8Array(MK_SIZE));
  try {
    await putMasterKey(toBase64(await wrapKey(kek, fresh)));
    return publishMasterKey(fresh, writes);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 409) throw err;
  }
  // Lost the set-once race: the server's MK is the only valid one.
  const again = await getMyKey();
  if (!again?.wrapped_master_key) throw new MasterKeyUnavailableError();
  return publishMasterKey(
    await unwrapMasterKey(kek, again.wrapped_master_key),
    again.master_key_writes === true,
  );
}

/**
 * The ONLY place a client decides to write an mk1 envelope. Returns the
 * "mk1:..." wrapped_cek for a VAULT file, or null when the caller must use the
 * legacy scheme. mk1 is written only when ALL hold:
 *  - the server's rollout switch (master_key_writes) is on,
 *  - the file is not in (or going into) a password-protected folder, and the
 *    passphrase in hand is the vault passphrase, never a folder password,
 *  - MK is loaded (or loads now), and the new envelope unwraps back to the CEK.
 * Any doubt returns null: a legacy wrap is always readable.
 */
export async function wrapCekForVault(
  cek: Uint8Array,
  passphrase: string,
  folderId: string | null | undefined,
): Promise<string | null> {
  try {
    if (!useKeysStore.getState().masterKeyWrites) return null;
    if (!passphrase || passphrase !== usePassphraseStore.getState().getPassphrase()) return null;
    if (folderId) {
      const registry = useFolderRegistry.getState();
      if (registry.get(folderId) == null || registry.isProtected(folderId)) return null;
    }
    const mk = await ensureMasterKey(passphrase);
    if (!useKeysStore.getState().masterKeyWrites) return null;
    const wrapped = await wrapCekWithMasterKey(mk, cek);
    const back = await unwrapCekWithMasterKey(mk, wrapped);
    if (back.length !== cek.length || back.some((b, i) => b !== cek[i])) return null;
    return wrapped;
  } catch {
    return null;
  }
}

let inflight: Promise<Uint8Array> | null = null;

async function loadFromPassphrase(passphrase: string): Promise<Uint8Array> {
  let record = await getMyKey();
  if (!record) {
    const { ensureUserKeypair } = await import("@/lib/keys");
    await ensureUserKeypair(passphrase);
    const mk = useKeysStore.getState().masterKey;
    if (mk) return mk;
    record = await getMyKey();
    if (!record) throw new MasterKeyUnavailableError();
  }
  const kek = await deriveKeyBytesCached(passphrase, fromBase64(record.kdf_salt));
  try {
    await unwrapKey(kek, fromBase64(record.wrapped_private_key));
  } catch {
    throw new IncorrectPassphraseError();
  }
  return loadMasterKey(kek, record);
}

/**
 * MK for this session: the in-memory copy, or loaded now from the vault
 * passphrase. Throws IncorrectPassphraseError for a wrong passphrase and
 * MasterKeyUnavailableError when it cannot be loaded for any other reason.
 */
export function ensureMasterKey(passphrase: string | null | undefined): Promise<Uint8Array> {
  const have = useKeysStore.getState().masterKey;
  if (have) return Promise.resolve(have);
  if (!passphrase) return Promise.reject(new MasterKeyUnavailableError());
  inflight ??= loadFromPassphrase(passphrase)
    .catch((err: unknown) => {
      if (err instanceof IncorrectPassphraseError || err instanceof MasterKeyUnavailableError) {
        throw err;
      }
      throw new MasterKeyUnavailableError(err instanceof Error ? err.message : undefined);
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Check a typed passphrase against the stored wrapped MK, ignoring any
 * in-memory copy. true = correct, false = definitively wrong, null = nothing
 * to check against (no MK yet) or the server could not be reached.
 */
export async function verifyPassphraseAgainstMasterKey(
  passphrase: string,
): Promise<boolean | null> {
  let record: UserKeyRecord | null;
  try {
    record = await getMyKey();
  } catch {
    return null;
  }
  if (!record?.wrapped_master_key) return null;
  const kek = await deriveKeyBytesCached(passphrase, fromBase64(record.kdf_salt));
  try {
    await unwrapMasterKey(kek, record.wrapped_master_key);
    return true;
  } catch (err) {
    return err instanceof IncorrectPassphraseError ? false : null;
  }
}

onDecryptCacheClear(() => {
  useKeysStore.setState({ masterKey: null });
});
