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
  ensureUserKeypair,
} from "@/lib/keys";
import {
  wrapKey,
  unwrapKey,
  generateCEK,
  deriveKeyBytes,
  generateSalt,
  toBase64,
  fromBase64,
} from "@/lib/crypto";
import { getMyKey, publishKey } from "@/lib/api";
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
  vi.clearAllMocks();
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

  it("falls back to no groups if the digest ever yielded under 4 hex chars", async () => {
    // A real SHA-256 digest is always 32 bytes (64 hex chars), so `.slice(0, 16)`
    // can never come up short and the `?? []` fallback is unreachable with a real
    // digest. Stub crypto.subtle.digest for this one call to prove the fallback
    // itself is correct, in case that guarantee is ever violated upstream.
    const digestSpy = vi.spyOn(crypto.subtle, "digest").mockResolvedValueOnce(new ArrayBuffer(0));
    await expect(keyFingerprint(new Uint8Array([1]))).resolves.toBe("");
    digestSpy.mockRestore();
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

  it("openSealed throws when no keypair is loaded", async () => {
    const recipient = x25519.keygen();
    const sealed = await sealTo(recipient.publicKey, generateSpaceKey());
    await expect(openSealed(sealed)).rejects.toThrow("keypair not loaded");
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

describe("ensureUserKeypair (X25519 bootstrap for sharing)", () => {
  it("generates + publishes a keypair on first use, with the private key wrapped under the passphrase", async () => {
    vi.mocked(getMyKey).mockResolvedValue(null);
    vi.mocked(publishKey).mockResolvedValue({ success: true } as never);

    await ensureUserKeypair("hunter2 hunter2 hunter2");

    // Published exactly one record; the store is now ready with a keypair.
    expect(publishKey).toHaveBeenCalledTimes(1);
    const state = useKeysStore.getState();
    expect(state.ready).toBe(true);
    expect(state.loading).toBe(false);
    expect(state.publicKey).toBeInstanceOf(Uint8Array);
    expect(state.privateKey).toBeInstanceOf(Uint8Array);

    // The published wrapped private key must unwrap, under a KEK derived from the
    // passphrase + the published salt, back to the in-memory private key.
    const pub = vi.mocked(publishKey).mock.calls[0][0];
    const kek = await deriveKeyBytes("hunter2 hunter2 hunter2", fromBase64(pub.kdf_salt));
    const unwrapped = await unwrapKey(kek, fromBase64(pub.wrapped_private_key));
    expect(unwrapped).toEqual(state.privateKey);
    // The published fingerprint matches the public key.
    expect(pub.fingerprint).toBe(await keyFingerprint(state.publicKey!));
    expect(pub.public_key).toBe(toBase64(state.publicKey!));
  });

  it("loads + unwraps an already-published keypair (no re-publish)", async () => {
    const kp = x25519.keygen();
    const salt = generateSalt();
    const kek = await deriveKeyBytes("my passphrase", salt);
    const wrapped = await wrapKey(kek, kp.secretKey);
    vi.mocked(getMyKey).mockResolvedValue({
      user_id: "u",
      public_key: toBase64(kp.publicKey),
      wrapped_private_key: toBase64(wrapped),
      kdf_salt: toBase64(salt),
      fingerprint: await keyFingerprint(kp.publicKey),
      updated_at: "",
    } as never);

    await ensureUserKeypair("my passphrase");

    const state = useKeysStore.getState();
    expect(state.ready).toBe(true);
    expect(state.privateKey).toEqual(kp.secretKey);
    expect(state.publicKey).toEqual(kp.publicKey);
    expect(publishKey).not.toHaveBeenCalled();
  });

  it("leaves the store not-ready on a wrong passphrase (and never re-publishes)", async () => {
    const kp = x25519.keygen();
    const salt = generateSalt();
    const kek = await deriveKeyBytes("correct", salt);
    const wrapped = await wrapKey(kek, kp.secretKey);
    vi.mocked(getMyKey).mockResolvedValue({
      user_id: "u",
      public_key: toBase64(kp.publicKey),
      wrapped_private_key: toBase64(wrapped),
      kdf_salt: toBase64(salt),
      fingerprint: "",
      updated_at: "",
    } as never);

    await ensureUserKeypair("wrong");

    const state = useKeysStore.getState();
    expect(state.ready).toBe(false);
    expect(state.loading).toBe(false);
    expect(state.privateKey).toBeNull();
    expect(publishKey).not.toHaveBeenCalled();
  });

  it("is a no-op when already ready", async () => {
    useKeysStore.setState({ ready: true });
    await ensureUserKeypair("whatever");
    expect(getMyKey).not.toHaveBeenCalled();
  });

  it("is a no-op with an empty passphrase", async () => {
    await ensureUserKeypair("");
    expect(getMyKey).not.toHaveBeenCalled();
  });
});
