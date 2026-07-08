import type { WorkerPool } from "@/lib/worker-pool";
import type { DecryptOutput } from "@/workers/crypto-worker";

/**
 * Decrypt (+ decompress) one chunk off the main thread via `pool`, used by the
 * download pipeline to fan a chunk out to the worker pool.
 *
 * `encrypted` is transferred to the worker (zero-copy); `keyBytes` is cloned per
 * call, so the caller's key object stays valid. Any worker rejection is mapped to
 * the "wrong passphrase?" error the download pipeline surfaces.
 */
export async function decryptChunkInPool(
  pool: WorkerPool,
  index: number,
  encrypted: ArrayBuffer,
  keyBytes: ArrayBuffer,
  compressed: boolean,
): Promise<Uint8Array> {
  let out: DecryptOutput;
  try {
    out = await pool.process<DecryptOutput>({
      mode: "decrypt",
      chunkIndex: index,
      encrypted,
      keyBytes,
      compressed,
    });
  } catch {
    throw new Error("Decryption failed — wrong passphrase?");
  }
  return new Uint8Array(out.plaintext);
}
