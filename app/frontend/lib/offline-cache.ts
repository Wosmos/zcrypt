/**
 * Offline SQLite cache using sql.js with OPFS persistence.
 * Caches file metadata for instant dashboard loading when offline.
 */

import type { FileMetadata } from "@/types";
import type { Database } from "sql.js";

let dbPromise: Promise<OfflineCache> | null = null;

const DB_FILE = "zpush-cache.sqlite";

class OfflineCache {
  private db: Database;
  private dirty = false;

  constructor(db: Database) {
    this.db = db;
    this.init();
  }

  private init() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS file_cache (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        original_name TEXT NOT NULL,
        original_size INTEGER NOT NULL,
        compressed_size INTEGER NOT NULL,
        encrypted_size INTEGER NOT NULL,
        chunk_count INTEGER NOT NULL,
        sha256 TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS cache_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
  }

  /** Replace all cached files for a user. */
  setFiles(userId: string, files: FileMetadata[]) {
    this.db.run("DELETE FROM file_cache WHERE user_id = ?", [userId]);
    for (const f of files) {
      this.db.run(
        `INSERT OR REPLACE INTO file_cache (id, user_id, original_name, original_size, compressed_size, encrypted_size, chunk_count, sha256, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [f.id, userId, f.original_name, f.original_size, f.compressed_size, f.encrypted_size, f.chunk_count, f.sha256, f.created_at]
      );
    }
    this.setMeta(`files_updated_${userId}`, new Date().toISOString());
    this.dirty = true;
    this.persist();
  }

  /** Get cached files for a user. */
  getFiles(userId: string): FileMetadata[] {
    const result = this.db.exec(
      "SELECT id, original_name, original_size, compressed_size, encrypted_size, chunk_count, sha256, created_at FROM file_cache WHERE user_id = ? ORDER BY created_at DESC",
      [userId]
    );
    if (!result.length) return [];
    return result[0].values.map((row: unknown[]) => ({
      id: row[0] as string,
      original_name: row[1] as string,
      original_size: row[2] as number,
      compressed_size: row[3] as number,
      encrypted_size: row[4] as number,
      chunk_count: row[5] as number,
      sha256: row[6] as string,
      created_at: row[7] as string,
    }));
  }

  /** Get last cache update time for a user. */
  getLastUpdate(userId: string): string | null {
    return this.getMeta(`files_updated_${userId}`);
  }

  private setMeta(key: string, value: string) {
    this.db.run("INSERT OR REPLACE INTO cache_meta (key, value) VALUES (?, ?)", [key, value]);
  }

  private getMeta(key: string): string | null {
    const result = this.db.exec("SELECT value FROM cache_meta WHERE key = ?", [key]);
    if (!result.length || !result[0].values.length) return null;
    return result[0].values[0][0] as string;
  }

  /** Persist database to OPFS if available, otherwise skip. */
  private async persist() {
    if (!this.dirty) return;
    this.dirty = false;

    try {
      if (typeof navigator !== "undefined" && "storage" in navigator && "getDirectory" in navigator.storage) {
        const root = await navigator.storage.getDirectory();
        const fileHandle = await root.getFileHandle(DB_FILE, { create: true });
        const writable = await fileHandle.createWritable();
        const data = this.db.export();
        await writable.write(data.buffer as ArrayBuffer);
        await writable.close();
      }
    } catch {
      // OPFS not available — cache is memory-only for this session
    }
  }

  close() {
    this.db.close();
  }
}

async function loadFromOPFS(): Promise<Uint8Array | null> {
  try {
    if (typeof navigator === "undefined" || !("storage" in navigator) || !("getDirectory" in navigator.storage)) {
      return null;
    }
    const root = await navigator.storage.getDirectory();
    const fileHandle = await root.getFileHandle(DB_FILE);
    const file = await fileHandle.getFile();
    const buffer = await file.arrayBuffer();
    return new Uint8Array(buffer);
  } catch {
    return null;
  }
}

/** Get or create the singleton offline cache instance. */
export function getOfflineCache(): Promise<OfflineCache> {
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    // Dynamic import to avoid SSR issues
    const initSqlJs = (await import("sql.js")).default;
    const SQL = await initSqlJs({
      locateFile: (file: string) => `https://sql.js.org/dist/${file}`,
    });

    const existingData = await loadFromOPFS();
    const db = existingData ? new SQL.Database(existingData) : new SQL.Database();
    return new OfflineCache(db);
  })();

  return dbPromise;
}

/** Check if OPFS is available for persistence. */
export function isOPFSAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "storage" in navigator &&
    "getDirectory" in navigator.storage
  );
}
