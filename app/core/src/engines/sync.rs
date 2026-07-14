//! Background sync — port of `sidecar/pipeline/sync_worker.go`: drive each
//! pending ledger file through init → chunk push → complete, deleting staged
//! ciphertext once it's remote. State machine: pending → init_done →
//! uploading → synced (or error).

use std::sync::Arc;

use async_trait::async_trait;
use base64::Engine as _;

use crate::adapters;
use crate::api::types::{ConfirmChunkRequest, UploadInitRequest};
use crate::api::Client;
use crate::localdb::{LocalChunk, LocalFile};
use crate::reppool::{self, RepoStore};
use crate::types::{Chunk, ChunkRef, Progress, RepoInfo, Stage};

use super::{EngineContext, EngineError};

/// One pass over every pending file (called by the 1s loop). Errors are
/// recorded per file/chunk in the ledger, never bubbled — the loop must
/// survive offline periods.
pub async fn sync_once(ctx: &EngineContext) {
    let files = match ctx.db.get_pending_files() {
        Ok(f) => f,
        Err(e) => {
            eprintln!("sync: get pending files: {e}");
            return;
        }
    };
    for f in files {
        if let Err(e) = sync_file(ctx, f, None).await {
            eprintln!("sync: {e}");
        }
    }
}

/// Sync a single ledger file to completion (used by `engines::upload`).
pub async fn sync_file_by_id(
    ctx: &EngineContext,
    file_id: &str,
    platform: Option<&str>,
) -> Result<(), EngineError> {
    let f = ctx
        .db
        .get_file_by_id(file_id)?
        .ok_or_else(|| EngineError::Other(format!("file {file_id} not in ledger")))?;
    sync_file(ctx, f, platform).await
}

async fn sync_file(
    ctx: &EngineContext,
    mut f: LocalFile,
    platform: Option<&str>,
) -> Result<(), EngineError> {
    if f.sync_status == "pending" {
        match init_remote_session(ctx, &f, platform).await {
            Ok((session_id, backend_id, plat, repo_url, direct)) => {
                ctx.db.update_file_sync_state(
                    &f.id,
                    "init_done",
                    &session_id,
                    &backend_id,
                    &plat,
                    &repo_url,
                    direct,
                )?;
                f.session_id = session_id;
                f.backend_file_id = backend_id;
                f.direct_upload = direct;
                f.sync_status = "init_done".into();
            }
            Err(e) => {
                let _ = ctx
                    .db
                    .update_file_sync_error(&f.id, &format!("init failed: {e}"));
                return Err(e);
            }
        }
    }

    if f.session_id.is_empty() {
        // Lost the session somehow — reset and retry next pass.
        ctx.db.update_file_sync_status(&f.id, "pending")?;
        return Ok(());
    }

    ctx.db.update_file_sync_status(&f.id, "uploading")?;
    let chunks = ctx.db.get_pending_chunks(&f.id)?;
    let total = f.chunk_count as u32;
    let already = total.saturating_sub(chunks.len() as u32);

    for (i, chunk) in chunks.iter().enumerate() {
        match push_chunk(ctx, &f, chunk).await {
            Ok(()) => {
                let _ = tokio::fs::remove_file(&chunk.staging_path).await;
                (ctx.progress)(Progress {
                    file_id: f.backend_file_id.clone(),
                    file_name: f.original_name.clone(),
                    stage: Stage::Uploading,
                    chunks_done: already + i as u32 + 1,
                    chunks_total: total,
                    bytes_done: (already as i64 + i as i64 + 1)
                        * (f.original_size / f.chunk_count.max(1)),
                    bytes_total: f.original_size,
                    speed: 0.0,
                });
            }
            Err(e) => {
                let _ = ctx.db.update_chunk_error(&chunk.id, &e.to_string());
                let _ = ctx
                    .db
                    .update_file_sync_error(&f.id, &format!("chunk {}: {e}", chunk.idx));
                return Err(e);
            }
        }
    }

    if !ctx.db.all_chunks_synced(&f.id)? {
        return Ok(()); // some chunks errored — retried next pass after reset
    }

    (ctx.progress)(Progress {
        file_id: f.backend_file_id.clone(),
        file_name: f.original_name.clone(),
        stage: Stage::Finalizing,
        chunks_done: total,
        chunks_total: total,
        bytes_done: f.original_size,
        bytes_total: f.original_size,
        speed: 0.0,
    });
    let (enc, comp) = ctx.db.get_chunk_totals(&f.id)?;
    ctx.client.complete_upload(&f.session_id, enc, comp).await?;
    ctx.db.update_file_sync_status(&f.id, "synced")?;
    Ok(())
}

async fn init_remote_session(
    ctx: &EngineContext,
    f: &LocalFile,
    platform: Option<&str>,
) -> Result<(String, String, String, String, bool), EngineError> {
    let b64 = base64::engine::general_purpose::STANDARD;
    // byos-direct: the client owns placement — send the chosen platform + mode so
    // the server creates a metadata-only session (no server repo). Relay leaves
    // mode empty and lets the server pick + create the repo.
    let byos = f.mode == "byos-direct";
    let req = UploadInitRequest {
        filename: f.original_name.clone(),
        original_size: f.original_size,
        sha256: f.sha256.clone(),
        salt: b64.encode(&f.salt),
        wrapped_cek: b64.encode(&f.wrapped_cek),
        chunk_count: f.chunk_count,
        platform: if byos {
            f.platform.clone()
        } else {
            platform.unwrap_or(&f.platform).to_string()
        },
        mode: if byos {
            "byos-direct".to_string()
        } else {
            String::new()
        },
        ..Default::default()
    };
    let resp = ctx.client.init_upload(&req).await?;
    Ok((
        resp.session_id,
        resp.file_id,
        resp.platform,
        resp.repo_url,
        resp.direct_upload,
    ))
}

async fn push_chunk(
    ctx: &EngineContext,
    f: &LocalFile,
    chunk: &LocalChunk,
) -> Result<(), EngineError> {
    // byos-direct: push straight to the user's own storage with the user's own
    // token; the server never sees the bytes (no egress).
    if f.mode == "byos-direct" {
        return push_chunk_byos(ctx, f, chunk).await;
    }

    let data = tokio::fs::read(&chunk.staging_path).await?;

    let remote_path = if f.direct_upload {
        // Presigned direct path (HuggingFace LFS): presign → external PUT → confirm.
        let presign = ctx
            .client
            .presign_chunk(&f.session_id, chunk.idx, &chunk.sha256, data.len() as i64)
            .await?;
        if !presign.already_exists {
            ctx.client
                .direct_upload_to_url(&presign.upload_url, &presign.upload_headers, data)
                .await?;
        }
        ctx.client
            .confirm_chunk(
                &f.session_id,
                chunk.idx,
                &ConfirmChunkRequest {
                    sha256: chunk.sha256.clone(),
                    size: chunk.encrypted_size,
                    remote_path: presign.remote_path.clone(),
                    compressed: chunk.compressed,
                    ..Default::default()
                },
            )
            .await?;
        presign.remote_path
    } else {
        // Relay path: the server stages + pushes to the platform.
        ctx.client
            .upload_chunk(
                &f.session_id,
                chunk.idx,
                data,
                &chunk.sha256,
                chunk.compressed,
            )
            .await?;
        String::new()
    };

    ctx.db.update_chunk_synced(&chunk.id, &remote_path)?;
    Ok(())
}

/// byos-direct chunk push: pick/create a repo on the user's OWN platform (via
/// the API-backed pool store), upload the ciphertext with the user's OWN
/// adapter, then confirm metadata (committed = TRUE — git/Telegram commit
/// atomically and the HF adapter does LFS+commit before returning). The server
/// never handles the bytes.
async fn push_chunk_byos(
    ctx: &EngineContext,
    f: &LocalFile,
    chunk: &LocalChunk,
) -> Result<(), EngineError> {
    let creds = (ctx.creds)(&f.platform)
        .ok_or_else(|| EngineError::Other(format!("no personal token for {}", f.platform)))?;
    let adapter = adapters::new_adapter(&f.platform, &creds.token, &creds.account)
        .ok_or_else(|| EngineError::Other(format!("no adapter for {}", f.platform)))?;

    // Client-side pool over the control plane: list/register repos through the
    // backend so locators + usage stay consistent, but create them on the user's
    // own platform with the user's own token.
    let store = ApiRepoStore {
        client: ctx.client.clone(),
    };
    let pool = reppool::Pool {
        adapter: adapter.as_ref(),
        store: &store,
        account: creds.account.clone(),
        threshold: reppool::default_threshold(&f.platform),
    };
    let repo = pool
        .get_or_create_repo()
        .await
        .map_err(|e| EngineError::Other(format!("repo: {e}")))?;

    let data = tokio::fs::read(&chunk.staging_path).await?;
    let obj = Chunk {
        r#ref: ChunkRef {
            platform: f.platform.clone(),
            account: creds.account.clone(),
            index: chunk.idx as i32,
            sha256: chunk.sha256.clone(),
            compressed: chunk.compressed,
            ..ChunkRef::default()
        },
        data,
    };
    let uploaded = adapter
        .upload(&repo.url, obj)
        .await
        .map_err(|e| EngineError::Other(format!("upload chunk {}: {e}", chunk.idx)))?;

    ctx.client
        .confirm_chunk(
            &f.session_id,
            chunk.idx,
            &ConfirmChunkRequest {
                sha256: chunk.sha256.clone(),
                size: chunk.encrypted_size,
                remote_path: uploaded.remote_path.clone(),
                compressed: chunk.compressed,
                platform: f.platform.clone(),
                account: creds.account.clone(),
                repo_id: repo.id.clone(),
                committed: true,
            },
        )
        .await?;

    ctx.db
        .update_chunk_synced(&chunk.id, &uploaded.remote_path)?;
    Ok(())
}

/// A `reppool::RepoStore` backed by the control-plane API: repos are listed and
/// registered through the backend (so locators + usage stay authoritative) but
/// physically created on the user's own platform by the caller's adapter.
struct ApiRepoStore {
    client: Arc<Client>,
}

#[async_trait]
impl RepoStore for ApiRepoStore {
    async fn list_repos(&self, platform: &str, account: &str) -> Result<Vec<RepoInfo>, String> {
        let repos = self
            .client
            .list_repos(platform)
            .await
            .map_err(|e| e.to_string())?;
        Ok(repos
            .into_iter()
            .filter(|r| r.platform == platform && r.account == account && r.active)
            .collect())
    }

    async fn register_repo(&self, repo: &RepoInfo) -> Result<(), String> {
        self.client
            .register_repo(repo)
            .await
            .map_err(|e| e.to_string())
    }

    async fn update_usage(&self, _repo_id: &str, _additional_bytes: i64) -> Result<(), String> {
        // The backend credits usage from the confirmed chunk size (BumpRepoUsage),
        // so the client doesn't double-report it.
        Ok(())
    }

    async fn deactivate_repo(&self, _repo_id: &str) -> Result<(), String> {
        // v1 has no client-facing deactivate endpoint: rotation is a later
        // refinement. Telegram/HF are effectively unbounded and git repos tolerate
        // exceeding the soft rotation threshold, so continuing to use the active
        // repo is safe. Returning Ok keeps get_or_create_repo from failing.
        Ok(())
    }
}
