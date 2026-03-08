import clsx, { type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
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
}

export function getFileTypeInfo(filename: string): FileTypeInfo {
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  const typeMap: Record<string, FileTypeInfo> = {
    // Documents
    pdf: { icon: "FileText", color: "text-rose-500", bg: "bg-rose-500/10" },
    doc: { icon: "FileText", color: "text-rose-500", bg: "bg-rose-500/10" },
    docx: { icon: "FileText", color: "text-rose-500", bg: "bg-rose-500/10" },
    // Spreadsheets
    xls: { icon: "Table", color: "text-emerald-500", bg: "bg-emerald-500/10" },
    xlsx: { icon: "Table", color: "text-emerald-500", bg: "bg-emerald-500/10" },
    csv: { icon: "Table", color: "text-emerald-500", bg: "bg-emerald-500/10" },
    // Images
    jpg: { icon: "Image", color: "text-violet-500", bg: "bg-violet-500/10" },
    jpeg: { icon: "Image", color: "text-violet-500", bg: "bg-violet-500/10" },
    png: { icon: "Image", color: "text-violet-500", bg: "bg-violet-500/10" },
    gif: { icon: "Image", color: "text-violet-500", bg: "bg-violet-500/10" },
    webp: { icon: "Image", color: "text-violet-500", bg: "bg-violet-500/10" },
    svg: { icon: "Image", color: "text-violet-500", bg: "bg-violet-500/10" },
    // Video
    mp4: { icon: "Video", color: "text-blue-500", bg: "bg-blue-500/10" },
    mov: { icon: "Video", color: "text-blue-500", bg: "bg-blue-500/10" },
    avi: { icon: "Video", color: "text-blue-500", bg: "bg-blue-500/10" },
    mkv: { icon: "Video", color: "text-blue-500", bg: "bg-blue-500/10" },
    // Audio
    mp3: { icon: "Music", color: "text-pink-500", bg: "bg-pink-500/10" },
    wav: { icon: "Music", color: "text-pink-500", bg: "bg-pink-500/10" },
    flac: { icon: "Music", color: "text-pink-500", bg: "bg-pink-500/10" },
    aac: { icon: "Music", color: "text-pink-500", bg: "bg-pink-500/10" },
    // Archives
    zip: { icon: "Archive", color: "text-amber-500", bg: "bg-amber-500/10" },
    rar: { icon: "Archive", color: "text-amber-500", bg: "bg-amber-500/10" },
    "7z": { icon: "Archive", color: "text-amber-500", bg: "bg-amber-500/10" },
    tar: { icon: "Archive", color: "text-amber-500", bg: "bg-amber-500/10" },
    gz: { icon: "Archive", color: "text-amber-500", bg: "bg-amber-500/10" },
    // Code
    js: { icon: "Code", color: "text-emerald-500", bg: "bg-emerald-500/10" },
    ts: { icon: "Code", color: "text-emerald-500", bg: "bg-emerald-500/10" },
    py: { icon: "Code", color: "text-emerald-500", bg: "bg-emerald-500/10" },
    go: { icon: "Code", color: "text-emerald-500", bg: "bg-emerald-500/10" },
    rs: { icon: "Code", color: "text-emerald-500", bg: "bg-emerald-500/10" },
    java: { icon: "Code", color: "text-emerald-500", bg: "bg-emerald-500/10" },
    // Executables
    exe: { icon: "Cog", color: "text-orange-500", bg: "bg-orange-500/10" },
    dmg: { icon: "Cog", color: "text-orange-500", bg: "bg-orange-500/10" },
    msi: { icon: "Cog", color: "text-orange-500", bg: "bg-orange-500/10" },
  };

  return typeMap[ext] || { icon: "File", color: "text-[var(--color-text-muted)]", bg: "bg-[var(--color-surface-1)]" };
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
