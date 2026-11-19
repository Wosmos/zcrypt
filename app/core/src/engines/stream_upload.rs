//! Streaming upload: parallel concurrent chunk streaming, the browser pipeline
//! ported to native Rust: read a chunk from the source, encrypt it IN MEMORY,
//! fire it at the platform, free it. N chunks in flight at once, N sized to the
//! device. Unlike `local_upload` + `sync` (which encrypt the WHOLE file to a
//! local staging dir first, then read it all back to upload, a disk round-trip
//! and no overlap), nothing is staged to our disk: a 1.4 GB or 100 GB file
//! streams through a small bounded RAM window (`conc` chunks).
//!
//! Resumable: on a repeated init the backend reports which chunks it already has
//! (`upload_status`); we re-stream only the missing ones from the source file.
//! No local ledger row: the backend's session is the source of truth, exactly
//! as the browser pipeline did it.

use std::collections::HashSet;
use std::sync::atomic::{AtomicI64, AtomicU32, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;

use base64::Engine as _;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use zeroize::Zeroize;

use crate::adapters;
use crate::api::types::{ConfirmChunkRequest, UploadInitRequest, UploadInitResponse};
use crate::compression;
use crate::crypto;
use crate::localdb::LocalDb;
use crate::types::{Chunk, ChunkRef, Progress, RepoInfo, Stage, UploadMode};

use super::pipeline::{self, ProcessedChunk};
use super::{EngineContext, EngineError};

/// In-flight RAM window ceiling. `conc` is also capped so `conc * chunk_size`
/// stays under this, so even a huge chunk size can't blow up memory.
const RAM_WINDOW_BYTES: i64 = 256 * 1024 * 1024;

/// Chunks in flight across EVERY concurrent upload in this process. The app
/// runs several files at once, and each file's own `conc` window would
/// otherwise multiply (6 files x 16 chunks), oversubscribing RAM and the
/// uplink. Sized by the first upload's `conc`: the profile, and so the chunk
/// size behind it, is fixed for the process.
fn global_window(conc: usize) -> Arc<tokio::sync::Semaphore> {
    static WINDOW: OnceLock<Arc<tokio::sync::Semaphore>> = OnceLock::new();
    WINDOW
        .get_or_init(|| Arc::new(tokio::sync::Semaphore::new(conc)))
        .clone()
}

fn count_chunks(file_size: i64, chunk_size: i64) -> i64 {
    if file_size == 0 {
        1
    } else {
        (file_size + chunk_size - 1) / chunk_size
    }
}

/// The chunk layout a resumed session was cut at, so re-streamed chunks land on
/// the same offsets as the ones the backend already holds. `None` when the
/// session's layout can't be reproduced and the session must be restarted.
fn session_layout(
    file_size: i64,
    chunk_size: i64,
    chunk_count: i64,
    resp: &UploadInitResponse,
) -> Option<(i64, i64)> {
    let (size, count) = if resp.chunk_size > 0 {
        (resp.chunk_size, count_chunks(file_size, resp.chunk_size))
    } else {
        (chunk_size, chunk_count)
    };
    (resp.chunk_count <= 0 || resp.chunk_count == count).then_some((size, count))
}

/// How an upload protects the file's key and name.
pub enum Sealing<'a> {
    /// The normal vault formats, from the vault (or folder) passphrase.
    Vault(&'a str),
    /// Automatic backup (docs/CRYPTO_FORMAT.md 2.2): sealed to the account's
    /// X25519 public key, so no passphrase is needed and none is held.
    PublicKey([u8; 32]),
}

pub async fn run(
    ctx: &EngineContext,
    file_path: &std::path::Path,
    passphrase: &str,
    platform: Option<String>,
    folder_id: Option<String>,
) -> Result<(), EngineError> {
    run_sealed(
        ctx,
        file_path,
        Sealing::Vault(passphrase),
        platform,
        folder_id,
    )
    .await
    .map(|_| ())
}

/// Where an upload reads its bytes from: a path, or an already open file such
/// as one Android's media library handed over (no path exists to reopen).
#[derive(Clone, Copy)]
pub enum UploadSource<'a> {
    Path(&'a std::path::Path),
    Open {
        file: &'a std::fs::File,
        name: &'a str,
        id: &'a str,
    },
}

impl UploadSource<'_> {
    fn name(&self) -> String {
        match self {
            Self::Path(p) => p
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "file".to_string()),
            Self::Open { name, .. } => name.to_string(),
        }
    }

    async fn stamp(&self) -> Result<(super::local_upload::SourceStamp, i64), EngineError> {
        match self {
            Self::Path(p) => {
                let size = tokio::fs::metadata(p).await?.len() as i64;
                Ok((super::local_upload::SourceStamp::of(p).await?, size))
            }
            Self::Open { file, .. } => Ok((
                super::local_upload::SourceStamp::of_file(file)?,
                file.metadata()?.len() as i64,
            )),
        }
    }

    async fn ensure_unchanged(
        &self,
        stamp: super::local_upload::SourceStamp,
    ) -> Result<(), EngineError> {
        match self {
            Self::Path(p) => stamp.ensure_unchanged(p).await,
            Self::Open { file, .. } => {
                if super::local_upload::SourceStamp::of_file(file)? == stamp {
                    Ok(())
                } else {
                    Err(EngineError::Io(std::io::Error::new(
                        std::io::ErrorKind::Interrupted,
                        "source file changed during upload, retry once it stops changing",
                    )))
                }
            }
        }
    }

    /// A reader positioned at byte 0.
    async fn open(&self) -> Result<tokio::fs::File, EngineError> {
        match self {
            Self::Path(p) => Ok(tokio::fs::File::open(p).await?),
            Self::Open { file, .. } => {
                let mut f = tokio::fs::File::from_std(file.try_clone()?);
                f.seek(std::io::SeekFrom::Start(0)).await?;
                Ok(f)
            }
        }
    }
}

/// What a sealed backup keeps between attempts at one file: the content key and
/// its content MAC. The device holds no private key, so without this a failed
/// attempt could neither continue its server session (the key is gone) nor skip
/// re-hashing (the MAC is keyed by the content key). It only ever covers a file
/// that is still in plaintext on this device, and is dropped on success, cancel,
/// or any change to the file.
struct SealedAttempt {
    cek: [u8; crypto::KEY_SIZE],
    mac: String,
}

impl SealedAttempt {
    fn key(source: &UploadSource<'_>) -> String {
        match source {
            UploadSource::Path(p) => format!("sealed_attempt:{}", p.display()),
            UploadSource::Open { name, id, .. } => format!("sealed_attempt:open:{id}:{name}"),
        }
    }

    fn load(db: &LocalDb, key: &str, token: &str) -> Option<Self> {
        let raw = db.setting(key).ok().flatten()?;
        let mut parts = raw.splitn(3, '|');
        let (saved, cek, mac) = (parts.next()?, parts.next()?, parts.next()?);
        if saved != token {
            return None;
        }
        let cek: [u8; crypto::KEY_SIZE] = base64::engine::general_purpose::STANDARD
            .decode(cek)
            .ok()?
            .try_into()
            .ok()?;
        Some(Self {
            cek,
            mac: mac.to_string(),
        })
    }

    fn save(&self, db: &LocalDb, key: &str, token: &str) {
        let cek = base64::engine::general_purpose::STANDARD.encode(self.cek);
        let _ = db.set_setting(key, &format!("{token}|{cek}|{}", self.mac));
    }

    fn clear(db: &LocalDb, key: &str) {
        let _ = db.set_setting(key, "");
    }
}

/// Uploads one file with the given sealing and returns its backend file id.
pub async fn run_sealed(
    ctx: &EngineContext,
    file_path: &std::path::Path,
    sealing: Sealing<'_>,
    platform: Option<String>,
    folder_id: Option<String>,
) -> Result<String, EngineError> {
    run_sealed_from(
        ctx,
        UploadSource::Path(file_path),
        sealing,
        platform,
        folder_id,
    )
    .await
}

/// [`run_sealed`] for any [`UploadSource`].
pub async fn run_sealed_from(
    ctx: &EngineContext,
    source: UploadSource<'_>,
    sealing: Sealing<'_>,
    platform: Option<String>,
    folder_id: Option<String>,
) -> Result<String, EngineError> {
    let t0 = Instant::now();
    let file_name = source.name();
    let (stamp, file_size) = source.stamp().await?;
    let mut chunk_size = ctx.profile.chunk_size as i64;
    let mut chunk_count = count_chunks(file_size, chunk_size);
    let total = AtomicU32::new(chunk_count as u32);

    let emit = |stage: Stage, done: u32, bytes: i64| {
        (ctx.progress)(Progress {
            file_id: String::new(),
            file_name: file_name.clone(),
            stage,
            chunks_done: done,
            chunks_total: total.load(Ordering::Relaxed),
            bytes_done: bytes,
            bytes_total: file_size,
            speed: 0.0,
        });
    };

    // Keys + file hash.
    emit(Stage::Hashing, 0, 0);
    // `cek` is what we ACTUALLY encrypt chunks with. For a fresh upload it's a
    // new random key; on a RESUMED vault session it is REPLACED below with the
    // file's ORIGINAL key (see the resume block after init), the backend keeps
    // the original envelope and discards this fresh one, so re-streamed chunks
    // MUST use the original CEK or the file becomes undecryptable.
    let mut cek = crypto::generate_cek();
    let attempt_key = matches!(sealing, Sealing::PublicKey(_)).then(|| SealedAttempt::key(&source));
    let stamp_token = stamp.token();
    let cached = attempt_key
        .as_deref()
        .and_then(|k| SealedAttempt::load(&ctx.db, k, &stamp_token));
    if let Some(a) = &cached {
        cek = a.cek;
    }
    let keys = match &sealing {
        Sealing::Vault(passphrase) => Some(super::upload_keys(ctx, passphrase).await?),
        Sealing::PublicKey(_) => None,
    };
    let hasher = match &keys {
        Some(k) => k.hasher(),
        None => {
            let mut mac_key = crate::pk1::cek_mac_key(&cek);
            let h = crypto::ContentHasher::new(crypto::CONTENT_MAC_SCHEME, Some(&mac_key));
            mac_key.zeroize();
            h
        }
    };
    // Report hash progress (throttled to ~1% steps) so the bar moves during the
    // whole-file read instead of freezing: hashing a multi-GB file is a big
    // slice of the wall-clock and looked "stuck at 0%" before.
    let progress = ctx.progress.clone();
    let hfn = file_name.clone();
    let mut last_emit = 0i64;
    let step = (file_size / 100).max(1);
    let content_mac = if let Some(a) = &cached {
        a.mac.clone()
    } else {
        super::local_upload::hash_open_progress(source.open().await?, hasher, |done| {
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
        .await?
    };
    if let (Some(k), None) = (attempt_key.as_deref(), &cached) {
        SealedAttempt {
            cek,
            mac: content_mac.clone(),
        }
        .save(&ctx.db, k, &stamp_token);
    }
    emit(Stage::DerivingKey, 0, 0);
    let salt = crypto::generate_salt();
    let b64 = base64::engine::general_purpose::STANDARD;
    let (wrapped_cek, encrypted_name, scheme) = match &sealing {
        Sealing::Vault(passphrase) => {
            let pass = passphrase.to_string();
            let mut kek = tokio::task::spawn_blocking(move || crypto::derive_key(&pass, &salt))
                .await
                .map_err(join_err)?;
            let wrapped = crypto::wrap_cek(&kek, &cek)?;
            kek.zeroize();
            let name = keys
                .as_ref()
                .expect("vault sealing derives upload keys")
                .seal_name(&file_name)?;
            (b64.encode(&wrapped), name, crypto::CONTENT_MAC_SCHEME)
        }
        Sealing::PublicKey(public) => (
            crate::pk1::seal_pk1(public, &cek)?,
            crate::pk1::seal_pk1(public, file_name.as_bytes())?,
            crate::pk1::CEK_MAC_SCHEME,
        ),
    };

    // Init (or resume) the backend session. Relay leaves mode empty; byos-direct
    // sends the chosen platform so the server makes a metadata-only session.
    let (mode, plat) = super::choose_plane(&ctx.creds);
    let plat = plat.map(|p| p.to_string()).unwrap_or_default();
    let byos = mode == UploadMode::ByosDirect;
    let req = UploadInitRequest {
        original_size: file_size,
        salt: b64.encode(salt),
        wrapped_cek,
        chunk_count,
        chunk_size,
        platform: if byos {
            plat.clone()
        } else {
            platform.clone().unwrap_or_else(|| plat.clone())
        },
        mode: mode.init_field().to_string(),
        folder_id,
        ..Default::default()
    }
    .with_identity_scheme(encrypted_name, content_mac, scheme);
    let mut resp = ctx.client.init_upload(&req).await?;
    if resp.resumed && matches!(sealing, Sealing::PublicKey(_)) && cached.is_none() {
        // A sealed backup holds no private key, so it can only continue a
        // session whose key it kept (`SealedAttempt`). Any other: start over.
        ctx.client.cancel_upload(&resp.session_id).await?;
        resp = ctx.client.init_upload(&req).await?;
        if resp.resumed {
            return Err(EngineError::Other(
                "backup: the server resumed a session this device cannot reopen".into(),
            ));
        }
    }
    if resp.resumed {
        match session_layout(file_size, chunk_size, chunk_count, &resp) {
            Some((size, count)) => {
                chunk_size = size;
                chunk_count = count;
                total.store(count as u32, Ordering::Relaxed);
            }
            None => {
                eprintln!(
                    "zcrypt stream upload {file_name}: resumable session was cut at a different \
                     chunk layout, restarting it"
                );
                ctx.client.cancel_upload(&resp.session_id).await?;
                resp = ctx.client.init_upload(&req).await?;
                if resp.resumed {
                    return Err(EngineError::Other(
                        "resume: session chunk layout does not match this file".into(),
                    ));
                }
            }
        }
    }
    let session_id = resp.session_id;
    let backend_id = resp.file_id;
    let direct = resp.direct_upload;

    // Resume: skip chunks the backend already has, and (critically) encrypt
    // the remaining chunks with the file's ORIGINAL CEK. The backend discarded
    // the fresh envelope we just sent and kept the original (upload.go resume
    // branch), so a fresh CEK here would produce chunks that don't match the
    // stored envelope → an undecryptable file. Recover the original CEK from the
    // file-meta envelope (exactly as the browser did on resume).
    let have: HashSet<i64> = if resp.resumed {
        match sealing {
            Sealing::Vault(passphrase) => {
                let meta = ctx.client.get_file_meta(&backend_id).await?;
                let orig_salt = b64
                    .decode(&meta.salt)
                    .map_err(|e| EngineError::Other(format!("resume: bad stored salt: {e}")))?;
                let orig_wrapped =
                    crypto::WrappedKey::parse(&meta.wrapped_cek)?.ok_or_else(|| {
                        EngineError::Other("resume: stored file has no envelope".into())
                    })?;
                if orig_wrapped.is_mk1() {
                    super::ensure_master_key(ctx, passphrase).await?;
                }
                let pass = passphrase.to_string();
                let mut recovered = tokio::task::spawn_blocking(move || {
                    crypto::resolve_file_key(&pass, &orig_salt, Some(&orig_wrapped))
                })
                .await
                .map_err(join_err)??;
                if recovered.len() != cek.len() {
                    recovered.zeroize();
                    return Err(EngineError::Other(
                        "resume: recovered key has wrong length (wrong passphrase?)".into(),
                    ));
                }
                cek.copy_from_slice(&recovered);
                recovered.zeroize();
            }
            Sealing::PublicKey(_) if cached.is_some() => {}
            Sealing::PublicKey(_) => {
                return Err(EngineError::Other(
                    "backup: resumed session without its key".into(),
                ));
            }
        }

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
    // count. ponytail: static formula, not a live RAM probe, upgrade to sysinfo
    // if these numbers ever prove wrong on a real device.
    let cores = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(4);
    let ram_cap = (RAM_WINDOW_BYTES / chunk_size.max(1)).max(2) as usize;
    let conc = (cores * 2).clamp(4, 16).min(ram_cap);

    emit(Stage::Uploading, have.len() as u32, 0);
    let sem = Arc::new(tokio::sync::Semaphore::new(conc));
    let window = global_window(conc);
    let done = Arc::new(AtomicU32::new(have.len() as u32));
    let enc_total = Arc::new(AtomicI64::new(0));
    let comp_total = Arc::new(AtomicI64::new(0));
    let first_err: Arc<Mutex<Option<EngineError>>> = Arc::new(Mutex::new(None));
    let should_compress = compression::should_compress(&file_name);
    let level = ctx.profile.zstd_level;
    let mut join: tokio::task::JoinSet<()> = tokio::task::JoinSet::new();
    let mut f = source.open().await?;
    let t_upload = Instant::now();

    for idx in 0..chunk_count {
        if have.contains(&idx) {
            continue;
        }
        if ctx.cancel.is_cancelled() {
            set_err(&first_err, EngineError::Cancelled);
            break;
        }
        if first_err.lock().unwrap().is_some() {
            break;
        }
        // Acquire BEFORE reading so at most `conc` chunks' bytes are ever
        // resident. This is the RAM window. Reads are serialized (one at a
        // time, here in the loop); encrypt+upload run concurrently in tasks.
        let Some(permit) = acquire_or_cancel(&sem, &ctx.cancel).await else {
            set_err(&first_err, EngineError::Cancelled);
            break;
        };
        let Some(slot) = acquire_or_cancel(&window, &ctx.cancel).await else {
            set_err(&first_err, EngineError::Cancelled);
            break;
        };
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
            let _slot = slot;
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

            match upload_one(
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
    loop {
        tokio::select! {
            joined = join.join_next() => {
                if joined.is_none() {
                    break;
                }
            }
            _ = ctx.cancel.cancelled() => {
                join.abort_all();
                while join.join_next().await.is_some() {}
                set_err(&first_err, EngineError::Cancelled);
                break;
            }
        }
    }
    if ctx.cancel.is_cancelled() {
        set_err(&first_err, EngineError::Cancelled);
    }
    let failure = first_err.lock().unwrap().take();
    if let Some(e) = failure {
        // A user-requested cancel is not a failure. Return quietly without the
        // alarming FAILED diagnostics line below.
        if matches!(e, EngineError::Cancelled) {
            let _ = ctx.client.cancel_upload(&session_id).await;
            if let Some(k) = attempt_key.as_deref() {
                SealedAttempt::clear(&ctx.db, k);
            }
            eprintln!(
                "zcrypt stream upload {file_name}: cancelled at {}/{chunk_count} chunks",
                done.load(Ordering::SeqCst)
            );
            return Err(e);
        }
        // Walk the whole source chain: the top-level Display collapses transport
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
            "zcrypt stream upload {file_name}: FAILED at {}/{chunk_count} chunks after {:.1}s, {chain}",
            done.load(Ordering::SeqCst),
            t_upload.elapsed().as_secs_f64()
        );
        return Err(e);
    }

    if ctx.cancel.is_cancelled() {
        let _ = ctx.client.cancel_upload(&session_id).await;
        return Err(EngineError::Cancelled);
    }
    source.ensure_unchanged(stamp).await?;
    ctx.client
        .complete_upload(
            &session_id,
            enc_total.load(Ordering::Relaxed),
            comp_total.load(Ordering::Relaxed),
        )
        .await?;
    if let Some(k) = attempt_key.as_deref() {
        SealedAttempt::clear(&ctx.db, k);
    }
    emit(Stage::Done, chunk_count as u32, file_size);

    // Timing line so a real upload prints where the wall-clock actually went.
    let secs = t_upload.elapsed().as_secs_f64().max(0.001);
    let mbps = (file_size as f64 / 1_000_000.0) / secs;
    eprintln!(
        "zcrypt stream upload {file_name}: {chunk_count} chunks, conc={conc}, mode={mode} \
         | total {:.1}s, upload {secs:.1}s, {mbps:.1} MB/s",
        t0.elapsed().as_secs_f64()
    );
    Ok(backend_id)
}

async fn acquire_or_cancel(
    sem: &Arc<tokio::sync::Semaphore>,
    cancel: &super::CancelToken,
) -> Option<tokio::sync::OwnedSemaphorePermit> {
    tokio::select! {
        p = sem.clone().acquire_owned() => Some(p.expect("semaphore")),
        _ = cancel.cancelled() => None,
    }
}

/// Fire ONE already-encrypted chunk (bytes in RAM) at its destination. Three
/// planes, same as `sync::push_chunk*` but byte-based (no staging file): byos
/// (user's own token, direct to platform), presigned direct (HuggingFace LFS),
/// or relay (server stages + forwards). Each stage retries only transient
/// failures (a single blip on ONE chunk must not kill a multi-minute upload)
/// and is raced against cancel. Retrying a stage is safe: the backend dedups by
/// chunk index, and a confirm retry reuses the bytes already pushed instead of
/// pushing them again.
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
        let adapter = adapters::shared_adapter(platform, &creds.token, &creds.account)
            .ok_or_else(|| EngineError::Other(format!("no adapter for {platform}")))?;
        let cref = ChunkRef {
            platform: platform.to_string(),
            account: creds.account.clone(),
            index: idx as i32,
            sha256: p.sha256.clone(),
            compressed: p.compressed,
            ..ChunkRef::default()
        };
        let uploaded = super::retry_transient(&ctx.cancel, 4, || async {
            adapter
                .upload(
                    &repo.url,
                    Chunk {
                        r#ref: cref.clone(),
                        data: p.encrypted.clone(),
                    },
                )
                .await
                .map_err(EngineError::from)
        })
        .await?;
        super::confirm_chunk(
            ctx,
            session_id,
            idx,
            &ConfirmChunkRequest {
                sha256: p.sha256.clone(),
                size: p.encrypted.len() as i64,
                remote_path: uploaded.remote_path.clone(),
                compressed: p.compressed,
                platform: platform.to_string(),
                account: creds.account,
                repo_id: repo.id.clone(),
                committed: true,
            },
            Some((adapter.as_ref(), &uploaded)),
        )
        .await
    } else if direct {
        // HuggingFace LFS presigned: presign -> external PUT -> confirm.
        let presign = super::retry_transient(&ctx.cancel, 4, || async {
            ctx.client
                .presign_chunk(session_id, idx, &p.sha256, p.encrypted.len() as i64)
                .await
                .map_err(EngineError::from)
        })
        .await?;
        if !presign.already_exists {
            super::retry_transient(&ctx.cancel, 4, || async {
                ctx.client
                    .direct_upload_to_url(
                        &presign.upload_url,
                        &presign.upload_headers,
                        p.encrypted.clone(),
                    )
                    .await
                    .map_err(EngineError::from)
            })
            .await?;
        }
        super::confirm_chunk(
            ctx,
            session_id,
            idx,
            &ConfirmChunkRequest {
                sha256: p.sha256.clone(),
                size: p.encrypted.len() as i64,
                remote_path: presign.remote_path,
                compressed: p.compressed,
                ..Default::default()
            },
            None,
        )
        .await
    } else {
        // Relay: the server stages + pushes to the platform.
        super::retry_transient(&ctx.cancel, 4, || async {
            ctx.client
                .upload_chunk(
                    session_id,
                    idx,
                    p.encrypted.clone(),
                    &p.sha256,
                    p.compressed,
                )
                .await
                .map_err(EngineError::from)
        })
        .await
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

#[cfg(test)]
mod tests {
    #[test]
    fn same_named_media_items_get_distinct_attempt_keys() {
        let f = std::fs::File::open(std::env::current_exe().unwrap()).unwrap();
        let open = |id| {
            SealedAttempt::key(&UploadSource::Open {
                file: &f,
                name: "IMG_0001.jpg",
                id,
            })
        };
        assert_ne!(open("external_primary:1"), open("external_primary:2"));
    }

    use super::*;

    const MIB: i64 = 1024 * 1024;

    fn resumed(chunk_size: i64, chunk_count: i64) -> UploadInitResponse {
        UploadInitResponse {
            resumed: true,
            chunk_size,
            chunk_count,
            ..Default::default()
        }
    }

    #[test]
    fn count_chunks_rounds_up() {
        assert_eq!(count_chunks(0, 10 * MIB), 1);
        assert_eq!(count_chunks(10 * MIB, 10 * MIB), 1);
        assert_eq!(count_chunks(10 * MIB + 1, 10 * MIB), 2);
    }

    #[test]
    fn resume_adopts_the_sessions_chunk_size() {
        let file = 100 * MIB;
        let r = resumed(16 * MIB, 7);
        assert_eq!(session_layout(file, 10 * MIB, 10, &r), Some((16 * MIB, 7)));
    }

    #[test]
    fn resume_without_size_keeps_ours_when_counts_match() {
        let r = resumed(0, 10);
        assert_eq!(
            session_layout(100 * MIB, 10 * MIB, 10, &r),
            Some((10 * MIB, 10))
        );
        assert_eq!(
            session_layout(100 * MIB, 10 * MIB, 10, &resumed(0, 0)),
            Some((10 * MIB, 10))
        );
    }

    #[test]
    fn resume_rejects_an_unreproducible_layout() {
        assert_eq!(
            session_layout(100 * MIB, 10 * MIB, 10, &resumed(0, 7)),
            None
        );
        assert_eq!(
            session_layout(100 * MIB, 10 * MIB, 10, &resumed(16 * MIB, 9)),
            None
        );
    }

    use crate::testutil::{serve, Reply};
    use std::time::Duration;

    #[tokio::test]
    async fn cancel_mid_chunk_stops_fast_cancels_the_session_and_skips_complete() {
        let seen: Arc<Mutex<Vec<String>>> = Arc::default();
        let record = seen.clone();
        let (base, _) = serve(move |_, req| {
            record
                .lock()
                .unwrap()
                .push(format!("{} {}", req.method, req.path));
            match (req.method.as_str(), req.path.as_str()) {
                ("POST", "/api/upload/init") => {
                    Reply::status(200, r#"{"session_id":"s1","file_id":"f1"}"#)
                }
                ("PUT", _) => Reply::Hang,
                _ => Reply::status(200, "{}"),
            }
        })
        .await;

        let dir = std::env::temp_dir().join(format!("zcrypt-su-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("a.bin");
        std::fs::write(&file, vec![5u8; 4096]).unwrap();
        let cancel = crate::engines::CancelToken::new();
        let ctx = EngineContext {
            client: Arc::new(crate::api::Client::new(&base, "t", "r")),
            db: Arc::new(crate::localdb::LocalDb::open_at(&dir.join("db.sqlite")).unwrap()),
            profile: crate::profiles::NORMAL,
            progress: Arc::new(|_p| {}),
            creds: crate::engines::no_creds(),
            cancel: cancel.clone(),
            vault_passphrase: None,
        };
        let trip = cancel.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(600)).await;
            trip.cancel();
        });

        let started = Instant::now();
        let r = run_sealed(&ctx, &file, Sealing::PublicKey([7u8; 32]), None, None).await;
        assert!(matches!(r, Err(EngineError::Cancelled)), "{r:?}");
        assert!(started.elapsed() < Duration::from_secs(5));

        let calls = seen.lock().unwrap().clone();
        assert!(
            calls.iter().any(|c| c == "DELETE /api/upload/s1"),
            "{calls:?}"
        );
        assert!(!calls.iter().any(|c| c.contains("/complete")), "{calls:?}");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn a_403_on_a_relay_chunk_is_sent_once_not_four_times() {
        let (base, hits) = serve(|_, req| match (req.method.as_str(), req.path.as_str()) {
            ("POST", "/api/upload/init") => {
                Reply::status(200, r#"{"session_id":"s1","file_id":"f1"}"#)
            }
            ("PUT", _) => Reply::status(403, "forbidden"),
            _ => Reply::status(200, "{}"),
        })
        .await;
        let dir = std::env::temp_dir().join(format!("zcrypt-su-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("a.bin");
        std::fs::write(&file, vec![5u8; 4096]).unwrap();
        let ctx = EngineContext {
            client: Arc::new(crate::api::Client::new(&base, "t", "r")),
            db: Arc::new(crate::localdb::LocalDb::open_at(&dir.join("db.sqlite")).unwrap()),
            profile: crate::profiles::NORMAL,
            progress: Arc::new(|_p| {}),
            creds: crate::engines::no_creds(),
            cancel: Default::default(),
            vault_passphrase: None,
        };
        let r = run_sealed(&ctx, &file, Sealing::PublicKey([7u8; 32]), None, None).await;
        assert!(r.is_err());
        // init + one PUT + the session cancel is not sent on a plain failure
        assert_eq!(hits.load(Ordering::SeqCst), 2);
        let _ = std::fs::remove_dir_all(dir);
    }

    fn sealed_ctx(base: &str, dir: &std::path::Path) -> EngineContext {
        EngineContext {
            client: Arc::new(crate::api::Client::new(base, "t", "r")),
            db: Arc::new(crate::localdb::LocalDb::open_at(&dir.join("db.sqlite")).unwrap()),
            profile: crate::profiles::NORMAL,
            progress: Arc::new(|_p| {}),
            creds: crate::engines::no_creds(),
            cancel: Default::default(),
            vault_passphrase: None,
        }
    }

    #[tokio::test]
    async fn a_failed_sealed_upload_resumes_with_its_key_and_hash_instead_of_starting_over() {
        let inits: Arc<Mutex<Vec<String>>> = Arc::default();
        let calls: Arc<Mutex<Vec<String>>> = Arc::default();
        let puts = Arc::new(AtomicU32::new(0));
        let (i, c, p) = (inits.clone(), calls.clone(), puts.clone());
        let (base, _) = serve(move |_, req| {
            c.lock()
                .unwrap()
                .push(format!("{} {}", req.method, req.path));
            match (req.method.as_str(), req.path.as_str()) {
                ("POST", "/api/upload/init") => {
                    let mut seen = i.lock().unwrap();
                    seen.push(String::from_utf8_lossy(&req.body).to_string());
                    if seen.len() == 1 {
                        Reply::status(200, r#"{"session_id":"s1","file_id":"f1"}"#)
                    } else {
                        Reply::status(200, r#"{"session_id":"s1","file_id":"f1","resumed":true}"#)
                    }
                }
                ("PUT", _) => {
                    if p.fetch_add(1, Ordering::SeqCst) == 0 {
                        Reply::status(403, "forbidden")
                    } else {
                        Reply::status(200, r#"{"success":true}"#)
                    }
                }
                ("GET", "/api/upload/s1/status") => Reply::status(200, r#"{"uploaded_chunks":[]}"#),
                ("POST", "/api/upload/s1/complete") => {
                    Reply::status(200, r#"{"success":true,"file_id":"f1"}"#)
                }
                _ => Reply::status(200, "{}"),
            }
        })
        .await;
        let dir = std::env::temp_dir().join(format!("zcrypt-su-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("a.bin");
        std::fs::write(&file, vec![5u8; 4096]).unwrap();
        let ctx = sealed_ctx(&base, &dir);

        let first = run_sealed(&ctx, &file, Sealing::PublicKey([7u8; 32]), None, None).await;
        assert!(first.is_err());
        let second = run_sealed(&ctx, &file, Sealing::PublicKey([7u8; 32]), None, None).await;
        assert!(second.is_ok(), "{second:?}");

        let bodies = inits.lock().unwrap().clone();
        let mac = |b: &str| {
            serde_json::from_str::<serde_json::Value>(b).unwrap()["sha256"]
                .as_str()
                .unwrap()
                .to_string()
        };
        assert_eq!(bodies.len(), 2);
        assert_eq!(
            mac(&bodies[0]),
            mac(&bodies[1]),
            "the content MAC is reused, so the server matches the session"
        );
        let seen = calls.lock().unwrap().clone();
        assert!(
            !seen.iter().any(|c| c.starts_with("DELETE")),
            "the resumed session is kept: {seen:?}"
        );
        assert!(seen.iter().any(|c| c.contains("/complete")), "{seen:?}");
        let key = format!("sealed_attempt:{}", file.display());
        assert_eq!(
            ctx.db.setting(&key).unwrap().as_deref(),
            Some(""),
            "a finished upload drops the saved key"
        );
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn a_changed_file_does_not_reuse_the_saved_key_and_a_foreign_resume_starts_over() {
        let inits: Arc<Mutex<Vec<String>>> = Arc::default();
        let calls: Arc<Mutex<Vec<String>>> = Arc::default();
        let (i, c) = (inits.clone(), calls.clone());
        let (base, _) = serve(move |_, req| {
            c.lock()
                .unwrap()
                .push(format!("{} {}", req.method, req.path));
            match (req.method.as_str(), req.path.as_str()) {
                ("POST", "/api/upload/init") => {
                    let mut seen = i.lock().unwrap();
                    seen.push(String::from_utf8_lossy(&req.body).to_string());
                    Reply::status(200, r#"{"session_id":"s1","file_id":"f1"}"#)
                }
                ("PUT", _) => Reply::status(403, "forbidden"),
                _ => Reply::status(200, "{}"),
            }
        })
        .await;
        let dir = std::env::temp_dir().join(format!("zcrypt-su-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("a.bin");
        std::fs::write(&file, vec![5u8; 4096]).unwrap();
        let ctx = sealed_ctx(&base, &dir);

        assert!(
            run_sealed(&ctx, &file, Sealing::PublicKey([7u8; 32]), None, None)
                .await
                .is_err()
        );
        std::fs::write(&file, vec![6u8; 8192]).unwrap();
        assert!(
            run_sealed(&ctx, &file, Sealing::PublicKey([7u8; 32]), None, None)
                .await
                .is_err()
        );

        let bodies = inits.lock().unwrap().clone();
        let mac = |b: &str| {
            serde_json::from_str::<serde_json::Value>(b).unwrap()["sha256"]
                .as_str()
                .unwrap()
                .to_string()
        };
        assert_ne!(mac(&bodies[0]), mac(&bodies[1]));
        let _ = std::fs::remove_dir_all(dir);
    }
}
