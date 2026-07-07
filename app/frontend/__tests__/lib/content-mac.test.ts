import { describe, it, expect } from "vitest";
import {
  deriveDedupKeyBytes,
  contentMacBytes,
  contentMacFile,
  createContentHasher,
  sha256Hex,
} from "@/lib/crypto";

// Per-user keyed content MAC (confirmation-of-file defeat). The invariant that
// matters for correctness: the MAC computed at UPLOAD time equals the MAC the
// DOWNLOAD path recomputes by feeding the same plaintext in chunks — otherwise a
// new (hmac_v1) file would fail its integrity check and be un-downloadable.

const randBytes = (n: number, seed: number) => {
  const a = new Uint8Array(n);
  for (let i = 0; i < n; i++) a[i] = (i * 31 + seed * 7) & 0xff;
  return a;
};

describe("content-mac: derivation", () => {
  it("deriveDedupKeyBytes is deterministic per (passphrase, userId)", async () => {
    const a = await deriveDedupKeyBytes("hunter2", "user-1");
    const b = await deriveDedupKeyBytes("hunter2", "user-1");
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(a.length).toBe(32);
  });

  it("differs across users and across passphrases", async () => {
    const u1 = await deriveDedupKeyBytes("hunter2", "user-1");
    const u2 = await deriveDedupKeyBytes("hunter2", "user-2");
    const p2 = await deriveDedupKeyBytes("different", "user-1");
    expect(Array.from(u1)).not.toEqual(Array.from(u2));
    expect(Array.from(u1)).not.toEqual(Array.from(p2));
  });
});

describe("content-mac: confirmation-of-file resistance", () => {
  it("the MAC is not the plaintext SHA-256 (a keyless attacker can't reproduce it)", async () => {
    const key = await deriveDedupKeyBytes("hunter2", "user-1");
    const data = randBytes(4096, 1);
    const mac = await contentMacBytes(data, key);
    const sha = await sha256Hex(data);
    expect(mac).not.toBe(sha);
    expect(mac).toHaveLength(64);
  });

  it("two users' MACs of identical bytes differ (no cross-user confirmation)", async () => {
    const data = randBytes(2048, 5);
    const m1 = await contentMacBytes(data, await deriveDedupKeyBytes("pw", "user-1"));
    const m2 = await contentMacBytes(data, await deriveDedupKeyBytes("pw", "user-2"));
    expect(m1).not.toBe(m2);
  });
});

describe("content-mac: upload/download agreement (the un-downloadable-file guard)", () => {
  it("streaming chunked hasher digest equals the one-shot MAC", async () => {
    const key = await deriveDedupKeyBytes("hunter2", "user-1");
    const data = randBytes(10_000, 9);
    const oneShot = await contentMacBytes(data, key);

    // Recompute the way the streaming download-verify path does: feed chunks.
    const hasher = await createContentHasher("hmac_v1", key);
    for (let off = 0; off < data.length; off += 1234) {
      hasher.update(data.subarray(off, Math.min(off + 1234, data.length)));
    }
    const streamed = Array.from(hasher.digest())
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    expect(streamed).toBe(oneShot);
  });

  it("contentMacFile (small path) matches contentMacBytes", async () => {
    const key = await deriveDedupKeyBytes("hunter2", "user-1");
    const data = randBytes(5000, 3);
    const file = new File([data], "x.bin");
    const fromFile = await contentMacFile(file, key);
    const fromBytes = await contentMacBytes(data, key);
    expect(fromFile).toBe(fromBytes);
  });

  it("a single-byte change flips the MAC (tamper detection preserved)", async () => {
    const key = await deriveDedupKeyBytes("hunter2", "user-1");
    const a = randBytes(1024, 2);
    const b = a.slice();
    b[500] ^= 0x01;
    expect(await contentMacBytes(a, key)).not.toBe(await contentMacBytes(b, key));
  });

  it("legacy scheme hasher is plain SHA-256 (unchanged for old files)", async () => {
    const data = randBytes(3000, 7);
    const hasher = await createContentHasher("plain");
    hasher.update(data);
    const streamed = Array.from(hasher.digest())
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
    expect(streamed).toBe(await sha256Hex(data));
  });
});
