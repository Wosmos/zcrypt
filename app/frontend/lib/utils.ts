import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { isAudioFile, isVideoFile, mediaMimeFor, extOf } from "@/lib/media-formats";
import {
  File as FileIcon,
  FileText,
  Table,
  Image as ImageIcon,
  Video,
  Music,
  Archive,
  Code,
  Cog,
} from "@/lib/icons";
import type { FileMetadata } from "@/types";

// Re-exported so existing importers of `@/lib/utils` keep working while the
// canonical lists live in lib/media-formats.
export { isVideoFile };

// Re-exported from lib/utils for import ergonomics so the many inline
// `filename.split('.').pop()` sites can adopt the ONE canonical extractor
// without reaching into lib/media-formats directly. Canonical impl still lives
// in lib/media-formats.
export { extOf };

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

export interface FileTypeInfo {
  icon: string;
  color: string;
  bg: string;
  label: string;
  gradient: string;
}

export function getFileTypeInfo(filename: string): FileTypeInfo {
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  const typeMap: Record<string, FileTypeInfo> = {
    // Documents
    pdf: { icon: "FileText", color: "text-rose-500", bg: "bg-rose-500/10", label: "Document", gradient: "from-rose-500/20 to-rose-500/5" },
    doc: { icon: "FileText", color: "text-rose-500", bg: "bg-rose-500/10", label: "Document", gradient: "from-rose-500/20 to-rose-500/5" },
    docx: { icon: "FileText", color: "text-rose-500", bg: "bg-rose-500/10", label: "Document", gradient: "from-rose-500/20 to-rose-500/5" },
    txt: { icon: "FileText", color: "text-rose-500", bg: "bg-rose-500/10", label: "Document", gradient: "from-rose-500/20 to-rose-500/5" },
    md: { icon: "FileText", color: "text-rose-500", bg: "bg-rose-500/10", label: "Document", gradient: "from-rose-500/20 to-rose-500/5" },
    markdown: { icon: "FileText", color: "text-rose-500", bg: "bg-rose-500/10", label: "Document", gradient: "from-rose-500/20 to-rose-500/5" },
    rtf: { icon: "FileText", color: "text-rose-500", bg: "bg-rose-500/10", label: "Document", gradient: "from-rose-500/20 to-rose-500/5" },
    odt: { icon: "FileText", color: "text-rose-500", bg: "bg-rose-500/10", label: "Document", gradient: "from-rose-500/20 to-rose-500/5" },
    ppt: { icon: "FileText", color: "text-rose-500", bg: "bg-rose-500/10", label: "Document", gradient: "from-rose-500/20 to-rose-500/5" },
    pptx: { icon: "FileText", color: "text-rose-500", bg: "bg-rose-500/10", label: "Document", gradient: "from-rose-500/20 to-rose-500/5" },
    // Spreadsheets
    xls: { icon: "Table", color: "text-emerald-500", bg: "bg-emerald-500/10", label: "Spreadsheet", gradient: "from-emerald-500/20 to-emerald-500/5" },
    xlsx: { icon: "Table", color: "text-emerald-500", bg: "bg-emerald-500/10", label: "Spreadsheet", gradient: "from-emerald-500/20 to-emerald-500/5" },
    csv: { icon: "Table", color: "text-emerald-500", bg: "bg-emerald-500/10", label: "Spreadsheet", gradient: "from-emerald-500/20 to-emerald-500/5" },
    // Images
    jpg: { icon: "Image", color: "text-violet-500", bg: "bg-violet-500/10", label: "Image", gradient: "from-violet-500/20 to-violet-500/5" },
    jpeg: { icon: "Image", color: "text-violet-500", bg: "bg-violet-500/10", label: "Image", gradient: "from-violet-500/20 to-violet-500/5" },
    png: { icon: "Image", color: "text-violet-500", bg: "bg-violet-500/10", label: "Image", gradient: "from-violet-500/20 to-violet-500/5" },
    gif: { icon: "Image", color: "text-violet-500", bg: "bg-violet-500/10", label: "Image", gradient: "from-violet-500/20 to-violet-500/5" },
    webp: { icon: "Image", color: "text-violet-500", bg: "bg-violet-500/10", label: "Image", gradient: "from-violet-500/20 to-violet-500/5" },
    svg: { icon: "Image", color: "text-violet-500", bg: "bg-violet-500/10", label: "Image", gradient: "from-violet-500/20 to-violet-500/5" },
    bmp: { icon: "Image", color: "text-violet-500", bg: "bg-violet-500/10", label: "Image", gradient: "from-violet-500/20 to-violet-500/5" },
    ico: { icon: "Image", color: "text-violet-500", bg: "bg-violet-500/10", label: "Image", gradient: "from-violet-500/20 to-violet-500/5" },
    // Video
    mp4: { icon: "Video", color: "text-blue-500", bg: "bg-blue-500/10", label: "Video", gradient: "from-blue-500/20 to-blue-500/5" },
    mov: { icon: "Video", color: "text-blue-500", bg: "bg-blue-500/10", label: "Video", gradient: "from-blue-500/20 to-blue-500/5" },
    avi: { icon: "Video", color: "text-blue-500", bg: "bg-blue-500/10", label: "Video", gradient: "from-blue-500/20 to-blue-500/5" },
    mkv: { icon: "Video", color: "text-blue-500", bg: "bg-blue-500/10", label: "Video", gradient: "from-blue-500/20 to-blue-500/5" },
    webm: { icon: "Video", color: "text-blue-500", bg: "bg-blue-500/10", label: "Video", gradient: "from-blue-500/20 to-blue-500/5" },
    // Audio
    mp3: { icon: "Music", color: "text-pink-500", bg: "bg-pink-500/10", label: "Audio", gradient: "from-pink-500/20 to-pink-500/5" },
    wav: { icon: "Music", color: "text-pink-500", bg: "bg-pink-500/10", label: "Audio", gradient: "from-pink-500/20 to-pink-500/5" },
    flac: { icon: "Music", color: "text-pink-500", bg: "bg-pink-500/10", label: "Audio", gradient: "from-pink-500/20 to-pink-500/5" },
    aac: { icon: "Music", color: "text-pink-500", bg: "bg-pink-500/10", label: "Audio", gradient: "from-pink-500/20 to-pink-500/5" },
    ogg: { icon: "Music", color: "text-pink-500", bg: "bg-pink-500/10", label: "Audio", gradient: "from-pink-500/20 to-pink-500/5" },
    m4a: { icon: "Music", color: "text-pink-500", bg: "bg-pink-500/10", label: "Audio", gradient: "from-pink-500/20 to-pink-500/5" },
    // Archives
    zip: { icon: "Archive", color: "text-amber-500", bg: "bg-amber-500/10", label: "Archive", gradient: "from-amber-500/20 to-amber-500/5" },
    rar: { icon: "Archive", color: "text-amber-500", bg: "bg-amber-500/10", label: "Archive", gradient: "from-amber-500/20 to-amber-500/5" },
    "7z": { icon: "Archive", color: "text-amber-500", bg: "bg-amber-500/10", label: "Archive", gradient: "from-amber-500/20 to-amber-500/5" },
    tar: { icon: "Archive", color: "text-amber-500", bg: "bg-amber-500/10", label: "Archive", gradient: "from-amber-500/20 to-amber-500/5" },
    gz: { icon: "Archive", color: "text-amber-500", bg: "bg-amber-500/10", label: "Archive", gradient: "from-amber-500/20 to-amber-500/5" },
    bz2: { icon: "Archive", color: "text-amber-500", bg: "bg-amber-500/10", label: "Archive", gradient: "from-amber-500/20 to-amber-500/5" },
    // Code
    js: { icon: "Code", color: "text-yellow-500", bg: "bg-yellow-500/10", label: "Code", gradient: "from-yellow-500/20 to-yellow-500/5" },
    ts: { icon: "Code", color: "text-blue-500", bg: "bg-blue-500/10", label: "Code", gradient: "from-blue-500/20 to-blue-500/5" },
    tsx: { icon: "Code", color: "text-blue-500", bg: "bg-blue-500/10", label: "Code", gradient: "from-blue-500/20 to-blue-500/5" },
    jsx: { icon: "Code", color: "text-yellow-500", bg: "bg-yellow-500/10", label: "Code", gradient: "from-yellow-500/20 to-yellow-500/5" },
    py: { icon: "Code", color: "text-emerald-500", bg: "bg-emerald-500/10", label: "Code", gradient: "from-emerald-500/20 to-emerald-500/5" },
    go: { icon: "Code", color: "text-cyan-500", bg: "bg-cyan-500/10", label: "Code", gradient: "from-cyan-500/20 to-cyan-500/5" },
    rs: { icon: "Code", color: "text-orange-500", bg: "bg-orange-500/10", label: "Code", gradient: "from-orange-500/20 to-orange-500/5" },
    java: { icon: "Code", color: "text-red-500", bg: "bg-red-500/10", label: "Code", gradient: "from-red-500/20 to-red-500/5" },
    cpp: { icon: "Code", color: "text-indigo-500", bg: "bg-indigo-500/10", label: "Code", gradient: "from-indigo-500/20 to-indigo-500/5" },
    c: { icon: "Code", color: "text-indigo-500", bg: "bg-indigo-500/10", label: "Code", gradient: "from-indigo-500/20 to-indigo-500/5" },
    html: { icon: "Code", color: "text-orange-500", bg: "bg-orange-500/10", label: "Code", gradient: "from-orange-500/20 to-orange-500/5" },
    css: { icon: "Code", color: "text-blue-400", bg: "bg-blue-400/10", label: "Code", gradient: "from-blue-400/20 to-blue-400/5" },
    json: { icon: "Code", color: "text-emerald-500", bg: "bg-emerald-500/10", label: "Data", gradient: "from-emerald-500/20 to-emerald-500/5" },
    xml: { icon: "Code", color: "text-emerald-500", bg: "bg-emerald-500/10", label: "Data", gradient: "from-emerald-500/20 to-emerald-500/5" },
    yaml: { icon: "Code", color: "text-emerald-500", bg: "bg-emerald-500/10", label: "Data", gradient: "from-emerald-500/20 to-emerald-500/5" },
    yml: { icon: "Code", color: "text-emerald-500", bg: "bg-emerald-500/10", label: "Data", gradient: "from-emerald-500/20 to-emerald-500/5" },
    // Executables
    exe: { icon: "Cog", color: "text-orange-500", bg: "bg-orange-500/10", label: "Executable", gradient: "from-orange-500/20 to-orange-500/5" },
    dmg: { icon: "Cog", color: "text-orange-500", bg: "bg-orange-500/10", label: "Executable", gradient: "from-orange-500/20 to-orange-500/5" },
    msi: { icon: "Cog", color: "text-orange-500", bg: "bg-orange-500/10", label: "Executable", gradient: "from-orange-500/20 to-orange-500/5" },
    app: { icon: "Cog", color: "text-orange-500", bg: "bg-orange-500/10", label: "Executable", gradient: "from-orange-500/20 to-orange-500/5" },
    // Fonts
    ttf: { icon: "File", color: "text-fuchsia-500", bg: "bg-fuchsia-500/10", label: "Font", gradient: "from-fuchsia-500/20 to-fuchsia-500/5" },
    otf: { icon: "File", color: "text-fuchsia-500", bg: "bg-fuchsia-500/10", label: "Font", gradient: "from-fuchsia-500/20 to-fuchsia-500/5" },
    woff: { icon: "File", color: "text-fuchsia-500", bg: "bg-fuchsia-500/10", label: "Font", gradient: "from-fuchsia-500/20 to-fuchsia-500/5" },
    woff2: { icon: "File", color: "text-fuchsia-500", bg: "bg-fuchsia-500/10", label: "Font", gradient: "from-fuchsia-500/20 to-fuchsia-500/5" },
  };

  if (typeMap[ext]) return typeMap[ext];
  // Broad audio/video recognition (mpeg, wma, mkv, flv, 3gp, …) beyond the
  // explicit entries above, so any known media gets the right icon + label.
  if (isVideoFile(filename)) {
    return { icon: "Video", color: "text-blue-500", bg: "bg-blue-500/10", label: "Video", gradient: "from-blue-500/20 to-blue-500/5" };
  }
  if (isAudioFile(filename)) {
    return { icon: "Music", color: "text-pink-500", bg: "bg-pink-500/10", label: "Audio", gradient: "from-pink-500/20 to-pink-500/5" };
  }
  return { icon: "File", color: "text-[var(--color-text-muted)]", bg: "bg-[var(--color-surface-1)]", label: "File", gradient: "from-gray-500/20 to-gray-500/5" };
}

export function getFileCategory(filename: string): string {
  return getFileTypeInfo(filename).label;
}

export function isImageFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "avif"].includes(ext);
}

// isVideoFile is re-exported at the top of this file from lib/media-formats.

/**
 * Best-guess MIME type from a file extension. Used to type decrypted Blobs so
 * the browser will actually decode them — an <img> won't render an SVG (or a
 * <video> a clip) if the Blob is `application/octet-stream`. Unknown types fall
 * back to octet-stream.
 */
export function mimeForFile(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
    webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp", ico: "image/x-icon",
    avif: "image/avif",
  };
  return map[ext] || mediaMimeFor(filename) || "application/octet-stream";
}

// Keep backward compat
export function getFileIcon(filename: string): string {
  return getFileTypeInfo(filename).icon;
}

/** Compute estimated time remaining from a start timestamp and current 0-100 percent. */
export function formatEta(startedAt: number, percent: number): string | undefined {
  if (percent <= 1 || percent >= 100) return undefined;
  const elapsed = (Date.now() - startedAt) / 1000; // seconds
  if (elapsed < 3) return undefined; // not enough data yet
  const total = elapsed / (percent / 100);
  const remaining = Math.max(0, total - elapsed);

  if (remaining < 60) return `~${Math.ceil(remaining)}s left`;
  if (remaining < 3600) return `~${Math.ceil(remaining / 60)}m left`;
  const h = Math.floor(remaining / 3600);
  const m = Math.ceil((remaining % 3600) / 60);
  return `~${h}h ${m}m left`;
}

/** Map raw 0-100 progress through a logarithmic ease-out curve.
 *  Produces fast initial movement that gradually slows toward 100%.
 *  Use for display only — keep raw percent for ETA math. */
export function easeProgress(raw: number): number {
  const p = Math.min(100, Math.max(0, raw));
  if (p <= 0) return 0;
  if (p >= 100) return 100;
  return Math.round(100 * Math.log10(1 + 9 * p / 100));
}

/**
 * Middle-truncate a file or folder name the way Apple does:
 * "muhammad_wasif_manki.pdf" → "muhammad…ki.pdf"
 *
 * Files: the extension is always preserved; truncation happens in the base name.
 * Folders / names without an extension: plain middle-truncation.
 *
 * @param name  - original name
 * @param start - chars to keep from the start (default 10)
 * @param end   - chars to keep from the end of the base name, before the extension (default 4)
 */
export function midTrunc(name: string, start = 10, end = 4): string {
  const dotIdx = name.lastIndexOf(".");
  const hasExt = dotIdx > 0 && dotIdx < name.length - 1 && name.length - dotIdx <= 6;
  const base = hasExt ? name.slice(0, dotIdx) : name;
  const ext  = hasExt ? name.slice(dotIdx) : "";

  if (base.length <= start + end + 1) return name;
  return base.slice(0, start) + "…" + base.slice(-end) + ext;
}

// ─── Shared severity union ───────────────────────────────────────────────────

/** The one 4-member severity union shared by toasts, notifications, and any
 *  other status-styled UI. Store-local aliases (ToastType, NotificationType)
 *  should be `= Severity`. */
export type Severity = "success" | "error" | "warning" | "info";

// ─── Date / time formatting ──────────────────────────────────────────────────

/**
 * ABSOLUTE date + time, e.g. "Jul 8, 2026, 09:41 PM". THE canonical replacement
 * for the hand-copied local `formatDate(iso)` absolute formatters (integrity /
 * snapshots / expiring tabs, dead-man switch, details drawer). Distinct from the
 * RELATIVE `formatDate` in this same file — do NOT route one through the other.
 * `opts.seconds` adds a 2-digit seconds field (covers audit-log's formatFullTime;
 * note that adopting this also forces the "en-US" locale on that site).
 */
export function formatDateTime(iso: string | number | Date, opts?: { seconds?: boolean }): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(opts?.seconds ? { second: "2-digit" } : {}),
  });
}

/**
 * Date-only, e.g. "Jul 8, 2026". For date-only displays and the bare
 * `.toLocaleDateString()` admin/settings sites — adopting this forces "en-US"
 * on those locale-default sites (intended).
 */
export function formatDateShort(iso: string | number | Date): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * ONE relative "X ago" policy. Accepts an ISO string, an epoch-ms number, or a
 * Date. Lowercase "just now"; single 30-day cutoff after which it falls back to
 * formatDateShort. Distinct from the RELATIVE `formatDate` (which uses "Just
 * now" and a 7-day cutoff) — that one may optionally delegate here later, but
 * they are not merged.
 */
export function formatRelativeTime(input: string | number | Date): string {
  const ts = input instanceof Date ? input.getTime() : typeof input === "number" ? input : new Date(input).getTime();
  const diff = Date.now() - ts;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDateShort(ts);
}

/**
 * Seconds -> clock string. Options-driven so both callers adopt without any
 * visual change:
 *   - media player: `formatDuration(s)` → "m:ss" (unpadded minutes), or
 *     "h:mm:ss" once an hour is present. Non-finite / negative → "0:00".
 *   - vault-lock countdown: `formatDuration(s, { padMinutes: true, showHours: false })`
 *     → "mm:ss" (padded minutes, never rolls into an hours field, e.g. 90:00).
 */
export function formatDuration(totalSeconds: number, opts?: { padMinutes?: boolean; showHours?: boolean }): string {
  const { padMinutes = false, showHours = true } = opts ?? {};
  const safe = !Number.isFinite(totalSeconds) || totalSeconds < 0 ? 0 : Math.floor(totalSeconds);
  const s = safe % 60;
  const ss = String(s).padStart(2, "0");
  if (showHours && safe >= 3600) {
    const h = Math.floor(safe / 3600);
    const m = Math.floor((safe % 3600) / 60);
    return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  }
  const m = showHours ? Math.floor((safe % 3600) / 60) : Math.floor(safe / 60);
  const mm = padMinutes ? String(m).padStart(2, "0") : String(m);
  return `${mm}:${ss}`;
}

/**
 * Future timestamp -> coarse countdown: "Xd Xh" (>= a day out), "Xh Xm"
 * (otherwise), or "Expired" once elapsed. Sits beside formatEta; also covers the
 * expiring-tab `timeUntil` helper.
 */
export function formatExpiry(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

/** Share-link expiry choices, shared by the file details drawer and both share modals. */
export const EXPIRY_OPTIONS = [
  { label: "Never", value: 0 },
  { label: "1 hour", value: 1 },
  { label: "24 hours", value: 24 },
  { label: "7 days", value: 168 },
  { label: "30 days", value: 720 },
];

/** YYYY-MM-DD in LOCAL time (avoids the UTC drift toISOString() causes). */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Size / number formatting ────────────────────────────────────────────────

/** Clamped space-saving percentage as a whole-number string (no "%" suffix).
 *  `((1 - compared/original) * 100)`, floored at 0, with an original<=0 guard.
 *  Callers pass their own field (encrypted_size vs compressed_size) so the
 *  semantics stay per-site. */
export function savingsPercent(original: number, compared: number): string {
  if (original <= 0) return "0";
  return Math.max(0, (1 - compared / original) * 100).toFixed(0);
}

/** GB -> bytes (*1024^3). */
export function gbToBytes(gb: number): number {
  return gb * 1024 * 1024 * 1024;
}

/** bytes -> GB (/1024^3). */
export function bytesToGb(bytes: number): number {
  return bytes / (1024 * 1024 * 1024);
}

/** used/max as a 0-100 percentage, clamped at 100; 0 when max<=0. */
export function usagePercent(used: number, max: number): number {
  return max > 0 ? Math.min(100, (used / max) * 100) : 0;
}

// ─── String helpers ──────────────────────────────────────────────────────────

/** Middle-truncate an opaque string (hash / id / token) as "head…tail". NOT the
 *  extension-aware midTrunc (that one stays for filenames). Returns the input
 *  unchanged when it's already short enough. */
export function truncateMiddle(s: string, head = 6, tail = 6): string {
  if (s.length <= head + tail + 1) return s;
  return s.slice(0, head) + "…" + s.slice(-tail);
}

// ─── File helpers ────────────────────────────────────────────────────────────

/** Map getFileTypeInfo(filename).icon (a string) to the Hugeicon component via
 *  ONE internal table, falling back to File. Replaces the 8+ local `iconMap` +
 *  `|| File` copies. */
const FILE_ICON_MAP: Record<string, typeof FileIcon> = {
  File: FileIcon,
  FileText,
  Table,
  Image: ImageIcon,
  Video,
  Music,
  Archive,
  Code,
  Cog,
};

export function fileIconFor(filename: string): typeof FileIcon {
  return FILE_ICON_MAP[getFileTypeInfo(filename).icon] ?? FileIcon;
}

/** Look up a file's display name by id, falling back to the first 8 chars of the
 *  id — folds the identical snapshots/expiring-tab `getFileName` helper. */
export function fileNameById(files: FileMetadata[], id: string): string {
  return files.find((f) => f.id === id)?.original_name || id.slice(0, 8);
}

// ─── Binary helpers ──────────────────────────────────────────────────────────

/** Concatenate decrypted chunks into one contiguous Uint8Array (sum lengths,
 *  then set at running offset). download-session intentionally streams and is
 *  excluded from this. */
export function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** Trigger a browser "save as": createObjectURL -> hidden <a download> -> click
 *  -> revoke. For a Uint8Array the bytes are copied into a FRESH ArrayBuffer so
 *  the Blob gets contiguous, offset-free bytes (matches the app/f hand-roll).
 *  The single home for the ~12 copy-pasted download triggers. */
export function saveBlob(name: string, data: Blob | BlobPart | Uint8Array, mime?: string): void {
  let blob: Blob;
  if (data instanceof Blob) {
    blob = mime ? new Blob([data], { type: mime }) : data;
  } else if (data instanceof Uint8Array) {
    const buf = new ArrayBuffer(data.byteLength);
    new Uint8Array(buf).set(data);
    blob = new Blob([buf], { type: mime ?? "application/octet-stream" });
  } else {
    blob = new Blob([data], { type: mime ?? "application/octet-stream" });
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
