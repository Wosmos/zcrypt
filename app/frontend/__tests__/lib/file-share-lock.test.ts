import { describe, it, expect, beforeEach, vi } from "vitest";

const store = vi.hoisted(() => ({
  listeners: [] as Array<(s: { cachedPassphrase: string | null }) => void>,
  passphrase: "pw" as string | null,
}));

const mockResolved = vi.hoisted(() => ({ value: "pw" }));
vi.mock("@/store/passphrase", () => ({
  usePassphraseStore: {
    getState: () => ({ getPassphrase: () => store.passphrase }),
    subscribe: vi.fn((l: (s: { cachedPassphrase: string | null }) => void) => {
      store.listeners.push(l);
      return () => {};
    }),
  },
}));
vi.mock("@/lib/api", () => ({ getFileMeta: vi.fn(), createShare: vi.fn() }));
vi.mock("@/lib/crypto", () => ({
  resolveFileKey: vi.fn(async () => new Uint8Array([1]).buffer),
  generateCEK: vi.fn(),
  wrapKey: vi.fn(),
  fromBase64: vi.fn(() => new Uint8Array([1])),
  toBase64: vi.fn(),
  toArrayBuffer: vi.fn(),
}));
vi.mock("@/lib/name-crypto", () => ({ decryptName: vi.fn() }));
vi.mock("@/lib/sealed", () => ({ sealText: vi.fn(), keyFromBytes: vi.fn(), userNameKey: vi.fn() }));
vi.mock("@/hooks/useFolderProtection", () => ({
  resolveFilePasswordGlobal: vi.fn(async () => mockResolved.value),
}));
vi.mock("@/hooks/useShares", () => ({ invalidateShares: vi.fn() }));

import { getFileMeta } from "@/lib/api";
import { clearFileShareCache, warmFileShareKey } from "@/lib/file-share";

const meta = vi.mocked(getFileMeta);

describe("file share key cache and the vault lock", () => {
  beforeEach(() => {
    clearFileShareCache();
    meta.mockReset();
    meta.mockResolvedValue({ salt: "c2FsdA==", wrapped_cek: "d3I=" } as never);
  });

  const tick = () => new Promise((r) => setTimeout(r, 0));

  it("subscribes once and drops warmed keys when the vault locks", async () => {
    warmFileShareKey("f1");
    warmFileShareKey("f2");
    await vi.waitFor(() => expect(meta).toHaveBeenCalledTimes(2));
    expect(store.listeners).toHaveLength(1);

    warmFileShareKey("f1");
    await tick();
    expect(meta).toHaveBeenCalledTimes(2);

    store.listeners[0]({ cachedPassphrase: "pw" });
    warmFileShareKey("f1");
    await tick();
    expect(meta).toHaveBeenCalledTimes(2);

    store.listeners[0]({ cachedPassphrase: null });
    warmFileShareKey("f1");
    await tick();
    expect(meta).toHaveBeenCalledTimes(3);
  });

  it("keeps a newer warm-up when an older, replaced one fails late", async () => {
    let fail!: (e: Error) => void;
    meta.mockReturnValueOnce(new Promise((_, rej) => (fail = rej)) as never);
    warmFileShareKey("f1");
    await tick();
    clearFileShareCache();
    warmFileShareKey("f1");
    await vi.waitFor(() => expect(meta).toHaveBeenCalledTimes(2));
    fail(new Error("late"));
    await tick();
    warmFileShareKey("f1");
    await tick();
    expect(meta).toHaveBeenCalledTimes(2);
  });
});
