import { describe, it, expect, beforeEach, vi } from "vitest";
import { x25519 } from "@noble/curves/ed25519.js";

const api = vi.hoisted(() => ({
  getMyKey: vi.fn(),
  publishKey: vi.fn(),
  putMasterKey: vi.fn(),
}));
vi.mock("@/lib/api", () => api);

import { deriveKeyBytes, toBase64, wrapKey } from "@/lib/crypto";
import { clearDecryptCache } from "@/lib/decrypt-cache";
import { ensureUserKeypair } from "@/lib/keys";
import "@/lib/spaces";
import { useKeysStore } from "@/store/keys";
import { useSpacesStore } from "@/store/spaces";

const PASS = "correct horse battery staple";

async function serverRecord() {
  const mine = x25519.keygen();
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const kek = await deriveKeyBytes(PASS, salt);
  return {
    user_id: "u1",
    public_key: toBase64(mine.publicKey),
    fingerprint: "fp",
    wrapped_private_key: toBase64(await wrapKey(kek, mine.secretKey)),
    kdf_salt: toBase64(salt),
    wrapped_master_key: "",
    master_key_writes: false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  useKeysStore.getState().reset();
  useSpacesStore.getState().reset();
});

describe("locking the vault", () => {
  it("drops the private key and space keys, keeping the public ones", async () => {
    api.getMyKey.mockResolvedValue(await serverRecord());
    await ensureUserKeypair(PASS);
    useSpacesStore.getState().setSpaceKey("s1", new Uint8Array([1, 2, 3]));
    expect(useKeysStore.getState().privateKey).not.toBeNull();

    clearDecryptCache();

    const keys = useKeysStore.getState();
    expect(keys.privateKey).toBeNull();
    expect(keys.ready).toBe(false);
    expect(keys.publicKey).not.toBeNull();
    expect(useSpacesStore.getState().spaceKeys).toEqual({});

    await ensureUserKeypair(PASS);
    expect(useKeysStore.getState().privateKey).not.toBeNull();
  });

  it("never lets a key load that finishes after the lock put the key back", async () => {
    let answer: (v: unknown) => void = () => {};
    api.getMyKey.mockImplementationOnce(() => new Promise((r) => (answer = r)));
    const loading = ensureUserKeypair(PASS);
    clearDecryptCache();
    answer(await serverRecord());
    await loading;
    expect(useKeysStore.getState().privateKey).toBeNull();
    expect(useKeysStore.getState().ready).toBe(false);
  });

  it("drops a key made for a new account when the vault locked meanwhile", async () => {
    api.getMyKey.mockResolvedValue(null);
    let published: (v: unknown) => void = () => {};
    api.publishKey.mockImplementationOnce(() => new Promise((r) => (published = r)));
    const loading = ensureUserKeypair(PASS);
    await vi.waitFor(() => expect(api.publishKey).toHaveBeenCalled());
    clearDecryptCache();
    published({});
    await loading;
    expect(useKeysStore.getState().privateKey).toBeNull();
  });
});
