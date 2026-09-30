import { formatBytes, getFileTypeInfo } from "@/lib/utils";
import { viewerKindFor, type ViewerKind } from "@/components/viewers/viewer-kind";

const KB = 1024;
export const MB = KB * 1024;
const GB = MB * 1024;
export const PIECE = 10 * MB;

export type ArtKey = "beach" | "cat" | "sunset" | "party" | "wallpaper" | "wedding";
type FolderGlyph = "image" | "doc" | "music" | "download";
export type View = "you" | "gh";
export type FilterKey = "image" | "document" | "video" | "audio" | "archive";

export type DriveFolder = { id: string; name: string; glyph?: FolderGlyph; locked?: boolean };

export type DriveFile = {
  id: string;
  name: string;
  size: number;
  saved: number;
  mod: string;
  art?: ArtKey;
  seed?: number;
  pages?: number;
  duration?: string;
};

export type DroppedFile = DriveFile & {
  type: string;
  url: string | null;
  pieces: string[];
  fresh: boolean;
};

export type Piece = { name: string; size: string; cap?: string };

export const REPO = "quick-loader-v2";
export const COMMIT = { msg: "chore: refresh build cache", when: "3 hours ago" };
export const README_LINE = "Internal build artifacts and cache storage.";
export const HINT = "That opens after you sign up. Everything here is sample data.";

const HEX = "0123456789abcdef";

export function seededHex(seed: number, len: number): string {
  let x = seed >>> 0;
  let s = "";
  for (let i = 0; i < len; i++) {
    x = (Math.imul(x ^ (x >>> 15), 2654435761) + 0x9e3779b9) >>> 0;
    s += HEX[x & 15];
  }
  return s;
}

export const shard = (h: string) => `${h.slice(0, 2)}/${h.slice(2)}.bin`;

export const fmtPiece = (b: number) =>
  b >= PIECE ? "10.0 MB" : formatBytes(b).replace(/^(\d+) /, "$1.0 ");

const ROOT_PIECES = [
  "a39f04c1e2b7d8e1",
  "7e41c09ab3f2d6c8",
  "0bd2e7f91a4c3355",
  "c58a13e6f0b9d247",
  "f12c7d90e4ab5163",
  "48e9b0c2d71f6a3e",
  "9d5f3a8c1e07b2d4",
  "26b1e4f8a09c7d53",
  "e07a2d5c9f14b68e",
  "5c0e9f3b7a2d81c6",
  "b8f46a1d0c3e9275",
  "3ac85e2f7d09b14a",
];
const ROOT_SIZES = [10, 10, 10, 3.4, 10, 10, 7.9, 10, 10, 1.2, 10, 10];

export const FOLDERS: DriveFolder[] = [
  { id: "photos", name: "Photos", glyph: "image" },
  { id: "documents", name: "Documents", glyph: "doc" },
  { id: "music", name: "Music", glyph: "music" },
  { id: "downloads", name: "Downloads", glyph: "download" },
  { id: "taxes", name: "Taxes", locked: true },
];

const f = (
  id: string,
  name: string,
  size: number,
  saved: number,
  mod: string,
  extra?: Partial<DriveFile>,
): DriveFile => ({ id, name, size, saved, mod, ...extra });

const FILES: DriveFile[] = [
  f("passport", "passport-scan.pdf", 1.8 * MB, 9, "2d ago", { pages: 2 }),
  f("wedzip", "wedding-photos.zip", 1.2 * GB, 0, "Sep 14"),
  f("thesis", "thesis-final-v9.docx", 2.4 * MB, 38, "5h ago", { pages: 3 }),
  f("savings", "savings.xlsx", 44 * KB, 61, "1d ago"),
  f("beach", "beach-2025.jpg", 3.1 * MB, 0, "Just now", { art: "beach" }),
  f("cat", "cat.jpg", 2.6 * MB, 0, "3d ago", { art: "cat" }),
  f("wedvid", "wedding-video.mp4", 4.2 * GB, 0, "Sep 14", { art: "wedding", duration: "4:12" }),
];

const CONTENTS: Record<string, DriveFile[]> = {
  photos: [
    f("p1", "IMG_0412.jpg", 4.1 * MB, 0, "Sep 20", { art: "beach", seed: 3 }),
    f("p2", "IMG_0413.jpg", 3.8 * MB, 0, "Sep 20", { art: "cat", seed: 2 }),
    f("p3", "sunset-karachi.jpg", 5.2 * MB, 0, "Aug 31", { art: "sunset" }),
    f("p4", "grandma-birthday.jpg", 2.9 * MB, 0, "Jul 12", { art: "party" }),
  ],
  documents: [
    f("d1", "lease-signed.pdf", 310 * KB, 14, "1w ago", { pages: 3 }),
    f("d2", "cv-2026.pdf", 188 * KB, 11, "Aug 02", { pages: 2 }),
    f("d3", "meeting-notes.txt", 12 * KB, 72, "4h ago"),
  ],
  music: [
    f("m1", "demo-take-3.mp3", 8.4 * MB, 1, "Jun 18", { duration: "3:07" }),
    f("m2", "voice-memo.m4a", 1.1 * MB, 2, "2d ago", { duration: "0:48" }),
  ],
  downloads: [
    f("w1", "receipt-0923.pdf", 96 * KB, 18, "6d ago", { pages: 1 }),
    f("w2", "wallpaper.png", 6.3 * MB, 0, "Aug 19", { art: "wallpaper" }),
    f("w3", "flight-booking.pdf", 240 * KB, 16, "Sep 01", { pages: 2 }),
  ],
  taxes: [
    f("t1", "tax-return-2025.pdf", 880 * KB, 12, "Mar 28", { pages: 3 }),
    f("t2", "receipts-2025.zip", 64 * MB, 3, "Mar 27"),
    f("t3", "w2-2025.pdf", 140 * KB, 15, "Feb 10", { pages: 1 }),
  ],
};

export const RECENT: DriveFile[] = [
  f("r1", "tax-return-2025.pdf", 880 * KB, 12, "Mar 28", { pages: 3 }),
  f("r2", "wedding-video.mp4", 4.2 * GB, 0, "Sep 14", { art: "wedding", duration: "4:12" }),
  f("r3", "lease-signed.pdf", 310 * KB, 14, "1w ago", { pages: 3 }),
  f("r4", "savings.xlsx", 44 * KB, 61, "1d ago"),
];

export const FILTERS: { key: FilterKey | null; label: string }[] = [
  { key: null, label: "All" },
  { key: "image", label: "Images" },
  { key: "document", label: "Documents" },
  { key: "video", label: "Videos" },
  { key: "audio", label: "Audio" },
  { key: "archive", label: "Archives" },
];

const LABEL_TO_FILTER: Record<string, FilterKey> = {
  Image: "image",
  Document: "document",
  Spreadsheet: "document",
  Video: "video",
  Audio: "audio",
  Archive: "archive",
};

export function filterKeyOf(name: string): FilterKey | null {
  return LABEL_TO_FILTER[getFileTypeInfo(name).label] ?? null;
}

export function typeOf(name: string) {
  const info = getFileTypeInfo(name);
  const ext = name.includes(".") ? (name.split(".").pop() ?? "").toLowerCase() : "";
  return { ...info, ext };
}

export function kindOf(name: string): ViewerKind {
  return viewerKindFor(name);
}

export function pieceFor(i: number, id: string, size?: number): Piece {
  if (i < ROOT_PIECES.length) {
    return { name: shard(ROOT_PIECES[i]), size: `${ROOT_SIZES[i].toFixed(1)} MB` };
  }
  const h = seededHex(i * 7919 + id.length * 131, 16);
  return { name: shard(h), size: fmtPiece(size ? Math.min(size, PIECE) : PIECE) };
}

export type Entries = { folders: DriveFolder[]; files: (DriveFile | DroppedFile)[] };

export function entriesFor(folder: string | null, dropped: DroppedFile | null): Entries {
  if (folder) return { folders: [], files: CONTENTS[folder] ?? [] };
  return { folders: FOLDERS, files: dropped ? [dropped, ...FILES] : FILES };
}

export function isDropped(f: DriveFile | DroppedFile): f is DroppedFile {
  return "pieces" in f;
}

export function countLabel(
  view: View,
  e: Entries,
  dropped: DroppedFile | null,
  folder: string | null,
) {
  const extra = dropped && !folder ? dropped.pieces.length - 1 : 0;
  if (view === "gh") return `${e.folders.length + e.files.length + extra} files, no real names`;
  const p = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (!e.folders.length) return p(e.files.length, "item");
  return `${p(e.folders.length, "folder")} · ${p(e.files.length, "file")}`;
}

export function randHex(): string {
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
