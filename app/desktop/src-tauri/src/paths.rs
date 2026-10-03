use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Every temp file this process writes is named `zcrypt-<pid>-<name>` inside
/// the OS temp dir; nothing outside that prefix may be written or removed.
pub fn temp_prefix(pid: u32) -> String {
    format!("zcrypt-{pid}-")
}

/// Resolve the temp path for a webview-supplied `name`. Only a bare file name
/// is accepted: separators, `.`/`..` and NUL are rejected so the result can
/// never leave `dir`.
pub fn temp_file_path(dir: &Path, pid: u32, name: &str) -> Result<PathBuf, String> {
    let bad = name.is_empty()
        || name == "."
        || name == ".."
        || name.contains(['/', '\\', '\0'])
        || Path::new(name).file_name() != Some(std::ffi::OsStr::new(name));
    if bad {
        return Err("invalid temp file name".to_string());
    }
    Ok(dir.join(format!("{}{}", temp_prefix(pid), name)))
}

/// Confine a removal request to a regular file this process created: the
/// parent must canonicalise to the temp dir and the name must carry this
/// pid's prefix. Returns `Ok(None)` when the file is already gone.
pub fn removable_temp_file(dir: &Path, pid: u32, path: &str) -> Result<Option<PathBuf>, String> {
    let reject = || Err("path is not a zcrypt temp file".to_string());
    let p = Path::new(path);
    let (Some(parent), Some(name)) = (p.parent(), p.file_name()) else {
        return reject();
    };
    if !name.to_string_lossy().starts_with(&temp_prefix(pid)) {
        return reject();
    }
    let (Ok(parent), Ok(dir)) = (parent.canonicalize(), dir.canonicalize()) else {
        return reject();
    };
    if parent != dir {
        return reject();
    }
    let target = parent.join(name);
    match std::fs::symlink_metadata(&target) {
        Ok(meta) if meta.is_file() || meta.file_type().is_symlink() => Ok(Some(target)),
        Ok(_) => reject(),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("remove temp: {e}")),
    }
}

/// Destinations the user picked in the native save dialog. Commands that write
/// a user-visible file only accept one of these, each exactly once, so a
/// compromised webview can't aim a download at an arbitrary path or reuse an
/// earlier pick to overwrite it.
#[derive(Default)]
pub struct SaveApprovals(Mutex<HashSet<String>>);

impl SaveApprovals {
    pub fn approve(&self, path: &str) {
        self.0.lock().unwrap().insert(path.to_string());
    }

    pub fn check(&self, path: &str) -> Result<(), String> {
        if self.0.lock().unwrap().remove(path) {
            Ok(())
        } else {
            Err("save location was not chosen in the save dialog".to_string())
        }
    }
}

/// Source files the user handed to zcrypt: picked in the native open dialog,
/// or shared into the app's share folder. Upload commands read only these, so
/// a compromised webview can't pull arbitrary files into the vault. Picks are
/// persisted to `store` so an unfinished upload still resumes after a restart.
pub struct ReadApprovals {
    picked: Mutex<HashSet<String>>,
    store: Option<PathBuf>,
    share_dir: Option<PathBuf>,
}

impl ReadApprovals {
    pub fn new(store: Option<PathBuf>, share_dir: Option<PathBuf>) -> Self {
        let picked = store
            .as_deref()
            .and_then(|p| std::fs::read(p).ok())
            .and_then(|raw| serde_json::from_slice::<HashSet<String>>(&raw).ok())
            .unwrap_or_default();
        Self {
            picked: Mutex::new(picked),
            store,
            share_dir,
        }
    }

    pub fn approve(&self, paths: &[String]) {
        let mut picked = self.picked.lock().unwrap();
        picked.extend(paths.iter().cloned());
        self.persist(&picked);
    }

    pub fn release(&self, path: &str) {
        let mut picked = self.picked.lock().unwrap();
        if picked.remove(path) {
            self.persist(&picked);
        }
    }

    pub fn check(&self, path: &str) -> Result<(), String> {
        if self.picked.lock().unwrap().contains(path) || self.is_shared(path) {
            Ok(())
        } else {
            Err("file was not chosen in the file picker".to_string())
        }
    }

    fn is_shared(&self, path: &str) -> bool {
        let Some(dir) = self
            .share_dir
            .as_deref()
            .and_then(|d| d.canonicalize().ok())
        else {
            return false;
        };
        Path::new(path)
            .canonicalize()
            .is_ok_and(|p| p.starts_with(&dir) && p != dir && p.is_file())
    }

    fn persist(&self, picked: &HashSet<String>) {
        let Some(store) = &self.store else { return };
        if let Some(parent) = store.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(raw) = serde_json::to_vec(picked) {
            let _ = std::fs::write(store, raw);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(tag: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("zcrypt-paths-test-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn temp_file_path_keeps_plain_names_inside_dir() {
        let dir = Path::new("/tmp/x");
        assert_eq!(
            temp_file_path(dir, 7, "photo.jpg").unwrap(),
            dir.join("zcrypt-7-photo.jpg")
        );
    }

    #[test]
    fn temp_file_path_rejects_traversal_and_separators() {
        let dir = Path::new("/tmp/x");
        for name in [
            "",
            ".",
            "..",
            "../etc/passwd",
            "a/b",
            "a\\b",
            "nul\0byte",
            "/abs",
        ] {
            assert!(temp_file_path(dir, 7, name).is_err(), "{name:?} accepted");
        }
    }

    #[test]
    fn removable_temp_file_accepts_own_prefixed_file() {
        let dir = scratch("own");
        let f = dir.join("zcrypt-9-a.bin");
        std::fs::write(&f, b"x").unwrap();
        let got = removable_temp_file(&dir, 9, f.to_str().unwrap()).unwrap();
        assert_eq!(
            got,
            Some(dir.canonicalize().unwrap().join("zcrypt-9-a.bin"))
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn removable_temp_file_missing_file_is_noop() {
        let dir = scratch("missing");
        let f = dir.join("zcrypt-9-gone.bin");
        assert_eq!(
            removable_temp_file(&dir, 9, f.to_str().unwrap()).unwrap(),
            None
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn removable_temp_file_rejects_foreign_paths() {
        let dir = scratch("foreign");
        let other = scratch("foreign-other");
        let wrong_pid = dir.join("zcrypt-8-a.bin");
        let no_prefix = dir.join("notes.txt");
        let outside = other.join("zcrypt-9-a.bin");
        let traversal = format!("{}/../zcrypt-9-a.bin", dir.join("sub").display());
        std::fs::create_dir_all(dir.join("zcrypt-9-dir")).unwrap();
        let a_dir = dir.join("zcrypt-9-dir");
        for p in [&wrong_pid, &no_prefix, &outside, &a_dir] {
            std::fs::write(p, b"x").ok();
            assert!(
                removable_temp_file(&dir, 9, p.to_str().unwrap()).is_err(),
                "{} accepted",
                p.display()
            );
        }
        assert!(removable_temp_file(&dir, 9, &traversal).is_err());
        assert!(removable_temp_file(&dir, 9, "/").is_err());
        assert!(removable_temp_file(&dir, 9, "").is_err());
        let _ = std::fs::remove_dir_all(&dir);
        let _ = std::fs::remove_dir_all(&other);
    }

    #[test]
    fn save_approvals_only_accept_picked_paths() {
        let approvals = SaveApprovals::default();
        assert!(approvals.check("/home/u/a.pdf").is_err());
        approvals.approve("/home/u/a.pdf");
        assert!(approvals.check("/home/u/b.pdf").is_err());
        assert!(approvals.check("/home/u/../u/a.pdf").is_err());
        assert!(approvals.check("/home/u/a.pdf").is_ok());
    }

    #[test]
    fn save_approvals_are_single_use() {
        let approvals = SaveApprovals::default();
        approvals.approve("/home/u/a.pdf");
        assert!(approvals.check("/home/u/a.pdf").is_ok());
        assert!(approvals.check("/home/u/a.pdf").is_err());
    }

    #[test]
    fn read_approvals_only_accept_picked_paths() {
        let reads = ReadApprovals::new(None, None);
        assert!(reads.check("/home/u/.ssh/id_rsa").is_err());
        reads.approve(&["/home/u/a.pdf".to_string()]);
        assert!(reads.check("/home/u/a.pdf").is_ok());
        assert!(reads.check("/home/u/a.pdf").is_ok());
        assert!(reads.check("/home/u/../u/a.pdf").is_err());
        reads.release("/home/u/a.pdf");
        assert!(reads.check("/home/u/a.pdf").is_err());
    }

    #[test]
    fn read_approvals_survive_a_restart_until_released() {
        let dir = scratch("reads-store");
        let store = dir.join("state").join("reads.json");
        let first = ReadApprovals::new(Some(store.clone()), None);
        first.approve(&["/home/u/a.pdf".to_string(), "/home/u/b.pdf".to_string()]);
        first.release("/home/u/b.pdf");
        let second = ReadApprovals::new(Some(store), None);
        assert!(second.check("/home/u/a.pdf").is_ok());
        assert!(second.check("/home/u/b.pdf").is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn read_approvals_accept_files_in_the_share_dir_only() {
        let dir = scratch("reads-share");
        let share = dir.join("shared");
        std::fs::create_dir_all(share.join("abc")).unwrap();
        let inside = share.join("abc").join("photo.jpg");
        let outside = dir.join("secret.txt");
        std::fs::write(&inside, b"x").unwrap();
        std::fs::write(&outside, b"x").unwrap();
        let escape = share.join("abc").join("..").join("..").join("secret.txt");
        let reads = ReadApprovals::new(None, Some(share.clone()));
        assert!(reads.check(inside.to_str().unwrap()).is_ok());
        assert!(reads.check(outside.to_str().unwrap()).is_err());
        assert!(reads.check(escape.to_str().unwrap()).is_err());
        assert!(reads.check(share.join("abc").to_str().unwrap()).is_err());
        assert!(reads.check(share.to_str().unwrap()).is_err());
        assert!(
            reads
                .check(share.join("abc").join("gone.jpg").to_str().unwrap())
                .is_err()
        );
        let _ = std::fs::remove_dir_all(&dir);
    }
}
