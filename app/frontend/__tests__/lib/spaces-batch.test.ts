import { describe, it, expect, beforeEach, vi } from "vitest";
import { x25519 } from "@noble/curves/ed25519.js";

vi.mock("@/lib/api", () => ({
  createSharedVault: vi.fn(),
  addSharedVaultMember: vi.fn(),
  lookupUserKey: vi.fn(),
  addFileToSpace: vi.fn(),
  removeFileFromSpace: vi.fn(),
  getFileMeta: vi.fn(),
  getFileMetas: vi.fn(),
  addFilesToSpaceBatch: vi.fn(),
  getUserPublicKey: vi.fn(),
  rotateSpace: vi.fn(),
  updateSharedVault: vi.fn(),
  getMyKey: vi.fn(),
  publishKey: vi.fn(),
}));
vi.mock("@/lib/download-session", () => ({ downloadAndDecryptFile: vi.fn() }));
vi.mock("@/lib/sealed", () => ({ userNameKey: vi.fn(async () => null) }));
vi.mock("@/store/quota", () => ({ getQuotaData: vi.fn(() => null) }));
vi.mock("@/lib/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crypto")>();
  return {
    ...actual,
    resolveFileKey: vi.fn(async () => crypto.getRandomValues(new Uint8Array(32)).buffer),
  };
});

const idb = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
vi.mock("idb-keyval", () => ({
  get: vi.fn(async (k: string) => idb.store.get(k)),
  set: vi.fn(async (k: string, v: unknown) => {
    idb.store.set(k, v);
  }),
  del: vi.fn(),
}));

import {
  lookupUserKey,
  addSharedVaultMember,
  getFileMetas,
  addFilesToSpaceBatch,
  getUserPublicKey,
  rotateSpace,
  createSharedVault,
} from "@/lib/api";
import {
  shareSpace,
  rotateSpaceKey,
  createSpace,
  memberKeyStatus,
  sealSpaceText,
  openSpaceText,
  shareFilesIntoSpace,
  warmSpaceKeys,
} from "@/lib/spaces";
import { KeyChangedError, pinPeerKey } from "@/lib/key-pins";
import { generateSpaceKey, ensureUserKeypair, OwnKeyMismatchError, localFingerprint } from "@/lib/keys";
import { getMyKey } from "@/lib/api";
import {
  deriveKeyBytes,
  generateSalt,
  wrapKey,
  toBase64,
  resolveFileKey,
  unwrapKey,
  fromBase64,
  toArrayBuffer,
} from "@/lib/crypto";
import { getQuotaData } from "@/store/quota";
import { useAuthStore } from "@/store/auth";
import { useKeysStore } from "@/store/keys";
import { useSpacesStore } from "@/store/spaces";
import { usePassphraseStore } from "@/store/passphrase";
import type { SharedVault } from "@/types";

const vault = (id = "v1") => ({ id, name: "n", description: "" }) as unknown as SharedVault;
const keyB64 = () => toBase64(x25519.keygen().publicKey);

beforeEach(() => {
  vi.clearAllMocks();
  idb.store.clear();
  useAuthStore.setState({ user: { id: "me" } as never });
  useKeysStore.getState().reset();
  useSpacesStore.getState().reset();
  usePassphraseStore.setState({ cachedPassphrase: "pp", cacheUntil: null, persistent: true });
  const me = x25519.keygen();
  useKeysStore.setState({ privateKey: me.secretKey, publicKey: me.publicKey, ready: true });
  vi.mocked(getQuotaData).mockReturnValue(null);
});

describe("peer key verification", () => {
  it("shareSpace throws KeyChangedError for a swapped key and succeeds when approved", async () => {
    const original = keyB64();
    await pinPeerKey("bob", original);
    const swapped = keyB64();
    vi.mocked(lookupUserKey).mockResolvedValue({
      user_id: "bob",
      public_key: swapped,
      fingerprint: "x",
    });
    vi.mocked(addSharedVaultMember).mockResolvedValue({ user_id: "bob" } as never);

    const err = await shareSpace("v1", generateSpaceKey(), "bob@x.io", "viewer").catch((e) => e);
    expect(err).toBeInstanceOf(KeyChangedError);
    expect((err as KeyChangedError).peerUserId).toBe("bob");
    expect(addSharedVaultMember).not.toHaveBeenCalled();

    await shareSpace("v1", generateSpaceKey(), "bob@x.io", "viewer", {
      acceptChangedKeys: ["bob"],
    });
    expect(addSharedVaultMember).toHaveBeenCalledTimes(1);
    const again = await memberKeyStatus({ user_id: "bob", public_key: swapped });
    expect(again.status).toBe("verified");
  });

  it("shareSpace pins a first-seen key after sealing", async () => {
    const k = keyB64();
    vi.mocked(lookupUserKey).mockResolvedValue({ user_id: "amy", public_key: k, fingerprint: "" });
    vi.mocked(addSharedVaultMember).mockResolvedValue({ user_id: "amy" } as never);
    expect((await memberKeyStatus({ user_id: "amy", public_key: k })).status).toBe("new");
    await shareSpace("v1", generateSpaceKey(), "amy@x.io", "editor");
    expect((await memberKeyStatus({ user_id: "amy", public_key: k })).status).toBe("verified");
  });

  it("memberKeyStatus is unknown without a public key and ignores the server fingerprint", async () => {
    const r = await memberKeyStatus({ user_id: "z", fingerprint: "AAAA-BBBB" });
    expect(r.status).toBe("unknown");
    const k = keyB64();
    const real = await memberKeyStatus({ user_id: "z", public_key: k, fingerprint: "AAAA-BBBB" });
    expect(real.fingerprint).not.toBe("AAAA-BBBB");
  });

  it("rotateSpaceKey refuses a changed member key", async () => {
    await pinPeerKey("bob", keyB64());
    vi.mocked(getUserPublicKey).mockResolvedValue({
      user_id: "bob",
      public_key: keyB64(),
      fingerprint: "",
    });
    const v = vault();
    useSpacesStore.getState().setSpaceKey(v.id, generateSpaceKey());
    await expect(
      rotateSpaceKey(v, [{ user_id: "bob" } as never], []),
    ).rejects.toBeInstanceOf(KeyChangedError);
    expect(rotateSpace).not.toHaveBeenCalled();
  });

  it("OwnKeyMismatchError when the server's own public key was swapped", async () => {
    useKeysStore.getState().reset();
    const kp = x25519.keygen();
    const salt = generateSalt();
    const kek = await deriveKeyBytes("my passphrase", salt);
    vi.mocked(getMyKey).mockResolvedValue({
      user_id: "me",
      public_key: keyB64(),
      wrapped_private_key: toBase64(await wrapKey(kek, kp.secretKey)),
      kdf_salt: toBase64(salt),
      fingerprint: "",
      updated_at: "",
    } as never);
    await expect(ensureUserKeypair("my passphrase")).rejects.toBeInstanceOf(OwnKeyMismatchError);
    const s = useKeysStore.getState();
    expect(s.ready).toBe(false);
    expect(s.publicKey).toBeNull();
    expect(s.mismatch).toBe(true);
    expect(localFingerprint()).toBeNull();
  });
});

describe("space text sealing", () => {
  it("round-trips and tags sealed values", async () => {
    const key = generateSpaceKey();
    const sealed = await sealSpaceText(key, "Team plans");
    expect(sealed.startsWith("s1:")).toBe(true);
    expect(sealed).not.toContain("Team");
    expect(await openSpaceText(key, sealed)).toBe("Team plans");
  });

  it("passes legacy plaintext through and keeps empty empty", async () => {
    const key = generateSpaceKey();
    expect(await openSpaceText(key, "Old name")).toBe("Old name");
    expect(await sealSpaceText(key, "")).toBe("");
    expect(await openSpaceText(key, "")).toBe("");
  });

  it("createSpace seals name and description; rotateSpaceKey re-seals under the new key", async () => {
    vi.mocked(createSharedVault).mockImplementation(
      async (req) => ({ id: "v9", ...req }) as unknown as SharedVault,
    );
    const v = await createSpace("Secret", "desc");
    const oldKey = useSpacesStore.getState().spaceKeys["v9"];
    expect(await openSpaceText(oldKey, v.name)).toBe("Secret");
    expect(await openSpaceText(oldKey, v.description)).toBe("desc");

    vi.mocked(rotateSpace).mockResolvedValue({ success: true });
    await rotateSpaceKey(v, [], []);
    const meta = vi.mocked(rotateSpace).mock.calls[0][3]!;
    const newKey = useSpacesStore.getState().spaceKeys["v9"];
    expect(newKey).not.toEqual(oldKey);
    expect(await openSpaceText(newKey, meta.name)).toBe("Secret");
    expect(await openSpaceText(newKey, meta.description)).toBe("desc");
  });
});

describe("shareFilesIntoSpace", () => {
  const metaFor = (id: string) => ({ id, salt: toBase64(new Uint8Array(16)), wrapped_cek: "x", original_name: `${id}.txt` });

  async function setup(n: number) {
    const key = generateSpaceKey();
    useSpacesStore.getState().setSpaceKey("v1", key);
    const ids = Array.from({ length: n }, (_, i) => `f${i}`);
    vi.mocked(getFileMetas).mockResolvedValue(ids.map(metaFor) as never);
    return { key, ids };
  }

  it("prepares, wraps under the space key, seals names, and submits in chunks of 100", async () => {
    const { key, ids } = await setup(230);
    vi.mocked(addFilesToSpaceBatch).mockImplementation(
      async (_v, files) => ({ added: files.length, skipped: [], rejected: [] }),
    );
    const progress: [number, number][] = [];
    const res = await shareFilesIntoSpace(vault(), ids, { onProgress: (d, t) => progress.push([d, t]) });

    expect(res.added).toHaveLength(230);
    expect(res.failed).toEqual([]);
    const sizes = vi.mocked(addFilesToSpaceBatch).mock.calls.map((c) => c[1].length).sort((a, b) => a - b);
    expect(sizes).toEqual([30, 100, 100]);
    const first = vi.mocked(addFilesToSpaceBatch).mock.calls[0][1][0];
    const cek = await unwrapKey(toArrayBuffer(key), fromBase64(first.wrapped_cek));
    expect(cek).toHaveLength(32);
    const name = await unwrapKey(toArrayBuffer(key), fromBase64(first.wrapped_name));
    expect(new TextDecoder().decode(name)).toBe(`${first.file_id}.txt`);
    expect(progress[progress.length - 1]).toEqual([230, 230]);
    expect(progress.every(([d, t]) => d <= t && t === 230)).toBe(true);
  });

  it("honours a smaller plan limit", async () => {
    const { ids } = await setup(25);
    vi.mocked(getQuotaData).mockReturnValue({ max_space_batch_files: 10 } as never);
    vi.mocked(addFilesToSpaceBatch).mockImplementation(
      async (_v, files) => ({ added: files.length, skipped: [], rejected: [] }),
    );
    await shareFilesIntoSpace(vault(), ids);
    expect(vi.mocked(addFilesToSpaceBatch).mock.calls.map((c) => c[1].length).sort((a, b) => a - b)).toEqual([5, 10, 10]);
  });

  it("collects partial failures: unknown files, key errors, rejected and skipped", async () => {
    const { ids } = await setup(5);
    vi.mocked(getFileMetas).mockResolvedValue(ids.filter((i) => i !== "f4").map(metaFor) as never);
    vi.mocked(resolveFileKey).mockImplementationOnce(async () => {
      throw new Error("bad key");
    });
    vi.mocked(addFilesToSpaceBatch).mockImplementation(async (_v, files) => ({
      added: files.length - 2,
      skipped: [files[0].file_id],
      rejected: [{ file_id: files[1].file_id, reason: "not yours" }],
    }));
    const res = await shareFilesIntoSpace(vault(), ids);
    expect(res.skipped).toHaveLength(1);
    expect(res.added).toHaveLength(1);
    const reasons = res.failed.map((f) => f.error).sort();
    expect(reasons).toEqual(["File not found", "bad key", "not yours"].sort());
  });

  it("marks the whole chunk failed when the batch request fails", async () => {
    const { ids } = await setup(3);
    vi.mocked(addFilesToSpaceBatch).mockRejectedValue(new Error("403"));
    const res = await shareFilesIntoSpace(vault(), ids);
    expect(res.added).toEqual([]);
    expect(res.failed).toHaveLength(3);
    expect(res.failed[0].error).toBe("403");
  });

  it("stops preparing when aborted", async () => {
    const { ids } = await setup(10);
    const ctl = new AbortController();
    ctl.abort();
    const res = await shareFilesIntoSpace(vault(), ids, { signal: ctl.signal });
    expect(addFilesToSpaceBatch).not.toHaveBeenCalled();
    expect(res.added).toEqual([]);
  });

  it("requires an unlocked vault", async () => {
    await setup(1);
    usePassphraseStore.setState({ cachedPassphrase: null, persistent: false });
    await expect(shareFilesIntoSpace(vault(), ["f0"])).rejects.toThrow(/Unlock/);
  });

  it("warmSpaceKeys prefetches metas and derives keys without throwing", async () => {
    const { ids } = await setup(3);
    warmSpaceKeys(ids);
    await vi.waitFor(() => expect(resolveFileKey).toHaveBeenCalledTimes(3));
    vi.mocked(getFileMetas).mockRejectedValue(new Error("net"));
    expect(() => warmSpaceKeys(ids)).not.toThrow();
  });
});
