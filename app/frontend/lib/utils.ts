import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

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

  return typeMap[ext] || { icon: "File", color: "text-[var(--color-text-muted)]", bg: "bg-[var(--color-surface-1)]", label: "File", gradient: "from-gray-500/20 to-gray-500/5" };
}

export function getFileCategory(filename: string): string {
  return getFileTypeInfo(filename).label;
}

export function isImageFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "avif"].includes(ext);
}

export function isVideoFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return ["mp4", "m4v", "webm", "mov", "ogv", "mkv", "avi"].includes(ext);
}

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
    mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime",
    ogv: "video/ogg", mkv: "video/x-matroska", avi: "video/x-msvideo",
  };
  return map[ext] || "application/octet-stream";
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
