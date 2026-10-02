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
/// a user-visible file only accept one of these, so a compromised webview can't
/// aim a download at an arbitrary path.
#[derive(Default)]
pub struct SaveApprovals(Mutex<HashSet<String>>);

impl SaveApprovals {
    pub fn approve(&self, path: &str) {
        self.0.lock().unwrap().insert(path.to_string());
    }

    pub fn check(&self, path: &str) -> Result<(), String> {
        if self.0.lock().unwrap().contains(path) {
            Ok(())
        } else {
            Err("save location was not chosen in the save dialog".to_string())
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
        assert!(approvals.check("/home/u/a.pdf").is_ok());
        assert!(approvals.check("/home/u/b.pdf").is_err());
        assert!(approvals.check("/home/u/../u/a.pdf").is_err());
    }
}
