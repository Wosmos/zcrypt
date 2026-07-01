import { describe, it, expect, beforeEach, vi } from "vitest";
import { x25519 } from "@noble/curves/ed25519.js";

// lib/keys pulls in lib/api → store/auth, which reads localStorage at module
// load. We only exercise the pure crypto here, so stub the API surface keys.ts
// imports; this keeps the store/auth (localStorage) chain out of the test.
vi.mock("@/lib/api", () => ({
  getMyKey: vi.fn(),
  publishKey: vi.fn(),
}));

import {
  sealTo,
  openSealed,
  generateSpaceKey,
  keyFingerprint,
} from "@/lib/keys";
import { wrapKey, unwrapKey, generateCEK } from "@/lib/crypto";
import { useKeysStore } from "@/store/keys";

/** A Uint8Array's bytes as a standalone ArrayBuffer (an AES key). */
function buf(u8: Uint8Array): ArrayBuffer {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

function loadKeypair(kp: { secretKey: Uint8Array; publicKey: Uint8Array }) {
  useKeysStore.setState({
    privateKey: kp.secretKey,
    publicKey: kp.publicKey,
    fingerprint: null,
    ready: true,
    loading: false,
  });
}

beforeEach(() => {
  useKeysStore.getState().reset();
});

describe("generateSpaceKey", () => {
  it("returns 32 random bytes, unique each call", () => {
    const a = generateSpaceKey();
    const b = generateSpaceKey();
    expect(a).toBeInstanceOf(Uint8Array);
    expect(a.length).toBe(32);
    expect(a).not.toEqual(b);
  });
});

describe("keyFingerprint", () => {
  it("is deterministic and formatted as 4 groups of 4 hex chars", async () => {
    const kp = x25519.keygen();
    const fp1 = await keyFingerprint(kp.publicKey);
    const fp2 = await keyFingerprint(kp.publicKey);
    expect(fp1).toBe(fp2);
    expect(fp1).toMatch(/^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  });

  it("differs for different keys", async () => {
    const a = await keyFingerprint(x25519.keygen().publicKey);
    const b = await keyFingerprint(x25519.keygen().publicKey);
    expect(a).not.toBe(b);
  });
});

describe("sealTo / openSealed (ECIES sharing primitive)", () => {
  it("round-trips: a recipient can open what was sealed to their public key", async () => {
    const recipient = x25519.keygen();
    loadKeypair(recipient);

    const data = generateSpaceKey();
    const sealed = await sealTo(recipient.publicKey, data);
    const opened = await openSealed(sealed);

    expect(opened).toEqual(data);
  });

  it("uses a fresh ephemeral key each time (ciphertext is non-deterministic)", async () => {
    const recipient = x25519.keygen();
    const data = generateSpaceKey();
    const s1 = await sealTo(recipient.publicKey, data);
    const s2 = await sealTo(recipient.publicKey, data);
    expect(s1).not.toEqual(s2);
  });

  it("a DIFFERENT keypair cannot open a blob sealed to someone else (zero-knowledge)", async () => {
    const alice = x25519.keygen();
    const mallory = x25519.keygen();

    const data = generateSpaceKey();
    const sealedToAlice = await sealTo(alice.publicKey, data);

    // Mallory tries to open it with her own keypair loaded.
    loadKeypair(mallory);
    await expect(openSealed(sealedToAlice)).rejects.toThrow();
  });

  it("tampering with the ephemeral public key prefix breaks decryption", async () => {
    const recipient = x25519.keygen();
    loadKeypair(recipient);
    const sealed = await sealTo(recipient.publicKey, generateSpaceKey());

    // Flip a byte in the base64 blob's first chunk (the ephemeral pub key).
    const bytes = atob(sealed);
    const tampered = btoa("\x00" + bytes.slice(1));
    await expect(openSealed(tampered)).rejects.toThrow();
  });
});

describe("space-key CEK re-wrap (P3 sharing + P5 rotation invariants)", () => {
  it("a file CEK wrapped under the space key round-trips", async () => {
    const spaceKey = generateSpaceKey();
    const cek = generateCEK();
    const wrapped = await wrapKey(buf(spaceKey), cek);
    const recovered = await unwrapKey(buf(spaceKey), wrapped);
    expect(recovered).toEqual(cek);
  });

  it("rotation re-wraps under a new key; the new key opens it, the OLD key does not", async () => {
    const oldKey = generateSpaceKey();
    const newKey = generateSpaceKey();
    const cek = generateCEK();

    // File is currently wrapped under the old space key.
    const wrappedOld = await wrapKey(buf(oldKey), cek);

    // Rotate: unwrap with old, re-wrap with new (exactly what rotateSpaceKey does).
    const recovered = await unwrapKey(buf(oldKey), wrappedOld);
    const wrappedNew = await wrapKey(buf(newKey), recovered);

    // The new key decrypts to the same CEK...
    expect(await unwrapKey(buf(newKey), wrappedNew)).toEqual(cek);
    // ...and a removed member holding only the OLD key cannot open the re-wrapped file.
    await expect(unwrapKey(buf(oldKey), wrappedNew)).rejects.toThrow();
  });

  it("the wrong space key cannot unwrap a CEK", async () => {
    const spaceKey = generateSpaceKey();
    const other = generateSpaceKey();
    const wrapped = await wrapKey(buf(spaceKey), generateCEK());
    await expect(unwrapKey(buf(other), wrapped)).rejects.toThrow();
  });
});
