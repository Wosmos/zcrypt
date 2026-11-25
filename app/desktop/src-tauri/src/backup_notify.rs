//! One OS notification per backup pass, and only when something happened.
//! The web layer pushes the person's notification choice and localized texts
//! through `set_backup_notifications`; they are kept in the local database so
//! a pass that runs with no window open (folder schedule, Android job) follows
//! them too. The sink is a trait so tests never reach the OS.

use serde::{Deserialize, Serialize};
use zcrypt_core::engines::backup::BackupReport;
use zcrypt_core::localdb::LocalDb;

const PREFS_KEY: &str = "backup.notify.prefs";
const STATE_KEY: &str = "backup.notify.state";
const TRANSIENT_PASSES_BEFORE_NOTICE: u32 = 2;

pub trait Notifier {
    fn show(&self, title: &str, body: &str);
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct Templates {
    pub title: String,
    pub files_one: String,
    pub files_other: String,
    pub files_from_one: String,
    pub files_from_other: String,
    pub photos_one: String,
    pub photos_other: String,
    pub signed_out: String,
    pub offline: String,
    pub failed_one: String,
    pub failed_other: String,
}

impl Default for Templates {
    fn default() -> Self {
        let s = |v: &str| v.to_string();
        Templates {
            title: s("zcrypt backup"),
            files_one: s("{n} file backed up"),
            files_other: s("{n} files backed up"),
            files_from_one: s("{n} file backed up from {folder}"),
            files_from_other: s("{n} files backed up from {folder}"),
            photos_one: s("{n} photo backed up"),
            photos_other: s("{n} photos backed up"),
            signed_out: s("Backup stopped: sign in again"),
            offline: s("Backup paused: no connection"),
            failed_one: s("Backup couldn't upload {n} file"),
            failed_other: s("Backup couldn't upload {n} files"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct NotifyPrefs {
    pub success: bool,
    pub problems: bool,
    pub templates: Templates,
}

impl Default for NotifyPrefs {
    fn default() -> Self {
        NotifyPrefs {
            success: true,
            problems: true,
            templates: Templates::default(),
        }
    }
}

impl NotifyPrefs {
    pub fn load(db: &LocalDb) -> Self {
        db.setting(PREFS_KEY)
            .ok()
            .flatten()
            .and_then(|v| serde_json::from_str(&v).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, db: &LocalDb) -> Result<(), String> {
        let json = serde_json::to_string(self).map_err(|e| e.to_string())?;
        db.set_setting(PREFS_KEY, &json).map_err(|e| e.to_string())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
enum Failure {
    SignedOut,
    Offline,
    Failed,
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct NoticeState {
    last: Option<Failure>,
    transient_passes: u32,
}

impl NoticeState {
    fn load(db: &LocalDb) -> Self {
        db.setting(STATE_KEY)
            .ok()
            .flatten()
            .and_then(|v| serde_json::from_str(&v).ok())
            .unwrap_or_default()
    }

    fn save(&self, db: &LocalDb) {
        if let Ok(json) = serde_json::to_string(self) {
            let _ = db.set_setting(STATE_KEY, &json);
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Subject {
    Folders,
    Photos,
}

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct PassSummary {
    pub uploaded: u32,
    pub failed: u32,
    pub transient: u32,
    pub signed_out: bool,
    pub folders: Vec<String>,
}

impl PassSummary {
    pub fn add(&mut self, folder: &str, r: &BackupReport) {
        self.uploaded += r.uploaded;
        self.failed += r.failed;
        self.transient += r.transient_failures;
        if r.uploaded > 0 && !folder.is_empty() && !self.folders.iter().any(|f| f == folder) {
            self.folders.push(folder.to_string());
        }
    }

    pub fn add_transient_error(&mut self) {
        self.failed += 1;
        self.transient += 1;
    }

    fn all_transient(&self) -> bool {
        self.failed > 0 && self.uploaded == 0 && self.transient == self.failed
    }

    fn permanent(&self) -> u32 {
        self.failed - self.transient
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Message {
    pub title: String,
    pub body: String,
}

fn count(n: u32, one: &str, other: &str) -> String {
    (if n == 1 { one } else { other }).replace("{n}", &n.to_string())
}

fn success_text(s: &PassSummary, subject: Subject, t: &Templates) -> String {
    match (subject, s.folders.as_slice()) {
        (Subject::Photos, _) => count(s.uploaded, &t.photos_one, &t.photos_other),
        (Subject::Folders, [one]) => {
            count(s.uploaded, &t.files_from_one, &t.files_from_other).replace("{folder}", one)
        }
        (Subject::Folders, _) => count(s.uploaded, &t.files_one, &t.files_other),
    }
}

/// What to tell the person after a pass, updating the failure memory so each
/// kind of failure is announced once until a pass goes cleanly again.
pub fn decide(
    summary: &PassSummary,
    state: &mut NoticeState,
    prefs: &NotifyPrefs,
    subject: Subject,
) -> Option<Message> {
    let t = &prefs.templates;
    let mut failure: Option<(Failure, String)> = None;
    if summary.signed_out {
        state.transient_passes = 0;
        if state.last != Some(Failure::SignedOut) {
            state.last = Some(Failure::SignedOut);
            failure = Some((Failure::SignedOut, t.signed_out.clone()));
        }
    } else if summary.all_transient() {
        state.transient_passes += 1;
        if state.transient_passes >= TRANSIENT_PASSES_BEFORE_NOTICE
            && state.last != Some(Failure::Offline)
        {
            state.last = Some(Failure::Offline);
            failure = Some((Failure::Offline, t.offline.clone()));
        }
    } else if summary.permanent() > 0 {
        state.transient_passes = 0;
        if state.last != Some(Failure::Failed) {
            state.last = Some(Failure::Failed);
            failure = Some((
                Failure::Failed,
                count(summary.permanent(), &t.failed_one, &t.failed_other),
            ));
        }
    } else {
        *state = NoticeState::default();
    }
    let body = if let Some((_, text)) = failure {
        prefs.problems.then_some(text)
    } else if summary.uploaded > 0 && !summary.signed_out {
        prefs.success.then(|| success_text(summary, subject, t))
    } else {
        None
    };
    body.map(|body| Message {
        title: t.title.clone(),
        body,
    })
}

pub fn deliver(db: &LocalDb, sink: &dyn Notifier, summary: &PassSummary, subject: Subject) {
    let prefs = NotifyPrefs::load(db);
    let mut state = NoticeState::load(db);
    let message = decide(summary, &mut state, &prefs, subject);
    state.save(db);
    if let Some(m) = message {
        sink.show(&m.title, &m.body);
    }
}

pub struct OsSink(pub tauri::AppHandle);

impl Notifier for OsSink {
    fn show(&self, title: &str, body: &str) {
        use tauri_plugin_notification::NotificationExt;
        let _ = self
            .0
            .notification()
            .builder()
            .title(title)
            .body(body)
            .show();
    }
}

static PENDING: std::sync::Mutex<Option<Message>> = std::sync::Mutex::new(None);

/// Holds the message for the Android job, which posts it itself.
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
pub struct PendingSink;

impl Notifier for PendingSink {
    fn show(&self, title: &str, body: &str) {
        *PENDING.lock().unwrap() = Some(Message {
            title: title.into(),
            body: body.into(),
        });
    }
}

/// Takes the message the last Android run left, as "title\nbody".
#[cfg_attr(not(target_os = "android"), allow(dead_code))]
pub fn take_pending() -> Option<String> {
    PENDING
        .lock()
        .unwrap()
        .take()
        .map(|m| format!("{}\n{}", m.title, m.body))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[derive(Default)]
    struct Fake(Mutex<Vec<(String, String)>>);

    impl Notifier for Fake {
        fn show(&self, title: &str, body: &str) {
            self.0.lock().unwrap().push((title.into(), body.into()));
        }
    }

    impl Fake {
        fn bodies(&self) -> Vec<String> {
            self.0.lock().unwrap().iter().map(|m| m.1.clone()).collect()
        }
    }

    fn report(uploaded: u32, failed: u32, transient: u32) -> BackupReport {
        BackupReport {
            uploaded,
            failed,
            transient_failures: transient,
            ..Default::default()
        }
    }

    fn summary(parts: &[(&str, BackupReport)]) -> PassSummary {
        let mut s = PassSummary::default();
        for (folder, r) in parts {
            s.add(folder, r);
        }
        s
    }

    fn run(summaries: &[PassSummary], subject: Subject) -> (Vec<String>, Fake) {
        let dir = tempfile::tempdir().unwrap();
        let db = LocalDb::open_at(&dir.path().join("db.sqlite")).unwrap();
        let fake = Fake::default();
        for s in summaries {
            deliver(&db, &fake, s, subject);
        }
        (fake.bodies(), fake)
    }

    #[test]
    fn new_files_are_announced_with_the_folder_when_there_is_one() {
        let one = summary(&[("Taxes", report(3, 0, 0))]);
        assert_eq!(
            run(&[one], Subject::Folders).0,
            vec!["3 files backed up from Taxes"]
        );
        let two = summary(&[("A", report(1, 0, 0)), ("B", report(1, 0, 0))]);
        assert_eq!(run(&[two], Subject::Folders).0, vec!["2 files backed up"]);
        let single = summary(&[("A", report(1, 0, 0))]);
        assert_eq!(
            run(&[single], Subject::Folders).0,
            vec!["1 file backed up from A"]
        );
        let photos = summary(&[("DCIM", report(5, 0, 0))]);
        assert_eq!(
            run(&[photos], Subject::Photos).0,
            vec!["5 photos backed up"]
        );
    }

    #[test]
    fn the_android_sink_hands_over_one_message_once() {
        PendingSink.show("t", "b");
        assert_eq!(take_pending().as_deref(), Some("t\nb"));
        assert_eq!(take_pending(), None);
    }

    #[test]
    fn a_pass_with_nothing_new_says_nothing() {
        let quiet = summary(&[("A", BackupReport::default())]);
        assert!(run(&[quiet], Subject::Folders).0.is_empty());
    }

    #[test]
    fn signing_out_is_announced_once_until_a_clean_pass() {
        let out = PassSummary {
            signed_out: true,
            ..Default::default()
        };
        let clean = summary(&[("A", report(1, 0, 0))]);
        let (bodies, _) = run(&[out.clone(), out.clone(), clean, out], Subject::Folders);
        assert_eq!(
            bodies,
            vec![
                "Backup stopped: sign in again",
                "1 file backed up from A",
                "Backup stopped: sign in again"
            ]
        );
    }

    #[test]
    fn repeated_transient_failures_give_one_notice_until_success() {
        let off = summary(&[("A", report(0, 2, 2))]);
        let clean = summary(&[("A", report(1, 0, 0))]);
        let (bodies, _) = run(
            &[
                off.clone(),
                off.clone(),
                off.clone(),
                clean,
                off.clone(),
                off,
            ],
            Subject::Folders,
        );
        assert_eq!(
            bodies,
            vec![
                "Backup paused: no connection",
                "1 file backed up from A",
                "Backup paused: no connection"
            ]
        );
    }

    #[test]
    fn a_single_transient_pass_stays_quiet() {
        let off = summary(&[("A", report(0, 1, 1))]);
        assert!(run(&[off], Subject::Folders).0.is_empty());
    }

    #[test]
    fn permanent_failures_are_counted_once_per_failure_streak() {
        let bad = summary(&[("A", report(0, 3, 1))]);
        let (bodies, _) = run(&[bad.clone(), bad], Subject::Folders);
        assert_eq!(bodies, vec!["Backup couldn't upload 2 files"]);
        let one = summary(&[("A", report(0, 1, 0))]);
        assert_eq!(
            run(&[one], Subject::Folders).0,
            vec!["Backup couldn't upload 1 file"]
        );
    }

    #[test]
    fn a_deduped_failure_still_reports_new_files() {
        let bad = summary(&[("A", report(0, 1, 0))]);
        let mixed = summary(&[("A", report(2, 1, 0))]);
        let (bodies, _) = run(&[bad, mixed], Subject::Folders);
        assert_eq!(
            bodies,
            vec!["Backup couldn't upload 1 file", "2 files backed up from A"]
        );
    }

    #[test]
    fn choices_and_texts_from_the_web_layer_apply() {
        let dir = tempfile::tempdir().unwrap();
        let db = LocalDb::open_at(&dir.path().join("db.sqlite")).unwrap();
        let fake = Fake::default();
        let mut prefs = NotifyPrefs::load(&db);
        assert!(prefs.success && prefs.problems);
        prefs.success = false;
        prefs.templates.files_other = "{n} Dateien gesichert".into();
        prefs.save(&db).unwrap();
        let s = summary(&[("A", report(2, 0, 0)), ("B", report(1, 0, 0))]);
        deliver(&db, &fake, &s, Subject::Folders);
        assert!(fake.bodies().is_empty());
        prefs.success = true;
        prefs.save(&db).unwrap();
        deliver(&db, &fake, &s, Subject::Folders);
        assert_eq!(fake.bodies(), vec!["3 Dateien gesichert"]);
        db.set_setting(PREFS_KEY, "garbage").unwrap();
        assert_eq!(NotifyPrefs::load(&db), NotifyPrefs::default());
    }

    #[test]
    fn disabled_problems_stay_silent_but_remember_the_failure() {
        let dir = tempfile::tempdir().unwrap();
        let db = LocalDb::open_at(&dir.path().join("db.sqlite")).unwrap();
        let fake = Fake::default();
        NotifyPrefs {
            problems: false,
            ..Default::default()
        }
        .save(&db)
        .unwrap();
        let out = PassSummary {
            signed_out: true,
            ..Default::default()
        };
        deliver(&db, &fake, &out, Subject::Folders);
        assert!(fake.bodies().is_empty());
        assert_eq!(NoticeState::load(&db).last, Some(Failure::SignedOut));
    }
}
