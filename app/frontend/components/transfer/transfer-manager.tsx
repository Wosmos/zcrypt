"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { useUploadStore } from "@/store/upload";
import { useDownloadStore, type DownloadStatus } from "@/store/download";
import type { UploadStatus } from "@/types";
import { usePassphraseStore } from "@/store/passphrase";
import { getFilesData } from "@/store/files";
import { useFolderRegistry } from "@/store/folder-registry";
import { useFolderPasswordStore } from "@/store/folder-passwords";
import { useFolderStore } from "@/store/folders";
import { useConnectivityStore } from "@/store/connectivity";
import { resolveFilePasswordGlobal } from "@/hooks/useFolderProtection";
import { useIsMobile } from "@/hooks/useIsMobile";
import { FILES_DRAG_MIME, useDragMove } from "@/hooks/useDragMove";
import { toast } from "@/store/toast";
import { useTransferDockStore } from "@/store/transfer-dock";
import { RETRY_TRANSFERS_EVENT } from "@/lib/service-worker";
import { ChevronDown, Lock, X } from "@/lib/icons";
import { cn, extOf, formatBytes, isImageFile, isVideoFile } from "@/lib/utils";
import {
  batchSentence,
  describeDownload,
  describeUpload,
  remainingFromElapsed,
  timeLeftLabel,
  translateLabel,
  type TransferLabel,
} from "@/lib/transfer-progress";
import { TransferItem, type TransferEntry, type TransferState } from "./transfer-item";
import { ProgressRing, TONE, type Segment } from "./transfer-parts";
import {
  BatchBlock,
  DropOverlay,
  SlimBar,
  TransferOrb,
  type DropIntent,
  type TransferSummary,
} from "./transfer-views";

/** Props of the single docked transfer panel. */
export interface TransferManagerProps {
  /** Called when a Retry/Resume needs the vault passphrase and none is cached;
   *  `resume` runs the action once the user unlocks. */
  onNeedUnlock?: (resume: () => void) => void;
}

const STATE_RANK: Record<TransferState, number> = {
  failed: 0,
  active: 1,
  paused: 2,
  queued: 3,
  cancelled: 4,
  done: 5,
};
const BATCH_MIN = 10;
const FOLD_DONE_MS = 5000;
const ORB_FADE_MS = 4000;

function uploadState(status: UploadStatus): TransferState {
  if (status === "done" || status === "failed" || status === "paused" || status === "queued")
    return status;
  return "active";
}

function downloadState(status: DownloadStatus): TransferState {
  return status === "downloading" ? "active" : status;
}

function isPhoto(name: string): boolean {
  return isImageFile(name) || isVideoFile(name) || extOf(name) === "heic" || extOf(name) === "heif";
}

function dropKind(dt: DataTransfer | null): DropIntent["kind"] | null {
  const types = Array.from(dt?.types ?? []);
  if (types.includes(FILES_DRAG_MIME)) return "download";
  if (types.includes("Files") && useTransferDockStore.getState().dropTarget) return "upload";
  return null;
}

function dropCount(dt: DataTransfer | null, kind: DropIntent["kind"]): number {
  if (kind === "download") return useDragMove.getState().dragging?.ids?.length ?? 1;
  return Array.from(dt?.items ?? []).filter((i) => i.kind === "file").length;
}

function droppedIds(dt: DataTransfer): string[] {
  try {
    const parsed: unknown = JSON.parse(dt.getData(FILES_DRAG_MIME));
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string" && x !== "")
      : [];
  } catch {
    return [];
  }
}

/**
 * The docked transfer panel: uploads and downloads in one place, in plain
 * words. Open on desktop as a 380px card, minimized as a slim bar, and on
 * phones as an orb above the nav. It is also a drop target both ways.
 */
export function TransferManager({ onNeedUnlock }: TransferManagerProps) {
  const t = useTranslations("app.transfer");
  const ta = useTranslations("app");
  const isPhone = useIsMobile();
  const canHover = useIsMobile("(hover: hover)");
  const online = useConnectivityStore((s) => s.online);
  const [minimized, setMinimized] = useState<boolean | null>(null);
  const collapsed = minimized ?? isPhone;
  const [dismissed, setDismissed] = useState(false);
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const [intent, setIntent] = useState<DropIntent | null>(null);
  const [over, setOver] = useState(false);

  const uploadQueue = useUploadStore((s) => s.queue);
  const pauseUpload = useUploadStore((s) => s.pauseUpload);
  const resumeUpload = useUploadStore((s) => s.resumeUpload);
  const retryUpload = useUploadStore((s) => s.retryUpload);
  const removeUpload = useUploadStore((s) => s.removeFromQueue);
  const dismissUpload = useUploadStore((s) => s.dismissUpload);
  const clearUploads = useUploadStore((s) => s.clearCompleted);
  const getItemFolderId = useUploadStore((s) => s.getItemFolderId);
  const getResumableUploadIds = useUploadStore((s) => s.getResumableUploadIds);

  const downloadQueue = useDownloadStore((s) => s.queue);
  const pauseDownload = useDownloadStore((s) => s.pauseDownload);
  const resumeDownload = useDownloadStore((s) => s.resumeDownload);
  const cancelDownload = useDownloadStore((s) => s.cancelDownload);
  const retryDownload = useDownloadStore((s) => s.retryDownload);
  const autoResumeDownloads = useDownloadStore((s) => s.autoResumeInterrupted);
  const removeDownload = useDownloadStore((s) => s.removeFromQueue);
  const clearDownloads = useDownloadStore((s) => s.clearCompleted);

  const folderNames = useTransferDockStore((s) => s.folderNames);
  const dropTarget = useTransferDockStore((s) => s.dropTarget);
  const breadcrumb = useFolderStore((s) => s.breadcrumb);

  const folderName = useCallback(
    (id: string | null): string => {
      if (id === null) return t("rootFolder");
      return folderNames[id] ?? breadcrumb.find((c) => c.id === id)?.name ?? t("folderFallback");
    },
    [folderNames, breadcrumb, t],
  );

  const withPassphrase = (run: (passphrase: string) => void) => {
    const cached = usePassphraseStore.getState().getPassphrase();
    if (cached) {
      run(cached);
      return;
    }
    onNeedUnlock?.(() => {
      const pass = usePassphraseStore.getState().getPassphrase();
      if (pass) run(pass);
    });
  };

  const withUploadPassword = (id: string, run: (password: string) => void) => {
    const folderId = getItemFolderId(id);
    if (folderId == null || !useFolderRegistry.getState().isProtected(folderId)) {
      withPassphrase(run);
      return;
    }
    const folderPw = useFolderPasswordStore.getState().get(folderId);
    if (folderPw) run(folderPw);
    else toast.info(t("openFolderRetryTransfer"));
  };

  const withDownloadPassword = (fileId: string, run: (passphrase: string) => void) => {
    const folderId = getFilesData().find((f) => f.id === fileId)?.folder_id ?? null;
    if (folderId == null || !useFolderRegistry.getState().isProtected(folderId)) {
      withPassphrase(run);
      return;
    }
    const folderPw = useFolderPasswordStore.getState().get(folderId);
    if (folderPw) run(folderPw);
    else toast.info(t("openFolderRetryDownload"));
  };

  useEffect(() => {
    const silentUploadPassword = (id: string): string | null => {
      const folderId = getItemFolderId(id);
      if (folderId != null && useFolderRegistry.getState().isProtected(folderId)) {
        return useFolderPasswordStore.getState().get(folderId) ?? null;
      }
      return usePassphraseStore.getState().getPassphrase();
    };
    const resumeInterrupted = () => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      for (const id of getResumableUploadIds()) {
        const pass = silentUploadPassword(id);
        if (pass) resumeUpload(id, pass);
      }
      autoResumeDownloads();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") resumeInterrupted();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", resumeInterrupted);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", resumeInterrupted);
    };
  }, [getResumableUploadIds, getItemFolderId, resumeUpload, autoResumeDownloads]);

  const bars = useTransferDockStore((s) => s.bars);
  const recordBars = useTransferDockStore((s) => s.recordBars);
  const noPlatformText = ta("hooks.noPlatform");
  const [now, setNow] = useState(() => Date.now());
  const downloading = downloadQueue.some((d) => d.status === "downloading");
  useEffect(() => {
    if (!downloading) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [downloading]);

  const entries = useMemo<TransferEntry[]>(() => {
    const up = uploadQueue.map<TransferEntry>((item) => {
      const key = `up:${item.id}`;
      const folderId = getItemFolderId(item.id);
      const total = item.totalBytes ?? item.file.size;
      const etaSeconds =
        item.rateBps && item.rateBps > 0
          ? (total - (item.bytesProcessed ?? 0)) / item.rateBps
          : undefined;
      return {
        key,
        id: item.id,
        direction: "upload",
        name: item.file.name,
        fileId: item.fileId,
        state: uploadState(item.status),
        view: describeUpload(
          { ...item, etaSeconds },
          { online, folderName: folderName(folderId), prevBar: bars[key], noPlatformText },
        ),
        sizeBytes: item.file.size,
        bytesProcessed: item.bytesProcessed,
        totalBytes: total,
        rateBps: item.rateBps,
        etaSeconds,
        startedAt: item.startedAt,
        folderId,
        desktop: item.desktop,
      };
    });
    const down = downloadQueue.map<TransferEntry>((item) => {
      const key = `dl:${item.id}`;
      const etaSeconds = remainingFromElapsed(item.startedAt, item.progress, now);
      return {
        key,
        id: item.id,
        direction: "download",
        name: item.filename,
        fileId: item.fileId === "zip" ? undefined : item.fileId,
        state: downloadState(item.status),
        view: describeDownload(
          { ...item, etaSeconds },
          { online, folderName: "", prevBar: bars[key], noPlatformText },
        ),
        sizeBytes: item.fileSize,
        etaSeconds,
        startedAt: item.startedAt,
      };
    });
    return [...up, ...down].sort(
      (a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || b.startedAt - a.startedAt,
    );
  }, [uploadQueue, downloadQueue, online, folderName, noPlatformText, getItemFolderId, bars, now]);

  useEffect(() => {
    recordBars(Object.fromEntries(entries.map((e) => [e.key, e.view.bar])));
  }, [entries, recordBars]);

  const count = (s: TransferState) => entries.filter((e) => e.state === s).length;
  const done = count("done");
  const failed = count("failed");
  const active = count("active");
  const waiting = count("queued");
  const paused = count("paused");
  const left = active + waiting + paused;
  const settled = left === 0;
  const transferring = active + waiting > 0;

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    setDismissed(false);
  }, [entries.length]);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    if (left > 0 || failed > 0) setDismissed(false);
  }, [left, failed]);

  useEffect(() => {
    if (!transferring) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [transferring]);

  const doneKeys = entries
    .filter((e) => e.state === "done" && !folded.has(e.key))
    .map((e) => e.key)
    .join("|");
  useEffect(() => {
    if (!doneKeys) return;
    const keys = doneKeys.split("|");
    const timer = setTimeout(() => setFolded((prev) => new Set([...prev, ...keys])), FOLD_DONE_MS);
    return () => clearTimeout(timer);
  }, [doneKeys]);

  const orbDone = isPhone && collapsed && settled && failed === 0 && entries.length > 0;
  useEffect(() => {
    if (!orbDone) return;
    const timer = setTimeout(() => setDismissed(true), ORB_FADE_MS);
    return () => clearTimeout(timer);
  }, [orbDone]);

  const controls = {
    onPause: (id: string) => pauseUpload(id),
    onResume: (id: string) => withUploadPassword(id, (pass) => resumeUpload(id, pass)),
    onCancelUpload: (id: string) => removeUpload(id),
    onRetryUpload: (id: string) => withUploadPassword(id, (pass) => retryUpload(id, pass)),
    onStopDownload: (id: string) => cancelDownload(id),
    onPauseDownload: (id: string) => pauseDownload(id),
    onResumeDownload: (id: string) => {
      const item = downloadQueue.find((d) => d.id === id);
      if (item)
        withDownloadPassword(item.fileId, (pass) =>
          resumeDownload(id, pass, resolveFilePasswordGlobal),
        );
    },
    onRetryDownload: (id: string) => {
      const item = downloadQueue.find((d) => d.id === id);
      if (item)
        withDownloadPassword(item.fileId, (pass) =>
          retryDownload(id, pass, resolveFilePasswordGlobal),
        );
    },
    onDismiss: (entry: TransferEntry) =>
      entry.direction === "upload" ? dismissUpload(entry.id) : removeDownload(entry.id),
  };

  const pausable = entries.filter(
    (e) =>
      (e.state === "active" || e.state === "queued") && !(e.direction === "upload" && e.desktop),
  );
  const resumable = entries.filter((e) => e.state === "paused");
  const pauseAll = () => {
    for (const e of pausable)
      (e.direction === "upload" ? controls.onPause : controls.onPauseDownload)(e.id);
  };
  const resumeAll = () => {
    for (const e of resumable)
      (e.direction === "upload" ? controls.onResume : controls.onResumeDownload)(e.id);
  };
  const retryFailed = () => {
    for (const e of entries.filter((x) => x.state === "failed"))
      (e.direction === "upload" ? controls.onRetryUpload : controls.onRetryDownload)(e.id);
  };
  const retryFailedRef = useRef(retryFailed);
  useEffect(() => {
    retryFailedRef.current = retryFailed;
  });
  useEffect(() => {
    const onRetry = () => retryFailedRef.current();
    window.addEventListener(RETRY_TRANSFERS_EVENT, onRetry);
    return () => window.removeEventListener(RETRY_TRANSFERS_EVENT, onRetry);
  }, []);
  const clearDone = () => {
    clearUploads();
    clearDownloads();
    setFolded(new Set());
  };

  const batch = useMemo(() => {
    const groups = new Map<string, TransferEntry[]>();
    for (const e of entries) {
      if (e.direction !== "upload") continue;
      const g = String(e.folderId ?? "");
      groups.set(g, [...(groups.get(g) ?? []), e]);
    }
    const biggest = [...groups.values()].sort((a, b) => b.length - a.length)[0];
    if (!biggest || biggest.length < BATCH_MIN) return null;
    return { items: biggest, keys: new Set(biggest.map((e) => e.key)) };
  }, [entries]);

  const segmentsOf = (list: TransferEntry[]): Segment[] => {
    const n = (s: TransferState) => list.filter((e) => e.state === s).length;
    const w = n("queued") + n("paused");
    return [
      {
        id: "done",
        count: n("done"),
        color: TONE.ok,
        title: t("segment.done", { count: n("done") }),
      },
      {
        id: "uploading",
        count: n("active"),
        color: TONE.accent,
        title: t("segment.uploading", { count: n("active") }),
      },
      { id: "waiting", count: w, color: TONE.waiting, title: t("segment.waiting", { count: w }) },
      {
        id: "failed",
        count: n("failed"),
        color: TONE.err,
        title: t("segment.failed", { count: n("failed") }),
      },
    ];
  };

  const uploads = entries.filter((e) => e.direction === "upload");
  const mainFolder = batch ? (batch.items[0].folderId ?? null) : (uploads[0]?.folderId ?? null);
  const sentenceList = uploads.length > 0 ? uploads : entries;
  const sentence: TransferLabel = batchSentence({
    direction: uploads.length > 0 ? "upload" : "download",
    done: sentenceList.filter((e) => e.state === "done").length,
    failed: sentenceList.filter((e) => e.state === "failed").length,
    active: sentenceList.filter((e) => e.state === "active").length,
    waiting: sentenceList.filter((e) => e.state === "queued").length,
    paused: sentenceList.filter((e) => e.state === "paused").length,
    photos: sentenceList.length > 0 && sentenceList.every((e) => isPhoto(e.name)),
    folderName: folderName(mainFolder),
    online,
  });

  const rate = entries.reduce((sum, e) => sum + (e.state === "active" ? (e.rateBps ?? 0) : 0), 0);
  const remainingBytes = uploads.reduce(
    (sum, e) =>
      e.state === "active" || e.state === "queued"
        ? sum + Math.max(0, (e.totalBytes ?? 0) - (e.bytesProcessed ?? 0))
        : sum,
    0,
  );
  const downloadEtas = entries
    .filter((e) => e.direction === "download" && e.state === "active")
    .map((e) => e.etaSeconds ?? 0);
  const etaSeconds = rate > 0 ? remainingBytes / rate : Math.max(0, ...downloadEtas);
  const timeLeft = timeLeftLabel(etaSeconds);
  const status = settled
    ? t("header.done")
    : active + waiting === 0
      ? t("header.paused")
      : timeLeft
        ? t("header.timeLeft", { time: translateLabel(t, timeLeft) })
        : "";
  const percent =
    entries.length > 0
      ? entries.reduce(
          (sum, e) =>
            sum +
            (e.state === "done" || e.state === "failed" || e.state === "cancelled"
              ? 100
              : e.view.bar),
          0,
        ) / entries.length
      : 100;
  const activeDownloads = entries.filter(
    (e) => e.direction === "download" && (e.state === "active" || e.state === "queued"),
  ).length;
  const speedLine = [
    rate > 0 ? t("header.speed", { speed: formatBytes(rate) }) : "",
    activeDownloads > 0 ? t("header.downloads", { count: activeDownloads }) : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const sentenceText = translateLabel(t, sentence);
  const current =
    entries.find((e) => e.state === "active" && e.direction === "upload") ??
    entries.find((e) => e.state === "active");

  const summary: TransferSummary = {
    total: entries.length,
    done,
    failed,
    active,
    waiting,
    left,
    percent,
    settled,
    allPaused: !settled && active + waiting === 0,
    status,
    segments: segmentsOf(entries),
    current: current ? { fileId: current.fileId, name: current.name } : undefined,
  };

  const rows = entries.filter(
    (e) => !folded.has(e.key) && !(batch && batch.keys.has(e.key) && e.state === "queued"),
  );
  const shown = entries.length > 0 && !dismissed;
  const dropFolder = dropTarget?.folderName ?? "";

  useEffect(() => {
    let depth = 0;
    const reset = () => {
      depth = 0;
      setIntent(null);
      setOver(false);
    };
    const onEnter = (e: DragEvent) => {
      const kind = dropKind(e.dataTransfer);
      if (!kind) return;
      depth += 1;
      if (depth === 1) setIntent({ kind, count: dropCount(e.dataTransfer, kind) });
    };
    const onLeave = (e: DragEvent) => {
      if (!dropKind(e.dataTransfer)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) reset();
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", reset);
    window.addEventListener("dragend", reset);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", reset);
      window.removeEventListener("dragend", reset);
    };
  }, []);

  const dropHandlers = {
    onDragEnter: (e: ReactDragEvent) => {
      if (!dropKind(e.dataTransfer)) return;
      e.preventDefault();
      setOver(true);
    },
    onDragOver: (e: ReactDragEvent) => {
      if (!dropKind(e.dataTransfer)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (e: ReactDragEvent) => {
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setOver(false);
    },
    onDrop: (e: ReactDragEvent) => {
      const kind = dropKind(e.dataTransfer);
      if (!kind) return;
      e.preventDefault();
      e.stopPropagation();
      setIntent(null);
      setOver(false);
      const target = useTransferDockStore.getState().dropTarget;
      if (!target) return;
      if (kind === "download") {
        const ids = droppedIds(e.dataTransfer);
        if (ids.length > 0) target.download(ids);
        return;
      }
      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length > 0) target.upload(files);
    },
  };

  const dockRef = useRef<HTMLDivElement>(null);
  const reportDock = useTransferDockStore((s) => s.report);
  useLayoutEffect(() => {
    const el = dockRef.current;
    if (!shown || !el) {
      reportDock(false, 0);
      return;
    }
    const measure = () => reportDock(true, el.offsetHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [shown, collapsed, isPhone, rows.length, reportDock]);

  if (!shown) return null;

  const live = (
    <p className="sr-only" aria-live="polite">
      {sentenceText}
    </p>
  );

  if (collapsed) {
    return (
      <div
        ref={dockRef}
        role="region"
        aria-label={t("title")}
        {...dropHandlers}
        className={cn(
          "fixed z-40",
          isPhone
            ? "end-4 bottom-[calc(5rem+var(--safe-bottom))] transition-opacity duration-700"
            : "end-4 bottom-4 w-[380px]",
          orbDone && "opacity-80",
        )}
      >
        {live}
        {isPhone ? (
          <TransferOrb
            summary={summary}
            intent={intent}
            onOpen={() => setMinimized(false)}
            onLongPress={() => (pausable.length > 0 ? pauseAll() : resumeAll())}
          />
        ) : (
          <SlimBar
            summary={summary}
            intent={intent}
            folderName={dropFolder}
            onOpen={() => setMinimized(false)}
          />
        )}
      </div>
    );
  }

  const batchFolder = batch ? folderName(batch.items[0].folderId ?? null) : "";
  const batchPhotos = batch ? batch.items.every((e) => isPhoto(e.name)) : false;
  const batchThumbs = batch
    ? [...batch.items]
        .sort((a, b) => Number(!!b.fileId) - Number(!!a.fileId))
        .slice(0, 3)
        .map((e) => ({ key: e.key, fileId: e.fileId, name: e.name }))
    : [];

  return (
    <div
      ref={dockRef}
      role="region"
      aria-label={t("title")}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          setMinimized(true);
        }
      }}
      {...dropHandlers}
      className="fixed inset-x-2 bottom-[calc(5rem+var(--safe-bottom))] z-40 overflow-hidden rounded-[18px] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl md:inset-x-auto md:end-4 md:bottom-4 md:w-[380px]"
      style={
        over && intent
          ? { borderColor: intent.kind === "upload" ? TONE.accent : TONE.ok }
          : undefined
      }
    >
      {live}
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] py-3 ps-3.5 pe-2.5">
        <span title={[t("lockTip"), speedLine].filter(Boolean).join(" · ")}>
          <ProgressRing size={38} stroke={3.5} percent={percent}>
            <Lock
              className="relative h-4 w-4"
              weight="bold"
              style={{ color: TONE.accent }}
              aria-hidden="true"
            />
          </ProgressRing>
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-[14.5px] font-bold text-[var(--color-text)]">
            <span className="tabular-nums" data-header-count>
              {done}/{entries.length}
            </span>
            {status && (
              <span className="font-medium text-[var(--color-text-muted)]"> · {status}</span>
            )}
          </p>
          <p className="truncate text-xs text-[var(--color-text-muted)]" data-header-sub>
            {speedLine || sentenceText}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMinimized(true)}
          aria-label={t("minimize")}
          aria-expanded={true}
          className="grid h-[30px] w-[30px] flex-none place-items-center rounded-[9px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          <ChevronDown className="h-4 w-4" weight="bold" />
        </button>
        <button
          type="button"
          onClick={() => {
            if (!settled) {
              setMinimized(true);
              return;
            }
            clearDone();
            setDismissed(true);
          }}
          aria-label={t("close")}
          className="grid h-[30px] w-[30px] flex-none place-items-center rounded-[9px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          <X className="h-4 w-4" weight="bold" />
        </button>
      </div>

      {batch && (
        <BatchBlock
          title={t(batchPhotos ? "batch.titlePhotos" : "batch.titleFiles", {
            count: batch.items.length,
            folder: batchFolder,
          })}
          thumbs={batchThumbs}
          segments={segmentsOf(batch.items)}
        />
      )}

      {rows.length > 0 && (
        <div className="max-h-[min(50vh,360px)] divide-y divide-[color-mix(in_oklab,var(--color-border)_70%,transparent)] overflow-y-auto overscroll-contain">
          {rows.map((entry) => (
            <TransferItem key={entry.key} entry={entry} controls={controls} canHover={canHover} />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] px-3.5 py-2 text-xs">
        <span>
          {failed > 0 && (
            <button
              type="button"
              onClick={retryFailed}
              className="rounded-lg bg-[var(--color-surface-1)] px-3 py-1.5 font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            >
              {t("retryFailed")}
            </button>
          )}
        </span>
        <span className="flex items-center gap-1">
          {pausable.length > 0 ? (
            <FooterLink onClick={pauseAll}>{t("pauseAll")}</FooterLink>
          ) : resumable.length > 0 ? (
            <FooterLink onClick={resumeAll}>{t("resumeAll")}</FooterLink>
          ) : null}
          {entries.some((e) => e.state === "done" || e.state === "cancelled") && (
            <FooterLink onClick={clearDone}>{t("clearDone")}</FooterLink>
          )}
        </span>
      </div>

      {over && intent && <DropOverlay intent={intent} folderName={dropFolder} />}
    </div>
  );
}

function FooterLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md px-1.5 py-1 font-semibold text-[var(--color-accent)] hover:bg-[var(--color-surface-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
    >
      {children}
    </button>
  );
}
