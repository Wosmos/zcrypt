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
  getSharedVault: vi.fn(),
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
  return { ...actual, resolveFileKey: vi.fn(async () => new Uint8Array(32).fill(9).buffer) };
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
  addFileToSpace,
  addFilesToSpaceBatch,
  addSharedVaultMember,
  getFileMeta,
  getFileMetas,
  getSharedVault,
  lookupUserKey,
  rotateSpace,
} from "@/lib/api";
import {
  inviteToSpace,
  isStaleSpaceKey,
  loadSpaceKeyEntry,
  rotateSpaceKey,
  shareFileIntoSpace,
  shareFilesIntoSpace,
} from "@/lib/spaces";
import { ApiError } from "@/lib/http-error";
import { generateSpaceKey, sealTo } from "@/lib/keys";
import { fromBase64, toBase64, unwrapKey } from "@/lib/crypto";
import { queryClient } from "@/lib/query-client";
import { useKeysStore } from "@/store/keys";
import { usePassphraseStore } from "@/store/passphrase";
import { useSpacesStore } from "@/store/spaces";
import type { SharedVault, SharedVaultDetail } from "@/types";

const me = x25519.keygen();
const stale = () => new ApiError("the space key changed", 409, 0, "", "stale_space_key");
const buf = (u8: Uint8Array) => u8.slice().buffer as ArrayBuffer;

async function grant(key: Uint8Array) {
  return sealTo(me.publicKey, key);
}

async function space(key: Uint8Array, gen: number): Promise<SharedVaultDetail> {
  return {
    id: "v",
    owner_id: "o",
    name: "",
    description: "",
    wrapped_space_key: await grant(key),
    key_generation: gen,
    members: [],
    files: [],
  } as unknown as SharedVaultDetail;
}

/** Opens a stored wrap with the key it should have been made under. */
async function opensWith(key: Uint8Array, wrapped: string) {
  return unwrapKey(buf(key), fromBase64(wrapped)).then(
    () => true,
    () => false,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  useSpacesStore.getState().reset();
  useKeysStore.setState({ privateKey: me.secretKey, publicKey: me.publicKey, ready: true });
  usePassphraseStore.getState().setPassphrase("pw");
});

describe("loadSpaceKeyEntry", () => {
  it("opens the caller's grant again once the Space shows a newer key generation", async () => {
    const oldKey = generateSpaceKey();
    const newKey = generateSpaceKey();
    useSpacesStore.getState().setSpaceKey("v", oldKey, 1);

    const same = await loadSpaceKeyEntry(await space(newKey, 1));
    expect(same?.key).toBe(oldKey);

    const next = await loadSpaceKeyEntry(await space(newKey, 2));
    expect(Array.from(next!.key)).toEqual(Array.from(newKey));
    expect(next!.gen).toBe(2);
    expect(useSpacesStore.getState().spaceKeyGens.v).toBe(2);
  });

  it("keeps a newer cached key when handed a Space fetched before the rotation", async () => {
    const newKey = generateSpaceKey();
    useSpacesStore.getState().setSpaceKey("v", newKey, 3);
    const entry = await loadSpaceKeyEntry(await space(generateSpaceKey(), 2));
    expect(entry).toEqual({ key: newKey, gen: 3 });
  });

  it("returns null without a grant", async () => {
    expect(await loadSpaceKeyEntry({ id: "v", key_generation: 1 } as SharedVault)).toBeNull();
  });
});

describe("isStaleSpaceKey", () => {
  it("matches only the stale-key conflict", () => {
    expect(isStaleSpaceKey(stale())).toBe(true);
    expect(isStaleSpaceKey(new ApiError("x", 409, 0, "", "key_rotating"))).toBe(false);
    expect(isStaleSpaceKey(new Error("stale_space_key"))).toBe(false);
  });
});

describe("writes after another device rotated the key", () => {
  it("shareFileIntoSpace reloads the Space and wraps again under the new key", async () => {
    const oldKey = generateSpaceKey();
    const newKey = generateSpaceKey();
    useSpacesStore.getState().setSpaceKey("v", oldKey, 1);
    vi.mocked(getFileMeta).mockResolvedValue({ salt: toBase64(new Uint8Array(16)), wrapped_cek: "" } as never);
    vi.mocked(getSharedVault).mockResolvedValue(await space(newKey, 2));
    vi.mocked(addFileToSpace).mockRejectedValueOnce(stale()).mockResolvedValueOnce({ success: true });

    await shareFileIntoSpace(await space(oldKey, 1), "f1", "a.txt");

    const [first, second] = vi.mocked(addFileToSpace).mock.calls;
    expect(first[4]).toBe(1);
    expect(second[4]).toBe(2);
    expect(await opensWith(newKey, second[2])).toBe(true);
    expect(await opensWith(oldKey, second[2])).toBe(false);
  });

  it("shareFileIntoSpace gives up after one reload", async () => {
    const key = generateSpaceKey();
    useSpacesStore.getState().setSpaceKey("v", key, 1);
    vi.mocked(getFileMeta).mockResolvedValue({ salt: toBase64(new Uint8Array(16)), wrapped_cek: "" } as never);
    vi.mocked(getSharedVault).mockResolvedValue(await space(key, 1));
    vi.mocked(addFileToSpace).mockRejectedValue(stale());

    await expect(shareFileIntoSpace(await space(key, 1), "f1")).rejects.toThrow("the space key changed");
    expect(addFileToSpace).toHaveBeenCalledTimes(2);
  });

  it("shareFilesIntoSpace re-sends a refused chunk under the new key", async () => {
    const oldKey = generateSpaceKey();
    const newKey = generateSpaceKey();
    useSpacesStore.getState().setSpaceKey("v", oldKey, 4);
    vi.mocked(getFileMetas).mockResolvedValue([
      { id: "f1", salt: toBase64(new Uint8Array(16)), wrapped_cek: "" },
    ] as never);
    vi.mocked(getSharedVault).mockResolvedValue(await space(newKey, 5));
    vi.mocked(addFilesToSpaceBatch)
      .mockRejectedValueOnce(stale())
      .mockResolvedValueOnce({ added: 1, skipped: [], rejected: [] });
    const progress = vi.fn();

    const out = await shareFilesIntoSpace(await space(oldKey, 4), ["f1"], { onProgress: progress });

    expect(out).toEqual({ added: ["f1"], skipped: [], failed: [] });
    const [first, second] = vi.mocked(addFilesToSpaceBatch).mock.calls;
    expect(first[2]).toBe(4);
    expect(second[2]).toBe(5);
    expect(await opensWith(newKey, second[1][0].wrapped_cek)).toBe(true);
    expect(progress).toHaveBeenLastCalledWith(1, 1);
  });

  it("shareFilesIntoSpace reports files refused twice as failed", async () => {
    const key = generateSpaceKey();
    useSpacesStore.getState().setSpaceKey("v", key, 1);
    vi.mocked(getFileMetas).mockResolvedValue([
      { id: "f1", salt: toBase64(new Uint8Array(16)), wrapped_cek: "" },
    ] as never);
    vi.mocked(getSharedVault).mockResolvedValue(await space(key, 1));
    vi.mocked(addFilesToSpaceBatch).mockRejectedValue(stale());

    const out = await shareFilesIntoSpace(await space(key, 1), ["f1"]);
    expect(out.added).toEqual([]);
    expect(out.failed.map((f) => f.fileId)).toEqual(["f1"]);
  });

  it("shareFilesIntoSpace stops when the Space reloads without a grant", async () => {
    const key = generateSpaceKey();
    useSpacesStore.getState().setSpaceKey("v", key, 1);
    vi.mocked(getFileMetas).mockResolvedValue([
      { id: "f1", salt: toBase64(new Uint8Array(16)), wrapped_cek: "" },
    ] as never);
    vi.mocked(getSharedVault).mockResolvedValue({ id: "v", key_generation: 2 } as never);
    vi.mocked(addFilesToSpaceBatch).mockRejectedValue(stale());

    await expect(shareFilesIntoSpace(await space(key, 1), ["f1"])).rejects.toThrow();
  });

  it("inviteToSpace seals the new key to the invitee after a reload", async () => {
    const oldKey = generateSpaceKey();
    const newKey = generateSpaceKey();
    const bob = x25519.keygen();
    useSpacesStore.getState().setSpaceKey("v", oldKey, 1);
    vi.mocked(lookupUserKey).mockResolvedValue({ user_id: "bob", public_key: toBase64(bob.publicKey) } as never);
    vi.mocked(getSharedVault).mockResolvedValue(await space(newKey, 2));
    vi.mocked(addSharedVaultMember)
      .mockRejectedValueOnce(stale())
      .mockResolvedValueOnce({ user_id: "bob" } as never);

    await inviteToSpace(await space(oldKey, 1), "bob@x.io", "viewer" as never);

    const second = vi.mocked(addSharedVaultMember).mock.calls[1];
    expect(second[4]).toBe(2);
    const { openSealed } = await import("@/lib/keys");
    useKeysStore.setState({ privateKey: bob.secretKey, publicKey: bob.publicKey });
    expect(Array.from(await openSealed(second[3]!))).toEqual(Array.from(newKey));
  });

  it("passes other errors straight through without reloading", async () => {
    const key = generateSpaceKey();
    useSpacesStore.getState().setSpaceKey("v", key, 1);
    vi.mocked(getFileMeta).mockResolvedValue({ salt: toBase64(new Uint8Array(16)), wrapped_cek: "" } as never);
    vi.mocked(addFileToSpace).mockRejectedValue(new ApiError("full", 413));
    await expect(shareFileIntoSpace(await space(key, 1), "f1")).rejects.toThrow("full");
    expect(getSharedVault).not.toHaveBeenCalled();
  });

  it("inviteToSpace refuses a Space with no grant for the caller", async () => {
    await expect(
      inviteToSpace({ id: "v", key_generation: 1 } as SharedVault, "bob@x.io", "viewer" as never),
    ).rejects.toThrow();
    expect(addSharedVaultMember).not.toHaveBeenCalled();
  });

  it("inviteToSpace refuses when the reloaded Space carries no grant", async () => {
    useSpacesStore.getState().setSpaceKey("v", generateSpaceKey(), 1);
    vi.mocked(lookupUserKey).mockResolvedValue({ user_id: "bob", public_key: toBase64(x25519.keygen().publicKey) } as never);
    vi.mocked(getSharedVault).mockResolvedValue({ id: "v", key_generation: 2 } as never);
    vi.mocked(addSharedVaultMember).mockRejectedValue(stale());
    await expect(
      inviteToSpace(await space(generateSpaceKey(), 1), "bob@x.io", "viewer" as never),
    ).rejects.toThrow();
  });
});

describe("rotateSpaceKey", () => {
  it("names the generation it rotated from and caches the new key one past it", async () => {
    const oldKey = generateSpaceKey();
    const d = await space(oldKey, 7);
    vi.mocked(rotateSpace).mockResolvedValue({ success: true });

    await rotateSpaceKey(d, [], []);

    expect(vi.mocked(rotateSpace).mock.calls[0][4]).toBe(7);
    expect(useSpacesStore.getState().spaceKeyGens.v).toBe(8);
    expect(useSpacesStore.getState().spaceKeys.v).not.toEqual(oldKey);
  });

  it("leaves the generation unknown when the server never sent one", async () => {
    const d = { ...(await space(generateSpaceKey(), 0)), key_generation: undefined };
    vi.mocked(rotateSpace).mockResolvedValue({ success: true });
    await rotateSpaceKey(d, [], []);
    expect(useSpacesStore.getState().spaceKeyGens.v).toBe(0);
  });
});
