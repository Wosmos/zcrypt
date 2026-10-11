import { describe, it, expect, beforeEach, vi } from "vitest";

const idb = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
vi.mock("idb-keyval", () => ({
  get: vi.fn(async (k: string) => idb.store.get(k)),
  set: vi.fn(async (k: string, v: unknown) => {
    idb.store.set(k, v);
  }),
  del: vi.fn(async (k: string) => {
    idb.store.delete(k);
  }),
}));
vi.mock("@/lib/api", () => ({ getSharedVault: vi.fn(), getMyKey: vi.fn(), publishKey: vi.fn() }));
vi.mock("@/lib/spaces", () => ({ shareFilesIntoSpace: vi.fn() }));
vi.mock("@/lib/keys", () => ({ ensureUserKeypair: vi.fn(async () => {}) }));
vi.mock("@/lib/query-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/query-client")>();
  return { ...actual, queryClient: { invalidateQueries: vi.fn() } };
});

import { get as idbGet, del as idbDel } from "idb-keyval";
import { getSharedVault } from "@/lib/api";
import { ensureUserKeypair } from "@/lib/keys";
import { shareFilesIntoSpace } from "@/lib/spaces";
import { queryClient } from "@/lib/query-client";
import { useSpaceAdds } from "@/store/space-adds";
import { useAuthStore } from "@/store/auth";
import { useKeysStore } from "@/store/keys";
import { usePassphraseStore } from "@/store/passphrase";
import type { SharedVault } from "@/types";

const KEY = "zcrypt-space-adds:me";
const v = (id: string) => ({ id, name: id }) as unknown as SharedVault;
const share = vi.mocked(shareFilesIntoSpace);
type ShareResult = Awaited<ReturnType<typeof shareFilesIntoSpace>>;
const ok = (ids: string[]): ShareResult => ({ added: ids, skipped: [], failed: [] });

function unlock() {
  usePassphraseStore.setState({ cachedPassphrase: "pp", cacheUntil: null, persistent: true });
}

function deferred<T>() {
  let resolve!: (x: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  vi.clearAllMocks();
  idb.store.clear();
  useAuthStore.setState({ user: { id: "me" } as never });
  useKeysStore.setState({ ready: true });
  unlock();
  useSpaceAdds.setState({ jobs: {} });
  await settle();
  idb.store.clear();
});

describe("space-adds queue", () => {
  it("runs an enqueued job to done, reporting progress and invalidating the space per chunk", async () => {
    share.mockImplementation(async (_v, ids, opts) => {
      opts?.onProgress?.(ids.length, ids.length);
      opts?.onChunk?.();
      return ok(ids);
    });
    useSpaceAdds.getState().enqueue(v("a"), ["1", "2", "3"], "Alpha");
    await vi.waitFor(() => expect(useSpaceAdds.getState().jobs.a.status).toBe("done"));
    const job = useSpaceAdds.getState().jobs.a;
    expect(job.done).toBe(3);
    expect(job.total).toBe(3);
    expect(job.vaultName).toBe("Alpha");
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["space", "a"] });
    expect(idb.store.has(KEY)).toBe(false);
  });

  it("persists the pending job and runs one job at a time", async () => {
    const gate = deferred<ReturnType<typeof ok>>();
    share.mockImplementationOnce(() => gate.promise);
    share.mockImplementation(async (_v, ids) => ok(ids));
    useSpaceAdds.getState().enqueue(v("a"), ["1", "2"], "Alpha");
    useSpaceAdds.getState().enqueue(v("b"), ["9"], "Beta");
    await vi.waitFor(() => expect(useSpaceAdds.getState().jobs.a.status).toBe("running"));
    expect(useSpaceAdds.getState().jobs.b.status).toBe("queued");
    expect(share).toHaveBeenCalledTimes(1);
    expect(idb.store.get(KEY)).toEqual([
      { vaultId: "a", vaultName: "Alpha", fileIds: ["1", "2"] },
      { vaultId: "b", vaultName: "Beta", fileIds: ["9"] },
    ]);

    gate.resolve(ok(["1", "2"]));
    await vi.waitFor(() => expect(useSpaceAdds.getState().jobs.b.status).toBe("done"));
    expect(useSpaceAdds.getState().jobs.a.status).toBe("done");
  });

  it("merges files enqueued into a running job", async () => {
    const gate = deferred<ReturnType<typeof ok>>();
    share.mockImplementationOnce(() => gate.promise);
    share.mockImplementation(async (_v, ids) => ok(ids));
    useSpaceAdds.getState().enqueue(v("a"), ["1"], "Alpha");
    await vi.waitFor(() => expect(useSpaceAdds.getState().jobs.a.status).toBe("running"));
    useSpaceAdds.getState().enqueue(v("a"), ["1", "2"], "Alpha");
    expect(useSpaceAdds.getState().jobs.a.total).toBe(2);
    gate.resolve(ok(["1"]));
    await vi.waitFor(() => expect(useSpaceAdds.getState().jobs.a.status).toBe("done"));
    expect(share.mock.calls[1][1]).toEqual(["2"]);
  });

  it("pauses while locked and resumes from storage on unlock", async () => {
    usePassphraseStore.setState({ cachedPassphrase: null, persistent: false });
    share.mockImplementation(async (_v, ids) => ok(ids));
    vi.mocked(getSharedVault).mockResolvedValue(v("a") as never);
    useSpaceAdds.getState().enqueue(v("a"), ["1", "2"], "Alpha");
    await vi.waitFor(() => expect(useSpaceAdds.getState().jobs.a.status).toBe("paused"));
    expect(share).not.toHaveBeenCalled();
    expect(idb.store.has(KEY)).toBe(true);

    unlock();
    await vi.waitFor(() => expect(useSpaceAdds.getState().jobs.a.status).toBe("done"));
    expect(share).toHaveBeenCalledTimes(1);
  });

  it("resumePending restores persisted jobs after a reload, fetching the vault", async () => {
    idb.store.set(KEY, [{ vaultId: "z", vaultName: "Zed", fileIds: ["7", "8"] }]);
    vi.mocked(getSharedVault).mockResolvedValue(v("z") as never);
    share.mockImplementation(async (_v, ids) => ok(ids));
    await useSpaceAdds.getState().resumePending();
    await vi.waitFor(() => expect(useSpaceAdds.getState().jobs.z.status).toBe("done"));
    expect(getSharedVault).toHaveBeenCalledWith("z");
    expect(share.mock.calls[0][1]).toEqual(["7", "8"]);
  });

  it("resumePending is a no-op while locked", async () => {
    usePassphraseStore.setState({ cachedPassphrase: null, persistent: false });
    idb.store.set(KEY, [{ vaultId: "z", vaultName: "Zed", fileIds: ["7"] }]);
    await useSpaceAdds.getState().resumePending();
    expect(useSpaceAdds.getState().jobs).toEqual({});
  });

  it("records failures and retryFailed re-runs only those files", async () => {
    share.mockResolvedValueOnce({
      added: ["1"],
      skipped: [],
      failed: [{ fileId: "2", error: "nope" }],
    });
    share.mockImplementation(async (_v, ids) => ok(ids));
    useSpaceAdds.getState().enqueue(v("a"), ["1", "2"], "Alpha");
    await vi.waitFor(() => expect(useSpaceAdds.getState().jobs.a.status).toBe("done"));
    expect(useSpaceAdds.getState().jobs.a.failed).toEqual([{ fileId: "2", error: "nope" }]);

    useSpaceAdds.getState().retryFailed("a");
    await vi.waitFor(() => expect(share).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(useSpaceAdds.getState().jobs.a.status).toBe("done"));
    expect(share.mock.calls[1][1]).toEqual(["2"]);
    expect(useSpaceAdds.getState().jobs.a.failed).toEqual([]);
  });

  it("marks the job errored when the run throws and keeps the files retryable", async () => {
    share.mockRejectedValueOnce(new Error("space is full"));
    useSpaceAdds.getState().enqueue(v("a"), ["1", "2"], "Alpha");
    await vi.waitFor(() => expect(useSpaceAdds.getState().jobs.a.status).toBe("error"));
    expect(useSpaceAdds.getState().jobs.a.failed.map((f) => f.error)).toEqual([
      "space is full",
      "space is full",
    ]);
  });

  it("dismiss removes a finished job", async () => {
    share.mockImplementation(async (_v, ids) => ok(ids));
    useSpaceAdds.getState().enqueue(v("a"), ["1"], "Alpha");
    await vi.waitFor(() => expect(useSpaceAdds.getState().jobs.a.status).toBe("done"));
    useSpaceAdds.getState().dismiss("a");
    expect(useSpaceAdds.getState().jobs).toEqual({});
  });

  it("drops the queue and its persisted copy on logout", async () => {
    const gate = deferred<ReturnType<typeof ok>>();
    share.mockImplementation(() => gate.promise);
    useSpaceAdds.getState().enqueue(v("a"), ["1"], "Alpha");
    await vi.waitFor(() => expect(idb.store.has(KEY)).toBe(true));
    useAuthStore.setState({ user: null });
    await settle();
    expect(useSpaceAdds.getState().jobs).toEqual({});
    expect(idb.store.has(KEY)).toBe(false);
    gate.resolve(ok(["1"]));
  });

  it("runs without persisting when nobody is signed in", async () => {
    useAuthStore.setState({ user: null });
    share.mockImplementation(async (_v, ids) => ok(ids));
    useSpaceAdds.getState().enqueue(v("a"), ["1"], "Alpha");
    await vi.waitFor(() => expect(useSpaceAdds.getState().jobs.a.status).toBe("done"));
    expect(idb.store.size).toBe(0);
    await useSpaceAdds.getState().resumePending();
    expect(getSharedVault).not.toHaveBeenCalled();
  });

  it("pauses until the keypair is ready and asks for it to be loaded", async () => {
    useKeysStore.setState({ ready: false });
    useSpaceAdds.getState().enqueue(v("a"), ["1"], "Alpha");
    await vi.waitFor(() => expect(useSpaceAdds.getState().jobs.a.status).toBe("paused"));
    expect(ensureUserKeypair).toHaveBeenCalledWith("pp");
    expect(share).not.toHaveBeenCalled();
  });

  it("survives the keypair load failing", async () => {
    useKeysStore.setState({ ready: false });
    vi.mocked(ensureUserKeypair).mockRejectedValueOnce(new Error("boom"));
    useSpaceAdds.getState().enqueue(v("a"), ["1"], "Alpha");
    await vi.waitFor(() => expect(useSpaceAdds.getState().jobs.a.status).toBe("paused"));
    await settle();
    expect(useSpaceAdds.getState().jobs.a.status).toBe("paused");
  });

  it("stops quietly when the queue is cleared while a chunk is in flight", async () => {
    const gate = deferred<ReturnType<typeof ok>>();
    let progress: ((done: number, total: number) => void) | undefined;
    share.mockImplementation((_v, _ids, opts) => {
      progress = opts?.onProgress;
      return gate.promise;
    });
    useSpaceAdds.getState().enqueue(v("a"), ["1"], "Alpha");
    await vi.waitFor(() => expect(share).toHaveBeenCalled());
    useAuthStore.setState({ user: null });
    await settle();
    progress?.(1, 1);
    gate.resolve(ok(["1"]));
    await settle();
    expect(useSpaceAdds.getState().jobs).toEqual({});
  });

  it("stops quietly when the queue is cleared before the vault loads", async () => {
    const gate = deferred<SharedVault>();
    vi.mocked(getSharedVault).mockImplementation(() => gate.promise as never);
    idb.store.set(KEY, [{ vaultId: "q", vaultName: "Q", fileIds: ["1"] }]);
    void useSpaceAdds.getState().resumePending();
    await vi.waitFor(() => expect(getSharedVault).toHaveBeenCalled());
    useAuthStore.setState({ user: null });
    await settle();
    gate.resolve(v("q"));
    await settle();
    expect(share).not.toHaveBeenCalled();
    expect(useSpaceAdds.getState().jobs).toEqual({});
  });

  it("ignores a failure that lands after the queue was cleared", async () => {
    const gate = deferred<ReturnType<typeof ok>>();
    share.mockImplementation(() => gate.promise);
    useSpaceAdds.getState().enqueue(v("a"), ["1"], "Alpha");
    await vi.waitFor(() => expect(share).toHaveBeenCalled());
    useAuthStore.setState({ user: null });
    await settle();
    gate.resolve(Promise.reject(new Error("late")) as never);
    await settle();
    expect(useSpaceAdds.getState().jobs).toEqual({});
  });

  it("uses a generic message when a non-Error is thrown", async () => {
    share.mockRejectedValueOnce("nope");
    useSpaceAdds.getState().enqueue(v("a"), ["1"], "Alpha");
    await vi.waitFor(() => expect(useSpaceAdds.getState().jobs.a.status).toBe("error"));
    const [failure] = useSpaceAdds.getState().jobs.a.failed;
    expect(failure.fileId).toBe("1");
    expect(failure.error).not.toBe("nope");
    expect(failure.error.length).toBeGreaterThan(0);
  });

  async function failOneThenHang(fail: Promise<unknown>) {
    const first = deferred<ShareResult>();
    share.mockImplementationOnce(() => first.promise);
    share.mockImplementationOnce(() => fail as never);
    useSpaceAdds.getState().enqueue(v("a"), ["1"], "Alpha");
    await vi.waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    useSpaceAdds.getState().enqueue(v("a"), ["2"], "Alpha");
    first.resolve({ added: [], skipped: [], failed: [{ fileId: "1", error: "bad" }] });
  }

  it("pauses and requeues the rest when the vault locks mid-run", async () => {
    const gate = deferred<ReturnType<typeof ok>>();
    await failOneThenHang(gate.promise);
    await vi.waitFor(() => expect(share).toHaveBeenCalledTimes(2));
    usePassphraseStore.setState({ cachedPassphrase: null, persistent: false });
    gate.resolve(Promise.reject(new Error("locked")) as never);
    await vi.waitFor(() => expect(useSpaceAdds.getState().jobs.a.status).toBe("paused"));
  });

  it("records the unfinished files as failed next to earlier failures", async () => {
    const gate = deferred<ReturnType<typeof ok>>();
    await failOneThenHang(gate.promise);
    await vi.waitFor(() => expect(share).toHaveBeenCalledTimes(2));
    gate.resolve(Promise.reject(new Error("down")) as never);
    await vi.waitFor(() => expect(useSpaceAdds.getState().jobs.a.status).toBe("error"));
    expect(useSpaceAdds.getState().jobs.a.failed).toEqual([
      { fileId: "1", error: "bad" },
      { fileId: "2", error: "down" },
    ]);
  });

  it("keeps a queued job queued when more files are merged into it", async () => {
    const gate = deferred<ReturnType<typeof ok>>();
    share.mockImplementationOnce(() => gate.promise);
    share.mockImplementation(async (_v, ids) => ok(ids));
    useSpaceAdds.getState().enqueue(v("a"), ["1"], "Alpha");
    useSpaceAdds.getState().enqueue(v("b"), ["9"], "Beta");
    await vi.waitFor(() => expect(useSpaceAdds.getState().jobs.a.status).toBe("running"));
    useSpaceAdds.getState().enqueue(v("b"), ["9", "10"], "Beta");
    expect(useSpaceAdds.getState().jobs.b).toMatchObject({ status: "queued", total: 2 });
    gate.resolve(ok(["1"]));
    await vi.waitFor(() => expect(useSpaceAdds.getState().jobs.b.status).toBe("done"));
  });

  it("retryFailed and dismiss ignore unknown, clean or running jobs", async () => {
    const gate = deferred<ReturnType<typeof ok>>();
    share.mockImplementation(() => gate.promise);
    useSpaceAdds.getState().retryFailed("nope");
    useSpaceAdds.getState().dismiss("nope");
    useSpaceAdds.getState().enqueue(v("a"), ["1"], "Alpha");
    await vi.waitFor(() => expect(useSpaceAdds.getState().jobs.a.status).toBe("running"));
    useSpaceAdds.getState().retryFailed("a");
    useSpaceAdds.getState().dismiss("a");
    expect(useSpaceAdds.getState().jobs.a.status).toBe("running");
    useSpaceAdds.setState((s) => ({
      jobs: { a: { ...s.jobs.a, failed: [{ fileId: "1", error: "x" }] } },
    }));
    useSpaceAdds.getState().retryFailed("a");
    expect(useSpaceAdds.getState().jobs.a.status).toBe("running");
    gate.resolve(ok(["1"]));
    await settle();
  });

  it("resumePending starts from nothing when storage cannot be read", async () => {
    vi.mocked(idbGet).mockRejectedValueOnce(new Error("idb"));
    await useSpaceAdds.getState().resumePending();
    expect(useSpaceAdds.getState().jobs).toEqual({});
  });

  it("resumePending keeps jobs already in memory and tolerates empty storage", async () => {
    const gate = deferred<ReturnType<typeof ok>>();
    share.mockImplementation(() => gate.promise);
    useSpaceAdds.getState().enqueue(v("a"), ["1"], "Alpha");
    await vi.waitFor(() => expect(useSpaceAdds.getState().jobs.a.status).toBe("running"));
    idb.store.set(KEY, [{ vaultId: "a", vaultName: "Other", fileIds: ["5"] }]);
    await useSpaceAdds.getState().resumePending();
    expect(useSpaceAdds.getState().jobs.a.vaultName).toBe("Alpha");
    gate.resolve(ok(["1"]));
    await settle();
    idb.store.delete(KEY);
    await useSpaceAdds.getState().resumePending();
  });

  it("logout survives the persisted copy failing to delete", async () => {
    vi.mocked(idbDel).mockRejectedValueOnce(new Error("idb"));
    useSpaceAdds.setState({ jobs: {} });
    useAuthStore.setState({ user: null });
    await settle();
    expect(useSpaceAdds.getState().jobs).toEqual({});
  });
});
