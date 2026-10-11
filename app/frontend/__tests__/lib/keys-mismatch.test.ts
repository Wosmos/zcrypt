import { describe, it, expect, beforeEach, vi } from "vitest";
import { x25519 } from "@noble/curves/ed25519.js";

const api = vi.hoisted(() => ({
  getMyKey: vi.fn(),
  publishKey: vi.fn(),
  putMasterKey: vi.fn(),
}));
vi.mock("@/lib/api", () => api);

import { deriveKeyBytes, toBase64, wrapKey } from "@/lib/crypto";
import { OwnKeyMismatchError, ensureUserKeypair } from "@/lib/keys";
import { useKeysStore } from "@/store/keys";

const PASS = "correct horse battery staple";

beforeEach(() => {
  vi.clearAllMocks();
  useKeysStore.getState().reset();
});

describe("ensureUserKeypair with a swapped server key", () => {
  it("refuses to use a public key that does not match our private key", async () => {
    const mine = x25519.keygen();
    const imposter = x25519.keygen();
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const kek = await deriveKeyBytes(PASS, salt);
    api.getMyKey.mockResolvedValue({
      user_id: "u1",
      public_key: toBase64(imposter.publicKey),
      fingerprint: "fp",
      wrapped_private_key: toBase64(await wrapKey(kek, mine.secretKey)),
      kdf_salt: toBase64(salt),
      wrapped_master_key: "",
      master_key_writes: false,
    });

    const err = await ensureUserKeypair(PASS).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(OwnKeyMismatchError);
    expect((err as Error).name).toBe("OwnKeyMismatchError");
    expect((err as Error).message).toContain("doesn't match your private key");
    const state = useKeysStore.getState();
    expect(state.mismatch).toBe(true);
    expect(state.ready).toBe(false);
    expect(state.loading).toBe(false);
    expect(state.privateKey).toBeNull();
  });
});
