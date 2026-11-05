import { createFolder, listFolders } from "@/lib/api";
import { encryptName } from "@/lib/name-crypto";
import { ensureNames, peekName } from "@/lib/file-names";
import { useFolderRegistry } from "@/store/folder-registry";

/** A file picked or dropped as part of a folder, with the folder path above it. */
export interface FolderFile {
  file: File;
  /** Folder names from the picked folder down to the file's parent; [] for a loose file. */
  dir: string[];
}

export interface FolderPick {
  files: FolderFile[];
  /** Every folder in the pick, empty ones included, as name paths. */
  dirs: string[][];
}

const JUNK = new Set([".DS_Store", "Thumbs.db", "desktop.ini", "Icon\r"]);

function isJunk(name: string): boolean {
  return JUNK.has(name) || name.startsWith("._");
}

/**
 * The top-level entries of a drop, read synchronously because the browser
 * empties `dataTransfer.items` once the drop handler returns. Null when the drop
 * holds no folder, so plain file drops keep their existing path.
 */
export function droppedEntries(dt: DataTransfer): FileSystemEntry[] | null {
  const entries: FileSystemEntry[] = [];
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind !== "file") continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }
  return entries.some((e) => e.isDirectory) ? entries : null;
}

function readBatch(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

function entryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

/** Walk dropped entries into files and folder paths. readEntries returns at most 100 per call. */
export async function walkEntries(roots: FileSystemEntry[]): Promise<FolderPick> {
  const pick: FolderPick = { files: [], dirs: [] };
  const visit = async (entry: FileSystemEntry, dir: string[]): Promise<void> => {
    if (entry.isFile) {
      if (!isJunk(entry.name)) {
        pick.files.push({ file: await entryFile(entry as FileSystemFileEntry), dir });
      }
      return;
    }
    if (!entry.isDirectory) return;
    const path = [...dir, entry.name];
    pick.dirs.push(path);
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    for (let batch = await readBatch(reader); batch.length > 0; batch = await readBatch(reader)) {
      for (const child of batch) await visit(child, path);
    }
  };
  for (const root of roots) await visit(root, []);
  return pick;
}

/** Files from an `<input webkitdirectory>`, whose relative paths start at the picked folder. */
export function pickFromDirectoryInput(list: FileList | File[]): FolderPick {
  const pick: FolderPick = { files: [], dirs: [] };
  const seen = new Set<string>();
  for (const file of Array.from(list)) {
    if (isJunk(file.name)) continue;
    const parts = (file.webkitRelativePath || file.name).split("/").filter(Boolean);
    const dir = parts.slice(0, -1);
    for (let i = 1; i <= dir.length; i++) {
      const key = pathKey(dir.slice(0, i));
      if (!seen.has(key)) {
        seen.add(key);
        pick.dirs.push(dir.slice(0, i));
      }
    }
    pick.files.push({ file, dir });
  }
  return pick;
}

export function pathKey(dir: string[]): string {
  return dir.join("\u0000");
}

/**
 * Find or create every folder in `dirs` under `rootId`, matching existing
 * folders by name (case-insensitive) so uploading the same folder twice fills
 * it rather than making a twin. Names are sealed with the user's name key like
 * any folder made by hand. Returns path key to folder id; the empty path maps to
 * `rootId`.
 */
export async function ensureFolderTree(
  rootId: string | null,
  dirs: string[][],
  nameKey: CryptoKey,
): Promise<Map<string, string | null>> {
  const ids = new Map<string, string | null>([[pathKey([]), rootId]]);
  const children = new Map<string | null, Map<string, string>>();

  const childrenOf = async (parentId: string | null): Promise<Map<string, string>> => {
    const cached = children.get(parentId);
    if (cached) return cached;
    const raw = await listFolders(parentId);
    useFolderRegistry.getState().record(raw);
    await ensureNames(raw.map((f) => f.encrypted_name));
    const byName = new Map<string, string>();
    for (const f of raw) {
      const name = peekName(f.encrypted_name);
      if (name) byName.set(name.trim().toLowerCase(), f.id);
    }
    children.set(parentId, byName);
    return byName;
  };

  const sorted = [...dirs].sort((a, b) => a.length - b.length);
  for (const dir of sorted) {
    const key = pathKey(dir);
    if (ids.has(key)) continue;
    const parentId = ids.get(pathKey(dir.slice(0, -1))) ?? rootId;
    const name = dir[dir.length - 1].trim();
    const siblings = await childrenOf(parentId);
    let id = siblings.get(name.toLowerCase());
    if (!id) {
      const folder = await createFolder({
        encrypted_name: await encryptName(name, nameKey),
        parent_id: parentId,
      });
      useFolderRegistry.getState().record([folder]);
      siblings.set(name.toLowerCase(), folder.id);
      children.set(folder.id, new Map());
      id = folder.id;
    }
    ids.set(key, id);
  }
  return ids;
}
