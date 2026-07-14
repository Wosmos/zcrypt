/**
 * Cross-implementation conformance vectors — TypeScript verifier.
 *
 * Verifies the REAL web crypto implementation (lib/crypto.ts, lib/name-crypto.ts)
 * against the shared fixture app/backend/crypto/testvectors/vectors.json, the
 * same vectors the Go sidecar and the Rust core must pass. Spec:
 * docs/CRYPTO_FORMAT.md. Regenerate with the Go reference generator:
 *   cd app/desktop/sidecar && ZCRYPT_GEN_VECTORS=1 go test ./crypto/ -run TestCryptoVectors
 *
 * zstd is exempt here: the wasm codec can't load under jsdom (see the mocks in
 * zstd.test.ts); the standard-frame guarantee is verified by Go and Rust.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  deriveKeyBytes,
  decryptChunk,
  unwrapKey,
  resolveFileKey,
  sha256Hex,
  contentMacBytes,
  bytesToHex,
  toArrayBuffer,
} from "@/lib/crypto";
import { deriveNameKey, decryptName } from "@/lib/name-crypto";

// vitest's cwd is app/frontend (vitest.config.ts lives there).
const vectorsPath = resolve(process.cwd(), "../backend/crypto/testvectors/vectors.json");

interface Vectors {
  pbkdf2: { name: string; password: string; salt_hex?: string; salt_text?: string; key_hex: string }[];
  gcm_decrypt: { name: string; key_hex: string; wire_hex: string; plaintext_hex: string }[];
  cek_unwrap: { name: string; kek_hex: string; wrapped_hex: string; cek_hex: string }[];
  resolve_file_key: { name: string; passphrase: string; salt_hex: string; wrapped_cek_b64: string; cek_hex: string }[];
  sha256: { name: string; data_hex: string; sha256_hex: string }[];
  hmac_sha256: { name: string; key_hex: string; data_hex: string; mac_hex: string }[];
  name_decrypt: { name: string; passphrase: string; user_id: string; encrypted_b64: string; plaintext: string }[];
}

const vectors: Vectors = JSON.parse(readFileSync(vectorsPath, "utf8"));

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

describe("crypto conformance vectors (shared with Go + Rust)", () => {
  it("has a sane fixture", () => {
    expect(vectors.pbkdf2.length).toBeGreaterThan(0);
    expect(vectors.gcm_decrypt.length).toBeGreaterThan(0);
  });

  it.each(vectors.pbkdf2)("pbkdf2 $name", async (c) => {
    const salt = c.salt_hex ? fromHex(c.salt_hex) : new TextEncoder().encode(c.salt_text!);
    const key = await deriveKeyBytes(c.password, salt);
    expect(bytesToHex(new Uint8Array(key))).toBe(c.key_hex);
  });

  it.each(vectors.gcm_decrypt)("gcm decrypt $name", async (c) => {
    const plain = await decryptChunk(toArrayBuffer(fromHex(c.key_hex)), fromHex(c.wire_hex));
    expect(bytesToHex(plain)).toBe(c.plaintext_hex);
  });

  it.each(vectors.cek_unwrap)("cek unwrap $name", async (c) => {
    const cek = await unwrapKey(toArrayBuffer(fromHex(c.kek_hex)), fromHex(c.wrapped_hex));
    expect(bytesToHex(cek)).toBe(c.cek_hex);
  });

  it.each(vectors.resolve_file_key)("resolve file key $name", async (c) => {
    const cek = await resolveFileKey(c.passphrase, fromHex(c.salt_hex), c.wrapped_cek_b64);
    expect(bytesToHex(new Uint8Array(cek))).toBe(c.cek_hex);
  });

  it.each(vectors.sha256)("sha256 $name", async (c) => {
    expect(await sha256Hex(fromHex(c.data_hex))).toBe(c.sha256_hex);
  });

  it.each(vectors.hmac_sha256)("hmac_v1 $name", async (c) => {
    expect(await contentMacBytes(fromHex(c.data_hex), fromHex(c.key_hex))).toBe(c.mac_hex);
  });

  it.each(vectors.name_decrypt)("name decrypt $name", async (c) => {
    const key = await deriveNameKey(c.passphrase, c.user_id);
    expect(await decryptName(c.encrypted_b64, key)).toBe(c.plaintext);
  });
});
