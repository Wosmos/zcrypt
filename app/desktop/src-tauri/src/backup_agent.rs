//! Desktop folder backup: runs zcrypt-core's one-way backup engine for every
//! folder the signed-in account backs up from this device. By default it runs
//! at start, every ten minutes, and a few seconds after a change settles; on
//! the nightly schedule it runs once a day at the chosen time instead, or as
//! soon as the computer wakes if it was asleep then. It works with the vault
//! locked: the engine seals to the account public key pinned when the folder
//! was added (docs/CRYPTO_FORMAT.md 2.2).

use std::path::PathBuf;
use std::time::Duration;

use base64::Engine;
use chrono::{Local, NaiveDateTime, NaiveTime, TimeZone};
use notify::{RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use tauri::Emitter;
use tokio::sync::{mpsc, watch};
use zcrypt_core::engines::EngineContext;
use zcrypt_core::engines::backup::{self, BackupReport};
use zcrypt_core::localdb::{BackupRoot, LocalDb};

/// Full pass interval: the safety net for anything a watcher missed.
pub const RESCAN_EVERY: Duration = Duration::from_secs(10 * 60);
/// How long changes must stay quiet before a watcher-triggered pass.
pub const SETTLE_FOR: Duration = Duration::from_secs(5);
/// How often the nightly schedule checks the wall clock. Checking the clock
/// rather than sleeping until the slot keeps it right across sleep and
/// time-zone changes.
pub const SCHEDULE_TICK: Duration = Duration::from_secs(60);

/// One backup pass at a time across the app and the Android background job,
/// which share the ledger: two passes at once would upload a file twice.
pub static PASS_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

const SCHEDULE_KEY: &str = "backup.schedule";
const LAST_RUN_KEY: &str = "backup.last_run";

/// What wakes the backup loop.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Nudge {
    /// Something changed in a backed-up folder.
    Changed,
    /// Back up now: a folder was added or the person asked.
    Now,
    /// The schedule changed; look at it again without backing up.
    Reschedule,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ScheduleMode {
    /// As soon as files change, plus a rescan every ten minutes.
    #[default]
    Instant,
    /// Once a day at `time`.
    Nightly,
}

/// When this device backs up. `time` is kept while instant so switching back
/// to nightly remembers it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BackupSchedule {
    pub mode: ScheduleMode,
    pub time: String,
}

impl Default for BackupSchedule {
    fn default() -> Self {
        BackupSchedule {
            mode: ScheduleMode::Instant,
            time: "02:00".into(),
        }
    }
}

impl BackupSchedule {
    pub fn load(db: &LocalDb) -> Self {
        db.setting(SCHEDULE_KEY)
            .ok()
            .flatten()
            .and_then(|v| serde_json::from_str::<BackupSchedule>(&v).ok())
            .filter(|s| s.at().is_some())
            .unwrap_or_default()
    }

    pub fn save(&self, db: &LocalDb) -> Result<(), String> {
        if self.at().is_none() {
            return Err("Choose a time like 02:00.".into());
        }
        let json = serde_json::to_string(self).map_err(|e| e.to_string())?;
        db.set_setting(SCHEDULE_KEY, &json)
            .map_err(|e| e.to_string())
    }

    fn at(&self) -> Option<NaiveTime> {
        NaiveTime::parse_from_str(&self.time, "%H:%M").ok()
    }

    fn nightly_at(&self) -> Option<NaiveTime> {
        (self.mode == ScheduleMode::Nightly)
            .then(|| self.at())
            .flatten()
    }
}

/// True when the latest daily slot at `at` that is not after `now` came after
/// the last pass, so a slot missed while the computer slept still runs.
pub fn nightly_due(now: NaiveDateTime, last_run: Option<NaiveDateTime>, at: NaiveTime) -> bool {
    let today = now.date().and_time(at);
    let slot = if now >= today {
        today
    } else {
        today - chrono::Duration::days(1)
    };
    last_run.is_none_or(|last| last < slot)
}

fn last_run(db: &LocalDb) -> Option<NaiveDateTime> {
    let secs = db
        .setting(LAST_RUN_KEY)
        .ok()
        .flatten()?
        .parse::<i64>()
        .ok()?;
    Local
        .timestamp_opt(secs, 0)
        .single()
        .map(|t| t.naive_local())
}

fn mark_run(db: &LocalDb) {
    let _ = db.set_setting(LAST_RUN_KEY, &Local::now().timestamp().to_string());
}

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
    let key = validate_public_key(public_key_b64)?;
    let canonical = path.canonicalize().map_err(|e| e.to_string())?;
    Ok((canonical, key))
}

/// The account public key in canonical base64, or an error when it isn't 32 bytes.
pub fn validate_public_key(public_key_b64: &str) -> Result<String, String> {
    let key = base64::engine::general_purpose::STANDARD
        .decode(public_key_b64.trim())
        .map_err(|_| "The account key is malformed.".to_string())?;
    if key.len() != 32 {
        return Err("The account key is malformed.".into());
    }
    Ok(base64::engine::general_purpose::STANDARD.encode(key))
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
    let _pass = PASS_LOCK.lock().await;
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
    nudge: mpsc::UnboundedSender<Nudge>,
) -> Option<notify::RecommendedWatcher> {
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        if res.is_ok() {
            let _ = nudge.send(Nudge::Changed);
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

/// Runs until `cancel` flips, backing up on the schedule this device keeps.
pub async fn run_loop(
    app: tauri::AppHandle,
    ctx: EngineContext,
    mut nudges: mpsc::UnboundedReceiver<Nudge>,
    mut cancel: watch::Receiver<bool>,
) {
    let mut forced = BackupSchedule::load(&ctx.db).nightly_at().is_none();
    loop {
        let schedule = BackupSchedule::load(&ctx.db);
        let due = schedule
            .nightly_at()
            .is_some_and(|at| nightly_due(Local::now().naive_local(), last_run(&ctx.db), at));
        if forced || due {
            run_all(&app, &ctx).await;
            mark_run(&ctx.db);
        }
        match next_wake(&schedule, &mut nudges, &mut cancel).await {
            Some(run) => forced = run,
            None => return,
        }
        if *cancel.borrow() {
            return;
        }
    }
}

/// Waits for the next reason to look again. Some(true) means back up now,
/// Some(false) means only re-check the schedule, None means stop.
async fn next_wake(
    schedule: &BackupSchedule,
    nudges: &mut mpsc::UnboundedReceiver<Nudge>,
    cancel: &mut watch::Receiver<bool>,
) -> Option<bool> {
    let nightly = schedule.nightly_at().is_some();
    let idle = if nightly { SCHEDULE_TICK } else { RESCAN_EVERY };
    tokio::select! {
        _ = cancel.changed() => None,
        _ = tokio::time::sleep(idle) => Some(!nightly),
        got = nudges.recv() => match got? {
            Nudge::Now => Some(true),
            Nudge::Reschedule => Some(false),
            Nudge::Changed if nightly => Some(false),
            Nudge::Changed => settle(nudges, cancel).await,
        },
    }
}

/// Lets a burst of changes go quiet for [`SETTLE_FOR`] before a pass.
async fn settle(
    nudges: &mut mpsc::UnboundedReceiver<Nudge>,
    cancel: &mut watch::Receiver<bool>,
) -> Option<bool> {
    loop {
        tokio::select! {
            _ = cancel.changed() => return None,
            more = tokio::time::timeout(SETTLE_FOR, nudges.recv()) => match more {
                Ok(Some(Nudge::Now)) | Err(_) => return Some(true),
                Ok(Some(_)) => continue,
                Ok(None) => return None,
            },
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

    fn at(s: &str) -> NaiveDateTime {
        NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M").unwrap()
    }

    #[test]
    fn nightly_runs_once_per_slot_and_catches_up_after_sleep() {
        let two = NaiveTime::from_hms_opt(2, 0, 0).unwrap();
        assert!(nightly_due(at("2026-11-10 02:00"), None, two));
        assert!(nightly_due(
            at("2026-11-10 02:01"),
            Some(at("2026-11-09 02:00")),
            two
        ));
        assert!(!nightly_due(
            at("2026-11-10 02:05"),
            Some(at("2026-11-10 02:01")),
            two
        ));
        assert!(!nightly_due(
            at("2026-11-10 01:59"),
            Some(at("2026-11-09 02:01")),
            two
        ));
        assert!(nightly_due(
            at("2026-11-10 09:30"),
            Some(at("2026-11-08 23:00")),
            two
        ));
        assert!(!nightly_due(
            at("2026-11-10 14:00"),
            Some(at("2026-11-10 13:00")),
            two
        ));
    }

    #[test]
    fn schedule_rejects_bad_times_and_falls_back_to_instant() {
        let dir = tempfile::tempdir().unwrap();
        let db = LocalDb::open_at(&dir.path().join("db.sqlite")).unwrap();
        assert_eq!(BackupSchedule::load(&db), BackupSchedule::default());
        let nightly = BackupSchedule {
            mode: ScheduleMode::Nightly,
            time: "23:30".into(),
        };
        nightly.save(&db).unwrap();
        assert_eq!(BackupSchedule::load(&db), nightly);
        assert_eq!(nightly.nightly_at(), NaiveTime::from_hms_opt(23, 30, 0));
        let bad = BackupSchedule {
            mode: ScheduleMode::Nightly,
            time: "25:00".into(),
        };
        assert!(bad.save(&db).is_err());
        db.set_setting(SCHEDULE_KEY, "not json").unwrap();
        assert_eq!(BackupSchedule::load(&db), BackupSchedule::default());
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
