//! Local SQLite ledger — port of `sidecar/localdb/db.go`, schema-identical so
//! an existing desktop install's database keeps working after the Rust
//! migration. Offline-first: `local_upload` records files/chunks here and the
//! sync worker drains them to the backend later.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("sqlite: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("no home directory")]
    NoHome,
}

/// The per-device data dir: macOS `~/Library/Application Support/zcrypt-desktop`,
/// elsewhere `~/.zcrypt-desktop` — same locations as the Go sidecar.
pub fn data_dir() -> Result<PathBuf, DbError> {
    let home = dirs::home_dir().ok_or(DbError::NoHome)?;
    Ok(if cfg!(target_os = "macos") {
        home.join("Library")
            .join("Application Support")
            .join("zcrypt-desktop")
    } else {
        home.join(".zcrypt-desktop")
    })
}

/// Where encrypted chunks are staged until synced.
pub fn staging_dir() -> Result<PathBuf, DbError> {
    let p = data_dir()?.join("staging");
    std::fs::create_dir_all(&p)?;
    Ok(p)
}

#[derive(Debug, Clone, Default)]
pub struct LocalFile {
    pub id: String,
    pub original_name: String,
    pub original_size: i64,
    pub sha256: String,
    pub salt: Vec<u8>,
    pub wrapped_cek: Vec<u8>,
    pub chunk_count: i64,
    pub status: String,
    pub sync_status: String,
    pub backend_file_id: String,
    pub session_id: String,
    pub platform: String,
    pub repo_url: String,
    pub direct_upload: bool,
    /// Data plane: "relay" (server pushes) or "byos-direct" (this device pushes
    /// to the user's own storage with the user's own token). Decided at upload
    /// time from available creds and persisted so resume keeps the same plane.
    pub mode: String,
    pub error_msg: String,
}

#[derive(Debug, Clone, Default)]
pub struct LocalChunk {
    pub id: String,
    pub file_id: String,
    pub idx: i64,
    pub size: i64,
    pub encrypted_size: i64,
    pub compressed_size: i64,
    pub sha256: String,
    pub compressed: bool,
    pub staging_path: String,
    pub sync_status: String,
}

#[derive(Debug, Clone, Copy, Default, Serialize)]
pub struct SyncStats {
    pub pending_files: i64,
    pub syncing_files: i64,
    pub synced_files: i64,
    pub error_files: i64,
}

/// Thread-safe handle (rusqlite connections aren't Sync; a Mutex serializes —
/// operations here are tiny row writes, matching the sidecar's usage).
pub struct LocalDb {
    conn: Mutex<Connection>,
}

impl LocalDb {
    /// Open (or create) the ledger at the default data dir.
    pub fn open() -> Result<Self, DbError> {
        let dir = data_dir()?;
        std::fs::create_dir_all(&dir)?;
        Self::open_at(&dir.join("db.sqlite"))
    }

    /// Open at an explicit path (tests use a temp dir).
    pub fn open_at(path: &Path) -> Result<Self, DbError> {
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.busy_timeout(std::time::Duration::from_millis(5000))?;
        conn.pragma_update(None, "cache_size", -64000)?;
        conn.pragma_update(None, "mmap_size", 268_435_456i64)?;
        conn.pragma_update(None, "temp_store", "MEMORY")?;
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS files (
                id           TEXT PRIMARY KEY,
                original_name TEXT NOT NULL,
                original_size INTEGER NOT NULL,
                sha256       TEXT NOT NULL,
                salt         BLOB NOT NULL,
                wrapped_cek  BLOB NOT NULL DEFAULT '',
                chunk_count  INTEGER NOT NULL,
                status       TEXT NOT NULL DEFAULT 'pending',
                sync_status  TEXT NOT NULL DEFAULT 'pending',
                backend_file_id TEXT NOT NULL DEFAULT '',
                session_id   TEXT NOT NULL DEFAULT '',
                platform     TEXT NOT NULL DEFAULT '',
                repo_url     TEXT NOT NULL DEFAULT '',
                direct_upload INTEGER NOT NULL DEFAULT 0,
                mode         TEXT NOT NULL DEFAULT 'relay',
                error_msg    TEXT NOT NULL DEFAULT '',
                created_at   TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS chunks (
                id           TEXT PRIMARY KEY,
                file_id      TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
                idx          INTEGER NOT NULL,
                size         INTEGER NOT NULL,
                encrypted_size INTEGER NOT NULL,
                compressed_size INTEGER NOT NULL,
                sha256       TEXT NOT NULL,
                compressed   INTEGER NOT NULL DEFAULT 0,
                staging_path TEXT NOT NULL,
                sync_status  TEXT NOT NULL DEFAULT 'pending',
                remote_path  TEXT NOT NULL DEFAULT '',
                error_msg    TEXT NOT NULL DEFAULT ''
            );

            CREATE INDEX IF NOT EXISTS idx_chunks_file ON chunks(file_id);
            CREATE INDEX IF NOT EXISTS idx_chunks_pending ON chunks(sync_status) WHERE sync_status = 'pending';
            CREATE INDEX IF NOT EXISTS idx_files_pending ON files(sync_status) WHERE sync_status != 'synced';
            "#,
        )?;
        // Migrate ledgers created before the byos-direct data plane (e.g. an old
        // Go-sidecar DB): add the mode column. Errors when it already exists —
        // SQLite has no ADD COLUMN IF NOT EXISTS — so the result is ignored.
        let _ = conn.execute(
            "ALTER TABLE files ADD COLUMN mode TEXT NOT NULL DEFAULT 'relay'",
            [],
        );
        Ok(LocalDb {
            conn: Mutex::new(conn),
        })
    }

    fn with<T>(
        &self,
        f: impl FnOnce(&Connection) -> Result<T, rusqlite::Error>,
    ) -> Result<T, DbError> {
        let conn = self.conn.lock().expect("localdb mutex");
        Ok(f(&conn)?)
    }

    // ── files ───────────────────────────────────────────────────────────────

    pub fn insert_file(&self, f: &LocalFile) -> Result<(), DbError> {
        // sync_status is written explicitly (empty → the historical 'pending')
        // so local_upload can insert as 'staging' and keep the row INVISIBLE to
        // the sync loop until every chunk is staged — a 'pending' row used to be
        // picked up by the 1s loop mid-encryption, which init'd a session and
        // even called complete against a partial chunk list.
        let sync_status = if f.sync_status.is_empty() {
            "pending"
        } else {
            &f.sync_status
        };
        self.with(|c| {
            c.execute(
                "INSERT INTO files (id, original_name, original_size, sha256, salt, wrapped_cek, chunk_count, status, sync_status, platform, mode)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                params![f.id, f.original_name, f.original_size, f.sha256, f.salt, f.wrapped_cek, f.chunk_count, f.status, sync_status, f.platform, mode_or_default(&f.mode)],
            )
            .map(|_| ())
        })
    }

    #[allow(clippy::too_many_arguments)]
    pub fn update_file_sync_state(
        &self,
        file_id: &str,
        sync_status: &str,
        session_id: &str,
        backend_file_id: &str,
        platform: &str,
        repo_url: &str,
        direct_upload: bool,
    ) -> Result<(), DbError> {
        self.with(|c| {
            c.execute(
                "UPDATE files SET sync_status=?1, session_id=?2, backend_file_id=?3, platform=?4, repo_url=?5, direct_upload=?6 WHERE id=?7",
                params![sync_status, session_id, backend_file_id, platform, repo_url, direct_upload, file_id],
            )
            .map(|_| ())
        })
    }

    pub fn update_file_sync_status(&self, file_id: &str, status: &str) -> Result<(), DbError> {
        self.with(|c| {
            c.execute(
                "UPDATE files SET sync_status=?1 WHERE id=?2",
                params![status, file_id],
            )
            .map(|_| ())
        })
    }

    pub fn update_file_sync_error(&self, file_id: &str, err_msg: &str) -> Result<(), DbError> {
        self.with(|c| {
            c.execute(
                "UPDATE files SET sync_status='error', error_msg=?1 WHERE id=?2",
                params![err_msg, file_id],
            )
            .map(|_| ())
        })
    }

    pub fn get_pending_files(&self) -> Result<Vec<LocalFile>, DbError> {
        self.with(|c| {
            let mut stmt = c.prepare(
                "SELECT id, original_name, original_size, sha256, salt, wrapped_cek, chunk_count, status, sync_status,
                        backend_file_id, session_id, platform, repo_url, direct_upload, mode, error_msg
                 FROM files WHERE sync_status IN ('pending','init_done','uploading') ORDER BY created_at",
            )?;
            let rows = stmt.query_map([], row_to_file)?;
            rows.collect()
        })
    }

    pub fn get_file_by_id(&self, file_id: &str) -> Result<Option<LocalFile>, DbError> {
        self.with(|c| {
            c.query_row(
                "SELECT id, original_name, original_size, sha256, salt, wrapped_cek, chunk_count, status, sync_status,
                        backend_file_id, session_id, platform, repo_url, direct_upload, mode, error_msg
                 FROM files WHERE id=?1",
                params![file_id],
                row_to_file,
            )
            .optional()
        })
    }

    /// Remove a file and its chunk rows from the local ledger. Used after a
    /// delete so a device's local mirror drops the file (whether the delete
    /// originated here or arrived as a remote change). Idempotent — deleting an
    /// absent file is a no-op.
    pub fn delete_file(&self, file_id: &str) -> Result<(), DbError> {
        self.with(|c| {
            c.execute("DELETE FROM chunks WHERE file_id=?1", params![file_id])?;
            c.execute("DELETE FROM files WHERE id=?1", params![file_id])
                .map(|_| ())
        })
    }

    // ── chunks ──────────────────────────────────────────────────────────────

    pub fn insert_chunk(&self, ch: &LocalChunk) -> Result<(), DbError> {
        self.with(|c| {
            c.execute(
                "INSERT INTO chunks (id, file_id, idx, size, encrypted_size, compressed_size, sha256, compressed, staging_path)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![ch.id, ch.file_id, ch.idx, ch.size, ch.encrypted_size, ch.compressed_size, ch.sha256, ch.compressed, ch.staging_path],
            )
            .map(|_| ())
        })
    }

    pub fn get_pending_chunks(&self, file_id: &str) -> Result<Vec<LocalChunk>, DbError> {
        self.with(|c| {
            let mut stmt = c.prepare(
                "SELECT id, file_id, idx, size, encrypted_size, compressed_size, sha256, compressed, staging_path, sync_status
                 FROM chunks WHERE file_id=?1 AND sync_status='pending' ORDER BY idx",
            )?;
            let rows = stmt.query_map(params![file_id], row_to_chunk)?;
            rows.collect()
        })
    }

    /// Every chunk not yet confirmed remote — 'pending' AND 'error'. Sync passes
    /// use this (not `get_pending_chunks`) so a chunk that errored once is
    /// retried on the next pass; its staging file still exists (staging is only
    /// deleted after a successful push).
    pub fn get_unsynced_chunks(&self, file_id: &str) -> Result<Vec<LocalChunk>, DbError> {
        self.with(|c| {
            let mut stmt = c.prepare(
                "SELECT id, file_id, idx, size, encrypted_size, compressed_size, sha256, compressed, staging_path, sync_status
                 FROM chunks WHERE file_id=?1 AND sync_status != 'synced' ORDER BY idx",
            )?;
            let rows = stmt.query_map(params![file_id], row_to_chunk)?;
            rows.collect()
        })
    }

    /// The newest row with the same content (sha256 + size) whose upload is
    /// still in motion ('staging'/'pending'/'init_done'/'uploading'). Used by
    /// `local_upload` to collapse a duplicate invocation onto the existing row
    /// instead of re-encrypting the whole file into a second ledger row — the
    /// backend dedupes such rows onto ONE upload session (same sha256+size), so
    /// two local rows would race each other on that single session. Note this
    /// deliberately does NOT match a 'synced' row: re-uploading already-finished
    /// content is a NEW file (the backend's FindActiveUploadSession only resumes
    /// 'active' sessions), never a silently-deduped one.
    pub fn find_active_sibling(
        &self,
        sha256: &str,
        size: i64,
    ) -> Result<Option<LocalFile>, DbError> {
        self.with(|c| {
            c.query_row(
                "SELECT id, original_name, original_size, sha256, salt, wrapped_cek, chunk_count, status, sync_status,
                        backend_file_id, session_id, platform, repo_url, direct_upload, mode, error_msg
                 FROM files WHERE sha256=?1 AND original_size=?2
                   AND sync_status IN ('staging','pending','init_done','uploading')
                 ORDER BY created_at DESC LIMIT 1",
                params![sha256, size],
                row_to_file,
            )
            .optional()
        })
    }

    /// Reset an errored file for a clean retry: drop its (dead/expired) backend
    /// session and reset EVERY chunk to pending. A fresh re-init gets a brand-new
    /// server session that holds none of the old chunks, so stale 'synced' chunk
    /// flags would make completion fire against an empty session ("not all chunks
    /// have been uploaded"). Wasteful (re-uploads all chunks) but correct;
    /// partial-resume across a dead session is a later refinement.
    pub fn reset_file_for_retry(&self, file_id: &str) -> Result<(), DbError> {
        self.with(|c| {
            c.execute(
                "UPDATE files SET sync_status='pending', session_id='', backend_file_id='', direct_upload=0, error_msg='' WHERE id=?1",
                params![file_id],
            )?;
            c.execute(
                "UPDATE chunks SET sync_status='pending', remote_path='', error_msg='' WHERE file_id=?1",
                params![file_id],
            )?;
            Ok(())
        })
    }

    /// Staging paths of every chunk of a file — for deleting the staged
    /// ciphertext when a partially-staged row is cleaned up or garbage-collected.
    pub fn get_staging_paths(&self, file_id: &str) -> Result<Vec<String>, DbError> {
        self.with(|c| {
            let mut stmt = c.prepare(
                "SELECT staging_path FROM chunks WHERE file_id=?1 AND staging_path != ''",
            )?;
            let rows = stmt.query_map(params![file_id], |r| r.get(0))?;
            rows.collect()
        })
    }

    /// All rows in one sync_status — GC uses this to find rows stuck in
    /// 'staging' (their encrypting process died; the CEK lived only in that
    /// process's memory, so they can never be finished — only purged).
    pub fn list_files_in_status(&self, status: &str) -> Result<Vec<LocalFile>, DbError> {
        self.with(|c| {
            let mut stmt = c.prepare(
                "SELECT id, original_name, original_size, sha256, salt, wrapped_cek, chunk_count, status, sync_status,
                        backend_file_id, session_id, platform, repo_url, direct_upload, mode, error_msg
                 FROM files WHERE sync_status=?1 ORDER BY created_at",
            )?;
            let rows = stmt.query_map(params![status], row_to_file)?;
            rows.collect()
        })
    }

    /// Every staging path referenced by ANY chunk row — the orphan-file scan
    /// deletes staging-dir entries not in this set (crash leftovers).
    pub fn all_staging_paths(&self) -> Result<std::collections::HashSet<String>, DbError> {
        self.with(|c| {
            let mut stmt = c.prepare("SELECT staging_path FROM chunks WHERE staging_path != ''")?;
            let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
            rows.collect()
        })
    }

    pub fn update_chunk_synced(&self, chunk_id: &str, remote_path: &str) -> Result<(), DbError> {
        self.with(|c| {
            c.execute(
                "UPDATE chunks SET sync_status='synced', remote_path=?1 WHERE id=?2",
                params![remote_path, chunk_id],
            )
            .map(|_| ())
        })
    }

    pub fn update_chunk_error(&self, chunk_id: &str, err_msg: &str) -> Result<(), DbError> {
        self.with(|c| {
            c.execute(
                "UPDATE chunks SET sync_status='error', error_msg=?1 WHERE id=?2",
                params![err_msg, chunk_id],
            )
            .map(|_| ())
        })
    }

    pub fn all_chunks_synced(&self, file_id: &str) -> Result<bool, DbError> {
        self.with(|c| {
            // Synced count must equal the file's declared chunk_count — NOT just
            // "no unsynced chunk rows". Mid-encryption only K of N chunk rows
            // exist; the old absence check returned true with K synced rows and
            // let a sync pass call complete against a partial upload ("not all
            // chunks have been uploaded" 400s every tick).
            let (synced, expected): (i64, i64) = c.query_row(
                "SELECT (SELECT COUNT(*) FROM chunks WHERE file_id=?1 AND sync_status='synced'),
                        (SELECT chunk_count FROM files WHERE id=?1)",
                params![file_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )?;
            Ok(synced == expected)
        })
    }

    pub fn get_chunk_totals(&self, file_id: &str) -> Result<(i64, i64), DbError> {
        self.with(|c| {
            c.query_row(
                "SELECT COALESCE(SUM(encrypted_size),0), COALESCE(SUM(compressed_size),0) FROM chunks WHERE file_id=?1",
                params![file_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
        })
    }

    // ── stats ───────────────────────────────────────────────────────────────

    pub fn get_sync_stats(&self) -> Result<SyncStats, DbError> {
        self.with(|c| {
            let mut stmt =
                c.prepare("SELECT sync_status, COUNT(*) FROM files GROUP BY sync_status")?;
            let mut s = SyncStats::default();
            let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?;
            for row in rows {
                let (status, count) = row?;
                match status.as_str() {
                    "pending" | "init_done" => s.pending_files += count,
                    "uploading" => s.syncing_files += count,
                    "synced" => s.synced_files += count,
                    "error" => s.error_files += count,
                    _ => {}
                }
            }
            Ok(s)
        })
    }
}

fn row_to_file(r: &rusqlite::Row<'_>) -> Result<LocalFile, rusqlite::Error> {
    Ok(LocalFile {
        id: r.get(0)?,
        original_name: r.get(1)?,
        original_size: r.get(2)?,
        sha256: r.get(3)?,
        salt: r.get(4)?,
        wrapped_cek: r.get(5)?,
        chunk_count: r.get(6)?,
        status: r.get(7)?,
        sync_status: r.get(8)?,
        backend_file_id: r.get(9)?,
        session_id: r.get(10)?,
        platform: r.get(11)?,
        repo_url: r.get(12)?,
        direct_upload: r.get(13)?,
        mode: r.get(14)?,
        error_msg: r.get(15)?,
    })
}

/// Normalize an empty/legacy mode to "relay".
fn mode_or_default(m: &str) -> &str {
    if m.is_empty() {
        "relay"
    } else {
        m
    }
}

fn row_to_chunk(r: &rusqlite::Row<'_>) -> Result<LocalChunk, rusqlite::Error> {
    Ok(LocalChunk {
        id: r.get(0)?,
        file_id: r.get(1)?,
        idx: r.get(2)?,
        size: r.get(3)?,
        encrypted_size: r.get(4)?,
        compressed_size: r.get(5)?,
        sha256: r.get(6)?,
        compressed: r.get(7)?,
        staging_path: r.get(8)?,
        sync_status: r.get(9)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_db() -> (LocalDb, PathBuf) {
        let dir = std::env::temp_dir().join(format!("zcrypt-localdb-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        (LocalDb::open_at(&dir.join("db.sqlite")).unwrap(), dir)
    }

    #[test]
    fn file_and_chunk_lifecycle() {
        let (db, dir) = temp_db();

        let f = LocalFile {
            id: "f1".into(),
            original_name: "a.txt".into(),
            original_size: 42,
            sha256: "aa".into(),
            salt: vec![1; 32],
            wrapped_cek: vec![2; 60],
            chunk_count: 2,
            status: "complete".into(),
            ..Default::default()
        };
        db.insert_file(&f).unwrap();

        for i in 0..2 {
            db.insert_chunk(&LocalChunk {
                id: format!("c{i}"),
                file_id: "f1".into(),
                idx: i,
                size: 21,
                encrypted_size: 49,
                compressed_size: 21,
                sha256: format!("sha{i}"),
                compressed: false,
                staging_path: format!("/tmp/c{i}.enc"),
                ..Default::default()
            })
            .unwrap();
        }

        // pending → init_done → uploading → synced
        let pending = db.get_pending_files().unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].sync_status, "pending");

        db.update_file_sync_state(
            "f1",
            "init_done",
            "sess",
            "backend-id",
            "telegram",
            "tg:1/x",
            false,
        )
        .unwrap();
        let f1 = db.get_file_by_id("f1").unwrap().unwrap();
        assert_eq!(f1.sync_status, "init_done");
        assert_eq!(f1.platform, "telegram");

        let chunks = db.get_pending_chunks("f1").unwrap();
        assert_eq!(chunks.len(), 2);
        assert!(!db.all_chunks_synced("f1").unwrap());

        db.update_chunk_synced("c0", "12:AA").unwrap();
        db.update_chunk_synced("c1", "13:BB").unwrap();
        assert!(db.all_chunks_synced("f1").unwrap());
        assert_eq!(db.get_chunk_totals("f1").unwrap(), (98, 42));

        db.update_file_sync_status("f1", "synced").unwrap();
        let stats = db.get_sync_stats().unwrap();
        assert_eq!(stats.synced_files, 1);
        assert_eq!(stats.pending_files, 0);

        // error path
        db.update_file_sync_error("f1", "boom").unwrap();
        assert_eq!(db.get_sync_stats().unwrap().error_files, 1);
        db.update_chunk_error("c0", "bad").unwrap();

        let _ = std::fs::remove_dir_all(dir);
    }
}
