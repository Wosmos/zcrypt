import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const api = vi.hoisted(() => ({
  getMyKey: vi.fn(),
  getFileMetas: vi.fn(),
  rekeyFile: vi.fn(),
}));
vi.mock("@/lib/api", () => api);

const filesStore = vi.hoisted(() => ({ ensureFiles: vi.fn() }));
vi.mock("@/store/files", () => filesStore);

import {
  clearDerivedKeyCache,
  deriveKeyBytes,
  fromBase64,
  generateCEK,
  generateSalt,
  resolveFileKey,
  toBase64,
  wrapKey,
} from "@/lib/crypto";
import { runMk1Migration, scheduleMk1Migration } from "@/lib/mk1-migrate";
import { unwrapCekWithMasterKey, wrapCekWithMasterKey } from "@/lib/master-key";
import { useKeysStore } from "@/store/keys";
import { usePassphraseStore } from "@/store/passphrase";
import { useFolderRegistry } from "@/store/folder-registry";

const PASS = "vault passphrase";

interface Fx {
  id: string;
  folder_id: string | null;
  salt: string;
  wrapped_cek: string;
  cek: Uint8Array;
}

async function legacyFile(id: string, folder_id: string | null = null): Promise<Fx> {
  const salt = generateSalt();
  const cek = generateCEK();
  const kek = await deriveKeyBytes(PASS, salt);
  return { id, folder_id, salt: toBase64(salt), wrapped_cek: toBase64(await wrapKey(kek, cek)), cek };
}

let mk: Uint8Array;
let metas: Fx[];

function bind(files: Fx[]) {
  metas = files;
  filesStore.ensureFiles.mockResolvedValue(
    files.map((f) => ({ id: f.id, folder_id: f.folder_id, deleted_at: null })),
  );
  api.getFileMetas.mockImplementation(async (ids: string[]) =>
    metas
      .filter((m) => ids.includes(m.id))
      .map((m) => ({ id: m.id, salt: m.salt, wrapped_cek: m.wrapped_cek })),
  );
  api.rekeyFile.mockImplementation(
    async (id: string, body: { salt: string; wrapped_cek: string }) => {
      const m = metas.find((x) => x.id === id)!;
      m.wrapped_cek = body.wrapped_cek;
      return { success: true };
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  clearDerivedKeyCache();
  useFolderRegistry.setState({ byId: {} });
  mk = crypto.getRandomValues(new Uint8Array(32));
  useKeysStore.setState({ masterKey: mk, masterKeyWrites: true });
  usePassphraseStore.setState({ cachedPassphrase: PASS, cacheUntil: null, persistent: true });
});

describe("runMk1Migration", () => {
  it("rewraps legacy vault files under MK, verified, keeping the same salt and CEK", async () => {
    const a = await legacyFile("a");
    const b = await legacyFile("b");
    const originalSalt = a.salt;
    bind([a, b]);

    const res = await runMk1Migration();

    expect(res).toEqual({ migrated: 2, skipped: 0, stopped: false });
    expect(api.rekeyFile).toHaveBeenCalledTimes(2);
    expect(a.salt).toBe(originalSalt);
    for (const f of [a, b]) {
      expect(f.wrapped_cek.startsWith("mk1:")).toBe(true);
      expect(await unwrapCekWithMasterKey(mk, f.wrapped_cek)).toEqual(f.cek);
      expect(new Uint8Array(await resolveFileKey(PASS, fromBase64(f.salt), f.wrapped_cek))).toEqual(
        f.cek,
      );
    }
    for (const call of api.rekeyFile.mock.calls) {
      expect(call[1].salt).toBe(metas.find((m) => m.id === call[0])!.salt);
    }
  });

  it("is idempotent: a second pass touches nothing", async () => {
    const a = await legacyFile("a");
    bind([a]);
    await runMk1Migration();
    api.rekeyFile.mockClear();

    const res = await runMk1Migration();
    expect(res.migrated).toBe(0);
    expect(api.rekeyFile).not.toHaveBeenCalled();
  });

  it("skips files already on mk1 without re-sending them", async () => {
    const done = await legacyFile("done");
    done.wrapped_cek = await wrapCekWithMasterKey(mk, done.cek);
    const todo = await legacyFile("todo");
    bind([done, todo]);

    const res = await runMk1Migration();
    expect(res.migrated).toBe(1);
    expect(api.rekeyFile.mock.calls.map((c) => c[0])).toEqual(["todo"]);
  });

  it("never touches files in protected or unknown folders", async () => {
    useFolderRegistry.setState({
      byId: { prot: { pwSalt: "s", pwVerifier: "v" }, open: { pwSalt: null, pwVerifier: null } },
    });
    const prot = await legacyFile("prot-file", "prot");
    const unknown = await legacyFile("unknown-file", "unknown");
    const open = await legacyFile("open-file", "open");
    const root = await legacyFile("root-file");
    bind([prot, unknown, open, root]);

    await runMk1Migration();

    expect(api.rekeyFile.mock.calls.map((c) => c[0]).sort()).toEqual(["open-file", "root-file"]);
    expect(prot.wrapped_cek.startsWith("mk1:")).toBe(false);
    expect(unknown.wrapped_cek.startsWith("mk1:")).toBe(false);
  });

  it("logs and skips a file it cannot resolve, and keeps going", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = await legacyFile("bad");
    const raw = fromBase64(bad.wrapped_cek);
    raw[raw.length - 1] ^= 1;
    bad.wrapped_cek = toBase64(raw);
    const bad2 = bad.wrapped_cek;
    const good = await legacyFile("good");
    bind([bad, good]);

    const res = await runMk1Migration();

    expect(res.migrated).toBe(1);
    expect(res.skipped).toBe(1);
    expect(bad.wrapped_cek).toBe(bad2);
    expect(api.rekeyFile.mock.calls.map((c) => c[0])).toEqual(["good"]);
    warn.mockRestore();
  });

  it("does nothing while the server switch is off", async () => {
    useKeysStore.setState({ masterKeyWrites: false });
    bind([await legacyFile("a")]);
    const res = await runMk1Migration();
    expect(res.stopped).toBe(true);
    expect(api.rekeyFile).not.toHaveBeenCalled();
  });

  it("stops when the vault locks mid-run and sends nothing more", async () => {
    const files = [await legacyFile("a"), await legacyFile("b"), await legacyFile("c")];
    bind(files);
    api.rekeyFile.mockImplementation(async (id: string, body: { wrapped_cek: string }) => {
      metas.find((x) => x.id === id)!.wrapped_cek = body.wrapped_cek;
      usePassphraseStore.setState({ cachedPassphrase: null });
      return { success: true };
    });

    const res = await runMk1Migration();

    expect(res.stopped).toBe(true);
    expect(api.rekeyFile.mock.calls.length).toBeLessThan(files.length);
  });

  it("stops when cancelled by the caller", async () => {
    bind([await legacyFile("a")]);
    const res = await runMk1Migration(() => true);
    expect(res.stopped).toBe(true);
    expect(api.rekeyFile).not.toHaveBeenCalled();
  });

  it("pauses while the tab is hidden and resumes when it is visible again", async () => {
    bind([await legacyFile("a")]);
    let state: "hidden" | "visible" = "hidden";
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });

    const run = runMk1Migration();
    await new Promise((r) => setTimeout(r, 20));
    expect(api.rekeyFile).not.toHaveBeenCalled();

    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((r) => setTimeout(r, 20));
    expect(api.rekeyFile).not.toHaveBeenCalled();

    state = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    const res = await run;
    expect(res.migrated).toBe(1);
  });

  it("never sends an unverified value: a failed verification skips the file", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const a = await legacyFile("a");
    bind([a]);
    const spy = vi.spyOn(crypto.subtle, "decrypt");
    spy.mockResolvedValueOnce(new ArrayBuffer(32)).mockResolvedValueOnce(new Uint8Array(32).fill(1).buffer);
    const res = await runMk1Migration();
    spy.mockRestore();
    expect(res.migrated).toBe(0);
    expect(api.rekeyFile).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("runMk1Migration edge cases", () => {
  it("does nothing while the vault is locked", async () => {
    usePassphraseStore.setState({ cachedPassphrase: null });
    bind([await legacyFile("a")]);
    expect(await runMk1Migration()).toEqual({ migrated: 0, skipped: 0, stopped: false });
    expect(filesStore.ensureFiles).not.toHaveBeenCalled();
  });

  it("leaves trashed files alone", async () => {
    const live = await legacyFile("live");
    const trashed = await legacyFile("trashed");
    bind([live, trashed]);
    filesStore.ensureFiles.mockResolvedValue([
      { id: "live", folder_id: null, deleted_at: null },
      { id: "trashed", folder_id: null, deleted_at: "2026-01-01" },
    ]);
    const res = await runMk1Migration();
    expect(res.migrated).toBe(1);
    expect(api.rekeyFile.mock.calls.map((c) => c[0])).toEqual(["live"]);
  });

  it("stops before touching files when the switch flips while loading the master key", async () => {
    bind([await legacyFile("a")]);
    useKeysStore.setState({ masterKey: null });
    api.getMyKey.mockImplementation(async () => {
      useKeysStore.setState({ masterKeyWrites: false });
      throw new Error("offline");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await runMk1Migration();
    expect(res).toEqual({ migrated: 0, skipped: 0, stopped: true });
    expect(warn).toHaveBeenCalledWith("mk1 migration: stopped", expect.any(Error));
    warn.mockRestore();
  });

  it("stops after loading the master key if the vault locked meanwhile", async () => {
    bind([await legacyFile("a")]);
    useKeysStore.setState({ masterKey: null });
    api.getMyKey.mockImplementation(async () => {
      usePassphraseStore.setState({ cachedPassphrase: null });
      throw new Error("offline");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await runMk1Migration()).stopped).toBe(true);
    warn.mockRestore();
  });

  it("does not migrate a file whose folder became protected after the scan", async () => {
    useFolderRegistry.setState({ byId: { f: { pwSalt: null, pwVerifier: null } } });
    const inFolder = await legacyFile("in-folder", "f");
    const root = await legacyFile("root");
    bind([inFolder, root]);
    const original = api.getFileMetas.getMockImplementation()!;
    api.getFileMetas.mockImplementation(async (ids: string[]) => {
      useFolderRegistry.setState({ byId: { f: { pwSalt: "s", pwVerifier: "v" } } });
      return original(ids);
    });
    const res = await runMk1Migration();
    expect(res).toEqual({ migrated: 1, skipped: 1, stopped: false });
    expect(api.rekeyFile.mock.calls.map((c) => c[0])).toEqual(["root"]);
  });

  it("stops handing out work once the vault locks and reports it", async () => {
    const files = await Promise.all(["a", "b", "c", "d", "e", "f"].map((id) => legacyFile(id)));
    bind(files);
    api.rekeyFile.mockImplementation(async (id: string, body: { wrapped_cek: string }) => {
      metas.find((x) => x.id === id)!.wrapped_cek = body.wrapped_cek;
      usePassphraseStore.setState({ cachedPassphrase: null });
      return { success: true };
    });
    const res = await runMk1Migration();
    expect(res.stopped).toBe(true);
    expect(res.migrated).toBeLessThan(files.length);
  });

  it("stops without sending when the vault locks while a file is being wrapped", async () => {
    const a = await legacyFile("a");
    bind([a]);
    const original = api.getFileMetas.getMockImplementation()!;
    api.getFileMetas.mockImplementation(async (ids: string[]) => {
      const out = await original(ids);
      setTimeout(() => usePassphraseStore.setState({ cachedPassphrase: null }), 0);
      return out;
    });
    const res = await runMk1Migration();
    expect(res.stopped).toBe(true);
    expect(api.rekeyFile).not.toHaveBeenCalled();
  });

  it("a newer pass supersedes an older one", async () => {
    const files = await Promise.all(["a", "b", "c", "d"].map((id) => legacyFile(id)));
    bind(files);
    const first = runMk1Migration();
    const second = runMk1Migration();
    const [r1, r2] = await Promise.all([first, second]);
    expect(r1.stopped).toBe(true);
    expect(r2.stopped).toBe(false);
    expect(r1.migrated + r2.migrated).toBeGreaterThanOrEqual(1);
  });

  it("works through more files than one page", async () => {
    const done = await Promise.all(
      Array.from({ length: 200 }, async (_, i) => {
        const cek = generateCEK();
        return {
          id: `m${i}`,
          folder_id: null,
          salt: toBase64(generateSalt()),
          wrapped_cek: await wrapCekWithMasterKey(mk, cek),
          cek,
        } as Fx;
      }),
    );
    const last = await legacyFile("last");
    bind([...done, last]);
    const res = await runMk1Migration();
    expect(res).toEqual({ migrated: 1, skipped: 0, stopped: false });
    expect(api.getFileMetas).toHaveBeenCalledTimes(2);
    expect(api.rekeyFile.mock.calls.map((c) => c[0])).toEqual(["last"]);
  });
});

describe("scheduleMk1Migration", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("runs a pass when the browser goes idle and can be cancelled", async () => {
    const callbacks: Array<() => void> = [];
    const cancel = vi.fn();
    vi.stubGlobal("requestIdleCallback", (cb: () => void) => {
      callbacks.push(cb);
      return callbacks.length;
    });
    vi.stubGlobal("cancelIdleCallback", cancel);
    bind([await legacyFile("a")]);

    scheduleMk1Migration();
    callbacks[0]();
    await vi.waitFor(() => expect(api.rekeyFile).toHaveBeenCalledTimes(1));

    api.rekeyFile.mockClear();
    const stop = scheduleMk1Migration();
    stop();
    expect(cancel).toHaveBeenCalledWith(2);
    callbacks[1]();
    await new Promise((r) => setTimeout(r, 10));
    expect(api.rekeyFile).not.toHaveBeenCalled();
  });

  it("falls back to a timer without requestIdleCallback", async () => {
    vi.useFakeTimers();
    // @ts-expect-error: simulate a browser without requestIdleCallback
    delete window.requestIdleCallback;
    bind([await legacyFile("a")]);

    const stop = scheduleMk1Migration();
    stop();
    vi.advanceTimersByTime(3_000);
    expect(filesStore.ensureFiles).not.toHaveBeenCalled();

    scheduleMk1Migration();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(filesStore.ensureFiles).toHaveBeenCalledTimes(1);
  });
});
