import { describe, it, expect, beforeEach, vi } from "vitest";
import { x25519 } from "@noble/curves/ed25519.js";

const api = vi.hoisted(() => ({
  getMyKey: vi.fn(),
  publishKey: vi.fn(),
  putMasterKey: vi.fn(),
}));
vi.mock("@/lib/api", () => api);
const keys = vi.hoisted(() => ({ ensureUserKeypair: vi.fn() }));
vi.mock("@/lib/keys", () => keys);
const crypt = vi.hoisted(() => ({ unwrapOverride: null as null | (() => Promise<Uint8Array>) }));
vi.mock("@/lib/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crypto")>();
  return {
    ...actual,
    unwrapKey: (...args: Parameters<typeof actual.unwrapKey>) => {
      const o = crypt.unwrapOverride;
      if (o) {
        crypt.unwrapOverride = null;
        return o();
      }
      return actual.unwrapKey(...args);
    },
  };
});

import { ApiError } from "@/lib/http-error";
import {
  IncorrectPassphraseError,
  clearDerivedKeyCache,
  deriveKeyBytes,
  fromBase64,
  generateCEK,
  toBase64,
  wrapKey,
} from "@/lib/crypto";
import {
  MasterKeyUnavailableError,
  ensureMasterKey,
  loadMasterKey,
  verifyPassphraseAgainstMasterKey,
  wrapCekForVault,
} from "@/lib/master-key";
import { useKeysStore } from "@/store/keys";
import { usePassphraseStore } from "@/store/passphrase";
import { clearDecryptCache } from "@/lib/decrypt-cache";

const PASS = "correct horse battery staple";

type Rec = Record<string, unknown>;
let server: Rec | null;

async function account(opts: { mk?: Uint8Array; writes?: boolean } = {}): Promise<Rec> {
  const kp = x25519.keygen();
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const kek = await deriveKeyBytes(PASS, salt);
  return {
    user_id: "u1",
    public_key: toBase64(kp.publicKey),
    fingerprint: "fp",
    wrapped_private_key: toBase64(await wrapKey(kek, kp.secretKey)),
    kdf_salt: toBase64(salt),
    wrapped_master_key: opts.mk ? toBase64(await wrapKey(kek, opts.mk)) : "",
    master_key_writes: opts.writes ?? false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearDerivedKeyCache();
  clearDecryptCache();
  useKeysStore.getState().reset();
  usePassphraseStore.setState({ cachedPassphrase: null });
  server = null;
  crypt.unwrapOverride = null;
  api.getMyKey.mockImplementation(async () => (server ? { ...server } : null));
  keys.ensureUserKeypair.mockReset();
});

describe("loading the master key", () => {
  it("rejects a stored master key of the wrong size", async () => {
    server = await account({ mk: new Uint8Array(16) });
    await expect(ensureMasterKey(PASS)).rejects.toThrow("Stored master key is malformed.");
    expect(useKeysStore.getState().masterKey).toBeNull();
  });

  it("fails when the server wins the set-once race but then shows no master key", async () => {
    server = await account();
    api.putMasterKey.mockRejectedValueOnce(new ApiError("exists", 409));
    await expect(ensureMasterKey(PASS)).rejects.toBeInstanceOf(MasterKeyUnavailableError);
    expect(useKeysStore.getState().masterKey).toBeNull();
  });

  it("adopts the winner's writes switch after a lost race", async () => {
    server = await account();
    const winner = crypto.getRandomValues(new Uint8Array(32));
    const rec = server;
    api.putMasterKey.mockImplementationOnce(async () => {
      const kek = await deriveKeyBytes(PASS, fromBase64(rec.kdf_salt as string));
      rec.wrapped_master_key = toBase64(await wrapKey(kek, winner));
      rec.master_key_writes = true;
      throw new ApiError("exists", 409);
    });
    expect(await ensureMasterKey(PASS)).toEqual(winner);
    expect(useKeysStore.getState().masterKeyWrites).toBe(true);
  });

  it("bootstraps the keypair for a brand-new account and uses the master key it produced", async () => {
    const mk = new Uint8Array(32).fill(3);
    keys.ensureUserKeypair.mockImplementation(async () => {
      useKeysStore.setState({ masterKey: mk });
    });
    expect(await ensureMasterKey(PASS)).toEqual(mk);
    expect(keys.ensureUserKeypair).toHaveBeenCalledWith(PASS);
    expect(api.getMyKey).toHaveBeenCalledTimes(1);
  });

  it("re-reads the account after bootstrapping when no master key came back", async () => {
    const mk = crypto.getRandomValues(new Uint8Array(32));
    keys.ensureUserKeypair.mockImplementation(async () => {
      server = await account({ mk });
    });
    expect(await ensureMasterKey(PASS)).toEqual(mk);
    expect(api.getMyKey).toHaveBeenCalledTimes(2);
  });

  it("is unavailable when the account still does not exist after bootstrapping", async () => {
    keys.ensureUserKeypair.mockResolvedValue(undefined);
    await expect(ensureMasterKey(PASS)).rejects.toBeInstanceOf(MasterKeyUnavailableError);
  });

  it("reports a wrong passphrase when the private key cannot be unwrapped", async () => {
    server = await account({ mk: new Uint8Array(32) });
    await expect(ensureMasterKey("wrong")).rejects.toBeInstanceOf(IncorrectPassphraseError);
  });

  it("wraps a non-Error failure as an unavailable master key", async () => {
    api.getMyKey.mockRejectedValueOnce("offline");
    const err = await ensureMasterKey(PASS).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MasterKeyUnavailableError);
    expect((err as Error).message).toBe("The account master key is not loaded yet.");
  });

  it("keeps the original message of an Error failure and shares one load between callers", async () => {
    api.getMyKey.mockRejectedValue(new Error("offline"));
    const [a, b] = await Promise.all([
      ensureMasterKey(PASS).catch((e: unknown) => e),
      ensureMasterKey(PASS).catch((e: unknown) => e),
    ]);
    expect((a as Error).message).toBe("offline");
    expect(b).toBe(a);
    expect(api.getMyKey).toHaveBeenCalledTimes(1);
  });

  it("loadMasterKey propagates a non-conflict server error", async () => {
    server = await account();
    const kek = await deriveKeyBytes(PASS, fromBase64(server.kdf_salt as string));
    api.putMasterKey.mockRejectedValueOnce(new ApiError("down", 500));
    await expect(loadMasterKey(kek, server as never)).rejects.toThrow("down");
    api.putMasterKey.mockRejectedValueOnce(new Error("plain"));
    await expect(loadMasterKey(kek, server as never)).rejects.toThrow("plain");
  });
});

describe("verifyPassphraseAgainstMasterKey edge cases", () => {
  it("is inconclusive when the stored master key is malformed", async () => {
    server = await account({ mk: new Uint8Array(16) });
    expect(await verifyPassphraseAgainstMasterKey(PASS)).toBeNull();
  });
});

describe("wrapCekForVault safety nets", () => {
  async function ready() {
    server = await account({ mk: new Uint8Array(32).fill(5), writes: true });
    usePassphraseStore.setState({ cachedPassphrase: PASS, cacheUntil: null, persistent: true });
    await ensureMasterKey(PASS);
  }

  it("falls back to legacy when loading the master key switches writes off", async () => {
    server = await account({ mk: new Uint8Array(32).fill(5), writes: false });
    usePassphraseStore.setState({ cachedPassphrase: PASS, cacheUntil: null, persistent: true });
    useKeysStore.setState({ masterKeyWrites: true });
    expect(await wrapCekForVault(generateCEK(), PASS, null)).toBeNull();
    expect(useKeysStore.getState().masterKeyWrites).toBe(false);
  });

  it("falls back to legacy when the envelope does not round-trip to the same length", async () => {
    await ready();
    crypt.unwrapOverride = async () => new Uint8Array(8);
    expect(await wrapCekForVault(generateCEK(), PASS, null)).toBeNull();
  });

  it("falls back to legacy when the envelope round-trips to different bytes", async () => {
    await ready();
    crypt.unwrapOverride = async () => new Uint8Array(32).fill(9);
    expect(await wrapCekForVault(generateCEK(), PASS, null)).toBeNull();
  });
});
