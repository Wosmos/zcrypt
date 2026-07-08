import { describe, it, expect, vi } from "vitest";
import { decryptChunkInPool } from "@/lib/decrypt-chunk";
import type { WorkerPool } from "@/lib/worker-pool";

function poolWith(process: WorkerPool["process"]): WorkerPool {
  return { process } as unknown as WorkerPool;
}

describe("decryptChunkInPool", () => {
  it("forwards a decrypt job to the pool and returns the plaintext as a Uint8Array", async () => {
    const plaintext = new Uint8Array([1, 2, 3, 4]).buffer;
    const process = vi.fn().mockResolvedValue({ chunkIndex: 7, plaintext });
    const encrypted = new ArrayBuffer(8);
    const keyBytes = new ArrayBuffer(32);

    const out = await decryptChunkInPool(poolWith(process), 7, encrypted, keyBytes, true);

    expect(out).toBeInstanceOf(Uint8Array);
    expect(Array.from(out)).toEqual([1, 2, 3, 4]);
    expect(process).toHaveBeenCalledWith({
      mode: "decrypt",
      chunkIndex: 7,
      encrypted,
      keyBytes,
      compressed: true,
    });
  });

  it("maps any worker rejection to the wrong-passphrase error", async () => {
    const process = vi.fn().mockRejectedValue(new Error("AES-GCM auth tag mismatch"));
    await expect(
      decryptChunkInPool(poolWith(process), 0, new ArrayBuffer(8), new ArrayBuffer(32), false)
    ).rejects.toThrow("Decryption failed — wrong passphrase?");
  });
});
