import { describe, it, expect, vi } from "vitest";
import { bytesToHex, createContentHasher, sha256Hex } from "@/lib/crypto";
import { CEK_MAC_SCHEME, cekMacKey } from "@/lib/pk1";
import { confirmLinkDownload, createLinkVerifier, needsDisk, verifiedDiskSink } from "@/lib/link-download";

const key = new Uint8Array(32).fill(7).buffer;
const data = new Uint8Array([1, 2, 3, 4]);

describe("createLinkVerifier", () => {
  it("accepts a plain file whose SHA-256 matches and rejects one that does not", async () => {
    const good = await createLinkVerifier({ sha256: await sha256Hex(data) }, key);
    good.update(data);
    expect(good.ok()).toBe(true);
    const bad = await createLinkVerifier({ sha256: "00" }, key);
    bad.update(data);
    expect(bad.ok()).toBe(false);
  });

  it("verifies a backup-scheme file with the MAC keyed from its own CEK", async () => {
    const h = await createContentHasher("hmac_v1", await cekMacKey(key));
    h.update(data);
    const sha256 = bytesToHex(h.digest());
    const v = await createLinkVerifier({ sha256, sha256_scheme: CEK_MAC_SCHEME }, key);
    v.update(data);
    expect(v.canVerify).toBe(true);
    expect(v.ok()).toBe(true);
    const wrong = await createLinkVerifier({ sha256: "00", sha256_scheme: CEK_MAC_SCHEME }, key);
    wrong.update(data);
    expect(wrong.ok()).toBe(false);
  });

  it("leaves a per-user hmac_v1 file to the per-chunk tags, since the passphrase is not here", async () => {
    const v = await createLinkVerifier({ sha256: "anything", sha256_scheme: "hmac_v1" }, key);
    v.update(data);
    expect(v.canVerify).toBe(false);
    expect(v.ok()).toBe(true);
  });
});

describe("needsDisk", () => {
  it("is true from 1 GB, the same threshold own downloads use", () => {
    expect(needsDisk(1024 ** 3 - 1)).toBe(false);
    expect(needsDisk(1024 ** 3)).toBe(true);
  });
});

describe("confirmLinkDownload", () => {
  it("passes the signal through and tolerates a confirm that fails", async () => {
    const ctl = new AbortController();
    const confirm = vi.fn(async () => {
      throw new Error("down");
    });
    await expect(confirmLinkDownload(confirm, ctl.signal)).resolves.toBeUndefined();
    expect(confirm).toHaveBeenCalledWith(ctl.signal);
  });

  it("still stops on a cancel", async () => {
    const ctl = new AbortController();
    ctl.abort();
    await expect(
      confirmLinkDownload(async () => {
        throw new DOMException("x", "AbortError");
      }, ctl.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("verifiedDiskSink", () => {
  it("has no sink when the file stays in memory, and no head", () => {
    const update = vi.fn();
    const { sink, head } = verifiedDiskSink(undefined, { update });
    expect(sink).toBeUndefined();
    expect(head()).toBeUndefined();
    expect(update).not.toHaveBeenCalled();
  });

  it("hashes each chunk, writes it to disk in order and keeps only the first as the head", async () => {
    const update = vi.fn();
    const write = vi.fn(async (_d: Uint8Array) => {});
    const disk = { write, close: vi.fn(async () => {}) };
    const { sink, head } = verifiedDiskSink(disk, { update });
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3]);

    await sink!(a);
    await sink!(b);

    expect(head()).toBe(a);
    expect(update.mock.calls.map((c) => c[0])).toEqual([a, b]);
    expect(write.mock.calls.map((c) => c[0])).toEqual([a, b]);
  });
});
