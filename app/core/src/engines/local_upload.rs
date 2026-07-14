//! Local-first upload — port of `sidecar/pipeline/local_upload.go`: hash,
//! derive keys, chunk + compress + encrypt in parallel, stage to disk, record
//! in the SQLite ledger. Returns instantly relative to network (CPU+disk only);
//! the sync worker pushes later.

use std::path::Path;
use std::sync::Arc;
use std::time::Instant;

use sha2::{Digest, Sha256};
use tokio::io::AsyncReadExt;

use crate::compression;
use crate::crypto;
use crate::localdb::{staging_dir, LocalChunk, LocalFile};
use crate::types::{Progress, Stage};

use super::{pipeline, EngineContext, EngineError};

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

    // 2. Keys: salt → KEK (600k PBKDF2, blocking) → random CEK, wrapped.
    emit(Stage::DerivingKey, 0, 0, 0);
    let salt = crypto::generate_salt();
    let pass = passphrase.to_string();
    let kek = tokio::task::spawn_blocking(move || crypto::derive_key(&pass, &salt))
        .await
        .map_err(join_err)?;
    let cek = crypto::generate_cek();
    let wrapped_cek = crypto::wrap_cek(&kek, &cek)?;

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
    ctx.db.insert_file(&LocalFile {
        id: file_id.clone(),
        original_name: file_name.clone(),
        original_size: file_size,
        sha256: file_sha256,
        salt: salt.to_vec(),
        wrapped_cek: wrapped_cek.clone(),
        chunk_count,
        status: "complete".into(),
        platform,
        mode,
        ..Default::default()
    })?;

    // 4. Read → process (parallel, bounded) → stage + record.
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
                pipeline::process_chunk(&buf, &cek, should_compress, level)
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

async fn sha256_file(path: &Path) -> Result<String, EngineError> {
    let mut f = tokio::fs::File::open(path).await?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 4 * 1024 * 1024];
    loop {
        let n = f.read(&mut buf).await?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
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
