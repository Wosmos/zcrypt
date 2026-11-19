//! Photo and video backup from Android's media library (MediaStore).
//!
//! The phone side lists items by album and opens each one as a file handle
//! (a [`MediaSource`]); this module decides what to back up and uploads it
//! sealed to the account public key, like folder backup (docs/CRYPTO_FORMAT.md
//! 2.2). An item is identified by its volume and media id, and counts as backed
//! up while its size and modified time are what the ledger recorded. Nothing
//! is ever deleted: removing a photo from the phone leaves it in the vault, and
//! a changed photo's older version goes to the trash.

use std::collections::{HashMap, HashSet};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Deserialize;

use super::backup::{
    attempt_due, clear_failure, record_failure, BackupReport, MAX_FILE_ATTEMPTS,
    MAX_REPORTED_ERRORS, STABLE_FOR,
};
use super::stream_upload::{run_sealed_from, Sealing, UploadSource};
use super::{EngineContext, EngineError};
use crate::localdb::{BackupFileState, LocalDb, MediaFileState};
use crate::pk1;

/// One photo or video in the media library.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct MediaItem {
    pub uri: String,
    pub volume: String,
    pub id: i64,
    #[serde(default)]
    pub bucket_id: String,
    #[serde(default)]
    pub bucket: String,
    /// Folder under the volume, e.g. `DCIM/Camera/` (empty before Android 10
    /// when it can't be worked out).
    #[serde(default)]
    pub rel: String,
    pub name: String,
    #[serde(default)]
    pub size: i64,
    /// Last modified, in seconds.
    #[serde(default)]
    pub modified: i64,
    /// When it was taken, in milliseconds.
    #[serde(default)]
    pub taken: i64,
    #[serde(default)]
    pub video: bool,
    /// Highest of added/modified generation (Android 11+), else 0.
    #[serde(default, rename = "gen")]
    pub generation: i64,
}

impl MediaItem {
    /// The ledger key: stable for one item across runs.
    pub fn key(&self) -> String {
        format!("{}:{}", self.volume, self.id)
    }

    fn path(&self) -> String {
        format!("{}{}", self.rel, self.name)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Kinds {
    Photos,
    Videos,
    #[default]
    Both,
}

impl Kinds {
    pub fn parse(s: &str) -> Self {
        match s {
            "photos" => Self::Photos,
            "videos" => Self::Videos,
            _ => Self::Both,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Photos => "photos",
            Self::Videos => "videos",
            Self::Both => "both",
        }
    }

    pub fn allows(self, video: bool) -> bool {
        match self {
            Self::Both => true,
            Self::Photos => !video,
            Self::Videos => video,
        }
    }
}

/// What to back up: the albums the person switched on, and photos / videos.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Selection {
    pub buckets: Vec<String>,
    pub kinds: Kinds,
}

impl Selection {
    pub fn wants(&self, item: &MediaItem) -> bool {
        self.kinds.allows(item.video) && self.buckets.contains(&item.bucket_id)
    }
}

/// A listing request. `since` maps a volume to the generation already seen.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct MediaQuery {
    pub buckets: Vec<String>,
    pub kinds: Kinds,
    pub since: HashMap<String, i64>,
}

impl MediaQuery {
    pub fn to_json(&self) -> String {
        serde_json::json!({
            "buckets": self.buckets,
            "kinds": self.kinds.as_str(),
            "since": self.since,
        })
        .to_string()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MediaError {
    /// Android refused the read: no photo access.
    Denied,
    Other(String),
}

/// The phone's media library.
pub trait MediaSource: Send + Sync {
    /// The items that match `query` and that the app may read.
    fn list(&self, query: &MediaQuery) -> Result<Vec<MediaItem>, MediaError>;
    /// The item's bytes, as an open file.
    fn open(&self, item: &MediaItem) -> Result<std::fs::File, String>;
    /// True when the person shared only some photos (Android 14), so a listing
    /// is not the whole library.
    fn partial_access(&self) -> bool {
        false
    }
}

/// Reads the `{"items":[...]}` / `{"error":"..."}` the Android side answers with.
pub fn parse_items(json: &str) -> Result<Vec<MediaItem>, MediaError> {
    #[derive(Deserialize)]
    struct Reply {
        items: Option<Vec<MediaItem>>,
        error: Option<String>,
    }
    let reply: Reply =
        serde_json::from_str(json).map_err(|e| MediaError::Other(format!("media list: {e}")))?;
    match (reply.items, reply.error) {
        (Some(items), _) => Ok(items),
        (None, Some(e)) if e == "denied" => Err(MediaError::Denied),
        (None, Some(e)) => Err(MediaError::Other(e)),
        (None, None) => Err(MediaError::Other("media list: empty reply".into())),
    }
}

/// The Camera albums: what is on for a person who never chose.
pub fn camera_buckets(items: &[MediaItem]) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for i in items {
        let camera =
            i.rel.eq_ignore_ascii_case("DCIM/Camera/") || i.bucket.eq_ignore_ascii_case("Camera");
        if camera && !i.bucket_id.is_empty() && !out.contains(&i.bucket_id) {
            out.push(i.bucket_id.clone());
        }
    }
    out
}

/// A folder the old path-based backup covered, as its path under shared storage.
#[derive(Debug, Clone)]
pub struct LegacyRoot {
    pub id: String,
    /// e.g. `DCIM`
    pub rel: String,
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Migration {
    /// Items found in the old ledger and marked backed up in the new one.
    pub marked: usize,
    /// Albums that hold at least one of them.
    pub buckets: Vec<String>,
}

/// Carries what the path-based backup already uploaded over to the media
/// ledger, so none of it goes up twice. Files are matched by folder and name
/// (`RELATIVE_PATH` + `DISPLAY_NAME`) and only when size and modified time still
/// match what was uploaded; an album that was a subfolder of an old
/// root keeps its vault folder.
pub fn migrate_legacy(
    db: &LocalDb,
    user_id: &str,
    items: &[MediaItem],
    roots: &[LegacyRoot],
) -> Result<Migration, EngineError> {
    let mut by_path: HashMap<String, BackupFileState> = HashMap::new();
    for root in roots {
        for (rel_path, state) in db.backup_file_rows(&root.id)? {
            by_path.insert(
                format!("{}/{}", root.rel.trim_end_matches('/'), rel_path),
                state,
            );
        }
    }
    let mut out = Migration::default();
    let mut dir_done: HashSet<String> = HashSet::new();
    for item in items {
        let Some(old) = by_path.get(&item.path()) else {
            continue;
        };
        // Edited since its last backup: leave it unmarked so it goes up again.
        if old.size != item.size || old.mtime_ns / 1_000_000_000 != item.modified {
            continue;
        }
        db.set_media_file(
            user_id,
            &item.key(),
            &MediaFileState {
                size: item.size,
                modified: item.modified,
                bucket_id: item.bucket_id.clone(),
                remote_file_id: old.remote_file_id.clone(),
            },
        )?;
        out.marked += 1;
        if !out.buckets.contains(&item.bucket_id) {
            out.buckets.push(item.bucket_id.clone());
        }
        if dir_done.insert(item.bucket_id.clone())
            && db.media_dir(user_id, &item.bucket_id)?.is_none()
        {
            let folder = item.rel.trim_end_matches('/');
            for root in roots {
                let base = root.rel.trim_end_matches('/');
                let inside = folder
                    .strip_prefix(base)
                    .map(|r| r.trim_start_matches('/'))
                    .filter(|_| folder == base || folder.starts_with(&format!("{base}/")));
                if let Some(rel_dir) = inside {
                    if let Some(id) = db.backup_dir(&root.id, rel_dir)? {
                        db.set_media_dir(user_id, &item.bucket_id, &id)?;
                        break;
                    }
                }
            }
        }
    }
    Ok(out)
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct MediaReport {
    pub report: BackupReport,
    /// Album names that got at least one new upload.
    pub albums: Vec<String>,
    /// Highest generation seen per volume, to start the next scan from.
    pub generations: HashMap<String, i64>,
    /// Every listed item is backed up: safe to start the next scan from `generations`.
    pub complete: bool,
}

fn is_stable(item: &MediaItem, now_secs: i64) -> bool {
    now_secs.saturating_sub(item.modified) >= STABLE_FOR.as_secs() as i64
}

async fn album_folder(
    ctx: &EngineContext,
    user_id: &str,
    public: &[u8; 32],
    item: &MediaItem,
) -> Result<String, EngineError> {
    if let Some(id) = ctx.db.media_dir(user_id, &item.bucket_id)? {
        return Ok(id);
    }
    let name = if item.bucket.is_empty() {
        "Photos"
    } else {
        &item.bucket
    };
    let sealed = pk1::seal_pk1(public, name.as_bytes())?;
    let id = ctx.client.create_folder(&sealed, None).await?;
    ctx.db.set_media_dir(user_id, &item.bucket_id, &id)?;
    Ok(id)
}

/// One pass over the selected albums.
pub async fn run_pass(
    ctx: &EngineContext,
    source: &dyn MediaSource,
    user_id: &str,
    public: [u8; 32],
    selection: &Selection,
    since: &HashMap<String, i64>,
) -> Result<MediaReport, EngineError> {
    let mut out = MediaReport::default();
    if selection.buckets.is_empty() {
        out.complete = true;
        return Ok(out);
    }
    let query = MediaQuery {
        buckets: selection.buckets.clone(),
        kinds: selection.kinds,
        since: since.clone(),
    };
    let mut items = match source.list(&query) {
        Ok(items) => items,
        Err(MediaError::Denied) => {
            out.report.unavailable = true;
            return Ok(out);
        }
        Err(MediaError::Other(e)) => return Err(EngineError::Other(e)),
    };
    items.retain(|i| selection.wants(i));
    items.sort_by(|a, b| b.taken.cmp(&a.taken).then(b.id.cmp(&a.id)));
    for i in &items {
        let g = out.generations.entry(i.volume.clone()).or_insert(0);
        *g = (*g).max(i.generation);
    }
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let report = &mut out.report;

    for item in &items {
        ctx.check_cancel()?;
        if !is_stable(item, now) {
            report.busy += 1;
            continue;
        }
        let key = item.key();
        let previous = ctx.db.media_file(user_id, &key)?;
        if previous
            .as_ref()
            .is_some_and(|p| p.size == item.size && p.modified == item.modified)
        {
            report.unchanged += 1;
            continue;
        }
        let retry = format!("media\0{user_id}\0{key}\0{}\0{}", item.size, item.modified);
        if !attempt_due(&retry) {
            report.deferred += 1;
            continue;
        }
        let outcome = async {
            let folder = album_folder(ctx, user_id, &public, item).await?;
            let file = source.open(item).map_err(|e| {
                EngineError::Io(std::io::Error::new(std::io::ErrorKind::NotFound, e))
            })?;
            let id = format!("{}:{}", item.volume, item.id);
            run_sealed_from(
                ctx,
                UploadSource::Open {
                    file: &file,
                    name: &item.name,
                    id: &id,
                },
                Sealing::PublicKey(public),
                None,
                Some(folder),
            )
            .await
        }
        .await;
        match outcome {
            Ok(file_id) => {
                clear_failure(&retry);
                ctx.db.set_media_file(
                    user_id,
                    &key,
                    &MediaFileState {
                        size: item.size,
                        modified: item.modified,
                        bucket_id: item.bucket_id.clone(),
                        remote_file_id: file_id.clone(),
                    },
                )?;
                if let Some(old) =
                    previous.filter(|p| !p.remote_file_id.is_empty() && p.remote_file_id != file_id)
                {
                    if let Err(e) = ctx.client.trash_file(&old.remote_file_id).await {
                        eprintln!(
                            "zcrypt photo backup: could not move the replaced version to the trash: {e}"
                        );
                    }
                }
                report.uploaded += 1;
                if !item.bucket.is_empty() && !out.albums.contains(&item.bucket) {
                    out.albums.push(item.bucket.clone());
                }
            }
            Err(EngineError::Cancelled) => return Err(EngineError::Cancelled),
            Err(e) if matches!(e, EngineError::Api(crate::api::ApiError::Unauthorized)) => {
                return Err(e);
            }
            Err(e) => {
                report.failed += 1;
                if e.is_transient() {
                    report.transient_failures += 1;
                }
                let attempts = record_failure(&retry);
                if report.errors.len() < MAX_REPORTED_ERRORS {
                    let note = if attempts >= MAX_FILE_ATTEMPTS {
                        format!(" (giving up after {attempts} tries)")
                    } else {
                        String::new()
                    };
                    report.errors.push(format!("{}: {e}{note}", item.name));
                }
            }
        }
    }
    out.complete = report.failed == 0 && report.deferred == 0 && report.busy == 0;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::localdb::BackupRoot;
    use crate::testutil::{serve, Reply};
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    struct Fake {
        items: Vec<MediaItem>,
        dir: tempfile::TempDir,
        queries: Mutex<Vec<MediaQuery>>,
        denied: bool,
    }

    impl Fake {
        fn new(items: Vec<MediaItem>) -> Self {
            Self {
                items,
                dir: tempfile::tempdir().unwrap(),
                queries: Mutex::new(vec![]),
                denied: false,
            }
        }
    }

    impl MediaSource for Fake {
        fn list(&self, q: &MediaQuery) -> Result<Vec<MediaItem>, MediaError> {
            self.queries.lock().unwrap().push(q.clone());
            if self.denied {
                return Err(MediaError::Denied);
            }
            Ok(self.items.clone())
        }

        fn open(&self, item: &MediaItem) -> Result<std::fs::File, String> {
            let p = self.dir.path().join(format!("{}", item.id));
            std::fs::write(&p, b"bytes").map_err(|e| e.to_string())?;
            std::fs::File::open(p).map_err(|e| e.to_string())
        }
    }

    fn item(id: i64, bucket: &str, rel: &str, name: &str, video: bool) -> MediaItem {
        MediaItem {
            uri: format!("content://media/external_primary/images/media/{id}"),
            volume: "external_primary".into(),
            id,
            bucket_id: bucket.into(),
            bucket: rel.trim_end_matches('/').rsplit('/').next().unwrap().into(),
            rel: rel.into(),
            name: name.into(),
            size: 5,
            modified: 1_000,
            taken: id * 1000,
            video,
            generation: id,
        }
    }

    fn ctx(base: &str) -> (tempfile::TempDir, EngineContext) {
        let dir = tempfile::tempdir().unwrap();
        let ctx = EngineContext {
            client: Arc::new(crate::api::Client::new(base, "t", "r")),
            db: Arc::new(LocalDb::open_at(&dir.path().join("db.sqlite")).unwrap()),
            profile: crate::profiles::NORMAL,
            progress: Arc::new(|_p| {}),
            creds: crate::engines::no_creds(),
            cancel: Default::default(),
            vault_passphrase: None,
        };
        (dir, ctx)
    }

    fn sel(buckets: &[&str], kinds: Kinds) -> Selection {
        Selection {
            buckets: buckets.iter().map(|s| s.to_string()).collect(),
            kinds,
        }
    }

    fn record(db: &LocalDb, it: &MediaItem) {
        db.set_media_file(
            "u",
            &it.key(),
            &MediaFileState {
                size: it.size,
                modified: it.modified,
                bucket_id: it.bucket_id.clone(),
                remote_file_id: "old".into(),
            },
        )
        .unwrap();
    }

    #[test]
    fn an_item_is_known_by_its_volume_and_id() {
        let mut a = item(7, "b", "DCIM/Camera/", "a.jpg", false);
        assert_eq!(a.key(), "external_primary:7");
        a.name = "renamed.jpg".into();
        assert_eq!(a.key(), "external_primary:7");
        a.volume = "1234-ABCD".into();
        assert_eq!(a.key(), "1234-ABCD:7");
    }

    #[test]
    fn the_android_reply_is_read_and_errors_are_told_apart() {
        let ok = r#"{"items":[{"uri":"content://x/1","volume":"external_primary","id":1,
            "bucket_id":"9","bucket":"Camera","rel":"DCIM/Camera/","name":"a.jpg",
            "size":10,"modified":5,"taken":5000,"video":false,"gen":42}]}"#;
        let items = parse_items(ok).unwrap();
        assert_eq!(
            (items[0].id, items[0].generation, items[0].size),
            (1, 42, 10)
        );
        assert_eq!(
            parse_items(r#"{"error":"denied"}"#),
            Err(MediaError::Denied)
        );
        assert_eq!(
            parse_items(r#"{"error":"boom"}"#),
            Err(MediaError::Other("boom".into()))
        );
        assert!(parse_items("nope").is_err());
    }

    #[test]
    fn kinds_pick_photos_videos_or_both() {
        assert!(Kinds::Photos.allows(false) && !Kinds::Photos.allows(true));
        assert!(Kinds::Videos.allows(true) && !Kinds::Videos.allows(false));
        assert!(Kinds::Both.allows(true) && Kinds::Both.allows(false));
        assert_eq!(Kinds::parse("videos"), Kinds::Videos);
        assert_eq!(Kinds::parse("anything"), Kinds::Both);
    }

    #[test]
    fn camera_is_found_by_folder_or_name() {
        let items = vec![
            item(1, "cam", "DCIM/Camera/", "a.jpg", false),
            item(
                2,
                "wa",
                "Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Images/",
                "b.jpg",
                false,
            ),
            item(3, "cam2", "Pictures/Camera/", "c.jpg", false),
        ];
        assert_eq!(camera_buckets(&items), vec!["cam", "cam2"]);
    }

    #[test]
    fn the_query_carries_albums_kinds_and_the_generation_to_start_from() {
        let q = MediaQuery {
            buckets: vec!["1".into()],
            kinds: Kinds::Videos,
            since: HashMap::from([("external_primary".to_string(), 9)]),
        };
        let v: serde_json::Value = serde_json::from_str(&q.to_json()).unwrap();
        assert_eq!(v["buckets"][0], "1");
        assert_eq!(v["kinds"], "videos");
        assert_eq!(v["since"]["external_primary"], 9);
    }

    #[tokio::test]
    async fn only_selected_albums_and_kinds_are_uploaded() {
        let (base, _) = serve(|_, _| Reply::status(503, "busy")).await;
        let (_d, ctx) = ctx(&base);
        let src = Fake::new(vec![
            item(1, "cam", "DCIM/Camera/", "a.jpg", false),
            item(2, "cam", "DCIM/Camera/", "b.mp4", true),
            item(3, "shots", "Pictures/Screenshots/", "c.png", false),
        ]);
        let r = run_pass(
            &ctx,
            &src,
            "u",
            [7; 32],
            &sel(&["cam"], Kinds::Photos),
            &HashMap::new(),
        )
        .await
        .unwrap();
        assert_eq!(r.report.failed, 1, "only the camera photo is attempted");
        assert!(r.report.errors[0].starts_with("a.jpg"));

        let r = run_pass(
            &ctx,
            &src,
            "u",
            [7; 32],
            &sel(&["cam"], Kinds::Both),
            &HashMap::new(),
        )
        .await
        .unwrap();
        assert_eq!(r.report.failed + r.report.deferred, 2);
        assert_eq!(
            src.queries.lock().unwrap()[0].buckets,
            vec!["cam".to_string()],
            "the album choice is sent to the phone, not filtered after"
        );
    }

    #[tokio::test]
    async fn no_albums_means_nothing_is_listed_or_uploaded() {
        let (base, hits) = serve(|_, _| Reply::status(503, "busy")).await;
        let (_d, ctx) = ctx(&base);
        let src = Fake::new(vec![item(1, "cam", "DCIM/Camera/", "a.jpg", false)]);
        let r = run_pass(
            &ctx,
            &src,
            "u",
            [7; 32],
            &sel(&[], Kinds::Both),
            &HashMap::new(),
        )
        .await
        .unwrap();
        assert!(r.complete && src.queries.lock().unwrap().is_empty());
        assert_eq!(hits.load(std::sync::atomic::Ordering::SeqCst), 0);
    }

    #[tokio::test]
    async fn an_item_is_unchanged_until_its_size_or_modified_time_changes() {
        let (base, hits) = serve(|_, _| Reply::status(503, "busy")).await;
        let (_d, ctx) = ctx(&base);
        let a = item(1, "cam", "DCIM/Camera/", "a.jpg", false);
        record(&ctx.db, &a);
        let src = Fake::new(vec![a.clone()]);
        let s = sel(&["cam"], Kinds::Both);
        let r = run_pass(&ctx, &src, "u", [7; 32], &s, &HashMap::new())
            .await
            .unwrap();
        assert_eq!((r.report.unchanged, r.report.failed), (1, 0));
        assert_eq!(hits.load(std::sync::atomic::Ordering::SeqCst), 0);

        let mut edited = a.clone();
        edited.modified += 60;
        let src = Fake::new(vec![edited.clone()]);
        let r = run_pass(&ctx, &src, "u", [7; 32], &s, &HashMap::new())
            .await
            .unwrap();
        assert_eq!((r.report.unchanged, r.report.failed), (0, 1));

        let mut resized = a;
        resized.size += 1;
        let src = Fake::new(vec![resized]);
        let r = run_pass(&ctx, &src, "u", [7; 32], &s, &HashMap::new())
            .await
            .unwrap();
        assert_eq!(r.report.unchanged, 0);
    }

    #[tokio::test]
    async fn the_next_scan_starts_from_the_newest_generation_only_when_everything_is_done() {
        let (base, _) = serve(|_, _| Reply::status(503, "busy")).await;
        let (_d, ctx) = ctx(&base);
        let mut a = item(1, "cam", "DCIM/Camera/", "a.jpg", false);
        a.generation = 11;
        let mut b = item(2, "cam", "DCIM/Camera/", "b.jpg", false);
        b.generation = 15;
        record(&ctx.db, &a);
        record(&ctx.db, &b);
        let src = Fake::new(vec![a.clone(), b.clone()]);
        let s = sel(&["cam"], Kinds::Both);
        let since = HashMap::from([("external_primary".to_string(), 10)]);
        let r = run_pass(&ctx, &src, "u", [7; 32], &s, &since)
            .await
            .unwrap();
        assert!(r.complete);
        assert_eq!(r.generations["external_primary"], 15);
        assert_eq!(src.queries.lock().unwrap()[0].since["external_primary"], 10);

        let mut c = item(3, "cam", "DCIM/Camera/", "c.jpg", false);
        c.generation = 20;
        let src = Fake::new(vec![a, b, c]);
        let r = run_pass(&ctx, &src, "u", [7; 32], &s, &since)
            .await
            .unwrap();
        assert!(
            !r.complete,
            "a failed upload must be retried from the old generation"
        );
    }

    #[tokio::test]
    async fn a_photo_still_being_written_waits() {
        let (base, hits) = serve(|_, _| Reply::status(503, "busy")).await;
        let (_d, ctx) = ctx(&base);
        let mut a = item(1, "cam", "DCIM/Camera/", "a.jpg", false);
        a.modified = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let src = Fake::new(vec![a]);
        let r = run_pass(
            &ctx,
            &src,
            "u",
            [7; 32],
            &sel(&["cam"], Kinds::Both),
            &HashMap::new(),
        )
        .await
        .unwrap();
        assert_eq!((r.report.busy, r.complete), (1, false));
        assert_eq!(hits.load(std::sync::atomic::Ordering::SeqCst), 0);
        assert!(STABLE_FOR >= Duration::from_secs(1));
    }

    #[tokio::test]
    async fn without_photo_access_the_pass_reports_unavailable() {
        let (base, _) = serve(|_, _| Reply::status(503, "busy")).await;
        let (_d, ctx) = ctx(&base);
        let mut src = Fake::new(vec![]);
        src.denied = true;
        let r = run_pass(
            &ctx,
            &src,
            "u",
            [7; 32],
            &sel(&["cam"], Kinds::Both),
            &HashMap::new(),
        )
        .await
        .unwrap();
        assert!(r.report.unavailable && !r.complete);
    }

    #[tokio::test]
    async fn a_signed_out_pass_returns_unauthorized() {
        let (base, _) = serve(|_, _| Reply::status(401, "")).await;
        let (_d, ctx) = ctx(&base);
        let src = Fake::new(vec![item(900, "cam", "DCIM/Camera/", "a.jpg", false)]);
        let r = run_pass(
            &ctx,
            &src,
            "u",
            [7; 32],
            &sel(&["cam"], Kinds::Both),
            &HashMap::new(),
        )
        .await;
        assert!(matches!(
            r,
            Err(EngineError::Api(crate::api::ApiError::Unauthorized))
        ));
    }

    fn legacy_root(ctx: &EngineContext) -> LegacyRoot {
        let root = BackupRoot {
            id: "dcim".into(),
            local_path: "/storage/emulated/0/DCIM".into(),
            user_id: "u".into(),
            public_key: "cHVi".into(),
            remote_folder_id: String::new(),
            last_scan_at: String::new(),
        };
        ctx.db.add_backup_root(&root).unwrap();
        ctx.db
            .set_backup_dir("dcim", "Camera", "vault-camera")
            .unwrap();
        for (path, id) in [
            ("Camera/a.jpg", "r1"),
            ("Camera/b.jpg", "r2"),
            ("Gone/x.jpg", "r3"),
        ] {
            ctx.db
                .set_backup_file(
                    "dcim",
                    path,
                    &BackupFileState {
                        size: 5,
                        mtime_ns: 1_000_000_000_000,
                        remote_file_id: id.into(),
                    },
                )
                .unwrap();
        }
        LegacyRoot {
            id: "dcim".into(),
            rel: "DCIM".into(),
        }
    }

    #[tokio::test]
    async fn migration_marks_already_backed_up_items_done_and_nothing_is_uploaded_again() {
        let (base, hits) = serve(|_, _| Reply::status(503, "busy")).await;
        let (_d, ctx) = ctx(&base);
        let root = legacy_root(&ctx);
        let items = vec![
            item(1, "cam", "DCIM/Camera/", "a.jpg", false),
            item(2, "cam", "DCIM/Camera/", "b.jpg", false),
            item(
                3,
                "wa",
                "Android/media/com.whatsapp/WhatsApp Images/",
                "w.jpg",
                false,
            ),
        ];
        let m = migrate_legacy(&ctx.db, "u", &items, &[root]).unwrap();
        assert_eq!(m.marked, 2);
        assert_eq!(m.buckets, vec!["cam"]);
        assert_eq!(ctx.db.media_file_count("u").unwrap(), 2);
        assert_eq!(
            ctx.db
                .media_file("u", "external_primary:1")
                .unwrap()
                .unwrap()
                .remote_file_id,
            "r1"
        );
        assert_eq!(
            ctx.db.media_dir("u", "cam").unwrap().as_deref(),
            Some("vault-camera")
        );
        assert_eq!(ctx.db.media_dir("u", "wa").unwrap(), None);

        let src = Fake::new(items[..2].to_vec());
        let r = run_pass(
            &ctx,
            &src,
            "u",
            [7; 32],
            &sel(&["cam"], Kinds::Both),
            &HashMap::new(),
        )
        .await
        .unwrap();
        assert_eq!((r.report.unchanged, r.report.failed), (2, 0));
        assert_eq!(hits.load(std::sync::atomic::Ordering::SeqCst), 0);
    }

    #[test]
    fn migration_leaves_items_edited_after_their_last_backup_unmarked() {
        let (_d, ctx) = ctx("http://unused");
        let root = legacy_root(&ctx);
        let mut resized = item(1, "cam", "DCIM/Camera/", "a.jpg", false);
        resized.size = 6;
        let mut touched = item(2, "cam", "DCIM/Camera/", "b.jpg", false);
        touched.modified = 1_001;
        let m = migrate_legacy(&ctx.db, "u", &[resized, touched], &[root]).unwrap();
        assert_eq!(m.marked, 0);
        assert_eq!(ctx.db.media_file_count("u").unwrap(), 0);
    }
}
