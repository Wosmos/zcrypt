//! Client-side delete: the byos-direct counterpart to `local_upload.rs` /
//! `download.rs`. Because the device holds the user's own platform token, it
//! removes each chunk's ciphertext straight from the user's OWN storage and the
//! backend only drops the metadata row: no `pending_deletions` queue, no
//! server-side deletion worker, zero backend byte-handling. Chunks on a
//! platform the device has no credentials for (e.g. a managed-pool file) are
//! left for the backend to clean up.

use crate::adapters::{self, AdapterError};
use crate::types::ChunkRef;

use super::{EngineContext, EngineError};

pub async fn run(ctx: &EngineContext, file_id: &str) -> Result<(), EngineError> {
    // 1. Where does each chunk physically live? (owner-only endpoint)
    let locs = ctx.client.get_file_locators(file_id).await?;

    // 2. Delete each chunk from the user's OWN platform where we hold the token.
    //    all_client_deleted stays true only if every chunk was ours to remove:
    //    it decides whether the backend can skip its deletion queue entirely.
    let mut all_client_deleted = true;
    for c in &locs.chunks {
        let Some(creds) = (ctx.creds)(&c.platform) else {
            all_client_deleted = false; // no creds, backend handles this chunk
            continue;
        };
        if !same_account(&c.account, &creds.account) {
            // Another account's storage (the shared pool, or a second account
            // on this platform): our token can't reach it, and its "not found"
            // would wrongly read as deleted. The backend removes it.
            all_client_deleted = false;
            continue;
        }
        let Some(adapter) = adapters::shared_adapter(&c.platform, &creds.token, &creds.account)
        else {
            all_client_deleted = false;
            continue;
        };
        let r = ChunkRef {
            platform: c.platform.clone(),
            account: c.account.clone(),
            repo: c.repo.clone(),
            remote_path: c.remote_path.clone(),
            size: c.size,
            sha256: c.sha256.clone(),
            compressed: c.compressed,
            ..ChunkRef::default()
        };
        // Best-effort: 404 (already gone from OUR account) is success; any other
        // failure means we could not remove it, so the backend must.
        match adapter.delete(&r).await {
            Ok(()) | Err(AdapterError::NotFound(_)) => {}
            Err(_) => all_client_deleted = false,
        }
    }

    // 3. Drop the backend metadata. If we removed every byte ourselves, request a
    //    metadata-only purge (no server deletion queue); otherwise a normal purge
    //    so the backend cleans up whatever we couldn't.
    ctx.client.purge_file(file_id, all_client_deleted).await?;

    // 4. Clear the local ledger row (idempotent: the file may never have been in
    //    this device's ledger, e.g. it was uploaded from another device).
    let _ = ctx.db.delete_file(file_id);
    Ok(())
}

/// True when a chunk lives in the account this device's token belongs to. An
/// unknown account on either side is never assumed to match.
fn same_account(chunk_account: &str, creds_account: &str) -> bool {
    let (a, b) = (chunk_account.trim(), creds_account.trim());
    !a.is_empty() && !b.is_empty() && a.eq_ignore_ascii_case(b)
}

#[cfg(test)]
mod tests {
    use super::same_account;

    #[test]
    fn only_a_chunk_in_this_devices_account_is_deleted_here() {
        assert!(same_account("wosmo", "wosmo"));
        assert!(same_account("Wosmo", "wosmo "));
        assert!(!same_account("shared_pool_bot", "wosmo"));
        assert!(!same_account("", "wosmo"));
        assert!(!same_account("wosmo", ""));
    }
}
