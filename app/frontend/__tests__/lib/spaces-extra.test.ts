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
vi.mock("@/lib/name-crypto", () => ({ decryptName: vi.fn() }));
vi.mock("@/store/quota", () => ({ getQuotaData: vi.fn(() => null) }));
vi.mock("@/lib/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crypto")>();
  return {
    ...actual,
    resolveFileKey: vi.fn(async () => crypto.getRandomValues(new Uint8Array(32)).buffer),
  };
});
const pins = vi.hoisted(() => ({ override: null as null | (() => unknown) }));
vi.mock("@/lib/key-pins", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/key-pins")>();
  return {
    ...actual,
    checkPeerKey: (...args: Parameters<typeof actual.checkPeerKey>) =>
      pins.override ? Promise.resolve(pins.override()) : actual.checkPeerKey(...args),
  };
});
vi.mock("idb-keyval", () => ({
  get: vi.fn(async () => undefined),
  set: vi.fn(async () => {}),
  del: vi.fn(),
}));

import {
  addFilesToSpaceBatch,
  getFileMetas,
  lookupUserKey,
  updateSharedVault,
} from "@/lib/api";
import { decryptName } from "@/lib/name-crypto";
import { userNameKey } from "@/lib/sealed";
import { KeyChangedError } from "@/lib/key-pins";
import { generateSpaceKey } from "@/lib/keys";
import { fromBase64, toArrayBuffer, toBase64, unwrapKey } from "@/lib/crypto";
import {
  memberKeyStatus,
  openSpaceText,
  shareFilesIntoSpace,
  shareSpace,
  updateSpaceDetails,
  warmSpaceKeys,
} from "@/lib/spaces";
import { useAuthStore } from "@/store/auth";
import { useKeysStore } from "@/store/keys";
import { usePassphraseStore } from "@/store/passphrase";
import { useSpacesStore } from "@/store/spaces";
import type { SharedVault } from "@/types";

const vault = (over: Partial<SharedVault> = {}) =>
  ({ id: "v1", name: "n", description: "", ...over }) as unknown as SharedVault;
const metaFor = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  salt: toBase64(new Uint8Array(16)),
  wrapped_cek: "x",
  original_name: `${id}.txt`,
  ...over,
});
const batches = () => vi.mocked(addFilesToSpaceBatch).mock.calls.map((c) => c[1]);

beforeEach(() => {
  vi.clearAllMocks();
  pins.override = null;
  useAuthStore.setState({ user: { id: "me" } as never });
  useKeysStore.getState().reset();
  useSpacesStore.getState().reset();
  usePassphraseStore.setState({ cachedPassphrase: "pp", cacheUntil: null, persistent: true });
  const me = x25519.keygen();
  useKeysStore.setState({ privateKey: me.secretKey, publicKey: me.publicKey, ready: true });
  vi.mocked(userNameKey).mockResolvedValue(null);
});

describe("updateSpaceDetails", () => {
  it("seals the new name and description under the space key", async () => {
    const key = generateSpaceKey();
    useSpacesStore.getState().setSpaceKey("v1", key);
    await updateSpaceDetails(vault(), { name: "Team", description: "Docs", size_limit_bytes: 5 });
    const [id, sent] = vi.mocked(updateSharedVault).mock.calls[0];
    expect(id).toBe("v1");
    expect(sent.name?.startsWith("s1:")).toBe(true);
    expect(await openSpaceText(key, sent.name as string)).toBe("Team");
    expect(await openSpaceText(key, sent.description as string)).toBe("Docs");
    expect(sent.size_limit_bytes).toBe(5);
  });

  it("only touches the fields it was given", async () => {
    const key = generateSpaceKey();
    useSpacesStore.getState().setSpaceKey("v1", key);
    await updateSpaceDetails(vault(), { description: "Only this" });
    const sent = vi.mocked(updateSharedVault).mock.calls[0][1];
    expect("name" in sent).toBe(false);
    expect(await openSpaceText(key, sent.description as string)).toBe("Only this");
    await updateSpaceDetails(vault(), { name: "Only name" });
    const second = vi.mocked(updateSharedVault).mock.calls[1][1];
    expect("description" in second).toBe(false);
  });

  it("sends plain text for a legacy vault with no key for us", async () => {
    await updateSpaceDetails(vault(), { name: "Plain", description: "Text" });
    expect(vi.mocked(updateSharedVault).mock.calls[0][1]).toEqual({
      name: "Plain",
      description: "Text",
    });
  });
});

describe("peer key edge cases", () => {
  it("reports an empty fingerprint for an unknown member without one", async () => {
    expect(await memberKeyStatus({ user_id: "z" })).toEqual({ fingerprint: "", status: "unknown" });
  });

  it("raises KeyChangedError with an empty previous fingerprint when none is reported", async () => {
    pins.override = () => ({ fingerprint: "NEW", status: "changed" });
    vi.mocked(lookupUserKey).mockResolvedValue({
      user_id: "bob",
      public_key: toBase64(x25519.keygen().publicKey),
      fingerprint: "",
    });
    const err = await shareSpace("v1", generateSpaceKey(), "bob@x.io", "viewer").catch((e) => e);
    expect(err).toBeInstanceOf(KeyChangedError);
    expect((err as KeyChangedError).previous).toBe("");
    expect((err as KeyChangedError).fingerprint).toBe("NEW");
  });
});

describe("shareFilesIntoSpace edge cases", () => {
  beforeEach(() => {
    useSpacesStore.getState().setSpaceKey("v1", generateSpaceKey());
  });

  it("refuses when the space key is not available", async () => {
    useSpacesStore.getState().reset();
    await expect(shareFilesIntoSpace(vault(), ["a"])).rejects.toThrow(/key/i);
    expect(getFileMetas).not.toHaveBeenCalled();
  });

  it("treats a batch response without skipped or rejected lists as all added", async () => {
    vi.mocked(getFileMetas).mockResolvedValue([metaFor("a"), metaFor("b")] as never);
    vi.mocked(addFilesToSpaceBatch).mockResolvedValue({ added: 2 } as never);
    const onChunk = vi.fn();
    const res = await shareFilesIntoSpace(vault(), ["a", "b", "a"], { onChunk });
    expect(res).toEqual({ added: expect.arrayContaining(["a", "b"]), skipped: [], failed: [] });
    expect(res.added).toHaveLength(2);
    expect(onChunk).toHaveBeenCalledTimes(1);
  });

  it("falls back to a generic message when the batch fails with a non-Error", async () => {
    vi.mocked(getFileMetas).mockResolvedValue([metaFor("a")] as never);
    vi.mocked(addFilesToSpaceBatch).mockRejectedValue("nope");
    const res = await shareFilesIntoSpace(vault(), ["a"]);
    expect(res.failed).toHaveLength(1);
    expect(res.failed[0].fileId).toBe("a");
    expect(res.failed[0].error).not.toBe("nope");
    expect(res.failed[0].error.length).toBeGreaterThan(0);
  });

  it("falls back to a generic message when preparing a file fails with a non-Error", async () => {
    const { resolveFileKey } = await import("@/lib/crypto");
    vi.mocked(resolveFileKey).mockRejectedValueOnce("bad");
    vi.mocked(getFileMetas).mockResolvedValue([metaFor("a")] as never);
    const res = await shareFilesIntoSpace(vault(), ["a"]);
    expect(res.failed).toHaveLength(1);
    expect(res.failed[0].error).not.toBe("bad");
    expect(addFilesToSpaceBatch).not.toHaveBeenCalled();
  });

  it("seals the decrypted file name when the user's name key is available", async () => {
    const nameKey = {} as CryptoKey;
    vi.mocked(userNameKey).mockResolvedValue(nameKey);
    vi.mocked(decryptName).mockResolvedValue("Real name.pdf");
    vi.mocked(getFileMetas).mockResolvedValue([metaFor("a", { encrypted_name: "enc" })] as never);
    vi.mocked(addFilesToSpaceBatch).mockResolvedValue({ added: 1, skipped: [], rejected: [] });
    const key = useSpacesStore.getState().spaceKeys.v1;
    await shareFilesIntoSpace(vault(), ["a"]);
    expect(decryptName).toHaveBeenCalledWith("enc", nameKey);
    const sealed = batches()[0][0].wrapped_name;
    const name = await unwrapKey(toArrayBuffer(key), fromBase64(sealed));
    expect(new TextDecoder().decode(name)).toBe("Real name.pdf");
  });

  it("falls back to the legacy name when decrypting fails or yields nothing", async () => {
    vi.mocked(userNameKey).mockResolvedValue({} as CryptoKey);
    vi.mocked(decryptName).mockRejectedValueOnce(new Error("bad")).mockResolvedValueOnce("");
    vi.mocked(getFileMetas).mockResolvedValue([
      metaFor("a", { encrypted_name: "enc" }),
      metaFor("b", { encrypted_name: "enc" }),
    ] as never);
    vi.mocked(addFilesToSpaceBatch).mockResolvedValue({ added: 2, skipped: [], rejected: [] });
    const key = useSpacesStore.getState().spaceKeys.v1;
    await shareFilesIntoSpace(vault(), ["a", "b"]);
    for (const f of batches()[0]) {
      const name = await unwrapKey(toArrayBuffer(key), fromBase64(f.wrapped_name));
      expect(new TextDecoder().decode(name)).toBe(`${f.file_id}.txt`);
    }
  });

  it("seals an empty name for a file that has none at all", async () => {
    vi.mocked(getFileMetas).mockResolvedValue([metaFor("a", { original_name: "" })] as never);
    vi.mocked(addFilesToSpaceBatch).mockResolvedValue({ added: 1, skipped: [], rejected: [] });
    await shareFilesIntoSpace(vault(), ["a"]);
    expect(batches()[0][0].wrapped_name).toBe("");
  });

  it("goes on without a name key when it cannot be loaded", async () => {
    vi.mocked(userNameKey).mockRejectedValue(new Error("locked"));
    vi.mocked(getFileMetas).mockResolvedValue([metaFor("a", { encrypted_name: "enc" })] as never);
    vi.mocked(addFilesToSpaceBatch).mockResolvedValue({ added: 1, skipped: [], rejected: [] });
    const res = await shareFilesIntoSpace(vault(), ["a"]);
    expect(res.added).toEqual(["a"]);
    expect(decryptName).not.toHaveBeenCalled();
  });
});

describe("warmSpaceKeys edge cases", () => {
  it("does nothing while locked or with nothing to warm", () => {
    usePassphraseStore.setState({ cachedPassphrase: null, persistent: false });
    warmSpaceKeys(["a"]);
    usePassphraseStore.setState({ cachedPassphrase: "pp", cacheUntil: null, persistent: true });
    warmSpaceKeys([]);
    expect(getFileMetas).not.toHaveBeenCalled();
  });

  it("keeps going when one file's key cannot be derived", async () => {
    const { resolveFileKey } = await import("@/lib/crypto");
    vi.mocked(resolveFileKey).mockClear();
    vi.mocked(resolveFileKey).mockRejectedValueOnce(new Error("bad"));
    vi.mocked(getFileMetas).mockResolvedValue([metaFor("a"), metaFor("b")] as never);
    warmSpaceKeys(["a", "b"]);
    await vi.waitFor(() => expect(resolveFileKey).toHaveBeenCalledTimes(2));
  });
});
