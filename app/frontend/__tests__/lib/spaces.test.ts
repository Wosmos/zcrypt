import { describe, it, expect, beforeEach, vi } from "vitest";
import { x25519 } from "@noble/curves/ed25519.js";

// spaces.ts orchestrates the API + crypto + stores. We mock only the network
// boundary (lib/api) and the download engine (lib/download-session); the crypto
// and the Zustand stores are the real thing, so these tests exercise the actual
// seal/unwrap/re-wrap logic and prove the security invariants end to end.
//
// keys.ts also imports from lib/api at module load, so the mock must cover every
// symbol either module pulls in.
vi.mock("@/lib/api", () => ({
  createSharedVault: vi.fn(),
  addSharedVaultMember: vi.fn(),
  lookupUserKey: vi.fn(),
  addFileToSpace: vi.fn(),
  removeFileFromSpace: vi.fn(),
  getFileMeta: vi.fn(),
  getUserPublicKey: vi.fn(),
  rotateSpace: vi.fn(),
  getMyKey: vi.fn(),
  publishKey: vi.fn(),
}));
vi.mock("@/lib/download-session", () => ({
  downloadAndDecryptFile: vi.fn(),
}));

import {
  createSharedVault,
  addSharedVaultMember,
  lookupUserKey,
  addFileToSpace,
  removeFileFromSpace,
  getFileMeta,
  getUserPublicKey,
  rotateSpace,
} from "@/lib/api";
import { downloadAndDecryptFile } from "@/lib/download-session";
import {
  createSpace,
  loadSpaceKey,
  shareFileIntoSpace,
  unshareFileFromSpace,
  downloadSpaceFile,
  rotateSpaceKey,
  shareSpace,
  decryptSpaceFileName,
} from "@/lib/spaces";
import { sealTo, openSealed, generateSpaceKey } from "@/lib/keys";
import {
  generateCEK,
  wrapKey,
  unwrapKey,
  deriveKeyBytes,
  generateSalt,
  toBase64,
  fromBase64,
} from "@/lib/crypto";
import { useKeysStore } from "@/store/keys";
import { useSpacesStore } from "@/store/spaces";
import { usePassphraseStore } from "@/store/passphrase";
import type { SharedVault } from "@/types";

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

/** Minimal SharedVault carrying just the fields spaces.ts reads. */
function vault(id: string, wrappedSpaceKey?: string): SharedVault {
  return { id, wrapped_space_key: wrappedSpaceKey } as unknown as SharedVault;
}

beforeEach(() => {
  vi.clearAllMocks();
  useKeysStore.getState().reset();
  useSpacesStore.getState().reset();
  usePassphraseStore.getState().clear?.();
});

describe("createSpace", () => {
  it("generates a space key, seals it to the creator, and caches it", async () => {
    const me = x25519.keygen();
    loadKeypair(me);
    vi.mocked(createSharedVault).mockImplementation(async (req) =>
      ({ id: "vault-1", ...req } as unknown as SharedVault)
    );

    const v = await createSpace("Docs", "shared docs", ["f1", "f2"], 500);

    // The request carries the plaintext fields + a sealed key envelope.
    expect(createSharedVault).toHaveBeenCalledTimes(1);
    const req = vi.mocked(createSharedVault).mock.calls[0][0];
    expect(req.name).toBe("Docs");
    expect(req.file_ids).toEqual(["f1", "f2"]);
    expect(req.size_limit_bytes).toBe(500);
    expect(req.wrapped_space_key).toBeTruthy();

    // The cached key round-trips: opening the sealed grant yields exactly it.
    const cached = useSpacesStore.getState().spaceKeys["vault-1"];
    expect(cached).toBeInstanceOf(Uint8Array);
    expect(cached.length).toBe(32);
    const opened = await openSealed(req.wrapped_space_key!);
    expect(opened).toEqual(cached);
    expect(v.id).toBe("vault-1");
  });

  it("refuses to create a space when the user's key isn't loaded", async () => {
    // No keypair loaded.
    await expect(createSpace("X")).rejects.toThrow();
    expect(createSharedVault).not.toHaveBeenCalled();
  });
});

describe("loadSpaceKey", () => {
  it("returns the cached key without touching the grant", async () => {
    const key = generateSpaceKey();
    useSpacesStore.getState().setSpaceKey("v", key);
    await expect(loadSpaceKey(vault("v"))).resolves.toEqual(key);
  });

  it("recovers + caches the key from the caller's sealed grant", async () => {
    const me = x25519.keygen();
    loadKeypair(me);
    const key = generateSpaceKey();
    const grant = await sealTo(me.publicKey, key);

    const recovered = await loadSpaceKey(vault("v2", grant));
    expect(recovered).toEqual(key);
    // ...and it's now cached for the session.
    expect(useSpacesStore.getState().spaceKeys["v2"]).toEqual(key);
  });

  it("returns null for a legacy vault with no grant for us", async () => {
    await expect(loadSpaceKey(vault("v3"))).resolves.toBeNull();
  });
});

describe("shareFileIntoSpace", () => {
  it("re-wraps the file CEK under the space key (server sees only the envelope)", async () => {
    const spaceKey = generateSpaceKey();
    useSpacesStore.getState().setSpaceKey("v", spaceKey);
    usePassphraseStore.getState().setPassphrase("correct horse battery");

    // Build a real envelope file: CEK wrapped under a passphrase-derived KEK.
    const cek = generateCEK();
    const salt = generateSalt();
    const kek = await deriveKeyBytes("correct horse battery", salt);
    const wrappedCek = await wrapKey(kek, cek);
    vi.mocked(getFileMeta).mockResolvedValue({
      salt: toBase64(salt),
      wrapped_cek: toBase64(wrappedCek),
    } as never);

    await shareFileIntoSpace(vault("v"), "file-1");

    expect(addFileToSpace).toHaveBeenCalledTimes(1);
    const [vaultId, fileId, spaceWrapped] = vi.mocked(addFileToSpace).mock.calls[0];
    expect(vaultId).toBe("v");
    expect(fileId).toBe("file-1");

    // The envelope the server stores must unwrap — with the SPACE key — back to
    // the exact same CEK. That's what lets other members decrypt the file.
    const recovered = await unwrapKey(buf(spaceKey), fromBase64(spaceWrapped));
    expect(recovered).toEqual(cek);
  });

  it("seals the file name under the space key so members can read it", async () => {
    const spaceKey = generateSpaceKey();
    useSpacesStore.getState().setSpaceKey("v", spaceKey);
    usePassphraseStore.getState().setPassphrase("pw");

    const cek = generateCEK();
    const salt = generateSalt();
    const kek = await deriveKeyBytes("pw", salt);
    vi.mocked(getFileMeta).mockResolvedValue({
      salt: toBase64(salt),
      wrapped_cek: toBase64(await wrapKey(kek, cek)),
    } as never);

    await shareFileIntoSpace(vault("v"), "file-1", "secret plan.pdf");

    const wrappedName = vi.mocked(addFileToSpace).mock.calls[0][3];
    expect(wrappedName).toBeTruthy();
    // A member with only the space key recovers the exact plaintext name.
    await expect(decryptSpaceFileName(vault("v"), wrappedName)).resolves.toBe("secret plan.pdf");
  });

  it("sends an empty sealed name when no name is provided", async () => {
    const spaceKey = generateSpaceKey();
    useSpacesStore.getState().setSpaceKey("v", spaceKey);
    usePassphraseStore.getState().setPassphrase("pw");
    const salt = generateSalt();
    vi.mocked(getFileMeta).mockResolvedValue({
      salt: toBase64(salt),
      wrapped_cek: toBase64(await wrapKey(await deriveKeyBytes("pw", salt), generateCEK())),
    } as never);

    await shareFileIntoSpace(vault("v"), "file-1");

    expect(vi.mocked(addFileToSpace).mock.calls[0][3]).toBe("");
  });

  it("throws when the space key isn't loaded", async () => {
    usePassphraseStore.getState().setPassphrase("p");
    await expect(shareFileIntoSpace(vault("locked"), "f")).rejects.toThrow();
    expect(addFileToSpace).not.toHaveBeenCalled();
  });

  it("throws when the vault is locked (no passphrase)", async () => {
    useSpacesStore.getState().setSpaceKey("v", generateSpaceKey());
    usePassphraseStore.getState().clear?.();
    await expect(shareFileIntoSpace(vault("v"), "f")).rejects.toThrow();
    expect(addFileToSpace).not.toHaveBeenCalled();
  });
});

describe("unshareFileFromSpace", () => {
  it("delegates to the API", async () => {
    await unshareFileFromSpace("v", "f");
    expect(removeFileFromSpace).toHaveBeenCalledWith("v", "f");
  });
});

describe("downloadSpaceFile", () => {
  it("decrypts using the space-wrapped CEK, bypassing the vault passphrase", async () => {
    const spaceKey = generateSpaceKey();
    useSpacesStore.getState().setSpaceKey("v", spaceKey);

    const cek = generateCEK();
    const spaceWrappedCek = toBase64(await wrapKey(buf(spaceKey), cek));

    await downloadSpaceFile(vault("v"), "file-9", spaceWrappedCek, "file-9.bin");

    expect(downloadAndDecryptFile).toHaveBeenCalledTimes(1);
    const [fileId, pass, opts] = vi.mocked(downloadAndDecryptFile).mock.calls[0];
    expect(fileId).toBe("file-9");
    expect(pass).toBe(""); // no passphrase is used on the space path

    // The injected resolveKey must yield the file's CEK from the space envelope.
    const resolved = await opts!.resolveKey!({} as never);
    expect(new Uint8Array(resolved)).toEqual(cek);
  });

  it("throws when the space's key isn't available", async () => {
    await expect(
      downloadSpaceFile(vault("locked"), "file-9", "irrelevant", "file-9.bin")
    ).rejects.toThrow("This space's key isn't available");
    expect(downloadAndDecryptFile).not.toHaveBeenCalled();
  });
});

describe("rotateSpaceKey (revocation)", () => {
  it("re-keys members + files so the new key works and the old key is useless", async () => {
    const oldKey = generateSpaceKey();
    useSpacesStore.getState().setSpaceKey("v", oldKey);

    // Two remaining members with published keypairs.
    const alice = x25519.keygen();
    const bob = x25519.keygen();
    vi.mocked(getUserPublicKey).mockImplementation(async (uid: string) => ({
      user_id: uid,
      public_key: toBase64(uid === "alice" ? alice.publicKey : bob.publicKey),
      fingerprint: "",
    }));

    // One shared file, currently wrapped under the OLD space key.
    const cek = generateCEK();
    const fileWrappedOld = toBase64(await wrapKey(buf(oldKey), cek));

    vi.mocked(rotateSpace).mockResolvedValue(undefined as never);

    await rotateSpaceKey(
      vault("v"),
      [
        { user_id: "alice" } as never,
        { user_id: "bob" } as never,
      ],
      [{ file_id: "f1", wrapped_cek: fileWrappedOld } as never]
    );

    expect(rotateSpace).toHaveBeenCalledTimes(1);
    const [vaultId, memberGrants, fileWraps] = vi.mocked(rotateSpace).mock.calls[0];
    expect(vaultId).toBe("v");
    expect(memberGrants).toHaveLength(2);
    expect(fileWraps).toHaveLength(1);

    // Recover the NEW key by opening Alice's fresh grant with her private key.
    loadKeypair(alice);
    const aliceGrant = memberGrants.find((g) => g.user_id === "alice")!;
    const newKey = await openSealed(aliceGrant.wrapped_space_key);
    expect(newKey).not.toEqual(oldKey);

    // Bob's grant opens to the SAME new key.
    loadKeypair(bob);
    const bobGrant = memberGrants.find((g) => g.user_id === "bob")!;
    expect(await openSealed(bobGrant.wrapped_space_key)).toEqual(newKey);

    // The re-wrapped file opens with the new key...
    const reopened = await unwrapKey(buf(newKey), fromBase64(fileWraps[0].wrapped_cek));
    expect(reopened).toEqual(cek);
    // ...and is useless to anyone still holding only the OLD key (revocation).
    await expect(
      unwrapKey(buf(oldKey), fromBase64(fileWraps[0].wrapped_cek))
    ).rejects.toThrow();

    // The session cache now holds the new key.
    expect(useSpacesStore.getState().spaceKeys["v"]).toEqual(newKey);
  });

  it("re-seals file names under the new key so the old key can't read them", async () => {
    const oldKey = generateSpaceKey();
    useSpacesStore.getState().setSpaceKey("v", oldKey);
    const alice = x25519.keygen();
    vi.mocked(getUserPublicKey).mockResolvedValue({
      user_id: "alice",
      public_key: toBase64(alice.publicKey),
      fingerprint: "",
    });
    vi.mocked(rotateSpace).mockResolvedValue(undefined as never);

    const nameOld = toBase64(await wrapKey(buf(oldKey), new TextEncoder().encode("report.pdf")));
    const cekOld = toBase64(await wrapKey(buf(oldKey), generateCEK()));

    await rotateSpaceKey(
      vault("v"),
      [{ user_id: "alice" } as never],
      [{ file_id: "f1", wrapped_cek: cekOld, wrapped_name: nameOld } as never]
    );

    const [, memberGrants, fileWraps] = vi.mocked(rotateSpace).mock.calls[0];
    loadKeypair(alice);
    const newKey = await openSealed(memberGrants[0].wrapped_space_key);

    const recovered = await unwrapKey(buf(newKey), fromBase64(fileWraps[0].wrapped_name));
    expect(new TextDecoder().decode(recovered)).toBe("report.pdf");
    await expect(
      unwrapKey(buf(oldKey), fromBase64(fileWraps[0].wrapped_name))
    ).rejects.toThrow();
  });

  it("skips members who have no published key (they have no access to lose)", async () => {
    const oldKey = generateSpaceKey();
    useSpacesStore.getState().setSpaceKey("v", oldKey);
    vi.mocked(getUserPublicKey).mockRejectedValue(new Error("no key"));
    vi.mocked(rotateSpace).mockResolvedValue(undefined as never);

    await rotateSpaceKey(vault("v"), [{ user_id: "ghost" } as never], []);

    const [, memberGrants] = vi.mocked(rotateSpace).mock.calls[0];
    expect(memberGrants).toHaveLength(0);
  });

  it("throws when the current (old) key isn't available", async () => {
    await expect(rotateSpaceKey(vault("locked"), [], [])).rejects.toThrow();
    expect(rotateSpace).not.toHaveBeenCalled();
  });
});

describe("decryptSpaceFileName", () => {
  it("returns null when there is no sealed name", async () => {
    useSpacesStore.getState().setSpaceKey("v", generateSpaceKey());
    await expect(decryptSpaceFileName(vault("v"), "")).resolves.toBeNull();
    await expect(decryptSpaceFileName(vault("v"), undefined)).resolves.toBeNull();
  });

  it("returns null when the space key isn't available", async () => {
    await expect(decryptSpaceFileName(vault("locked"), "abc")).resolves.toBeNull();
  });
});

describe("shareSpace", () => {
  it("seals the space key to the invitee's public key", async () => {
    const invitee = x25519.keygen();
    vi.mocked(lookupUserKey).mockResolvedValue({
      user_id: "u",
      public_key: toBase64(invitee.publicKey),
      fingerprint: "",
    });
    vi.mocked(addSharedVaultMember).mockResolvedValue({} as never);

    const spaceKey = generateSpaceKey();
    await shareSpace("v", spaceKey, "bob@example.com", "editor");

    expect(addSharedVaultMember).toHaveBeenCalledTimes(1);
    const [vaultId, email, role, wrapped] = vi.mocked(addSharedVaultMember).mock.calls[0];
    expect(vaultId).toBe("v");
    expect(email).toBe("bob@example.com");
    expect(role).toBe("editor");

    // The grant is sealed to the invitee: only their private key opens it.
    loadKeypair(invitee);
    expect(await openSealed(wrapped!)).toEqual(spaceKey);
  });
});
