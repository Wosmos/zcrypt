import { create } from "zustand";
import { tr } from "@/store/translate";
import { del, get, set } from "idb-keyval";
import { getSharedVault } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { queryClient } from "@/lib/query-client";
import { ensureUserKeypair } from "@/lib/keys";
import { shareFilesIntoSpace } from "@/lib/spaces";
import { useAuthStore } from "@/store/auth";
import { useKeysStore } from "@/store/keys";
import { usePassphraseStore } from "@/store/passphrase";
import type { SharedVault } from "@/types";

export type SpaceAddJob = {
  vaultId: string;
  vaultName: string;
  fileIds: string[];
  done: number;
  total: number;
  failed: { fileId: string; error: string }[];
  status: "queued" | "running" | "paused" | "done" | "error";
};

interface PersistedJob {
  vaultId: string;
  vaultName: string;
  fileIds: string[];
}

interface SpaceAddsStore {
  jobs: Record<string, SpaceAddJob>;
  enqueue: (vault: SharedVault, fileIds: string[], vaultName: string) => void;
  retryFailed: (vaultId: string) => void;
  dismiss: (vaultId: string) => void;
  resumePending: () => Promise<void>;
}

const vaultRefs = new Map<string, SharedVault>();
const attempted = new Map<string, Set<string>>();
const settled = new Map<string, Set<string>>();
let running = false;
let controller: AbortController | null = null;

function storageKey(): string | null {
  const id = useAuthStore.getState().user?.id;
  return id ? `zcrypt-space-adds:${id}` : null;
}

async function persist(): Promise<void> {
  const key = storageKey();
  if (!key) return;
  const pending: PersistedJob[] = Object.values(useSpaceAdds.getState().jobs)
    .filter((j) => j.status !== "done")
    .map((j) => {
      const finished = settled.get(j.vaultId);
      const failed = new Set(j.failed.map((f) => f.fileId));
      return {
        vaultId: j.vaultId,
        vaultName: j.vaultName,
        fileIds: j.fileIds.filter((id) => !failed.has(id) && !finished?.has(id)),
      };
    })
    .filter((j) => j.fileIds.length > 0);
  try {
    if (pending.length === 0) await del(key);
    else await set(key, pending);
  } catch {
    /* storage unavailable: the queue simply won't survive a reload */
  }
}

function patch(vaultId: string, p: Partial<SpaceAddJob>): void {
  useSpaceAdds.setState((s) =>
    s.jobs[vaultId] ? { jobs: { ...s.jobs, [vaultId]: { ...s.jobs[vaultId], ...p } } } : s,
  );
}

function invalidateSpace(vaultId: string): void {
  void queryClient.invalidateQueries({ queryKey: qk.space(vaultId) });
}

async function runJob(vaultId: string): Promise<void> {
  const passphrase = usePassphraseStore.getState().getPassphrase();
  if (!passphrase) {
    patch(vaultId, { status: "paused" });
    return;
  }
  if (!useKeysStore.getState().ready) {
    patch(vaultId, { status: "paused" });
    void ensureUserKeypair(passphrase).catch(() => {});
    return;
  }
  patch(vaultId, { status: "running" });
  controller = new AbortController();
  const signal = controller.signal;
  try {
    let vault = vaultRefs.get(vaultId);
    if (!vault) {
      vault = await getSharedVault(vaultId);
      vaultRefs.set(vaultId, vault);
    }
    const seen = attempted.get(vaultId) ?? new Set<string>();
    attempted.set(vaultId, seen);
    let total = 0;
    for (;;) {
      const job = useSpaceAdds.getState().jobs[vaultId];
      if (!job) return;
      total = job.total;
      const todo = job.fileIds.filter((id) => !seen.has(id));
      if (todo.length === 0) break;
      todo.forEach((id) => seen.add(id));
      const finished = settled.get(vaultId) ?? new Set<string>();
      settled.set(vaultId, finished);
      const base = finished.size;
      const res = await shareFilesIntoSpace(vault, todo, {
        signal,
        onProgress: (d) => patch(vaultId, { done: base + d }),
        onChunk: () => invalidateSpace(vaultId),
      });
      todo.forEach((id) => finished.add(id));
      const current = useSpaceAdds.getState().jobs[vaultId];
      if (!current) return;
      patch(vaultId, { failed: [...current.failed, ...res.failed], done: base + todo.length });
      await persist();
    }
    patch(vaultId, { status: "done", done: total });
    invalidateSpace(vaultId);
    void queryClient.invalidateQueries({ queryKey: qk.spaces });
  } catch (err) {
    const message = err instanceof Error ? err.message : tr("files.addFailed");
    const job = useSpaceAdds.getState().jobs[vaultId];
    if (!job) return;
    const unlockNeeded = !usePassphraseStore.getState().getPassphrase();
    if (unlockNeeded) {
      attempted.delete(vaultId);
      patch(vaultId, { status: "paused" });
    } else {
      const finished = settled.get(vaultId);
      const failedIds = new Set(job.failed.map((f) => f.fileId));
      const rest = job.fileIds.filter((id) => !failedIds.has(id) && !finished?.has(id));
      patch(vaultId, {
        status: "error",
        failed: [...job.failed, ...rest.map((fileId) => ({ fileId, error: message }))],
      });
    }
  } finally {
    controller = null;
  }
}

async function pump(): Promise<void> {
  if (running) return;
  const next = Object.values(useSpaceAdds.getState().jobs).find((j) => j.status === "queued");
  if (!next) return;
  running = true;
  try {
    await runJob(next.vaultId);
  } finally {
    running = false;
  }
  await persist();
  void pump();
}

export const useSpaceAdds = create<SpaceAddsStore>((setState, getState) => ({
  jobs: {},

  enqueue: (vault, fileIds, vaultName) => {
    vaultRefs.set(vault.id, vault);
    const existing = getState().jobs[vault.id];
    if (existing && existing.status !== "done") {
      const have = new Set(existing.fileIds);
      const added = [...new Set(fileIds)].filter((id) => !have.has(id));
      patch(vault.id, {
        fileIds: [...existing.fileIds, ...added],
        total: existing.total + added.length,
        status: existing.status === "running" ? "running" : "queued",
      });
    } else {
      const unique = [...new Set(fileIds)];
      attempted.delete(vault.id);
      settled.delete(vault.id);
      setState((s) => ({
        jobs: {
          ...s.jobs,
          [vault.id]: {
            vaultId: vault.id,
            vaultName,
            fileIds: unique,
            done: 0,
            total: unique.length,
            failed: [],
            status: "queued",
          },
        },
      }));
    }
    void persist().then(() => pump());
  },

  retryFailed: (vaultId) => {
    const job = getState().jobs[vaultId];
    if (!job || job.failed.length === 0 || job.status === "running") return;
    const ids = job.failed.map((f) => f.fileId);
    attempted.delete(vaultId);
    settled.delete(vaultId);
    patch(vaultId, { fileIds: ids, total: ids.length, done: 0, failed: [], status: "queued" });
    void persist().then(() => pump());
  },

  dismiss: (vaultId) => {
    const job = getState().jobs[vaultId];
    if (!job || job.status === "running") return;
    attempted.delete(vaultId);
    settled.delete(vaultId);
    setState((s) => {
      const { [vaultId]: _gone, ...rest } = s.jobs;
      return { jobs: rest };
    });
    void persist();
  },

  resumePending: async () => {
    const key = storageKey();
    if (!key || !usePassphraseStore.getState().getPassphrase()) return;
    let saved: PersistedJob[] = [];
    try {
      saved = (await get<PersistedJob[]>(key)) ?? [];
    } catch {
      saved = [];
    }
    setState((s) => {
      const jobs = { ...s.jobs };
      for (const p of saved) {
        if (jobs[p.vaultId]) continue;
        jobs[p.vaultId] = {
          vaultId: p.vaultId,
          vaultName: p.vaultName,
          fileIds: p.fileIds,
          done: 0,
          total: p.fileIds.length,
          failed: [],
          status: "queued",
        };
      }
      for (const id of Object.keys(jobs)) {
        if (jobs[id].status === "paused") jobs[id] = { ...jobs[id], status: "queued" };
      }
      return { jobs };
    });
    await pump();
  },
}));

function resetAll(): void {
  controller?.abort();
  attempted.clear();
  settled.clear();
  vaultRefs.clear();
  useSpaceAdds.setState({ jobs: {} });
}

if (typeof window !== "undefined") {
  let lastUser = useAuthStore.getState().user?.id ?? null;
  useAuthStore.subscribe((s) => {
    const id = s.user?.id ?? null;
    if (id === lastUser) return;
    const previous = lastUser;
    lastUser = id;
    if (!id && previous) {
      resetAll();
      void del(`zcrypt-space-adds:${previous}`).catch(() => {});
    }
  });
  usePassphraseStore.subscribe((s, prev) => {
    if (s.cachedPassphrase && !prev.cachedPassphrase) void useSpaceAdds.getState().resumePending();
  });
  useKeysStore.subscribe((s, prev) => {
    if (s.ready && !prev.ready) void useSpaceAdds.getState().resumePending();
  });
}
