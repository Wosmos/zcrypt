//! Local-first upload — port of `sidecar/pipeline/local_upload.go`: hash,
//! derive keys, chunk + compress + encrypt in parallel, stage to disk, record
//! in the SQLite ledger. Returns instantly relative to network (CPU+disk only);
//! the sync worker pushes later.

use std::collections::HashSet;
use std::path::Path;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;

use sha2::{Digest, Sha256};
use tokio::io::AsyncReadExt;
use zeroize::Zeroize;

use crate::compression;
use crate::crypto;
use crate::localdb::{staging_dir, LocalChunk, LocalFile};
use crate::types::{Progress, Stage};

use super::{pipeline, EngineContext, EngineError};

/// File ids whose chunks are being staged by THIS process right now. A row in
/// sync_status 'staging' is only meaningful while its encrypting task is alive
/// (the CEK exists only in that task's memory) — the ledger GC purges 'staging'
/// rows NOT in this set as crash leftovers, and must never touch live ones.
fn staging_live() -> &'static Mutex<HashSet<String>> {
    static SET: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    SET.get_or_init(|| Mutex::new(HashSet::new()))
}

/// Whether `file_id` is being staged by a live task in this process.
pub(crate) fn is_staging_live(file_id: &str) -> bool {
    staging_live().lock().unwrap().contains(file_id)
}

/// RAII registration in [`staging_live`] — removed on drop, including on any
/// early error return, so a failed staging never leaves a stale "live" mark.
struct StagingLive(String);

impl StagingLive {
    fn register(file_id: &str) -> Self {
        staging_live().lock().unwrap().insert(file_id.to_string());
        StagingLive(file_id.to_string())
    }
}

impl Drop for StagingLive {
    fn drop(&mut self) {
        staging_live().lock().unwrap().remove(&self.0);
    }
}

pub async fn run(
    ctx: &EngineContext,
    file_path: &Path,
    passphrase: &str,
) -> Result<String, EngineError> {
    let file_name = file_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".to_string());
    let meta = tokio::fs::metadata(file_path).await?;
    let file_size = meta.len() as i64;

    let emit = |stage: Stage, done: u32, total: u32, bytes: i64| {
        (ctx.progress)(Progress {
            file_id: String::new(),
            file_name: file_name.clone(),
            stage,
            chunks_done: done,
            chunks_total: total,
            bytes_done: bytes,
            bytes_total: file_size,
            speed: 0.0,
        });
    };

    // 1. Hash the original file (streaming, constant memory).
    emit(Stage::Hashing, 0, 0, 0);
    let file_sha256 = sha256_file(file_path).await?;

    // Dedup: identical content already staging or syncing → reuse that row
    // instead of re-encrypting into a second one. The backend collapses
    // same-content inits onto ONE upload session (FindActiveUploadSession
    // matches sha256+size), so two ledger rows would race each other on that
    // single session — the loser dies with "upload session is not active"
    // after the winner completes it, showing a false failure for a file that
    // actually uploaded.
    if let Some(existing) = ctx.db.find_active_sibling(&file_sha256, file_size)? {
        eprintln!(
            "zcrypt upload: {} already in flight as {} ({}) — reusing, not re-encrypting",
            file_name, existing.id, existing.sync_status
        );
        return Ok(existing.id);
    }

    // 2. Keys: salt → KEK (600k PBKDF2, blocking) → random CEK, wrapped.
    emit(Stage::DerivingKey, 0, 0, 0);
    let salt = crypto::generate_salt();
    let pass = passphrase.to_string();
    let mut kek = tokio::task::spawn_blocking(move || crypto::derive_key(&pass, &salt))
        .await
        .map_err(join_err)?;
    let mut cek = crypto::generate_cek();
    let wrapped_cek = crypto::wrap_cek(&kek, &cek)?;
    // wrap_cek (AES-GCM) already copied kek into its own key schedule — this is
    // kek's only use, so it's safe to wipe now.
    kek.zeroize();

    // 3. Ledger row first (chunks reference it).
    let chunk_size = ctx.profile.chunk_size as i64;
    let chunk_count = if file_size == 0 {
        1
    } else {
        (file_size + chunk_size - 1) / chunk_size
    };
    let file_id = uuid::Uuid::new_v4().to_string();
    // Placement: byos-direct to the user's own platform when we hold a token,
    // else relay. Persisted so the sync worker and any resume keep this plane.
    let (mode, platform) = super::choose_plane(&ctx.creds);
    // Inserted as 'staging' — invisible to the sync loop (it drains only
    // 'pending'/'init_done'/'uploading') until every chunk is staged below.
    // Inserting as 'pending' here let the 1s loop init a session and push/
    // complete against a PARTIAL chunk list while encryption was still running.
    let _live = StagingLive::register(&file_id);
    ctx.db.insert_file(&LocalFile {
        id: file_id.clone(),
        original_name: file_name.clone(),
        original_size: file_size,
        sha256: file_sha256,
        salt: salt.to_vec(),
        wrapped_cek: wrapped_cek.clone(),
        chunk_count,
        status: "complete".into(),
        sync_status: "staging".into(),
        platform,
        mode,
        ..Default::default()
    })?;

    // 4. Read → process (parallel, bounded) → stage + record. Fallible section
    // wrapped so a mid-staging failure removes the partial row + staged chunks —
    // a leftover 'staging' row would shadow future uploads of this content via
    // the dedup check above (and can never finish: the CEK dies with this call).
    let staged: Result<(), EngineError> = async {
        emit(Stage::Encrypting, 0, chunk_count as u32, 0);
        let staging = staging_dir()?;
        let should_compress = compression::should_compress(&file_name);
        let workers = ctx.profile.effective_workers();
        let sem = Arc::new(tokio::sync::Semaphore::new(workers));
        let mut join: tokio::task::JoinSet<Result<(i64, usize), EngineError>> =
            tokio::task::JoinSet::new();

        let mut f = tokio::fs::File::open(file_path).await?;
        let started = Instant::now();
        let done = Arc::new(std::sync::atomic::AtomicU32::new(0));

        for idx in 0..chunk_count {
            let want = std::cmp::min(chunk_size, file_size - idx * chunk_size).max(0) as usize;
            let mut buf = vec![0u8; want];
            f.read_exact(&mut buf).await?;

            let permit = sem.clone().acquire_owned().await.expect("semaphore");
            let level = ctx.profile.zstd_level;
            let staging = staging.clone();
            let db = ctx.db.clone();
            let fid = file_id.clone();
            join.spawn(async move {
                let _permit = permit;
                let processed = tokio::task::spawn_blocking(move || {
                    // process_chunk's AES-GCM setup copies cek into its own key
                    // schedule — this per-chunk copy is safe to wipe right after.
                    let mut cek = cek;
                    let result = pipeline::process_chunk(&buf, &cek, should_compress, level);
                    cek.zeroize();
                    result
                })
                .await
                .map_err(join_err)??;

                let chunk_id = uuid::Uuid::new_v4().to_string();
                let path = staging.join(format!("{chunk_id}.enc"));
                tokio::fs::write(&path, &processed.encrypted).await?;
                db.insert_chunk(&LocalChunk {
                    id: chunk_id,
                    file_id: fid,
                    idx,
                    size: processed.original_size as i64,
                    encrypted_size: processed.encrypted.len() as i64,
                    compressed_size: processed.compressed_size as i64,
                    sha256: processed.sha256,
                    compressed: processed.compressed,
                    staging_path: path.to_string_lossy().to_string(),
                    ..Default::default()
                })?;
                Ok((idx, processed.encrypted.len()))
            });

            // Surface progress as tasks finish (non-blocking poll).
            while let Some(res) = join.try_join_next() {
                let (_, _) = res.map_err(join_err)??;
                bump_progress(
                    ctx,
                    &done,
                    &file_id,
                    &file_name,
                    chunk_count,
                    file_size,
                    started,
                );
            }
        }
        // Every spawned task above captured its own copy of `cek` (it's Copy) —
        // this original is no longer needed now that they've all been spawned.
        cek.zeroize();
        while let Some(res) = join.join_next().await {
            let (_, _) = res.map_err(join_err)??;
            bump_progress(
                ctx,
                &done,
                &file_id,
                &file_name,
                chunk_count,
                file_size,
                started,
            );
        }
        Ok(())
    }
    .await;

    if let Err(e) = staged {
        // Remove the partial row and its staged ciphertext; a retry re-encrypts
        // from the source file, which still exists.
        if let Ok(paths) = ctx.db.get_staging_paths(&file_id) {
            for p in paths {
                let _ = tokio::fs::remove_file(&p).await;
            }
        }
        let _ = ctx.db.delete_file(&file_id);
        return Err(e);
    }

    // All chunks staged — NOW the row becomes visible to sync.
    ctx.db.update_file_sync_status(&file_id, "pending")?;

    emit(
        Stage::Done,
        chunk_count as u32,
        chunk_count as u32,
        file_size,
    );
    Ok(file_id)
}

fn bump_progress(
    ctx: &EngineContext,
    done: &std::sync::atomic::AtomicU32,
    file_id: &str,
    file_name: &str,
    chunk_count: i64,
    file_size: i64,
    started: Instant,
) {
    let n = done.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
    let elapsed = started.elapsed().as_secs_f64().max(0.001);
    let bytes = (n as i64 * file_size / chunk_count.max(1)).min(file_size);
    (ctx.progress)(Progress {
        file_id: file_id.to_string(),
        file_name: file_name.to_string(),
        stage: Stage::Encrypting,
        chunks_done: n,
        chunks_total: chunk_count as u32,
        bytes_done: bytes,
        bytes_total: file_size,
        speed: bytes as f64 / elapsed,
    });
}

pub(super) async fn sha256_file(path: &Path) -> Result<String, EngineError> {
    sha256_file_progress(path, |_| {}).await
}

/// Like [`sha256_file`] but reports cumulative bytes hashed via `on_bytes` — so a
/// multi-GB hash can drive a moving progress bar instead of sitting frozen (the
/// "stuck at 0%/deriving_key" the streaming upload showed while hashing).
pub(super) async fn sha256_file_progress(
    path: &Path,
    mut on_bytes: impl FnMut(i64),
) -> Result<String, EngineError> {
    let mut f = tokio::fs::File::open(path).await?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 4 * 1024 * 1024];
    let mut total = 0i64;
    loop {
        let n = f.read(&mut buf).await?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        total += n as i64;
        on_bytes(total);
    }
    Ok(hex::encode(hasher.finalize()))
}

fn join_err(e: tokio::task::JoinError) -> EngineError {
    EngineError::Other(format!("task join: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::localdb::LocalDb;
    use crate::profiles;

    #[tokio::test]
    async fn local_upload_stages_and_records() {
        let dir = std::env::temp_dir().join(format!("zcrypt-eng-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let db = Arc::new(LocalDb::open_at(&dir.join("db.sqlite")).unwrap());

        // 2.5 chunks at the light profile (4MB) would be slow; use a tiny fake
        // profile via NORMAL but a small file (1 chunk).
        let src = dir.join("hello.txt");
        std::fs::write(&src, b"hello zcrypt local-first \x00\x01".repeat(1000)).unwrap();

        let events = Arc::new(std::sync::Mutex::new(Vec::new()));
        let ev = events.clone();
        let ctx = EngineContext {
            client: Arc::new(crate::api::Client::new("http://localhost:0", "", "")),
            db: db.clone(),
            profile: profiles::NORMAL,
            progress: Arc::new(move |p: Progress| ev.lock().unwrap().push(p.stage)),
            creds: crate::engines::no_creds(),
            cancel: Default::default(),
        };

        let file_id = run(&ctx, &src, "test-pass").await.unwrap();

        let f = db.get_file_by_id(&file_id).unwrap().unwrap();
        assert_eq!(f.chunk_count, 1);
        assert_eq!(f.sync_status, "pending");
        assert!(!f.wrapped_cek.is_empty());
        let chunks = db.get_pending_chunks(&file_id).unwrap();
        assert_eq!(chunks.len(), 1);
        assert!(std::path::Path::new(&chunks[0].staging_path).exists());

        // Staged bytes decrypt back to the source with the wrapped CEK.
        let kek = crate::crypto::derive_key("test-pass", &f.salt);
        let cek = crate::crypto::unwrap_cek(&kek, &f.wrapped_cek).unwrap();
        let wire = std::fs::read(&chunks[0].staging_path).unwrap();
        let plain =
            super::super::pipeline::unprocess_chunk(&wire, &cek, chunks[0].compressed).unwrap();
        assert_eq!(plain, std::fs::read(&src).unwrap());

        let stages = events.lock().unwrap();
        assert!(stages.contains(&Stage::Hashing));
        assert!(stages.contains(&Stage::Done));

        let _ = std::fs::remove_dir_all(dir);
    }
}
