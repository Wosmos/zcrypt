//! Android photo and video backup: the albums the person switched on in
//! Android's media library (MediaStore: Camera, Screenshots, WhatsApp Images
//! and so on), backed up by an Android background job
//! (android/PhotoBackupWorker.kt) that runs with the app closed, on the
//! network and power the person chose. Like folder backup it seals to the
//! account public key, so it works with the vault locked.
//!
//! Earlier versions backed up the DCIM, Pictures and Movies folders by path.
//! The first run of this source carries what those uploaded over to the media
//! ledger, so nothing goes up twice, and then drops the path roots.
//!
//! The job holds its own sign-in (`POST /api/auth/sessions/background`),
//! kept in the app's private database. It rotates on its own, so a backup
//! while the app is closed never spends a refresh token the app still holds.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

use base64::Engine as _;
use serde::{Deserialize, Serialize};
use zcrypt_core::api::{ApiError, Client};
use zcrypt_core::engines::media_backup::{
    self, Kinds, LegacyRoot, MediaQuery, MediaSource, Selection,
};
use zcrypt_core::engines::{CancelToken, EngineContext, EngineError};
use zcrypt_core::localdb::{BackupRoot, LocalDb};

use crate::backup_agent;
use crate::backup_notify::{PassSummary, PendingSink, Subject, deliver};

const SESSION_ACCESS: &str = "background.access";
const SESSION_REFRESH: &str = "background.refresh";

const KEY_ENABLED: &str = "photo.enabled";
const KEY_PUBLIC_KEY: &str = "photo.public_key";
const KEY_ALBUMS: &str = "photo.albums";
const KEY_KINDS: &str = "photo.kinds";
const KEY_WIFI_ONLY: &str = "photo.wifi_only";
const KEY_CHARGING_ONLY: &str = "photo.charging_only";
const KEY_MIGRATED: &str = "photo.migrated";
const KEY_GENERATIONS: &str = "photo.generations";
const KEY_FULL_SCAN: &str = "photo.full_scan_at";

/// An incremental scan (only items newer than the last one) is trusted for a
/// day; after that one full scan catches anything it could have missed.
const FULL_SCAN_EVERY_SECS: i64 = 24 * 60 * 60;

/// Where Android keeps the shared photo folders for the phone's owner.
pub const SHARED_STORAGE: &str = "/storage/emulated/0";

/// The folders the old path-based backup covered, relative to shared storage.
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

static CURRENT_PASS: std::sync::Mutex<Option<CancelToken>> = std::sync::Mutex::new(None);

/// Registers the cancel token of the run that is starting, so the Android job
/// can stop it when WorkManager stops the worker.
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
pub fn begin_pass() -> CancelToken {
    let token = CancelToken::new();
    *CURRENT_PASS.lock().unwrap() = Some(token.clone());
    token
}

/// Cancels the run in flight, if any.
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
pub fn stop_pass() {
    if let Some(token) = CURRENT_PASS.lock().unwrap().take() {
        token.cancel();
    }
}

/// What the person chose for photo backup, kept in the app's local database so
/// the background job reads it with the app closed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PhotoOptions {
    /// Album ids switched on. None until the person (or the first run) chose,
    /// which means the Camera albums.
    pub albums: Option<Vec<String>>,
    /// "photos", "videos" or "both".
    pub kinds: String,
    pub wifi_only: bool,
    pub charging_only: bool,
}

impl Default for PhotoOptions {
    fn default() -> Self {
        Self {
            albums: None,
            kinds: "both".into(),
            wifi_only: true,
            charging_only: false,
        }
    }
}

impl PhotoOptions {
    pub fn load(db: &LocalDb) -> Self {
        let get = |key: &str| db.setting(key).ok().flatten();
        let flag = |key: &str, default: bool| get(key).map_or(default, |v| v == "1");
        Self {
            albums: get(KEY_ALBUMS).and_then(|v| serde_json::from_str(&v).ok()),
            kinds: Kinds::parse(&get(KEY_KINDS).unwrap_or_default())
                .as_str()
                .into(),
            wifi_only: flag(KEY_WIFI_ONLY, true),
            charging_only: flag(KEY_CHARGING_ONLY, false),
        }
    }

    /// Saves the options. A changed album or kind choice drops the saved scan
    /// position, so the next run looks at everything the new choice covers.
    pub fn save(&self, db: &LocalDb) -> Result<(), String> {
        let before = Self::load(db);
        let flag = |on: bool| if on { "1" } else { "0" };
        let kinds = Kinds::parse(&self.kinds).as_str();
        let set = |k: &str, v: &str| db.set_setting(k, v).map_err(|e| e.to_string());
        if let Some(albums) = &self.albums {
            set(
                KEY_ALBUMS,
                &serde_json::to_string(albums).map_err(|e| e.to_string())?,
            )?;
        }
        set(KEY_KINDS, kinds)?;
        set(KEY_WIFI_ONLY, flag(self.wifi_only))?;
        set(KEY_CHARGING_ONLY, flag(self.charging_only))?;
        if (self.albums.is_some() && self.albums != before.albums) || kinds != before.kinds {
            set(KEY_GENERATIONS, "")?;
            set(KEY_FULL_SCAN, "")?;
        }
        Ok(())
    }

    fn selection(&self) -> Option<Selection> {
        Some(Selection {
            buckets: self.albums.clone()?,
            kinds: Kinds::parse(&self.kinds),
        })
    }
}

/// The old path-based photo folders that exist under `storage`.
#[cfg(test)]
pub fn photo_folders(storage: &Path) -> Vec<std::path::PathBuf> {
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

/// The old path-based photo roots for `user_id`, left from earlier versions.
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

/// What the settings page shows for photo backup.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PhotoStatus {
    pub files: i64,
    #[serde(flatten)]
    pub options: PhotoOptions,
}

fn files_backed_up(db: &LocalDb, user_id: &str, storage: &Path) -> i64 {
    let legacy: i64 = photo_roots(db, user_id, storage)
        .iter()
        .map(|r| db.backup_file_count(&r.id).unwrap_or(0))
        .sum();
    db.media_file_count(user_id).unwrap_or(0) + legacy
}

pub fn status(db: &LocalDb, user_id: &str, storage: &Path) -> PhotoStatus {
    PhotoStatus {
        files: files_backed_up(db, user_id, storage),
        options: PhotoOptions::load(db),
    }
}

/// Turns photo backup on for `user_id`: the account key (already checked
/// against the published key) is pinned, and the background job gets its own
/// session from `app`. The albums come from the options.
pub async fn enable(
    app: &Client,
    db: &LocalDb,
    user_id: &str,
    public_key: &str,
    storage: &Path,
) -> Result<PhotoStatus, String> {
    db.set_setting(KEY_PUBLIC_KEY, public_key)
        .and_then(|_| db.set_setting(KEY_ENABLED, "1"))
        .map_err(|e| e.to_string())?;
    if stored_session(db).is_none() {
        let pair = app
            .start_background_session()
            .await
            .map_err(|e| e.to_string())?;
        save_session(db, &pair.access_token, &pair.refresh_token);
    }
    Ok(status(db, user_id, storage))
}

/// Turns photo backup off: nothing more is backed up (files already in the
/// vault stay) and the background session is signed out.
pub async fn disable(db: &Arc<LocalDb>, user_id: &str, storage: &Path, base_url: &str) {
    let _ = db.set_setting(KEY_ENABLED, "0");
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

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn decode_key(b64: &str) -> Option<[u8; 32]> {
    base64::engine::general_purpose::STANDARD
        .decode(b64)
        .ok()
        .and_then(|b| <[u8; 32]>::try_from(b.as_slice()).ok())
}

fn all_media() -> MediaQuery {
    MediaQuery::default()
}

/// First run of the media source: what the path-based backup uploaded is
/// marked done in the media ledger and the old roots are dropped. Returns the
/// albums that already held backed-up photos, or None when it can't be done
/// yet (no or partial photo access, or the library shows nothing to match).
fn migrate(
    db: &LocalDb,
    user_id: &str,
    source: &dyn MediaSource,
    legacy: &[BackupRoot],
    storage: &Path,
) -> Option<Vec<String>> {
    if legacy.is_empty() {
        return Some(vec![]);
    }
    // A partial listing would drop the old ledger rows of every photo not in it.
    if source.partial_access() {
        return None;
    }
    let items = source.list(&all_media()).ok().filter(|i| !i.is_empty())?;
    let roots: Vec<LegacyRoot> = legacy
        .iter()
        .filter_map(|r| {
            Path::new(&r.local_path)
                .strip_prefix(storage)
                .ok()
                .map(|p| LegacyRoot {
                    id: r.id.clone(),
                    rel: p.to_string_lossy().to_string(),
                })
        })
        .collect();
    let moved = media_backup::migrate_legacy(db, user_id, &items, &roots).ok()?;
    for r in legacy {
        let _ = db.remove_backup_root(&r.id, user_id);
    }
    Some(moved.buckets)
}

fn read_generations(db: &LocalDb) -> HashMap<String, i64> {
    let full_at = db
        .setting(KEY_FULL_SCAN)
        .ok()
        .flatten()
        .and_then(|v| v.parse::<i64>().ok());
    match full_at {
        Some(at) if now_secs() - at < FULL_SCAN_EVERY_SECS => db
            .setting(KEY_GENERATIONS)
            .ok()
            .flatten()
            .and_then(|v| serde_json::from_str(&v).ok())
            .unwrap_or_default(),
        _ => HashMap::new(),
    }
}

fn save_generations(db: &LocalDb, was_full: bool, seen: &HashMap<String, i64>) {
    let mut merged: HashMap<String, i64> = if was_full {
        HashMap::new()
    } else {
        db.setting(KEY_GENERATIONS)
            .ok()
            .flatten()
            .and_then(|v| serde_json::from_str(&v).ok())
            .unwrap_or_default()
    };
    for (volume, g) in seen {
        let e = merged.entry(volume.clone()).or_insert(0);
        *e = (*e).max(*g);
    }
    if let Ok(json) = serde_json::to_string(&merged) {
        let _ = db.set_setting(KEY_GENERATIONS, &json);
    }
    if was_full {
        let _ = db.set_setting(KEY_FULL_SCAN, &now_secs().to_string());
    }
}

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
/// One background run over the selected albums. `make_ctx` builds the engine
/// context around the background client.
pub async fn run(
    db: &Arc<LocalDb>,
    base_url: &str,
    storage: &Path,
    source: &dyn MediaSource,
    make_ctx: impl Fn(Arc<Client>) -> EngineContext,
) -> RunOutcome {
    let Some(client) = background_client(db, base_url) else {
        return RunOutcome::Stop;
    };
    let Ok(user_id) = client.user_id().await else {
        clear_session(db);
        return RunOutcome::Stop;
    };
    let legacy = photo_roots(db, &user_id, storage);
    let on = db.setting(KEY_ENABLED).ok().flatten().as_deref() == Some("1");
    if !on && legacy.is_empty() {
        end_background_session(db, base_url).await;
        return RunOutcome::Stop;
    }
    let pinned = db
        .setting(KEY_PUBLIC_KEY)
        .ok()
        .flatten()
        .filter(|k| !k.is_empty())
        .or_else(|| legacy.first().map(|r| r.public_key.clone()));
    let Some(public) = pinned.as_deref().and_then(decode_key) else {
        eprintln!("zcrypt photo backup: the pinned account key is missing or malformed");
        return RunOutcome::Done;
    };
    let ctx = make_ctx(client);
    let _pass = backup_agent::PASS_LOCK.lock().await;

    let mut options = PhotoOptions::load(db);
    let migrated = db.setting(KEY_MIGRATED).ok().flatten().as_deref() == Some("1");
    if !migrated {
        match migrate(db, &user_id, source, &legacy, storage) {
            Some(buckets) => {
                let _ = db.set_setting(KEY_PUBLIC_KEY, pinned.as_deref().unwrap_or_default());
                let _ = db.set_setting(KEY_ENABLED, "1");
                let _ = db.set_setting(KEY_MIGRATED, "1");
                if options.albums.is_none() {
                    let mut albums = source
                        .list(&all_media())
                        .map(|i| media_backup::camera_buckets(&i))
                        .unwrap_or_default();
                    for b in buckets {
                        if !albums.contains(&b) {
                            albums.push(b);
                        }
                    }
                    options.albums = Some(albums);
                    let _ = options.save(db);
                }
            }
            None => return RunOutcome::Done,
        }
    }
    if options.albums.is_none() {
        match source.list(&all_media()) {
            Ok(items) if !items.is_empty() => {
                options.albums = Some(media_backup::camera_buckets(&items));
                let _ = options.save(db);
            }
            _ => return RunOutcome::Done,
        }
    }
    let Some(selection) = options.selection() else {
        return RunOutcome::Done;
    };

    let since = read_generations(db);
    let was_full = since.is_empty();
    let mut summary = PassSummary::default();
    let outcome =
        match media_backup::run_pass(&ctx, source, &user_id, public, &selection, &since).await {
            Ok(out) => {
                summary.add("", &out.report);
                summary.folders.extend(out.albums.iter().cloned());
                if out.complete {
                    save_generations(db, was_full, &out.generations);
                }
                if out.report.all_transient() {
                    eprintln!("zcrypt photo backup: nothing got through, will retry");
                    RunOutcome::Retry
                } else {
                    RunOutcome::Done
                }
            }
            Err(e) if is_signed_out(&e) => {
                clear_session(db);
                summary.signed_out = true;
                deliver(db, &PendingSink, &summary, Subject::Photos);
                return RunOutcome::Stop;
            }
            Err(EngineError::Cancelled) => return RunOutcome::Retry,
            Err(e) => {
                eprintln!("zcrypt photo backup: {e}");
                if e.is_transient() {
                    summary.add_transient_error();
                }
                RunOutcome::Retry
            }
        };
    deliver(db, &PendingSink, &summary, Subject::Photos);
    outcome
}

#[cfg_attr(not(target_os = "android"), allow(dead_code))]
fn is_signed_out(e: &EngineError) -> bool {
    matches!(e, EngineError::Api(ApiError::Unauthorized))
}

/// The Android media library, reached over JNI through the `MediaStoreSource`
/// object the background job passes in (android/MediaStoreSource.kt).
#[cfg(all(unix, any(target_os = "android", test)))]
pub struct JniMediaSource {
    vm: jni::JavaVM,
    source: jni::objects::GlobalRef,
}

#[cfg(all(unix, any(target_os = "android", test)))]
impl JniMediaSource {
    pub fn new(env: &jni::JNIEnv, source: &jni::objects::JObject) -> Result<Self, String> {
        Ok(Self {
            vm: env.get_java_vm().map_err(|e| e.to_string())?,
            source: env.new_global_ref(source).map_err(|e| e.to_string())?,
        })
    }
}

#[cfg(all(unix, any(target_os = "android", test)))]
impl MediaSource for JniMediaSource {
    fn list(
        &self,
        query: &MediaQuery,
    ) -> Result<Vec<media_backup::MediaItem>, media_backup::MediaError> {
        use jni::objects::{JString, JValue};
        use media_backup::MediaError;
        let other = |e: &dyn std::fmt::Display| MediaError::Other(e.to_string());
        let mut env = self.vm.attach_current_thread().map_err(|e| other(&e))?;
        // The frame frees the string refs; a pass would otherwise leak them
        // into the native frame's table, one per call.
        let json = env
            .with_local_frame(8, |env| -> jni::errors::Result<String> {
                let arg = env.new_string(query.to_json())?;
                let reply = env
                    .call_method(
                        &self.source,
                        "listMedia",
                        "(Ljava/lang/String;)Ljava/lang/String;",
                        &[JValue::Object(&arg)],
                    )
                    .and_then(|v| v.l());
                let reply = match reply {
                    Ok(r) => r,
                    Err(e) => {
                        let _ = env.exception_clear();
                        return Err(e);
                    }
                };
                Ok(env.get_string(&JString::from(reply))?.into())
            })
            .map_err(|e| other(&e))?;
        media_backup::parse_items(&json)
    }

    fn open(&self, item: &media_backup::MediaItem) -> Result<std::fs::File, String> {
        use jni::objects::JValue;
        use std::os::fd::FromRawFd;
        let mut env = self.vm.attach_current_thread().map_err(|e| e.to_string())?;
        let fd = env
            .with_local_frame(4, |env| -> jni::errors::Result<i32> {
                let arg = env.new_string(&item.uri)?;
                let fd = env
                    .call_method(
                        &self.source,
                        "openFd",
                        "(Ljava/lang/String;)I",
                        &[JValue::Object(&arg)],
                    )
                    .and_then(|v| v.i());
                if fd.is_err() {
                    let _ = env.exception_clear();
                }
                fd
            })
            .map_err(|e| e.to_string())?;
        if fd < 0 {
            return Err("Android would not open the photo".into());
        }
        // SAFETY: openFd detached the descriptor from its ParcelFileDescriptor,
        // so this is the only owner and closes it on drop.
        Ok(unsafe { std::fs::File::from_raw_fd(fd) })
    }

    fn partial_access(&self) -> bool {
        let Ok(mut env) = self.vm.attach_current_thread() else {
            return false;
        };
        let partial = env
            .call_method(&self.source, "isPartialAccess", "()Z", &[])
            .and_then(|v| v.z());
        partial.unwrap_or_else(|_| {
            let _ = env.exception_clear();
            false
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use zcrypt_core::engines::media_backup::{MediaError, MediaItem};
    use zcrypt_core::localdb::{BackupFileState, MediaFileState};

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

    struct Fake(Vec<MediaItem>, tempfile::TempDir);

    impl Fake {
        fn new(items: Vec<MediaItem>) -> Self {
            Self(items, tempfile::tempdir().unwrap())
        }
    }

    impl MediaSource for Fake {
        fn list(&self, q: &MediaQuery) -> Result<Vec<MediaItem>, MediaError> {
            Ok(self
                .0
                .iter()
                .filter(|i| q.buckets.is_empty() || q.buckets.contains(&i.bucket_id))
                .cloned()
                .collect())
        }

        fn open(&self, item: &MediaItem) -> Result<std::fs::File, String> {
            let p = self.1.path().join(item.id.to_string());
            std::fs::write(&p, b"bytes").map_err(|e| e.to_string())?;
            std::fs::File::open(p).map_err(|e| e.to_string())
        }
    }

    struct Partial(Fake);

    impl MediaSource for Partial {
        fn list(&self, q: &MediaQuery) -> Result<Vec<MediaItem>, MediaError> {
            self.0.list(q)
        }

        fn open(&self, item: &MediaItem) -> Result<std::fs::File, String> {
            self.0.open(item)
        }

        fn partial_access(&self) -> bool {
            true
        }
    }

    #[test]
    fn partial_photo_access_keeps_the_legacy_roots_and_ledger() {
        let (_d, db) = db();
        let storage = Path::new("/storage/emulated/0");
        let mut r = root("dcim", &storage.join("DCIM"));
        r.user_id = "u1".into();
        db.add_backup_root(&r).unwrap();
        let state = BackupFileState {
            size: 5,
            mtime_ns: 1_000_000_000_000,
            remote_file_id: "r1".into(),
        };
        db.set_backup_file("dcim", "Camera/a.jpg", &state).unwrap();
        let src = Partial(Fake::new(vec![camera(1, "a.jpg")]));
        assert!(migrate(&db, "u1", &src, &photo_roots(&db, "u1", storage), storage).is_none());
        assert_eq!(photo_roots(&db, "u1", storage).len(), 1);
        assert_eq!(db.backup_file_rows("dcim").unwrap().len(), 1);
        assert_eq!(db.media_file_count("u1").unwrap(), 0);
    }

    fn item(id: i64, bucket: &str, bucket_id: &str, rel: &str, name: &str) -> MediaItem {
        MediaItem {
            uri: format!("content://media/external_primary/images/media/{id}"),
            volume: "external_primary".into(),
            id,
            bucket_id: bucket_id.into(),
            bucket: bucket.into(),
            rel: rel.into(),
            name: name.into(),
            size: 5,
            modified: 1_000,
            taken: id,
            video: false,
            generation: id,
        }
    }

    fn camera(id: i64, name: &str) -> MediaItem {
        item(id, "Camera", "cam", "DCIM/Camera/", name)
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

    #[test]
    fn options_default_to_wifi_only_both_kinds_and_no_chosen_albums() {
        let (_d, db) = db();
        let o = PhotoOptions::load(&db);
        assert_eq!(o, PhotoOptions::default());
        assert!(o.wifi_only && !o.charging_only && o.albums.is_none() && o.kinds == "both");
    }

    #[test]
    fn options_are_saved_and_a_changed_choice_resets_the_scan_position() {
        let (_d, db) = db();
        let mut o = PhotoOptions {
            albums: Some(vec!["cam".into()]),
            kinds: "photos".into(),
            wifi_only: false,
            charging_only: true,
        };
        o.save(&db).unwrap();
        assert_eq!(PhotoOptions::load(&db), o);

        save_generations(&db, true, &HashMap::from([("v".to_string(), 5)]));
        assert!(!read_generations(&db).is_empty());
        o.wifi_only = true;
        o.save(&db).unwrap();
        assert!(
            !read_generations(&db).is_empty(),
            "power and network changes keep it"
        );
        o.albums = Some(vec!["cam".into(), "wa".into()]);
        o.save(&db).unwrap();
        assert!(read_generations(&db).is_empty());

        save_generations(&db, true, &HashMap::from([("v".to_string(), 5)]));
        o.kinds = "videos".into();
        o.save(&db).unwrap();
        assert!(read_generations(&db).is_empty());
    }

    #[test]
    fn an_incremental_scan_is_trusted_for_a_day_then_one_full_scan_runs() {
        let (_d, db) = db();
        assert!(read_generations(&db).is_empty());
        save_generations(&db, true, &HashMap::from([("v".to_string(), 5)]));
        save_generations(
            &db,
            false,
            &HashMap::from([("v".to_string(), 9), ("w".to_string(), 2)]),
        );
        assert_eq!(
            read_generations(&db),
            HashMap::from([("v".to_string(), 9), ("w".to_string(), 2)])
        );
        db.set_setting(
            KEY_FULL_SCAN,
            &(now_secs() - FULL_SCAN_EVERY_SECS - 1).to_string(),
        )
        .unwrap();
        assert!(read_generations(&db).is_empty());
    }

    #[tokio::test]
    async fn a_run_without_a_session_tells_android_to_stop() {
        let (_d, db) = db();
        let outcome = run(
            &db,
            "http://127.0.0.1:9",
            Path::new("/nowhere"),
            &Fake::new(vec![]),
            |_| unreachable!("no engine without a session"),
        )
        .await;
        assert_eq!(outcome, RunOutcome::Stop);
    }

    #[test]
    fn outcomes_match_the_android_job() {
        assert_eq!(RunOutcome::Done as i32, 0);
        assert_eq!(RunOutcome::Retry as i32, 1);
        assert_eq!(RunOutcome::Stop as i32, 2);
    }

    async fn serve_status(status: u16) -> (String, Arc<AtomicUsize>) {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let hits = Arc::new(AtomicUsize::new(0));
        let counted = hits.clone();
        tokio::spawn(async move {
            while let Ok((mut sock, _)) = listener.accept().await {
                counted.fetch_add(1, Ordering::SeqCst);
                let mut buf = [0u8; 4096];
                let _ = sock.read(&mut buf).await;
                let reply = format!(
                    "HTTP/1.1 {status} X\r\ncontent-length: 0\r\nconnection: close\r\n\r\n"
                );
                let _ = sock.write_all(reply.as_bytes()).await;
            }
        });
        (base, hits)
    }

    fn token_for(sub: &str) -> String {
        use base64::Engine as _;
        let b = base64::engine::general_purpose::URL_SAFE_NO_PAD;
        format!(
            "{}.{}.sig",
            b.encode("{}"),
            b.encode(format!(r#"{{"sub":"{sub}"}}"#))
        )
    }

    fn key() -> String {
        base64::engine::general_purpose::STANDARD.encode([7u8; 32])
    }

    async fn run_with(
        status: u16,
        db: &Arc<LocalDb>,
        source: &Fake,
    ) -> (RunOutcome, Arc<AtomicUsize>) {
        let (base, hits) = serve_status(status).await;
        save_session(db, &token_for("u1"), "refresh");
        let keep = db.clone();
        let outcome = run(
            db,
            &base,
            Path::new("/storage/emulated/0"),
            source,
            |client| EngineContext {
                client,
                db: keep.clone(),
                profile: zcrypt_core::profiles::NORMAL,
                progress: Arc::new(|_| {}),
                creds: zcrypt_core::engines::no_creds(),
                cancel: CancelToken::new(),
                vault_passphrase: None,
            },
        )
        .await;
        (outcome, hits)
    }

    fn turned_on(db: &LocalDb) {
        db.set_setting(KEY_ENABLED, "1").unwrap();
        db.set_setting(KEY_PUBLIC_KEY, &key()).unwrap();
        db.set_setting(KEY_MIGRATED, "1").unwrap();
        PhotoOptions {
            albums: Some(vec!["cam".into()]),
            ..PhotoOptions::default()
        }
        .save(db)
        .unwrap();
    }

    #[tokio::test]
    async fn a_signed_out_run_stops_and_forgets_the_session() {
        let (_d, db) = db();
        turned_on(&db);
        let (outcome, _) = run_with(401, &db, &Fake::new(vec![camera(3, "a.jpg")])).await;
        assert_eq!(outcome, RunOutcome::Stop);
        assert_eq!(stored_session(&db), None);
    }

    #[tokio::test]
    async fn a_run_where_every_failure_is_transient_asks_android_to_retry() {
        let (_d, db) = db();
        turned_on(&db);
        let (outcome, _) = run_with(503, &db, &Fake::new(vec![camera(1, "a.jpg")])).await;
        assert_eq!(outcome, RunOutcome::Retry);
    }

    #[tokio::test]
    async fn a_run_with_photo_backup_off_stops_and_signs_out() {
        let (_d, db) = db();
        let (outcome, _) = run_with(200, &db, &Fake::new(vec![])).await;
        assert_eq!(outcome, RunOutcome::Stop);
        assert_eq!(stored_session(&db), None);
    }

    #[tokio::test]
    async fn the_first_run_of_a_new_install_backs_up_camera_only_by_default() {
        let (_d, db) = db();
        db.set_setting(KEY_ENABLED, "1").unwrap();
        db.set_setting(KEY_PUBLIC_KEY, &key()).unwrap();
        let src = Fake::new(vec![
            camera(5, "a.jpg"),
            item(
                2,
                "WhatsApp Images",
                "wa",
                "Android/media/com.whatsapp/WhatsApp Images/",
                "w.jpg",
            ),
        ]);
        let (outcome, _) = run_with(503, &db, &src).await;
        assert_eq!(outcome, RunOutcome::Retry, "the camera photo was attempted");
        assert_eq!(
            PhotoOptions::load(&db).albums,
            Some(vec!["cam".to_string()])
        );
    }

    #[tokio::test]
    async fn the_first_run_after_an_update_keeps_what_was_backed_up_and_uploads_nothing_again() {
        let (_d, db) = db();
        let storage = Path::new("/storage/emulated/0");
        for (id, dir) in [
            ("dcim", "DCIM"),
            ("pics", "Pictures"),
            ("docs", "Documents"),
        ] {
            let mut r = root(id, &storage.join(dir));
            r.user_id = "u1".into();
            r.public_key = key();
            db.add_backup_root(&r).unwrap();
        }
        for (r, path, id) in [
            ("dcim", "Camera/a.jpg", "r1"),
            ("pics", "Screenshots/s.png", "r2"),
        ] {
            db.set_backup_file(
                r,
                path,
                &BackupFileState {
                    size: 5,
                    mtime_ns: 1_000_000_000_000,
                    remote_file_id: id.into(),
                },
            )
            .unwrap();
        }
        db.set_backup_dir("dcim", "Camera", "vault-cam").unwrap();
        let src = Fake::new(vec![
            camera(1, "a.jpg"),
            item(2, "Screenshots", "shots", "Pictures/Screenshots/", "s.png"),
            item(
                3,
                "WhatsApp Images",
                "wa",
                "Android/media/com.whatsapp/WhatsApp Images/",
                "w.jpg",
            ),
            camera(4, "newer.jpg"),
        ]);
        let (outcome, _) = run_with(503, &db, &src).await;
        assert_eq!(
            outcome,
            RunOutcome::Retry,
            "only the genuinely new camera photo is attempted"
        );

        assert_eq!(
            db.media_file("u1", "external_primary:1")
                .unwrap()
                .map(|m| m.remote_file_id),
            Some("r1".into())
        );
        assert_eq!(
            db.media_file("u1", "external_primary:2").unwrap(),
            Some(MediaFileState {
                size: 5,
                modified: 1_000,
                bucket_id: "shots".into(),
                remote_file_id: "r2".into()
            })
        );
        assert!(db.media_file("u1", "external_primary:3").unwrap().is_none());
        assert!(db.media_file("u1", "external_primary:4").unwrap().is_none());
        assert_eq!(
            db.media_dir("u1", "cam").unwrap().as_deref(),
            Some("vault-cam")
        );

        let albums = PhotoOptions::load(&db).albums.unwrap();
        assert!(albums.contains(&"cam".to_string()) && albums.contains(&"shots".to_string()));
        assert!(
            !albums.contains(&"wa".to_string()),
            "WhatsApp was never backed up, so it stays off"
        );

        let left: Vec<_> = db
            .list_backup_roots("u1")
            .unwrap()
            .into_iter()
            .map(|r| r.id)
            .collect();
        assert_eq!(left, vec!["docs"], "only the photo path roots are dropped");
        assert_eq!(db.setting(KEY_MIGRATED).unwrap().as_deref(), Some("1"));
    }

    #[tokio::test]
    async fn a_migration_that_cannot_see_the_library_waits_and_keeps_the_old_roots() {
        let (_d, db) = db();
        let storage = Path::new("/storage/emulated/0");
        let mut r = root("dcim", &storage.join("DCIM"));
        r.user_id = "u1".into();
        r.public_key = key();
        db.add_backup_root(&r).unwrap();
        let (outcome, hits) = run_with(200, &db, &Fake::new(vec![])).await;
        assert_eq!(outcome, RunOutcome::Done);
        assert_eq!(db.list_backup_roots("u1").unwrap().len(), 1);
        assert_ne!(db.setting(KEY_MIGRATED).unwrap().as_deref(), Some("1"));
        assert!(hits.load(Ordering::SeqCst) <= 1);
    }

    #[tokio::test]
    async fn turning_off_stops_everything_and_drops_old_roots_but_keeps_the_ledger() {
        let (_d, db) = db();
        let storage = Path::new("/storage/emulated/0");
        turned_on(&db);
        db.add_backup_root(&root("dcim", &storage.join("DCIM")))
            .unwrap();
        db.set_media_file(
            "u",
            "v:1",
            &MediaFileState {
                size: 1,
                modified: 1,
                bucket_id: "cam".into(),
                remote_file_id: "r".into(),
            },
        )
        .unwrap();
        save_session(&db, "a", "r");
        disable(&db, "u", storage, "http://127.0.0.1:9").await;
        assert_eq!(db.setting(KEY_ENABLED).unwrap().as_deref(), Some("0"));
        assert!(photo_roots(&db, "u", storage).is_empty());
        assert_eq!(stored_session(&db), None);
        assert_eq!(db.media_file_count("u").unwrap(), 1);
    }

    #[test]
    fn stopping_trips_the_registered_pass_once() {
        let token = begin_pass();
        assert!(!token.is_cancelled());
        stop_pass();
        assert!(token.is_cancelled());
        stop_pass();
    }
}
