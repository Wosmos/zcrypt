/**
 * Background migration of existing vault files to the account master key.
 *
 * Runs only while the server's master_key_writes switch is on, MK is loaded and
 * the vault is unlocked. Each legacy file's CEK is resolved through the normal
 * (memoized PBKDF2) path, re-wrapped under MK, VERIFIED by unwrapping the new
 * value back to the same CEK, and only then sent to PUT /api/files/{id}/rekey
 * with the file's existing salt. The job is idempotent and resumable: the
 * prefix is re-checked on every file, so a restart simply skips what is done.
 * Files that cannot be resolved (unknown folder, wrong key, network) are logged
 * and left exactly as they are.
 */
import { getFileMetas, rekeyFile, type FileMetaResponse } from "@/lib/api";
import { fromBase64, resolveFileKey } from "@/lib/crypto";
import {
  ensureMasterKey,
  isMk1,
  unwrapCekWithMasterKey,
  wrapCekWithMasterKey,
} from "@/lib/master-key";
import { runPool } from "@/lib/pool";
import { ensureFiles } from "@/store/files";
import { useFolderRegistry } from "@/store/folder-registry";
import { useKeysStore } from "@/store/keys";
import { usePassphraseStore } from "@/store/passphrase";

export const MK1_MIGRATION_CONCURRENCY = 3;
const PAGE = 200;

export interface Mk1MigrationResult {
  migrated: number;
  skipped: number;
  stopped: boolean;
}

type LegacyMeta = FileMetaResponse & { wrapped_cek: string };

let activeRun: symbol | null = null;

function vaultPassphrase(): string | null {
  return usePassphraseStore.getState().getPassphrase();
}

function waitUntilVisible(): Promise<void> {
  if (typeof document === "undefined" || document.visibilityState !== "hidden") {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const onChange = () => {
      if (document.visibilityState !== "hidden") {
        document.removeEventListener("visibilitychange", onChange);
        resolve();
      }
    };
    document.addEventListener("visibilitychange", onChange);
  });
}

/** Run one migration pass. Resolves when everything is done or it was stopped
 *  (lock, logout, switch off, superseded, or `isStopped()`). */
export async function runMk1Migration(
  isStopped: () => boolean = () => false,
): Promise<Mk1MigrationResult> {
  const result: Mk1MigrationResult = { migrated: 0, skipped: 0, stopped: false };
  const startPass = vaultPassphrase();
  if (!startPass) return result;
  const run = Symbol("mk1-migration");
  activeRun = run;

  const stopped = (): boolean => {
    const keys = useKeysStore.getState();
    return (
      isStopped() ||
      activeRun !== run ||
      vaultPassphrase() !== startPass ||
      !keys.masterKeyWrites ||
      !keys.masterKey
    );
  };

  try {
    const mk = await ensureMasterKey(startPass);
    if (stopped()) {
      result.stopped = true;
      return result;
    }
    const registry = useFolderRegistry.getState();
    const eligible = (await ensureFiles()).filter((f) => {
      if (f.deleted_at) return false;
      if (!f.folder_id) return true;
      return registry.get(f.folder_id) != null && !registry.isProtected(f.folder_id);
    });
    const folderOf = new Map(eligible.map((f) => [f.id, f.folder_id ?? null]));

    const migrateOne = async (meta: LegacyMeta): Promise<void> => {
      await waitUntilVisible();
      if (stopped()) {
        result.stopped = true;
        return;
      }
      try {
        const folderId = folderOf.get(meta.id) ?? null;
        if (folderId && useFolderRegistry.getState().isProtected(folderId)) {
          result.skipped++;
          return;
        }
        const cek = new Uint8Array(
          await resolveFileKey(startPass, fromBase64(meta.salt), meta.wrapped_cek),
        );
        const wrapped = await wrapCekWithMasterKey(mk, cek);
        const back = await unwrapCekWithMasterKey(mk, wrapped);
        if (back.length !== cek.length || back.some((b, i) => b !== cek[i])) {
          throw new Error("verification mismatch");
        }
        if (stopped()) {
          result.stopped = true;
          return;
        }
        await rekeyFile(meta.id, { salt: meta.salt, wrapped_cek: wrapped });
        result.migrated++;
      } catch (err) {
        result.skipped++;
        console.warn("mk1 migration: skipped a file", meta.id, err);
      }
    };

    const ids = eligible.map((f) => f.id);
    for (let i = 0; i < ids.length && !stopped(); i += PAGE) {
      const metas = (await getFileMetas(ids.slice(i, i + PAGE))).filter(
        (m): m is LegacyMeta => !!m.wrapped_cek && !isMk1(m.wrapped_cek),
      );
      await runPool(metas, migrateOne, MK1_MIGRATION_CONCURRENCY);
    }
    if (stopped()) result.stopped = true;
    return result;
  } catch (err) {
    console.warn("mk1 migration: stopped", err);
    result.stopped = true;
    return result;
  } finally {
    if (activeRun === run) activeRun = null;
  }
}

/** Start a pass when the browser is idle; returns a cancel function. */
export function scheduleMk1Migration(): () => void {
  let cancelled = false;
  const start = () => {
    if (!cancelled) void runMk1Migration(() => cancelled);
  };
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    const handle = window.requestIdleCallback(start, { timeout: 10_000 });
    return () => {
      cancelled = true;
      window.cancelIdleCallback(handle);
    };
  }
  const timer = setTimeout(start, 3_000);
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}
