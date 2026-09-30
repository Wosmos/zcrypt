import type { FileMetadata } from "@/types";
import { encryptName, decryptNameSafe, decryptStyle, type CustomStyle } from "@/lib/name-crypto";
import { userNameKey, LOCKED } from "@/lib/sealed";
import { setFileName } from "@/lib/api";
import { onDecryptCacheClear } from "@/lib/decrypt-cache";
import { usePassphraseStore } from "@/store/passphrase";

/**
 * Zero-knowledge file-name dual-read.
 *
 * A file's name lives in one of two columns: legacy files carry a plaintext
 * `original_name` (encrypted_name == ""); zero-knowledge files carry an opaque
 * `encrypted_name` and an empty `original_name`. The query cache (and its
 * IndexedDB snapshot) only ever holds that raw ciphertext. Plaintext lives in
 * the in-memory maps below, keyed by ciphertext, filled while the vault is
 * unlocked and dropped on every lock / TTL expiry / logout. Views resolve names
 * synchronously through `resolveFileNames`, so an unlock re-renders from cache
 * with no refetch, and a lock flips everything back to "[locked]" at once.
 *
 * Folder names and styles use the same per-user key, so they share the maps.
 */
const names = new Map<string, string>();
const styles = new Map<string, CustomStyle | null>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
let epoch = 0;
let generation = 0;

function bump(): void {
  epoch++;
  for (const l of listeners) l();
}

/** useSyncExternalStore subscription: fires when names resolve or are dropped. */
export function subscribeNames(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getNamesEpoch(): number {
  return epoch;
}

/** Forget every decrypted name and style (lock / TTL / logout). */
export function clearNames(): void {
  names.clear();
  styles.clear();
  inflight.clear();
  generation++;
  bump();
}
onDecryptCacheClear(clearNames);

export function peekName(enc: string): string | undefined {
  return names.get(enc);
}

export function peekStyle(enc: string | null | undefined): CustomStyle | null {
  return enc ? (styles.get(enc) ?? null) : null;
}

/** Decrypt every not-yet-known name/style ciphertext. A no-op while locked.
 *  Resolves once every requested ciphertext is known, including ones another
 *  caller already has in flight. */
export async function ensureNames(
  nameCts: Iterable<string | null | undefined>,
  styleCts: Iterable<string | null | undefined> = [],
): Promise<void> {
  const gen = generation;
  const waiting = new Set<Promise<void>>();
  const pick = (
    cts: Iterable<string | null | undefined>,
    known: Map<string, unknown>,
    tag: string,
  ) => {
    const todo: string[] = [];
    for (const c of new Set(cts)) {
      if (!c || known.has(c)) continue;
      const running = inflight.get(tag + c);
      if (running) waiting.add(running);
      else todo.push(c);
    }
    return todo;
  };
  const todoNames = pick(nameCts, names, "");
  const todoStyles = pick(styleCts, styles, "s:");
  if (todoNames.length > 0 || todoStyles.length > 0) {
    const marks = [...todoNames, ...todoStyles.map((c) => `s:${c}`)];
    const work = (async () => {
      const key = await userNameKey();
      if (!key || gen !== generation) return;
      const [plainNames, plainStyles] = await Promise.all([
        Promise.all(todoNames.map((c) => decryptNameSafe(c, key))),
        Promise.all(todoStyles.map((c) => decryptStyle(c, key))),
      ]);
      if (gen !== generation) return; // locked mid-flight: never repopulate
      todoNames.forEach((c, i) => names.set(c, plainNames[i]));
      todoStyles.forEach((c, i) => styles.set(c, plainStyles[i]));
      bump();
    })().finally(() => {
      for (const m of marks) if (inflight.get(m) === work) inflight.delete(m);
    });
    for (const m of marks) inflight.set(m, work);
    waiting.add(work);
  }
  await Promise.all(waiting);
}

// Legacy files are re-sealed the first time they're listed while the vault is
// unlocked: the plaintext name is encrypted under the name key and handed back
// to the server, which blanks its plaintext copies. Once per file per session;
// display isn't blocked on it.
const resealed = new Set<string>();
function resealLegacyName(f: FileMetadata, key: CryptoKey) {
  if (resealed.has(f.id)) return;
  resealed.add(f.id);
  encryptName(f.original_name, key)
    .then((enc) => setFileName(f.id, enc))
    .catch(() => resealed.delete(f.id)); // transient failure → retry on a later list
}

function isSealedFile(f: FileMetadata): boolean {
  return !!(f.encrypted_name || f.encrypted_style);
}

/** Decrypt names for a raw file list into the maps, and reseal legacy names. */
export async function ensureFileNames(files: FileMetadata[]): Promise<void> {
  if (files.length === 0) return;
  const legacy = files.filter((f) => !isSealedFile(f) && f.original_name);
  if (legacy.length > 0) {
    const key = await userNameKey(); // null while locked, no derivation happens
    if (key) for (const f of legacy) resealLegacyName(f, key);
  }
  await ensureNames(
    files.map((f) => f.encrypted_name),
    files.map((f) => f.encrypted_style),
  );
}

/**
 * Synchronous view of a raw list: real names while unlocked, "[locked]" while
 * locked. A name still being decrypted reads as the row's own `original_name`
 * ("" from the server, or the plaintext of a just-finished optimistic upload).
 * Legacy files pass through untouched.
 *
 * `_epoch` is unused here: reactive callers pass the names epoch so a select
 * built from it changes identity whenever names resolve.
 */
export function resolveFileNames(
  files: FileMetadata[],
  unlocked: boolean = usePassphraseStore.getState().cachedPassphrase != null,
  _epoch?: number,
): FileMetadata[] {
  if (!files.some(isSealedFile)) return files;
  return files.map((f) => {
    if (!isSealedFile(f)) return f;
    return {
      ...f,
      original_name: f.encrypted_name
        ? unlocked
          ? (names.get(f.encrypted_name) ?? f.original_name)
          : LOCKED
        : f.original_name,
      style: unlocked ? peekStyle(f.encrypted_style) : null,
    };
  });
}

/** One-shot async resolve for callers outside the reactive views. */
export async function decryptFileNames(files: FileMetadata[]): Promise<FileMetadata[]> {
  await ensureFileNames(files);
  return resolveFileNames(files);
}
