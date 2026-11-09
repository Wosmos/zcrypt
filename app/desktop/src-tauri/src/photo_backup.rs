//! Android photo and video backup: the camera, pictures and movies folders on
//! the phone's shared storage, backed up by an Android background job
//! (android/PhotoBackupWorker.kt) that runs with the app closed, on the
//! network and schedule the person chose. Like folder backup it seals to the
//! account public key, so it works with the vault locked.
//!
//! The job holds its own sign-in (`POST /api/auth/sessions/background`),
//! kept in the app's private database. It rotates on its own, so a backup
//! while the app is closed never spends a refresh token the app still holds.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use zcrypt_core::api::{ApiError, Client};
use zcrypt_core::engines::EngineContext;
use zcrypt_core::engines::backup;
use zcrypt_core::localdb::{BackupRoot, LocalDb};

use crate::backup_agent::{self, BackupFolderView};

const SESSION_ACCESS: &str = "background.access";
const SESSION_REFRESH: &str = "background.refresh";

/// Where Android keeps the shared photo folders for the phone's owner.
pub const SHARED_STORAGE: &str = "/storage/emulated/0";

/// The folders photo backup covers, relative to shared storage.
const PHOTO_FOLDERS: &[&str] = &["DCIM", "Pictures", "Movies"];

/// What one background run asks the Android job to do next.
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(i32)]
pub enum RunOutcome {
    /// Finished; wait for the next scheduled run.
    Done = 0,
    /// Couldn't reach the server; Android should try again later.
    Retry = 1,
    /// Signed out or turned off; Android should stop scheduling.
    Stop = 2,
}

/// The photo folders that exist under `storage`.
pub fn photo_folders(storage: &Path) -> Vec<PathBuf> {
    PHOTO_FOLDERS
        .iter()
        .map(|name| storage.join(name))
        .filter(|p| p.is_dir())
        .collect()
}

fn is_photo_root(storage: &Path, root: &BackupRoot) -> bool {
    PHOTO_FOLDERS
        .iter()
        .any(|name| Path::new(&root.local_path) == storage.join(name))
}

/// The photo folders this phone backs up for `user_id`.
pub fn photo_roots(db: &LocalDb, user_id: &str, storage: &Path) -> Vec<BackupRoot> {
    db.list_backup_roots(user_id)
        .unwrap_or_default()
        .into_iter()
        .filter(|r| is_photo_root(storage, r))
        .collect()
}

fn stored_session(db: &LocalDb) -> Option<(String, String)> {
    let read = |key| db.setting(key).ok().flatten().filter(|v| !v.is_empty());
    Some((read(SESSION_ACCESS)?, read(SESSION_REFRESH)?))
}

fn save_session(db: &LocalDb, access: &str, refresh: &str) {
    let _ = db.set_setting(SESSION_ACCESS, access);
    let _ = db.set_setting(SESSION_REFRESH, refresh);
}

fn clear_session(db: &LocalDb) {
    save_session(db, "", "");
}

/// A client on the background session, saving each rotation, or None when
/// photo backup holds no session.
pub fn background_client(db: &Arc<LocalDb>, base_url: &str) -> Option<Arc<Client>> {
    let (access, refresh) = stored_session(db)?;
    let keep = db.clone();
    Some(Arc::new(
        Client::new(base_url, &access, &refresh)
            .with_rotate_hook(Arc::new(move |a: &str, r: &str| save_session(&keep, a, r))),
    ))
}

/// Turns photo backup on for `user_id`: every photo folder on the phone is
/// added (sealed to `public_key`, already checked against the published key),
/// and the background job gets its own session from `app`.
pub async fn enable(
    app: &Client,
    db: &LocalDb,
    user_id: &str,
    public_key: &str,
    storage: &Path,
) -> Result<Vec<BackupFolderView>, String> {
    let folders = photo_folders(storage);
    if folders.is_empty() {
        return Err("No photo folders were found on this phone.".into());
    }
    let mut existing = db.list_backup_roots(user_id).map_err(|e| e.to_string())?;
    for path in folders {
        if existing.iter().any(|r| Path::new(&r.local_path) == path)
            || backup_agent::overlaps(&existing, &path)
        {
            continue;
        }
        let root = BackupRoot {
            id: uuid::Uuid::new_v4().to_string(),
            local_path: path.to_string_lossy().to_string(),
            user_id: user_id.to_string(),
            public_key: public_key.to_string(),
            remote_folder_id: String::new(),
            last_scan_at: String::new(),
        };
        db.add_backup_root(&root).map_err(|e| e.to_string())?;
        existing.push(root);
    }
    if stored_session(db).is_none() {
        let pair = app
            .start_background_session()
            .await
            .map_err(|e| e.to_string())?;
        save_session(db, &pair.access_token, &pair.refresh_token);
    }
    Ok(photo_roots(db, user_id, storage)
        .iter()
        .map(|r| backup_agent::view(db, r))
        .collect())
}

/// Turns photo backup off: the folders stop backing up (files already in the
/// vault stay) and the background session is signed out.
pub async fn disable(db: &Arc<LocalDb>, user_id: &str, storage: &Path, base_url: &str) {
    for root in photo_roots(db, user_id, storage) {
        let _ = db.remove_backup_root(&root.id, user_id);
    }
    end_background_session(db, base_url).await;
}

/// Signs the background session out on the server and forgets it.
pub async fn end_background_session(db: &Arc<LocalDb>, base_url: &str) {
    if let Some(client) = background_client(db, base_url) {
        let _ = client.sign_out().await;
    }
    clear_session(db);
}

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
/// One background run over every photo folder. `make_ctx` builds the engine
/// context around the background client.
pub async fn run(
    db: &Arc<LocalDb>,
    base_url: &str,
    storage: &Path,
    make_ctx: impl Fn(Arc<Client>) -> EngineContext,
) -> RunOutcome {
    let Some(client) = background_client(db, base_url) else {
        return RunOutcome::Stop;
    };
    let Ok(user_id) = client.user_id().await else {
        clear_session(db);
        return RunOutcome::Stop;
    };
    let roots = photo_roots(db, &user_id, storage);
    if roots.is_empty() {
        end_background_session(db, base_url).await;
        return RunOutcome::Stop;
    }
    let ctx = make_ctx(client);
    let _pass = backup_agent::PASS_LOCK.lock().await;
    let mut outcome = RunOutcome::Done;
    for root in roots {
        match backup::run_pass(&ctx, &root).await {
            Ok(_) => {}
            Err(e) if is_signed_out(&e) => {
                clear_session(db);
                return RunOutcome::Stop;
            }
            Err(e) => {
                eprintln!("zcrypt photo backup {}: {e}", root.id);
                outcome = RunOutcome::Retry;
            }
        }
    }
    outcome
}

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
fn is_signed_out(e: &zcrypt_core::engines::EngineError) -> bool {
    matches!(
        e,
        zcrypt_core::engines::EngineError::Api(ApiError::Unauthorized)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn db() -> (tempfile::TempDir, Arc<LocalDb>) {
        let dir = tempfile::tempdir().unwrap();
        let db = Arc::new(LocalDb::open_at(&dir.path().join("db.sqlite")).unwrap());
        (dir, db)
    }

    fn root(id: &str, path: &Path) -> BackupRoot {
        BackupRoot {
            id: id.into(),
            local_path: path.to_string_lossy().to_string(),
            user_id: "u".into(),
            public_key: "cHVi".into(),
            remote_folder_id: String::new(),
            last_scan_at: String::new(),
        }
    }

    #[test]
    fn finds_only_the_photo_folders_that_exist() {
        let storage = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(storage.path().join("DCIM/Camera")).unwrap();
        std::fs::create_dir_all(storage.path().join("Movies")).unwrap();
        std::fs::create_dir_all(storage.path().join("Download")).unwrap();
        assert_eq!(
            photo_folders(storage.path()),
            vec![storage.path().join("DCIM"), storage.path().join("Movies")]
        );
    }

    #[test]
    fn photo_roots_leave_other_backed_up_folders_alone() {
        let (_d, db) = db();
        let storage = Path::new("/storage/emulated/0");
        db.add_backup_root(&root("dcim", &storage.join("DCIM")))
            .unwrap();
        db.add_backup_root(&root("docs", &storage.join("Documents")))
            .unwrap();
        let ids: Vec<_> = photo_roots(&db, "u", storage)
            .into_iter()
            .map(|r| r.id)
            .collect();
        assert_eq!(ids, vec!["dcim"]);
    }

    #[test]
    fn the_background_session_is_kept_and_forgotten() {
        let (_d, db) = db();
        assert!(background_client(&db, "http://127.0.0.1:9").is_none());
        save_session(&db, "a", "r");
        assert_eq!(stored_session(&db), Some(("a".into(), "r".into())));
        assert!(background_client(&db, "http://127.0.0.1:9").is_some());
        clear_session(&db);
        assert_eq!(stored_session(&db), None);
    }

    #[tokio::test]
    async fn a_run_without_a_session_tells_android_to_stop() {
        let (_d, db) = db();
        let outcome = run(&db, "http://127.0.0.1:9", Path::new("/nowhere"), |_| {
            unreachable!("no engine without a session")
        })
        .await;
        assert_eq!(outcome, RunOutcome::Stop);
    }

    #[test]
    fn outcomes_match_the_android_job() {
        assert_eq!(RunOutcome::Done as i32, 0);
        assert_eq!(RunOutcome::Retry as i32, 1);
        assert_eq!(RunOutcome::Stop as i32, 2);
    }
}
