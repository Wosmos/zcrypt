import { describe, it, expect, beforeEach, vi } from "vitest";
import { x25519 } from "@noble/curves/ed25519.js";

const api = vi.hoisted(() => ({
  getMyKey: vi.fn(),
  publishKey: vi.fn(),
  putMasterKey: vi.fn(),
}));
vi.mock("@/lib/api", () => api);

import { ApiError } from "@/lib/http-error";
import {
  IncorrectPassphraseError,
  clearDerivedKeyCache,
  deriveKeyBytes,
  fromBase64,
  generateCEK,
  resolveFileKey,
  toBase64,
  toArrayBuffer,
  unwrapKey,
  wrapKey,
  bytesToHex,
} from "@/lib/crypto";
import { ensureUserKeypair } from "@/lib/keys";
import {
  MasterKeyUnavailableError,
  ensureMasterKey,
  isMk1,
  loadMasterKey,
  unwrapCekWithMasterKey,
  verifyPassphraseAgainstMasterKey,
  wrapCekForVault,
  wrapCekWithMasterKey,
} from "@/lib/master-key";
import { useKeysStore } from "@/store/keys";
import { usePassphraseStore } from "@/store/passphrase";
import { useFolderRegistry } from "@/store/folder-registry";
import { clearDecryptCache } from "@/lib/decrypt-cache";

const PASS = "correct horse battery staple";

interface ServerRecord {
  user_id: string;
  public_key: string;
  fingerprint: string;
  wrapped_private_key: string;
  kdf_salt: string;
  updated_at: string;
  wrapped_master_key: string;
  master_key_writes: boolean;
}

let server: ServerRecord | null;

function bindServer() {
  api.getMyKey.mockImplementation(async () => (server ? { ...server } : null));
  api.publishKey.mockImplementation(async (body: Record<string, string>) => {
    server = {
      user_id: "u1",
      updated_at: "",
      wrapped_master_key: "",
      master_key_writes: false,
      public_key: body.public_key,
      fingerprint: body.fingerprint,
      wrapped_private_key: body.wrapped_private_key,
      kdf_salt: body.kdf_salt,
    };
    return { success: true };
  });
  api.putMasterKey.mockImplementation(async (wrapped: string) => {
    if (!server) throw new ApiError("no keys", 404);
    if (server.wrapped_master_key) throw new ApiError("exists", 409);
    server.wrapped_master_key = wrapped;
    return { stored: true };
  });
}

async function seedAccount(pass = PASS): Promise<ServerRecord> {
  const kp = x25519.keygen();
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const kek = await deriveKeyBytes(pass, salt);
  server = {
    user_id: "u1",
    updated_at: "",
    public_key: toBase64(kp.publicKey),
    fingerprint: "fp",
    wrapped_private_key: toBase64(await wrapKey(kek, kp.secretKey)),
    kdf_salt: toBase64(salt),
    wrapped_master_key: "",
    master_key_writes: false,
  };
  return server;
}

beforeEach(() => {
  vi.clearAllMocks();
  clearDerivedKeyCache();
  clearDecryptCache();
  useKeysStore.getState().reset();
  usePassphraseStore.setState({ cachedPassphrase: null });
  useFolderRegistry.setState({ byId: {} });
  server = null;
  bindServer();
});

describe("master key bootstrap", () => {
  it("creates + publishes MK for a brand-new account right after the keypair", async () => {
    await ensureUserKeypair(PASS);

    expect(api.publishKey).toHaveBeenCalledTimes(1);
    expect(api.putMasterKey).toHaveBeenCalledTimes(1);
    const mk = useKeysStore.getState().masterKey!;
    expect(mk).toHaveLength(32);
    const kek = await deriveKeyBytes(PASS, fromBase64(server!.kdf_salt));
    expect(await unwrapKey(kek, fromBase64(server!.wrapped_master_key))).toEqual(mk);
  });

  it("creates MK when an existing account has none", async () => {
    await seedAccount();
    await ensureUserKeypair(PASS);

    expect(api.putMasterKey).toHaveBeenCalledTimes(1);
    expect(useKeysStore.getState().masterKey).toHaveLength(32);
    expect(useKeysStore.getState().ready).toBe(true);
  });

  it("unwraps the stored MK without writing, and records the writes switch", async () => {
    const rec = await seedAccount();
    const kek = await deriveKeyBytes(PASS, fromBase64(rec.kdf_salt));
    const mk = crypto.getRandomValues(new Uint8Array(32));
    rec.wrapped_master_key = toBase64(await wrapKey(kek, mk));
    rec.master_key_writes = true;

    await ensureUserKeypair(PASS);

    expect(api.putMasterKey).not.toHaveBeenCalled();
    expect(useKeysStore.getState().masterKey).toEqual(mk);
    expect(useKeysStore.getState().masterKeyWrites).toBe(true);
  });

  it("on a 409 race adopts the server's MK and never keeps its own", async () => {
    const rec = await seedAccount();
    const kek = await deriveKeyBytes(PASS, fromBase64(rec.kdf_salt));
    const winner = crypto.getRandomValues(new Uint8Array(32));
    api.putMasterKey.mockImplementationOnce(async () => {
      rec.wrapped_master_key = toBase64(await wrapKey(kek, winner));
      throw new ApiError("exists", 409);
    });

    await ensureUserKeypair(PASS);

    expect(useKeysStore.getState().masterKey).toEqual(winner);
  });

  it("a non-409 failure leaves MK unloaded and the keypair usable", async () => {
    await seedAccount();
    api.putMasterKey.mockRejectedValueOnce(new Error("boom"));

    await ensureUserKeypair(PASS);

    expect(useKeysStore.getState().ready).toBe(true);
    expect(useKeysStore.getState().masterKey).toBeNull();
  });

  it("a wrong passphrase never unwraps MK and never creates one", async () => {
    const rec = await seedAccount();
    const kek = await deriveKeyBytes(PASS, fromBase64(rec.kdf_salt));
    rec.wrapped_master_key = toBase64(
      await wrapKey(kek, crypto.getRandomValues(new Uint8Array(32))),
    );

    await ensureUserKeypair("not the passphrase");
    expect(useKeysStore.getState().masterKey).toBeNull();
    await expect(ensureMasterKey("not the passphrase")).rejects.toBeInstanceOf(
      IncorrectPassphraseError,
    );

    rec.wrapped_master_key = "";
    await expect(ensureMasterKey("not the passphrase")).rejects.toBeInstanceOf(
      IncorrectPassphraseError,
    );
    expect(api.putMasterKey).not.toHaveBeenCalled();
  });

  it("loadMasterKey rejects a wrong KEK with IncorrectPassphraseError", async () => {
    const rec = await seedAccount();
    const kek = await deriveKeyBytes(PASS, fromBase64(rec.kdf_salt));
    rec.wrapped_master_key = toBase64(
      await wrapKey(kek, crypto.getRandomValues(new Uint8Array(32))),
    );
    const wrongKek = await deriveKeyBytes("nope", fromBase64(rec.kdf_salt));
    await expect(loadMasterKey(wrongKek, rec)).rejects.toBeInstanceOf(IncorrectPassphraseError);
  });

  it("clears MK on a vault lock / logout like the private key", async () => {
    await ensureUserKeypair(PASS);
    expect(useKeysStore.getState().masterKey).not.toBeNull();
    clearDecryptCache();
    expect(useKeysStore.getState().masterKey).toBeNull();

    await ensureMasterKey(PASS);
    expect(useKeysStore.getState().masterKey).not.toBeNull();
    useKeysStore.getState().reset();
    expect(useKeysStore.getState().masterKey).toBeNull();
    expect(useKeysStore.getState().masterKeyWrites).toBe(false);
  });

  it("ensureMasterKey without a passphrase and without MK is MasterKeyUnavailableError", async () => {
    await expect(ensureMasterKey(null)).rejects.toBeInstanceOf(MasterKeyUnavailableError);
  });
});

describe("verifyPassphraseAgainstMasterKey", () => {
  it("true for the right passphrase, false for a wrong one, null with no MK", async () => {
    const rec = await seedAccount();
    expect(await verifyPassphraseAgainstMasterKey(PASS)).toBeNull();
    const kek = await deriveKeyBytes(PASS, fromBase64(rec.kdf_salt));
    rec.wrapped_master_key = toBase64(
      await wrapKey(kek, crypto.getRandomValues(new Uint8Array(32))),
    );
    expect(await verifyPassphraseAgainstMasterKey(PASS)).toBe(true);
    expect(await verifyPassphraseAgainstMasterKey("wrong")).toBe(false);
  });

  it("is inconclusive when the server cannot be reached", async () => {
    api.getMyKey.mockRejectedValueOnce(new Error("offline"));
    expect(await verifyPassphraseAgainstMasterKey(PASS)).toBeNull();
  });
});

describe("resolveFileKey with mk1", () => {
  it("round-trips a CEK through the in-memory MK", async () => {
    await ensureUserKeypair(PASS);
    const mk = useKeysStore.getState().masterKey!;
    const cek = generateCEK();
    const wrapped = await wrapCekWithMasterKey(mk, cek);
    expect(wrapped.startsWith("mk1:")).toBe(true);
    expect(isMk1(wrapped)).toBe(true);

    const salt = crypto.getRandomValues(new Uint8Array(32));
    const key = await resolveFileKey(PASS, salt, wrapped);
    expect(new Uint8Array(key)).toEqual(cek);
  });

  it("loads MK from the passphrase when it is not in memory yet", async () => {
    await ensureUserKeypair(PASS);
    const mk = useKeysStore.getState().masterKey!;
    const wrapped = await wrapCekWithMasterKey(mk, generateCEK());
    clearDecryptCache();

    const key = await resolveFileKey(PASS, new Uint8Array(32), wrapped);
    expect(key.byteLength).toBe(32);
    expect(useKeysStore.getState().masterKey).toEqual(mk);
  });

  it("rejects a wrong passphrase when MK must be loaded", async () => {
    await ensureUserKeypair(PASS);
    const wrapped = await wrapCekWithMasterKey(useKeysStore.getState().masterKey!, generateCEK());
    clearDecryptCache();
    await expect(resolveFileKey("wrong", new Uint8Array(32), wrapped)).rejects.toBeInstanceOf(
      IncorrectPassphraseError,
    );
  });

  it("throws MasterKeyUnavailableError when MK cannot be loaded", async () => {
    api.getMyKey.mockRejectedValue(new Error("offline"));
    await expect(resolveFileKey(PASS, new Uint8Array(32), "mk1:AAAA")).rejects.toBeInstanceOf(
      MasterKeyUnavailableError,
    );
  });

  it("a tampered mk1 envelope fails instead of returning a key", async () => {
    await ensureUserKeypair(PASS);
    const mk = useKeysStore.getState().masterKey!;
    const wrapped = await wrapCekWithMasterKey(mk, generateCEK());
    const raw = fromBase64(wrapped.slice(4));
    raw[raw.length - 1] ^= 1;
    await expect(
      resolveFileKey(PASS, new Uint8Array(32), "mk1:" + toBase64(raw)),
    ).rejects.toThrow();
  });

  it("leaves the legacy scheme byte-for-byte unchanged", async () => {
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const kek = await deriveKeyBytes(PASS, salt);
    const cek = generateCEK();
    const wrapped = toBase64(await wrapKey(kek, cek));

    expect(new Uint8Array(await resolveFileKey(PASS, salt, wrapped))).toEqual(cek);
    expect(new Uint8Array(await resolveFileKey(PASS, salt, ""))).toEqual(new Uint8Array(kek));
    expect(new Uint8Array(await resolveFileKey(PASS, salt, null))).toEqual(new Uint8Array(kek));
    await expect(resolveFileKey("wrong", salt, wrapped)).rejects.toBeInstanceOf(
      IncorrectPassphraseError,
    );
    expect(api.getMyKey).not.toHaveBeenCalled();
  });
});

describe("Rust interop (app/core/src/crypto.rs mk1_chain_resolves_cek)", () => {
  async function wrapWithIv(key: ArrayBuffer, iv: number, plain: Uint8Array): Promise<Uint8Array> {
    const k = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt"]);
    const ivBytes = new Uint8Array(12).fill(iv);
    const ct = new Uint8Array(
      await crypto.subtle.encrypt({ name: "AES-GCM", iv: ivBytes }, k, plain as BufferSource),
    );
    const out = new Uint8Array(12 + ct.length);
    out.set(ivBytes, 0);
    out.set(ct, 12);
    return out;
  }

  it("resolves the same CEK as the Rust fixed-input chain", async () => {
    const pass = "mk1-fixed-passphrase";
    const kdfSalt = new Uint8Array(32).fill(7);
    const mk = new Uint8Array(32).fill(0x11);
    const cek = new Uint8Array(32).fill(0x22);
    const accountKek = await deriveKeyBytes(pass, kdfSalt);
    const wrappedMk = await wrapWithIv(accountKek, 1, mk);
    const wrappedCek = await wrapWithIv(toArrayBuffer(mk), 2, cek);

    const unwrapped = await loadMasterKey(accountKek, {
      wrapped_master_key: toBase64(wrappedMk),
    } as never);
    expect(bytesToHex(unwrapped)).toBe(bytesToHex(mk));

    const key = await resolveFileKey(
      pass,
      new Uint8Array(32).fill(9),
      "mk1:" + toBase64(wrappedCek),
    );
    expect(bytesToHex(new Uint8Array(key))).toBe(bytesToHex(cek));

    useKeysStore.setState({ masterKey: new Uint8Array(32) });
    await expect(
      resolveFileKey(pass, new Uint8Array(32).fill(9), "mk1:" + toBase64(wrappedCek)),
    ).rejects.toThrow();
  });
});

describe("wrapCekForVault (the only mk1 write gate)", () => {
  async function ready(writes: boolean) {
    await ensureUserKeypair(PASS);
    useKeysStore.setState({ masterKeyWrites: writes });
    usePassphraseStore.setState({ cachedPassphrase: PASS, cacheUntil: null, persistent: true });
  }

  it("wraps under MK when the switch is on and the file is vault-keyed", async () => {
    await ready(true);
    const cek = generateCEK();
    const wrapped = await wrapCekForVault(cek, PASS, null);
    expect(wrapped?.startsWith("mk1:")).toBe(true);
    expect(await unwrapCekWithMasterKey(useKeysStore.getState().masterKey!, wrapped!)).toEqual(cek);
  });

  it("returns null (legacy) while the server switch is off", async () => {
    await ready(false);
    expect(await wrapCekForVault(generateCEK(), PASS, null)).toBeNull();
  });

  it("returns null when MK is not loaded and cannot be loaded", async () => {
    await ready(true);
    clearDecryptCache();
    api.getMyKey.mockRejectedValue(new Error("offline"));
    expect(await wrapCekForVault(generateCEK(), PASS, null)).toBeNull();
  });

  it("returns null for a protected folder and for an unknown folder", async () => {
    await ready(true);
    useFolderRegistry.setState({
      byId: { prot: { pwSalt: "s", pwVerifier: "v" }, open: { pwSalt: null, pwVerifier: null } },
    });
    expect(await wrapCekForVault(generateCEK(), PASS, "prot")).toBeNull();
    expect(await wrapCekForVault(generateCEK(), PASS, "unknown")).toBeNull();
    expect(await wrapCekForVault(generateCEK(), PASS, "open")).not.toBeNull();
  });

  it("returns null when the passphrase is a folder password, not the vault passphrase", async () => {
    await ready(true);
    expect(await wrapCekForVault(generateCEK(), "folder-password", null)).toBeNull();
  });
});
