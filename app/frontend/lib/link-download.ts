import { bytesToHex, createContentHasher } from "@/lib/crypto";
import { CEK_MAC_SCHEME, cekMacKey } from "@/lib/pk1";
import { STREAM_TO_DISK_MIN_BYTES } from "@/lib/disk-save";
import type { DiskWritable } from "@/lib/download-session";

/**
 * File-level integrity for a public-link download, by the same rule as own
 * downloads (lib/download-session.ts): a backup-scheme file is checked with a MAC
 * keyed from its own CEK, which a link recipient holds; a per-user 'hmac_v1' file
 * needs the owner's passphrase, so it is left to the per-chunk AES-GCM tags;
 * everything else is a plain SHA-256.
 */
export async function createLinkVerifier(
  meta: { sha256: string; sha256_scheme?: string },
  keyBytes: ArrayBuffer,
) {
  const macKey = meta.sha256_scheme === CEK_MAC_SCHEME ? await cekMacKey(keyBytes) : undefined;
  const canVerify = meta.sha256_scheme !== "hmac_v1";
  const hasher = await createContentHasher(macKey ? "hmac_v1" : "plain", macKey);
  return {
    canVerify,
    update: (d: Uint8Array) => hasher.update(d),
    ok: () => !canVerify || bytesToHex(hasher.digest()) === meta.sha256,
  };
}

/** A chunk sink that hashes each chunk and streams it to `disk`, keeping the
 *  first one for type sniffing. No sink when the file stays in memory. */
export function verifiedDiskSink(
  disk: DiskWritable | undefined,
  verifier: { update(d: Uint8Array): void },
) {
  let head: Uint8Array | undefined;
  const sink = disk
    ? async (d: Uint8Array) => {
        head ??= d;
        verifier.update(d);
        await disk.write(d);
      }
    : undefined;
  return { sink, head: () => head };
}

/** Whether a file of this size must go to disk instead of tab memory. */
export function needsDisk(size: number): boolean {
  return size >= STREAM_TO_DISK_MIN_BYTES;
}

/** Run a link's completion confirm, which already retries under the shared rule
 *  (lib/api.ts linkFetch). The server counts a download when it serves the last
 *  chunk and the confirm is idempotent per ticket, so a confirm that still fails
 *  does not fail a download whose bytes are already saved; only a cancel stops. */
export async function confirmLinkDownload(
  confirm: (signal?: AbortSignal) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  try {
    await confirm(signal);
  } catch (err) {
    if (signal?.aborted) throw err;
  }
}
