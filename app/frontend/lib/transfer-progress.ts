/**
 * Plain-language progress for the transfer panel. Every raw upload/download
 * stage, percent and error string the stores emit is folded here, in one
 * place, into a phase, a 0-100 bar that never goes backwards, and a message
 * key (relative to the `app.transfer` namespace) with its values.
 */

export type TransferDirection = "upload" | "download";

export type TransferPhase =
  | "ready"
  | "securing"
  | "sending"
  | "checking"
  | "saved"
  | "fetching"
  | "unlocking"
  | "saving"
  | "downloaded"
  | "queued"
  | "choose"
  | "paused"
  | "offline"
  | "failed"
  | "stopped";

/** A message key under `app.transfer` plus its values; values may nest labels. */
export interface TransferLabel {
  key: string;
  values?: Record<string, string | number | TransferLabel>;
}

/** What one row shows: the step, the bar width and the sentence. */
export interface TransferView {
  phase: TransferPhase;
  bar: number;
  label: TransferLabel;
}

/** Raw upload fields, exactly as the upload store keeps them. */
export interface UploadProgressInput {
  status: "queued" | "encrypting" | "uploading" | "paused" | "done" | "failed";
  progress: number;
  stage?: string;
  bytesProcessed?: number;
  totalBytes?: number;
  error?: string;
  etaSeconds?: number;
}

/** Raw download fields, exactly as the download store keeps them. */
export interface DownloadProgressInput {
  status: "queued" | "downloading" | "paused" | "done" | "failed" | "cancelled";
  progress: number;
  stage?: string;
  fileSize?: number;
  error?: string;
  etaSeconds?: number;
}

/** Context a row needs beyond its own item. */
export interface ProgressContext {
  online: boolean;
  folderName: string;
  /** The bar this item showed last time: the new bar never drops below it. */
  prevBar?: number;
  /** Localized error texts the stores emit already translated (e.g. no platform). */
  noPlatformText?: string;
}

const clamp01 = (n: number) => (n > 0 ? (n < 1 ? n : 1) : 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

const UNITS = ["B", "KB", "MB", "GB", "TB"];

/** "2.8" and "4.8 MB": both sides in the unit of the total. */
export function bytePair(done: number, total: number): { done: string; total: string } {
  const exp =
    total > 0 ? Math.min(UNITS.length - 1, Math.floor(Math.log(total) / Math.log(1024))) : 0;
  const scale = 1024 ** exp;
  const fmt = (n: number) => String(parseFloat((n / scale).toFixed(1)));
  return { done: fmt(Math.min(done, total)), total: `${fmt(total)} ${UNITS[exp]}` };
}

/** Rounded, human time left: a few seconds, about 40 s, about 2 min, about 2 h 10 min. */
export function timeLeftLabel(seconds: number | undefined): TransferLabel | undefined {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return undefined;
  if (seconds < 10) return { key: "time.fewSeconds" };
  const fives = Math.max(10, Math.round(seconds / 5) * 5);
  if (fives < 60) return { key: "time.seconds", values: { count: fives } };
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return { key: "time.minutes", values: { count: minutes } };
  let hours = Math.floor(seconds / 3600);
  let rest = Math.round((seconds - hours * 3600) / 300) * 5;
  if (rest === 60) {
    hours += 1;
    rest = 0;
  }
  if (rest === 0) return { key: "time.hours", values: { hours } };
  return { key: "time.hoursMinutes", values: { hours, minutes: rest } };
}

/** Seconds left from elapsed time and percent, for transfers without a byte rate. */
export function remainingFromElapsed(
  startedAt: number,
  percent: number,
  now: number,
): number | undefined {
  if (percent <= 1 || percent >= 100) return undefined;
  const elapsed = (now - startedAt) / 1000;
  if (elapsed < 3) return undefined;
  return Math.max(0, elapsed / (percent / 100) - elapsed);
}

const NETWORK =
  /can't reach|network|failed to fetch|\bload failed|timed? ?out|connection|dns|offline|unreachable/i;

/** Map a raw error string to a cause and, where there is one, the fix. */
export function errorLabel(
  direction: TransferDirection,
  error: string | undefined,
  percent: number,
  noPlatformText?: string,
): TransferLabel {
  const e = error ?? "";
  if (/^Too large to download/i.test(e)) return { key: "errors.tooBigDownload" };
  if (/^Too large to ZIP/i.test(e)) return { key: "errors.tooBigZip" };
  if (/^Choose where to save the ZIP/i.test(e)) return { key: "errors.chooseZip" };
  if (
    /no storage platform|storage not available/i.test(e) ||
    (!!noPlatformText && e === noPlatformText)
  )
    return { key: "errors.noPlatform" };
  if (/unlock your vault/i.test(e)) return { key: "errors.vaultLocked" };
  if (/folder/i.test(e) && /password|locked|unlock/i.test(e)) return { key: "errors.unlockFolder" };
  if (/wrong|password|passphrase|decrypt|key mismatch/i.test(e)) return { key: "errors.wrongKey" };
  if (/integrity|corrupt|hash/i.test(e)) return { key: "errors.damaged" };
  if (/\b413\b|too large|too big/i.test(e)) return { key: "errors.tooBigUpload" };
  if (/quota|storage full|insufficient/i.test(e)) return { key: "errors.storageFull" };
  if (NETWORK.test(e)) {
    const values = { percent: Math.round(percent) };
    return { key: direction === "upload" ? "errors.dropped" : "errors.droppedDownload", values };
  }
  return { key: direction === "upload" ? "errors.sendFailed" : "errors.downloadFailed" };
}

function settle(phase: TransferPhase, estimate: number, prevBar: number | undefined): number {
  if (phase === "saved" || phase === "downloaded") return 100;
  return Math.min(99, Math.max(prevBar ?? 0, estimate));
}

function uploadEstimate(i: UploadProgressInput): { phase: TransferPhase; bar: number } {
  const stage = i.stage ?? "";
  const total = i.totalBytes ?? 0;
  const bytes = i.bytesProcessed ?? 0;
  const frac = total > 0 ? clamp01(bytes / total) : 0;
  if (/^finaliz/i.test(stage)) return { phase: "checking", bar: 98 };
  const hashing = /^Hashing file…(?: (\d+)%)?$/.exec(stage);
  if (hashing) return { phase: "ready", bar: 1 + (5 * Number(hashing[1] ?? 0)) / 100 };
  if (stage === "hashing") return { phase: "ready", bar: 1 + 5 * frac };
  if (/^deriving/i.test(stage)) return { phase: "ready", bar: 6 };
  if (/^(Starting upload session|Waiting for slot)/.test(stage)) return { phase: "ready", bar: 7 };
  if (bytes > 0 && total > 0) return { phase: "sending", bar: 20 + 77 * frac };
  if (i.status === "uploading" && i.progress >= 10)
    return { phase: "sending", bar: 20 + 77 * clamp01((i.progress - 3) / 92) };
  if (i.status === "uploading" || /^(encrypting|processing|uploading)/i.test(stage))
    return { phase: "securing", bar: 12 };
  return { phase: "ready", bar: Math.min(7, Math.max(0, i.progress) * 2) };
}

function sendingLabel(i: UploadProgressInput): TransferLabel {
  const total = i.totalBytes ?? 0;
  const bytes = i.bytesProcessed ?? 0;
  if (total > 0 && bytes > 0)
    return { key: "progress.sendingBytes", values: bytePair(bytes, total) };
  const time = timeLeftLabel(i.etaSeconds);
  return time ? { key: "progress.sendingEta", values: { time } } : { key: "progress.sending" };
}

/** Phase, monotonic bar and sentence for one upload. */
export function describeUpload(i: UploadProgressInput, ctx: ProgressContext): TransferView {
  const est = uploadEstimate(i);
  const stage = i.stage ?? "";
  let phase: TransferPhase;
  if (i.status === "done") phase = "saved";
  else if (i.status === "failed") phase = "failed";
  else if (i.status === "paused") phase = "paused";
  else if (!ctx.online) phase = "offline";
  else if (i.status === "queued")
    phase = /^(Waiting for slot|Retrying)/.test(stage) ? "ready" : "queued";
  else phase = est.phase;
  const bar = settle(phase, est.bar, ctx.prevBar);
  let label: TransferLabel;
  switch (phase) {
    case "saved":
      label = { key: "progress.savedTo", values: { folder: ctx.folderName } };
      break;
    case "failed":
      label = errorLabel("upload", i.error, bar, ctx.noPlatformText);
      break;
    case "sending":
      label = sendingLabel(i);
      break;
    default:
      label = { key: `progress.${phase}` };
  }
  return { phase, bar, label };
}

function downloadEstimate(i: DownloadProgressInput): { phase: TransferPhase; bar: number } {
  if (i.progress >= 96) return { phase: "saving", bar: 97 };
  if (i.progress >= 93) return { phase: "unlocking", bar: 92 };
  return { phase: "fetching", bar: Math.min(88, Math.max(0, i.progress)) };
}

function fetchingLabel(i: DownloadProgressInput): TransferLabel {
  const size = i.fileSize ?? 0;
  const frac = clamp01((i.progress - 2) / 90);
  if (size > 0 && frac > 0)
    return { key: "progress.fetchingBytes", values: bytePair(round1(size * frac), size) };
  const time = timeLeftLabel(i.etaSeconds);
  return time ? { key: "progress.fetchingEta", values: { time } } : { key: "progress.fetching" };
}

/** Phase, monotonic bar and sentence for one download. */
export function describeDownload(i: DownloadProgressInput, ctx: ProgressContext): TransferView {
  const est = downloadEstimate(i);
  let phase: TransferPhase;
  if (i.status === "done") phase = "downloaded";
  else if (i.status === "failed") phase = "failed";
  else if (i.status === "cancelled") phase = "stopped";
  else if (i.status === "paused") phase = "paused";
  else if (!ctx.online) phase = "offline";
  else if (i.status === "queued") phase = /^Choose where/.test(i.stage ?? "") ? "choose" : "queued";
  else phase = est.phase;
  const bar = settle(phase, est.bar, ctx.prevBar);
  let label: TransferLabel;
  if (phase === "failed") label = errorLabel("download", i.error, bar, ctx.noPlatformText);
  else if (phase === "fetching") label = fetchingLabel(i);
  else label = { key: `progress.${phase}` };
  return { phase, bar, label };
}

/** Counts behind the header sentence. */
export interface BatchCounts {
  direction: TransferDirection;
  done: number;
  failed: number;
  active: number;
  waiting: number;
  paused: number;
  photos: boolean;
  folderName: string;
  online: boolean;
}

/** One sentence about what the whole batch is doing right now. */
export function batchSentence(c: BatchCounts): TransferLabel {
  const open = c.active + c.waiting + c.paused;
  if (open === 0) {
    if (c.failed > 0 && c.done === 0)
      return { key: "batch.allFailed", values: { failed: c.failed } };
    if (c.direction === "download")
      return c.failed > 0
        ? { key: "batch.downloadedSomeFailed", values: { count: c.done, failed: c.failed } }
        : { key: "batch.downloaded", values: { count: c.done } };
    return c.failed > 0
      ? {
          key: "batch.savedSomeFailed",
          values: { count: c.done, folder: c.folderName, failed: c.failed },
        }
      : { key: "batch.saved", values: { count: c.done, folder: c.folderName } };
  }
  if (!c.online) return { key: "batch.offline" };
  if (c.active === 0)
    return c.paused > 0
      ? { key: "batch.paused", values: { count: open } }
      : { key: "batch.waiting", values: { count: c.waiting } };
  const values = { active: c.active, waiting: c.waiting + c.paused };
  if (c.direction === "download") return { key: "batch.downloading", values };
  return { key: c.photos ? "batch.sendingPhotos" : "batch.sendingFiles", values };
}

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** Resolve a label (and any nested labels in its values) through a translator. */
export function translateLabel(t: Translate, label: TransferLabel): string {
  if (!label.values) return t(label.key);
  const values: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(label.values))
    values[k] = typeof v === "object" ? translateLabel(t, v) : v;
  return t(label.key, values);
}
