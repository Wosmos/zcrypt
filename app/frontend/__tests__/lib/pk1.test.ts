import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { x25519 } from "@noble/curves/ed25519.js";
import { cekMacKey, isPk1, openPk1, openPk1Name, PK1_PREFIX } from "@/lib/pk1";
import { contentMacBytes, resolveFileKey } from "@/lib/crypto";
import { decryptName } from "@/lib/name-crypto";
import { sealTo } from "@/lib/keys";
import { useKeysStore } from "@/store/keys";

const hexBytes = (h: string) => Uint8Array.from(Buffer.from(h, "hex"));
const vectors = JSON.parse(
  readFileSync(resolve(process.cwd(), "../backend/crypto/testvectors/pk1_vectors.json"), "utf8"),
) as {
  recipient_secret_hex: string;
  recipient_public_hex: string;
  seal: Array<{ name: string; data_hex: string; sealed_b64: string }>;
  cek_mac: Array<{ name: string; cek_hex: string; data_hex: string; mac_hex: string }>;
};

beforeEach(() => {
  useKeysStore.setState({
    privateKey: hexBytes(vectors.recipient_secret_hex),
    publicKey: hexBytes(vectors.recipient_public_hex),
  });
});
afterEach(() => useKeysStore.setState({ privateKey: null, publicKey: null }));

describe("pk1 public-key backup format (CRYPTO_FORMAT.md §2.2)", () => {
  it("opens values sealed by the shared vectors, the same ones the Rust core is checked against", async () => {
    for (const v of vectors.seal) {
      expect(Buffer.from(await openPk1(PK1_PREFIX + v.sealed_b64)).toString("hex"), v.name).toBe(v.data_hex);
    }
  });

  it("derives the cek_hmac_v1 MAC exactly like the vectors", async () => {
    for (const v of vectors.cek_mac) {
      const mac = await contentMacBytes(hexBytes(v.data_hex), await cekMacKey(hexBytes(v.cek_hex)));
      expect(mac, v.name).toBe(v.mac_hex);
    }
  });

  it("resolves a pk1-wrapped file key and a pk1 name through the normal readers", async () => {
    const cek = crypto.getRandomValues(new Uint8Array(32));
    const pub = hexBytes(vectors.recipient_public_hex);
    const wrapped = PK1_PREFIX + (await sealTo(pub, cek));
    const key = new Uint8Array(await resolveFileKey("any passphrase", new Uint8Array(32), wrapped));
    expect(key).toEqual(cek);

    const name = PK1_PREFIX + (await sealTo(pub, new TextEncoder().encode("Holiday 🌴.jpg")));
    expect(await openPk1Name(name)).toBe("Holiday 🌴.jpg");
    const unusedKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    expect(await decryptName(name, unusedKey)).toBe("Holiday 🌴.jpg");
  });

  it("fails cleanly while the vault is locked or for someone else's key", async () => {
    const other = x25519.getPublicKey(crypto.getRandomValues(new Uint8Array(32)));
    const sealed = PK1_PREFIX + (await sealTo(other, new Uint8Array([1, 2, 3])));
    await expect(openPk1(sealed)).rejects.toThrow();
    await expect(resolveFileKey("p", new Uint8Array(32), sealed)).rejects.toThrow(/unlock your vault/);
    useKeysStore.setState({ privateKey: null, publicKey: null });
    await expect(openPk1(sealed)).rejects.toThrow(/not loaded/);
  });

  it("recognises only the pk1 prefix", () => {
    expect(isPk1("pk1:abc")).toBe(true);
    expect(isPk1("mk1:abc")).toBe(false);
    expect(isPk1(undefined)).toBe(false);
    vi.restoreAllMocks();
  });
});
