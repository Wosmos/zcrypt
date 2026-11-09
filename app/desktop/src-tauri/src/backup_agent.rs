//! Desktop folder backup: runs zcrypt-core's one-way backup engine for every
//! folder the signed-in account backs up from this device, at start, every
//! ten minutes, and a few seconds after a change settles. It works with the
//! vault locked: the engine seals to the account public key pinned when the
//! folder was added (docs/CRYPTO_FORMAT.md 2.2).

use std::path::PathBuf;
use std::time::Duration;

use base64::Engine;
use notify::{RecursiveMode, Watcher};
use serde::Serialize;
use tauri::Emitter;
use tokio::sync::{mpsc, watch};
use zcrypt_core::engines::EngineContext;
use zcrypt_core::engines::backup::{self, BackupReport};
use zcrypt_core::localdb::{BackupRoot, LocalDb};

/// Full pass interval: the safety net for anything a watcher missed.
pub const RESCAN_EVERY: Duration = Duration::from_secs(10 * 60);
/// How long changes must stay quiet before a watcher-triggered pass.
pub const SETTLE_FOR: Duration = Duration::from_secs(5);

/// A backed-up folder as the settings screen shows it.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct BackupFolderView {
    pub id: String,
    pub path: String,
    pub name: String,
    pub files: i64,
    pub last_scan_at: String,
    pub available: bool,
}

/// One pass's outcome for one folder, sent to the webview as `zcrypt://backup`.
#[derive(Debug, Clone, Serialize)]
pub struct BackupEvent {
    pub id: String,
    pub uploaded: u32,
    pub unchanged: u32,
    pub busy: u32,
    pub failed: u32,
    pub unavailable: bool,
    pub errors: Vec<String>,
}

impl BackupEvent {
    fn of(id: &str, r: &BackupReport) -> Self {
        BackupEvent {
            id: id.to_string(),
            uploaded: r.uploaded,
            unchanged: r.unchanged,
            busy: r.busy,
            failed: r.failed,
            unavailable: r.unavailable,
            errors: r.errors.clone(),
        }
    }
}

pub fn view(db: &LocalDb, root: &BackupRoot) -> BackupFolderView {
    let path = PathBuf::from(&root.local_path);
    BackupFolderView {
        id: root.id.clone(),
        name: path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default(),
        available: path.is_dir(),
        files: db.backup_file_count(&root.id).unwrap_or(0),
        last_scan_at: root.last_scan_at.clone(),
        path: root.local_path.clone(),
    }
}

/// Validates a folder the user picked and the account public key the unlocked
/// webview derived from its private key, returning the key normalised.
pub fn validate_new_folder(path: &str, public_key_b64: &str) -> Result<(PathBuf, String), String> {
    let path = PathBuf::from(path);
    if !path.is_absolute() || !path.is_dir() {
        return Err("Pick a folder that exists on this computer.".into());
    }
    let key = base64::engine::general_purpose::STANDARD
        .decode(public_key_b64.trim())
        .map_err(|_| "The account key is malformed.".to_string())?;
    if key.len() != 32 {
        return Err("The account key is malformed.".into());
    }
    let canonical = path.canonicalize().map_err(|e| e.to_string())?;
    Ok((
        canonical,
        base64::engine::general_purpose::STANDARD.encode(key),
    ))
}

/// True when `candidate` is the same folder as, inside, or around one already
/// backed up: overlapping roots would upload the same files twice.
pub fn overlaps(existing: &[BackupRoot], candidate: &std::path::Path) -> bool {
    existing.iter().any(|r| {
        let other = std::path::Path::new(&r.local_path);
        candidate.starts_with(other) || other.starts_with(candidate)
    })
}

async fn run_all(app: &tauri::AppHandle, ctx: &EngineContext) {
    let Ok(user_id) = ctx.client.user_id().await else {
        return;
    };
    let Ok(roots) = ctx.db.list_backup_roots(&user_id) else {
        return;
    };
    for root in roots {
        match backup::run_pass(ctx, &root).await {
            Ok(report) => {
                let _ = app.emit("zcrypt://backup", BackupEvent::of(&root.id, &report));
            }
            Err(e) => eprintln!("zcrypt backup {}: {e}", root.id),
        }
    }
}

/// Watches every backed-up folder and nudges the loop on any change. The
/// returned watcher must be kept alive; dropping it stops watching.
pub fn watch_roots(
    roots: &[BackupRoot],
    nudge: mpsc::UnboundedSender<()>,
) -> Option<notify::RecommendedWatcher> {
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if res.is_ok() {
            let _ = nudge.send(());
        }
    })
    .ok()?;
    for root in roots {
        if let Err(e) = watcher.watch(
            std::path::Path::new(&root.local_path),
            RecursiveMode::Recursive,
        ) {
            eprintln!("zcrypt backup: can't watch {}: {e}", root.local_path);
        }
    }
    Some(watcher)
}

/// Runs until `cancel` flips: a pass now, then on a nudge (after changes have
/// been quiet for [`SETTLE_FOR`]) or every [`RESCAN_EVERY`].
pub async fn run_loop(
    app: tauri::AppHandle,
    ctx: EngineContext,
    mut nudges: mpsc::UnboundedReceiver<()>,
    mut cancel: watch::Receiver<bool>,
) {
    loop {
        run_all(&app, &ctx).await;
        tokio::select! {
            _ = cancel.changed() => return,
            _ = tokio::time::sleep(RESCAN_EVERY) => {}
            got = nudges.recv() => {
                if got.is_none() {
                    return;
                }
                loop {
                    tokio::select! {
                        _ = cancel.changed() => return,
                        more = tokio::time::timeout(SETTLE_FOR, nudges.recv()) => match more {
                            Ok(Some(())) => continue,
                            Ok(None) => return,
                            Err(_) => break,
                        },
                    }
                }
            }
        }
        if *cancel.borrow() {
            return;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root(path: &str) -> BackupRoot {
        BackupRoot {
            id: "r".into(),
            local_path: path.into(),
            user_id: "u".into(),
            public_key: String::new(),
            remote_folder_id: String::new(),
            last_scan_at: String::new(),
        }
    }

    #[test]
    fn nested_or_same_folders_overlap() {
        let existing = vec![root("/Users/me/Documents")];
        assert!(overlaps(
            &existing,
            std::path::Path::new("/Users/me/Documents")
        ));
        assert!(overlaps(
            &existing,
            std::path::Path::new("/Users/me/Documents/Taxes")
        ));
        assert!(overlaps(&existing, std::path::Path::new("/Users/me")));
        assert!(!overlaps(
            &existing,
            std::path::Path::new("/Users/me/Pictures")
        ));
        assert!(!overlaps(
            &existing,
            std::path::Path::new("/Users/me/Documents2")
        ));
    }

    #[test]
    fn rejects_missing_folders_and_bad_keys() {
        let dir = tempfile::tempdir().unwrap();
        let key = base64::engine::general_purpose::STANDARD.encode([7u8; 32]);
        let path = dir.path().to_string_lossy().to_string();
        assert!(validate_new_folder(&path, &key).is_ok());
        assert!(validate_new_folder("relative/path", &key).is_err());
        assert!(validate_new_folder("/definitely/not/here", &key).is_err());
        assert!(validate_new_folder(&path, "not base64!").is_err());
        let short = base64::engine::general_purpose::STANDARD.encode([7u8; 16]);
        assert!(validate_new_folder(&path, &short).is_err());
    }
}
