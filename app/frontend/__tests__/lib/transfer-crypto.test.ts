import { describe, it, expect } from "vitest";
import {
  assembleTransfer,
  deriveTransferKeys,
  formatPairingSecret,
  isCompletePairingSecret,
  newPairingSecret,
  normalizePairingSecret,
  openChunk,
  openMeta,
  pairingLink,
  sealChunk,
  sealMeta,
  secretFromHash,
} from "@/lib/transfer-crypto";

describe("pairing secret", () => {
  it("is 16 base32 chars and unique", () => {
    const a = newPairingSecret();
    expect(a).toMatch(/^[A-Z2-7]{16}$/);
    expect(isCompletePairingSecret(a)).toBe(true);
    expect(newPairingSecret()).not.toBe(a);
  });

  it("formats and normalizes round trip", () => {
    const a = newPairingSecret();
    const shown = formatPairingSecret(a);
    expect(shown).toMatch(/^[A-Z2-7]{4}(-[A-Z2-7]{4}){3}$/);
    expect(normalizePairingSecret(shown.toLowerCase())).toBe(a);
    expect(normalizePairingSecret(a + "AAAA")).toBe(a);
    expect(isCompletePairingSecret("ABC")).toBe(false);
    expect(formatPairingSecret("")).toBe("");
  });

  it("puts the secret in the fragment only", () => {
    const link = pairingLink("https://x.test", "123456", "AAAABBBBCCCCDDDD");
    const url = new URL(link);
    expect(url.search).toBe("?code=123456");
    expect(url.hash).toBe("#k=AAAABBBBCCCCDDDD");
    expect(secretFromHash(url.hash)).toBe("AAAABBBBCCCCDDDD");
    expect(secretFromHash("#other=1")).toBe("");
    expect(secretFromHash("")).toBe("");
  });
});

describe("deriveTransferKeys", () => {
  it("is deterministic and bound to secret and code", async () => {
    const s = newPairingSecret();
    const a = await deriveTransferKeys(s, "111111");
    const b = await deriveTransferKeys(s, "111111");
    expect(a.confirm).toMatch(/^\d{3} \d{3}$/);
    expect(new Uint8Array(a.key)).toEqual(new Uint8Array(b.key));
    expect(a.confirm).toBe(b.confirm);
    const c = await deriveTransferKeys(s, "222222");
    const d = await deriveTransferKeys(newPairingSecret(), "111111");
    expect(new Uint8Array(c.key)).not.toEqual(new Uint8Array(a.key));
    expect(new Uint8Array(d.key)).not.toEqual(new Uint8Array(a.key));
  });
});

describe("sealMeta / openMeta", () => {
  it("hides the filename and round-trips", async () => {
    const { key } = await deriveTransferKeys(newPairingSecret(), "123456");
    const sealed = await sealMeta(key, { name: "tax-return.pdf", size: 42, type: "application/pdf", chunks: 1 });
    expect(atob(sealed)).not.toContain("tax-return");
    expect(await openMeta(key, sealed)).toEqual({
      name: "tax-return.pdf",
      size: 42,
      type: "application/pdf",
      chunks: 1,
    });
  });

  it("fails under a wrong key", async () => {
    const k1 = await deriveTransferKeys(newPairingSecret(), "123456");
    const k2 = await deriveTransferKeys(newPairingSecret(), "123456");
    const sealed = await sealMeta(k1.key, { name: "a", size: 1, type: "", chunks: 1 });
    await expect(openMeta(k2.key, sealed)).rejects.toThrow();
  });
});

describe("stream integrity", () => {
  const meta = { name: "f", size: 6, type: "", chunks: 2 };
  const bytes = (...n: number[]) => new Uint8Array(n);

  it("round-trips chunks at their own position", async () => {
    const { key } = await deriveTransferKeys(newPairingSecret(), "123456");
    const sealed = await sealChunk(key, 1, 2, bytes(1, 2, 3));
    expect(await openChunk(key, 1, 2, sealed)).toEqual(bytes(1, 2, 3));
  });

  it("rejects a chunk replayed at another index or under another total", async () => {
    const { key } = await deriveTransferKeys(newPairingSecret(), "123456");
    const sealed = await sealChunk(key, 0, 2, bytes(1, 2, 3));
    await expect(openChunk(key, 1, 2, sealed)).rejects.toThrow();
    await expect(openChunk(key, 0, 3, sealed)).rejects.toThrow();
  });

  it("rejects out-of-range indexes", async () => {
    const { key } = await deriveTransferKeys(newPairingSecret(), "123456");
    const sealed = await sealChunk(key, 0, 2, bytes(1));
    await expect(openChunk(key, 2, 2, sealed)).rejects.toThrow("integrity");
    await expect(openChunk(key, -1, 2, sealed)).rejects.toThrow("integrity");
    await expect(openChunk(key, 0.5, 2, sealed)).rejects.toThrow("integrity");
  });

  it("rejects the sealed meta injected as a chunk, and a chunk opened as meta", async () => {
    const { key } = await deriveTransferKeys(newPairingSecret(), "123456");
    const sealedMeta = await sealMeta(key, meta);
    await expect(openChunk(key, 0, 2, sealedMeta)).rejects.toThrow();
    await expect(openMeta(key, await sealChunk(key, 0, 2, bytes(1)))).rejects.toThrow();
  });

  it("rejects meta with a bad chunk count", async () => {
    const { key } = await deriveTransferKeys(newPairingSecret(), "123456");
    const bad = await sealMeta(key, { ...meta, chunks: -1 });
    await expect(openMeta(key, bad)).rejects.toThrow("Invalid transfer metadata");
  });

  it("assembles a complete stream", () => {
    expect(assembleTransfer([bytes(1, 2, 3), bytes(4, 5, 6)], meta)).toEqual(bytes(1, 2, 3, 4, 5, 6));
    expect(assembleTransfer([], { ...meta, size: 0, chunks: 0 })).toEqual(bytes());
  });

  it("refuses truncated, gapped, extra, or wrong-size streams", () => {
    expect(() => assembleTransfer([bytes(1, 2, 3)], meta)).toThrow("integrity");
    const gap: (Uint8Array | undefined)[] = [];
    gap[1] = bytes(4, 5, 6);
    expect(() => assembleTransfer(gap, meta)).toThrow("integrity");
    expect(() => assembleTransfer([bytes(1), bytes(2), bytes(3)], meta)).toThrow("integrity");
    expect(() => assembleTransfer([bytes(1, 2), bytes(3, 4)], meta)).toThrow("integrity");
  });
});
