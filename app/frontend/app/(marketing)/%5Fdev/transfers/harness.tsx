"use client";

import { useEffect, useState } from "react";
import { TransferManager } from "@/components/transfer/transfer-manager";
import { useUploadStore } from "@/store/upload";
import { useDownloadStore, type DownloadItem } from "@/store/download";
import { useConnectivityStore } from "@/store/connectivity";
import { usePassphraseStore } from "@/store/passphrase";
import { useTransferDockStore } from "@/store/transfer-dock";
import { seedThumbnailFromFile } from "@/hooks/useThumbnail";
import { FILES_DRAG_MIME, useDragMove } from "@/hooks/useDragMove";
import type { UploadItem } from "@/types";

const MB = 1024 * 1024;
const FAMILY = "dev-family";
const HUES = [18, 200, 140, 330, 45, 260];

type Scenario = "big" | "small" | "paused" | "offline" | "done" | "failed";

const folderOf = new Map<string, string | null>();

function file(name: string, size: number): File {
  const f = new File([], name, { type: "image/jpeg" });
  Object.defineProperty(f, "size", { value: size });
  return f;
}

function up(
  id: string,
  name: string,
  size: number,
  patch: Partial<UploadItem>,
  folder: string | null = FAMILY,
): UploadItem {
  folderOf.set(id, folder);
  return {
    id,
    file: file(name, size),
    fileId: `file-${id}`,
    status: "queued",
    progress: 0,
    stage: "Queued",
    startedAt: Date.now() - 20_000,
    ...patch,
  };
}

function down(
  id: string,
  filename: string,
  fileSize: number,
  patch: Partial<DownloadItem>,
): DownloadItem {
  return {
    id,
    fileId: `file-${id}`,
    filename,
    fileSize,
    status: "downloading",
    progress: 0,
    stage: "Downloading 1/4",
    startedAt: Date.now() - 12_000,
    ...patch,
  };
}

function bigBatch(): UploadItem[] {
  const items: UploadItem[] = [
    up("fail", "Mom birthday.MOV", 48 * MB, {
      status: "failed",
      error: "Failed to fetch",
      bytesProcessed: 19.7 * MB,
      totalBytes: 48 * MB,
    }),
    up("enc", "IMG_4021.HEIC", 3.2 * MB, {
      status: "uploading",
      progress: 3,
      stage: "Uploading chunk 1/1",
      bytesProcessed: 0,
      totalBytes: 3.2 * MB,
    }),
    up("send", "Beach day.jpg", 4.8 * MB, {
      status: "uploading",
      progress: 58,
      stage: "Uploading chunk 1/1",
      bytesProcessed: 2.8 * MB,
      totalBytes: 4.8 * MB,
      rateBps: 12.4 * MB,
    }),
  ];
  for (let i = 0; i < 56; i++)
    items.push(
      up(`d${i}`, `IMG_${3900 + i}.jpg`, 3 * MB, {
        status: "done",
        progress: 100,
        stage: "Done",
        startedAt: Date.now() - 300_000,
      }),
    );
  for (let i = 0; i < 45; i++) items.push(up(`q${i}`, `IMG_${4100 + i}.jpg`, 3 * MB, {}));
  return items;
}

function seed(s: Scenario) {
  folderOf.clear();
  let uploads: UploadItem[] = [];
  let downloads: DownloadItem[] = [];
  if (s === "big" || s === "offline") {
    uploads = bigBatch();
    downloads = [
      down("lease", "Lease 2026.pdf", 3.1 * MB, { progress: 94, stage: "Verifying integrity..." }),
    ];
  } else if (s === "small") {
    uploads = [
      up(
        "send",
        "Beach day.jpg",
        4.8 * MB,
        {
          status: "uploading",
          progress: 40,
          stage: "Uploading chunk 1/1",
          bytesProcessed: 1.8 * MB,
          totalBytes: 4.8 * MB,
          rateBps: 12.4 * MB,
        },
        null,
      ),
      up(
        "enc",
        "IMG_4021.HEIC",
        3.2 * MB,
        { status: "encrypting", progress: 2, stage: "Hashing file… 60%" },
        null,
      ),
    ];
    downloads = [
      down("lease", "Lease 2026.pdf", 3.1 * MB, { progress: 47, stage: "Downloading 2/4" }),
      down("notes", "Notes.txt", 12_000, { status: "done", progress: 100, stage: "Done" }),
    ];
  } else if (s === "paused") {
    uploads = bigBatch().map((i) =>
      i.status === "uploading" || i.status === "queued"
        ? { ...i, status: "paused", stage: "Paused" }
        : i,
    );
  } else if (s === "done") {
    uploads = bigBatch().map((i) => ({
      ...i,
      status: "done",
      progress: 100,
      stage: "Done",
      error: undefined,
    }));
  } else {
    uploads = [
      up(
        "a",
        "Passport scan.png",
        2 * MB,
        { status: "failed", error: "Unlock your vault to continue" },
        null,
      ),
      up(
        "b",
        "Taxes 2025.zip",
        20 * 1024 * MB,
        { status: "failed", error: "HTTP 413 too large" },
        null,
      ),
      up(
        "c",
        "Holiday.jpg",
        6 * MB,
        {
          status: "failed",
          error: "No storage platform connected. Go to Settings to connect one.",
        },
        null,
      ),
    ];
    downloads = [
      down("big", "Movie.mkv", 6 * 1024 * MB, {
        status: "failed",
        progress: 0,
        error: "Too large to download in this browser",
      }),
    ];
  }
  useConnectivityStore.setState({ online: s !== "offline" });
  useUploadStore.setState({ queue: uploads });
  useDownloadStore.setState({ queue: downloads });
}

function setStatus(id: string, status: UploadItem["status"], stage: string) {
  useUploadStore.setState((st) => ({
    queue: st.queue.map((i) => (i.id === id ? { ...i, status, stage, error: undefined } : i)),
  }));
}

function setDownload(id: string, patch: Partial<DownloadItem>) {
  useDownloadStore.setState((st) => ({
    queue: st.queue.map((i) => (i.id === id ? { ...i, ...patch } : i)),
  }));
}

async function thumbnails() {
  const ids = ["fail", "enc", "send", ...Array.from({ length: 56 }, (_, i) => `d${i}`)];
  await Promise.all(
    ids.map(async (id, n) => {
      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 96;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const hue = HUES[n % HUES.length];
      const g = ctx.createLinearGradient(0, 0, 96, 96);
      g.addColorStop(0, `hsl(${hue} 80% 65%)`);
      g.addColorStop(1, `hsl(${(hue + 60) % 360} 70% 40%)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 96, 96);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
      if (blob) await seedThumbnailFromFile(`file-${id}`, blob, `${id}.png`);
    }),
  );
}

/** Seeds the transfer stores with fake items and renders the real panel over a plain page. */
export function TransfersHarness() {
  const [scenario, setScenario] = useState<Scenario>("big");
  const [dark, setDark] = useState(false);

  useEffect(() => {
    usePassphraseStore.setState({ getPassphrase: () => "dev" });
    useTransferDockStore.getState().rememberFolder(FAMILY, "Family");
    useTransferDockStore.getState().setDropTarget({
      folderName: "Family",
      upload: (files) => window.alert(`upload ${files.length}`),
      download: (ids) => window.alert(`download ${ids.join(",")}`),
    });
    useUploadStore.setState({
      getItemFolderId: (id) => folderOf.get(id) ?? null,
      pauseUpload: (id) => setStatus(id, "paused", "Paused"),
      resumeUpload: (id) => setStatus(id, "uploading", "Resuming…"),
      retryUpload: (id) => setStatus(id, "queued", "Retrying..."),
      removeFromQueue: (id) =>
        useUploadStore.setState((st) => ({ queue: st.queue.filter((i) => i.id !== id) })),
      dismissUpload: (id) =>
        useUploadStore.setState((st) => ({ queue: st.queue.filter((i) => i.id !== id) })),
    });
    useDownloadStore.setState({
      pauseDownload: (id) => setDownload(id, { status: "paused" }),
      resumeDownload: (id) => setDownload(id, { status: "downloading" }),
      retryDownload: (id) => setDownload(id, { status: "downloading", error: undefined }),
      cancelDownload: (id) => setDownload(id, { status: "cancelled" }),
    });
    void thumbnails();
    return () => useTransferDockStore.getState().setDropTarget(null);
  }, []);

  useEffect(() => {
    seed(scenario);
  }, [scenario]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <main className="min-h-[80vh] px-4 py-24">
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="font-heading text-2xl font-bold">Transfer panel harness</h1>
        <div className="flex flex-wrap gap-2">
          {(["big", "small", "paused", "offline", "done", "failed"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScenario(s)}
              className={`rounded-full border px-3 py-1.5 text-sm ${s === scenario ? "border-[var(--color-accent)] text-[var(--color-accent)]" : "border-[var(--color-border)]"}`}
            >
              {s}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setDark((d) => !d)}
            className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-sm"
          >
            {dark ? "light" : "dark"}
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {["IMG_5001.jpg", "Contract.pdf", "Trip.mov"].map((n) => (
            <div
              key={n}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(FILES_DRAG_MIME, JSON.stringify([n]));
                e.dataTransfer.effectAllowed = "copyMove";
                useDragMove.getState().startDrag({ kind: "file", id: n, name: n, ids: [n] });
              }}
              onDragEnd={() => useDragMove.getState().endDrag()}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm"
            >
              {n}
            </div>
          ))}
        </div>
      </div>
      <TransferManager onNeedUnlock={(resume) => resume()} />
    </main>
  );
}
