/**
 * Adopts automatic-backup items into the normal formats once the vault is
 * unlocked (docs/CRYPTO_FORMAT.md §2.2). Backup seals names to the account
 * public key because it runs locked; here each `pk1:` file and folder name is
 * opened with the private key and re-sealed with the name key, verified by
 * decrypting it back before it is written. File keys are adopted by the mk1
 * migration (lib/mk1-migrate.ts), which already moves every non-mk1 wrap.
 */
import { listPk1Folders, renameFolder, setFileName } from "@/lib/api";
import { decryptName, encryptName } from "@/lib/name-crypto";
import { isPk1, openPk1Name } from "@/lib/pk1";
import { runPool } from "@/lib/pool";
import { userNameKey } from "@/lib/sealed";
import { ensureFiles, prefetchFileList } from "@/store/files";

export interface Pk1AdoptionResult {
  adopted: number;
  skipped: number;
}

const CONCURRENCY = 3;

async function reseal(value: string, key: CryptoKey): Promise<string> {
  const name = await openPk1Name(value);
  const sealed = await encryptName(name, key);
  if ((await decryptName(sealed, key)) !== name) throw new Error("verification mismatch");
  return sealed;
}

/** One adoption pass over backup-named files and folders. Never throws. */
export async function adoptBackupNames(
  isStopped: () => boolean = () => false,
): Promise<Pk1AdoptionResult> {
  const result: Pk1AdoptionResult = { adopted: 0, skipped: 0 };
  try {
    const key = await userNameKey();
    if (!key) return result;
    const [files, folders] = await Promise.all([ensureFiles(), listPk1Folders()]);
    const items: Array<{
      id: string;
      value: string;
      write: (id: string, v: string) => Promise<unknown>;
    }> = [
      ...folders
        .filter((f) => isPk1(f.encrypted_name))
        .map((f) => ({ id: f.id, value: f.encrypted_name, write: renameFolder })),
      ...files
        .filter((f) => !f.deleted_at && isPk1(f.encrypted_name))
        .map((f) => ({ id: f.id, value: f.encrypted_name as string, write: setFileName })),
    ];
    await runPool(
      items,
      async (item) => {
        if (isStopped()) return;
        try {
          await item.write(item.id, await reseal(item.value, key));
          result.adopted++;
        } catch (err) {
          result.skipped++;
          console.warn("backup adoption: skipped an item", item.id, err);
        }
      },
      CONCURRENCY,
    );
    if (result.adopted > 0) await prefetchFileList(true);
  } catch (err) {
    console.warn("backup adoption: stopped", err);
  }
  return result;
}
