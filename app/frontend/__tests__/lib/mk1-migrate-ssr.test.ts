// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

const api = vi.hoisted(() => ({
  getFileMetas: vi.fn(async () => [{ id: "a", salt: "c2FsdA==", wrapped_cek: "legacy" }]),
  rekeyFile: vi.fn(async () => ({ success: true })),
}));
vi.mock("@/lib/api", () => api);
vi.mock("@/store/files", () => ({
  ensureFiles: vi.fn(async () => [{ id: "a", folder_id: null, deleted_at: null }]),
}));
vi.mock("@/lib/crypto", () => ({
  fromBase64: () => new Uint8Array(1),
  resolveFileKey: async () => new Uint8Array(32).buffer,
}));
vi.mock("@/lib/master-key", () => ({
  ensureMasterKey: async () => new Uint8Array(32),
  isMk1: (v: string) => v.startsWith("mk1:"),
  wrapCekWithMasterKey: async () => "mk1:wrapped",
  unwrapCekWithMasterKey: async () => new Uint8Array(32),
}));

import { runMk1Migration } from "@/lib/mk1-migrate";
import { useKeysStore } from "@/store/keys";
import { usePassphraseStore } from "@/store/passphrase";

describe("runMk1Migration without a document", () => {
  it("does not wait for tab visibility", async () => {
    useKeysStore.setState({ masterKey: new Uint8Array(32), masterKeyWrites: true });
    usePassphraseStore.setState({ cachedPassphrase: "pw", cacheUntil: null, persistent: true });
    const res = await runMk1Migration();
    expect(res).toEqual({ migrated: 1, skipped: 0, stopped: false });
    expect(api.rekeyFile).toHaveBeenCalledWith("a", { salt: "c2FsdA==", wrapped_cek: "mk1:wrapped" });
  });
});
