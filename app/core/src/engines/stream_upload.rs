//! Streaming upload — parallel concurrent chunk streaming, the browser pipeline
//! ported to native Rust: read a chunk from the source, encrypt it IN MEMORY,
//! fire it at the platform, free it — N chunks in flight at once, N sized to the
//! device. Unlike `local_upload` + `sync` (which encrypt the WHOLE file to a
//! local staging dir first, then read it all back to upload — a disk round-trip
//! and no overlap), nothing is staged to our disk: a 1.4 GB or 100 GB file
//! streams through a small bounded RAM window (`conc` chunks).
//!
//! Resumable: on a repeated init the backend reports which chunks it already has
//! (`upload_status`); we re-stream only the missing ones from the source file.
//! No local ledger row — the backend's session is the source of truth, exactly
//! as the browser pipeline did it.

use std::collections::HashSet;
use std::sync::atomic::{AtomicI64, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use base64::Engine as _;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use zeroize::Zeroize;

use crate::adapters;
use crate::api::types::{ConfirmChunkRequest, UploadInitRequest};
use crate::compression;
use crate::crypto;
use crate::types::{Chunk, ChunkRef, Progress, RepoInfo, Stage};

use super::pipeline::{self, ProcessedChunk};
use super::{EngineContext, EngineError};

/// In-flight RAM window ceiling. `conc` is also capped so `conc * chunk_size`
/// stays under this, so even a huge chunk size can't blow up memory.
const RAM_WINDOW_BYTES: i64 = 256 * 1024 * 1024;

pub async fn run(
    ctx: &EngineContext,
    file_path: &std::path::Path,
    passphrase: &str,
    platform: Option<String>,
) -> Result<(), EngineError> {
    let t0 = Instant::now();
    let file_name = file_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".to_string());
    let file_size = tokio::fs::metadata(file_path).await?.len() as i64;
    let chunk_size = ctx.profile.chunk_size as i64;
    let chunk_count = if file_size == 0 {
        1
    } else {
        (file_size + chunk_size - 1) / chunk_size
    };

    let emit = |stage: Stage, done: u32, bytes: i64| {
        (ctx.progress)(Progress {
            file_id: String::new(),
            file_name: file_name.clone(),
            stage,
            chunks_done: done,
            chunks_total: chunk_count as u32,
            bytes_done: bytes,
            bytes_total: file_size,
            speed: 0.0,
        });
    };

    // Keys + file hash.
    emit(Stage::Hashing, 0, 0);
    // Report hash progress (throttled to ~1% steps) so the bar moves during the
    // whole-file read instead of freezing — hashing a multi-GB file is a big
    // slice of the wall-clock and looked "stuck at 0%" before.
    let progress = ctx.progress.clone();
    let hfn = file_name.clone();
    let mut last_emit = 0i64;
    let step = (file_size / 100).max(1);
    let sha256 = super::local_upload::sha256_file_progress(file_path, |done| {
        if done - last_emit >= step {
            last_emit = done;
            (progress)(Progress {
                file_id: String::new(),
                file_name: hfn.clone(),
                stage: Stage::Hashing,
                chunks_done: 0,
                chunks_total: chunk_count as u32,
                bytes_done: done,
                bytes_total: file_size,
                speed: 0.0,
            });
        }
    })
    .await?;
    emit(Stage::DerivingKey, 0, 0);
    let salt = crypto::generate_salt();
    let pass = passphrase.to_string();
    let mut kek = tokio::task::spawn_blocking(move || crypto::derive_key(&pass, &salt))
        .await
        .map_err(join_err)?;
    // `cek` is what we ACTUALLY encrypt chunks with. For a fresh upload it's a
    // new random key; on a RESUMED session it is REPLACED below with the file's
    // ORIGINAL key (see the resume block after init) — the backend keeps the
    // original envelope and discards this fresh one, so re-streamed chunks MUST
    // use the original CEK or the file becomes undecryptable (mismatched CEK).
    let mut cek = crypto::generate_cek();
    let wrapped_cek = crypto::wrap_cek(&kek, &cek)?;
    kek.zeroize();

    // Init (or resume) the backend session. Relay leaves mode empty; byos-direct
    // sends the chosen platform so the server makes a metadata-only session.
    let (mode, plat) = super::choose_plane(&ctx.creds);
    let byos = mode == "byos-direct";
    let b64 = base64::engine::general_purpose::STANDARD;
    let req = UploadInitRequest {
        filename: file_name.clone(),
        original_size: file_size,
        sha256: sha256.clone(),
        salt: b64.encode(salt),
        wrapped_cek: b64.encode(&wrapped_cek),
        chunk_count,
        platform: if byos {
            plat.clone()
        } else {
            platform.clone().unwrap_or_else(|| plat.clone())
        },
        mode: if byos {
            "byos-direct".to_string()
        } else {
            String::new()
        },
        ..Default::default()
    };
    let resp = ctx.client.init_upload(&req).await?;
    let session_id = resp.session_id;
    let backend_id = resp.file_id;
    let direct = resp.direct_upload;

    // Resume: skip chunks the backend already has, and — critically — encrypt
    // the remaining chunks with the file's ORIGINAL CEK. The backend discarded
    // the fresh envelope we just sent and kept the original (upload.go resume
    // branch), so a fresh CEK here would produce chunks that don't match the
    // stored envelope → an undecryptable file. Recover the original CEK from the
    // file-meta envelope (exactly as the browser did on resume).
    let have: HashSet<i64> = if resp.resumed {
        let meta = ctx.client.get_file_meta(&backend_id).await?;
        let orig_salt = b64
            .decode(&meta.salt)
            .map_err(|e| EngineError::Other(format!("resume: bad stored salt: {e}")))?;
        let orig_wrapped = b64
            .decode(&meta.wrapped_cek)
            .map_err(|e| EngineError::Other(format!("resume: bad stored envelope: {e}")))?;
        let pass = passphrase.to_string();
        let mut kek = tokio::task::spawn_blocking(move || crypto::derive_key(&pass, &orig_salt))
            .await
            .map_err(join_err)?;
        let mut recovered = crypto::unwrap_cek(&kek, &orig_wrapped)?;
        kek.zeroize();
        if recovered.len() != cek.len() {
            recovered.zeroize();
            return Err(EngineError::Other(
                "resume: recovered key has wrong length (wrong passphrase?)".into(),
            ));
        }
        cek.copy_from_slice(&recovered);
        recovered.zeroize();

        ctx.client
            .upload_status(&session_id)
            .await
            .unwrap_or_default()
            .into_iter()
            .collect()
    } else {
        HashSet::new()
    };

    // byos-direct: resolve the ONE destination repo up front (per-chunk would
    // race N chunks into creating N repos).
    let byos_repo: Option<Arc<RepoInfo>> = if byos {
        Some(Arc::new(super::sync::resolve_byos_repo(ctx, &plat).await?))
    } else {
        None
    };

    // Device-scaled concurrency, bounded by the RAM window. Wide enough to beat
    // per-connection upload throttling (the actual bottleneck), not just core
    // count. ponytail: static formula, not a live RAM probe — upgrade to sysinfo
    // if these numbers ever prove wrong on a real device.
    let cores = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    let ram_cap = (RAM_WINDOW_BYTES / chunk_size.max(1)).max(2) as usize;
    let conc = (cores * 2).clamp(4, 16).min(ram_cap);

    emit(Stage::Uploading, have.len() as u32, 0);
    let sem = Arc::new(tokio::sync::Semaphore::new(conc));
    let done = Arc::new(AtomicU32::new(have.len() as u32));
    let enc_total = Arc::new(AtomicI64::new(0));
    let comp_total = Arc::new(AtomicI64::new(0));
    let first_err: Arc<Mutex<Option<EngineError>>> = Arc::new(Mutex::new(None));
    let should_compress = compression::should_compress(&file_name);
    let level = ctx.profile.zstd_level;
    let mut join: tokio::task::JoinSet<()> = tokio::task::JoinSet::new();
    let mut f = tokio::fs::File::open(file_path).await?;
    let t_upload = Instant::now();

    for idx in 0..chunk_count {
        if have.contains(&idx) {
            continue;
        }
        if first_err.lock().unwrap().is_some() {
            break;
        }
        // Acquire BEFORE reading so at most `conc` chunks' bytes are ever
        // resident — this is the RAM window. Reads are serialized (one at a
        // time, here in the loop); encrypt+upload run concurrently in tasks.
        let permit = sem.clone().acquire_owned().await.expect("semaphore");
        let want = std::cmp::min(chunk_size, file_size - idx * chunk_size).max(0) as usize;
        f.seek(std::io::SeekFrom::Start((idx * chunk_size) as u64))
            .await?;
        let mut buf = vec![0u8; want];
        f.read_exact(&mut buf).await?;

        let ctx = ctx.clone();
        let cek = cek;
        let session_id = session_id.clone();
        let backend_id = backend_id.clone();
        let file_name = file_name.clone();
        let repo = byos_repo.clone();
        let plat = plat.clone();
        let done = done.clone();
        let enc_total = enc_total.clone();
        let comp_total = comp_total.clone();
        let first_err = first_err.clone();
        join.spawn(async move {
            let _permit = permit;
            // Encrypt IN MEMORY (native, off the async runtime).
            let processed = match tokio::task::spawn_blocking(move || {
                let mut cek = cek;
                let r = pipeline::process_chunk(&buf, &cek, should_compress, level);
                cek.zeroize();
                r
            })
            .await
            {
                Ok(Ok(p)) => p,
                Ok(Err(e)) => return set_err(&first_err, e),
                Err(e) => return set_err(&first_err, join_err(e)),
            };
            enc_total.fetch_add(processed.encrypted.len() as i64, Ordering::Relaxed);
            comp_total.fetch_add(processed.compressed_size as i64, Ordering::Relaxed);

            match upload_one_retrying(
                &ctx,
                &session_id,
                idx,
                &processed,
                direct,
                repo.as_deref(),
                &plat,
            )
            .await
            {
                Ok(()) => {
                    let n = done.fetch_add(1, Ordering::SeqCst) + 1;
                    (ctx.progress)(Progress {
                        file_id: backend_id,
                        file_name,
                        stage: Stage::Uploading,
                        chunks_done: n,
                        chunks_total: chunk_count as u32,
                        bytes_done: (n as i64) * (file_size / chunk_count.max(1)),
                        bytes_total: file_size,
                        speed: 0.0,
                    });
                }
                Err(e) => set_err(&first_err, e),
            }
        });
    }
    cek.zeroize();
    while join.join_next().await.is_some() {}
    if let Some(e) = first_err.lock().unwrap().take() {
        // Walk the whole source chain — the top-level Display collapses transport
        // failures ("http: error decoding response body") and drops the real
        // reason (which JSON field, connection reset, TLS, …). We were blind to
        // an HF null-headers decode until this.
        let mut chain = e.to_string();
        let mut src = std::error::Error::source(&e);
        while let Some(s) = src {
            chain.push_str(" -> ");
            chain.push_str(&s.to_string());
            src = s.source();
        }
        eprintln!(
            "zcrypt stream upload {file_name}: FAILED at {}/{chunk_count} chunks after {:.1}s — {chain}",
            done.load(Ordering::SeqCst),
            t_upload.elapsed().as_secs_f64()
        );
        return Err(e);
    }

    ctx.client
        .complete_upload(
            &session_id,
            enc_total.load(Ordering::Relaxed),
            comp_total.load(Ordering::Relaxed),
        )
        .await?;
    emit(Stage::Done, chunk_count as u32, file_size);

    // Timing line so a real upload prints where the wall-clock actually went.
    let secs = t_upload.elapsed().as_secs_f64().max(0.001);
    let mbps = (file_size as f64 / 1_000_000.0) / secs;
    eprintln!(
        "zcrypt stream upload {file_name}: {chunk_count} chunks, conc={conc}, mode={mode} \
         | total {:.1}s, upload {secs:.1}s, {mbps:.1} MB/s",
        t0.elapsed().as_secs_f64()
    );
    Ok(())
}

/// `upload_one` with bounded retry — a single transient blip (dropped
/// connection, 5xx, timeout) on ONE chunk must not kill a multi-minute upload.
/// The browser pipeline retried every chunk; so does the download path. Safe to
/// retry: the backend dedups by chunk index (a re-sent chunk returns
/// `duplicate:true`), so a partially-succeeded chunk isn't double-counted.
/// "upload session is not active" is terminal for this session (retrying the
/// same dead session is pointless) — surfaced immediately so the caller can
/// re-init/resume instead.
async fn upload_one_retrying(
    ctx: &EngineContext,
    session_id: &str,
    idx: i64,
    p: &ProcessedChunk,
    direct: bool,
    repo: Option<&RepoInfo>,
    platform: &str,
) -> Result<(), EngineError> {
    let mut last: Option<EngineError> = None;
    for attempt in 0..4u32 {
        match upload_one(ctx, session_id, idx, p, direct, repo, platform).await {
            Ok(()) => return Ok(()),
            Err(e) if e.to_string().contains("upload session is not active") => return Err(e),
            Err(e) => last = Some(e),
        }
        if attempt < 3 {
            tokio::time::sleep(std::time::Duration::from_millis(500 << attempt)).await;
        }
    }
    Err(last.unwrap_or_else(|| EngineError::Other(format!("chunk {idx}: no upload attempts"))))
}

/// Fire ONE already-encrypted chunk (bytes in RAM) at its destination. Three
/// planes, same as `sync::push_chunk*` but byte-based (no staging file): byos
/// (user's own token, direct to platform), presigned direct (HuggingFace LFS),
/// or relay (server stages + forwards).
async fn upload_one(
    ctx: &EngineContext,
    session_id: &str,
    idx: i64,
    p: &ProcessedChunk,
    direct: bool,
    repo: Option<&RepoInfo>,
    platform: &str,
) -> Result<(), EngineError> {
    if let Some(repo) = repo {
        let creds = (ctx.creds)(platform)
            .ok_or_else(|| EngineError::Other(format!("no personal token for {platform}")))?;
        let adapter = adapters::new_adapter(platform, &creds.token, &creds.account)
            .ok_or_else(|| EngineError::Other(format!("no adapter for {platform}")))?;
        let cref = ChunkRef {
            platform: platform.to_string(),
            account: creds.account.clone(),
            index: idx as i32,
            sha256: p.sha256.clone(),
            compressed: p.compressed,
            ..ChunkRef::default()
        };
        let uploaded = adapter
            .upload(
                &repo.url,
                Chunk {
                    r#ref: cref,
                    data: p.encrypted.clone(),
                },
            )
            .await
            .map_err(|e| EngineError::Other(format!("upload chunk {idx}: {e}")))?;
        ctx.client
            .confirm_chunk(
                session_id,
                idx,
                &ConfirmChunkRequest {
                    sha256: p.sha256.clone(),
                    size: p.encrypted.len() as i64,
                    remote_path: uploaded.remote_path,
                    compressed: p.compressed,
                    platform: platform.to_string(),
                    account: creds.account,
                    repo_id: repo.id.clone(),
                    committed: true,
                },
            )
            .await?;
        Ok(())
    } else if direct {
        // HuggingFace LFS presigned: presign -> external PUT -> confirm.
        let presign = ctx
            .client
            .presign_chunk(session_id, idx, &p.sha256, p.encrypted.len() as i64)
            .await?;
        if !presign.already_exists {
            ctx.client
                .direct_upload_to_url(
                    &presign.upload_url,
                    &presign.upload_headers,
                    p.encrypted.clone(),
                )
                .await?;
        }
        ctx.client
            .confirm_chunk(
                session_id,
                idx,
                &ConfirmChunkRequest {
                    sha256: p.sha256.clone(),
                    size: p.encrypted.len() as i64,
                    remote_path: presign.remote_path,
                    compressed: p.compressed,
                    ..Default::default()
                },
            )
            .await?;
        Ok(())
    } else {
        // Relay: the server stages + pushes to the platform.
        ctx.client
            .upload_chunk(
                session_id,
                idx,
                p.encrypted.clone(),
                &p.sha256,
                p.compressed,
            )
            .await?;
        Ok(())
    }
}

fn set_err(slot: &Mutex<Option<EngineError>>, e: EngineError) {
    let mut g = slot.lock().unwrap();
    if g.is_none() {
        *g = Some(e);
    }
}

fn join_err(e: tokio::task::JoinError) -> EngineError {
    EngineError::Other(format!("task join: {e}"))
}
