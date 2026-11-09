//! One-way folder backup (docs/CRYPTO_FORMAT.md 2.2).
//!
//! Each pass mirrors new and changed files of a backed-up folder into a vault
//! folder of the same shape, sealing keys and names to the account public key
//! pinned when backup was turned on, so it runs with the vault locked and the
//! device never holds anything that can read the vault. It never deletes: a
//! file removed locally stays in the vault, and a replaced version goes to the
//! trash. A file counts as backed up only once the server confirmed it.

use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::Engine;

use super::stream_upload::{run_sealed, Sealing};
use super::{EngineContext, EngineError};
use crate::localdb::{BackupFileState, BackupRoot, LocalDb};
use crate::pk1;

/// A file whose size or mtime changed this recently may still be being written.
pub const STABLE_FOR: Duration = Duration::from_secs(3);
const MAX_REPORTED_ERRORS: usize = 20;

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct BackupReport {
    pub uploaded: u32,
    pub unchanged: u32,
    pub busy: u32,
    pub failed: u32,
    /// The folder is missing (unplugged drive, renamed): nothing was done.
    pub unavailable: bool,
    pub errors: Vec<String>,
}

/// A regular file found under a backed-up folder.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Found {
    /// Relative path with `/` separators on every OS.
    pub rel_path: String,
    pub size: i64,
    pub mtime_ns: i64,
}

/// System and temporary files no one means to back up.
pub fn is_ignored(name: &str) -> bool {
    const NAMES: &[&str] = &[
        ".DS_Store",
        "Thumbs.db",
        "desktop.ini",
        ".localized",
        "Icon\r",
        ".git",
        "node_modules",
        "$RECYCLE.BIN",
        ".Trashes",
        ".Spotlight-V100",
        ".fseventsd",
        ".thumbnails",
        ".nomedia",
    ];
    const SUFFIXES: &[&str] = &[
        ".tmp",
        ".part",
        ".crdownload",
        ".download",
        ".partial",
        ".swp",
    ];
    NAMES.contains(&name)
        || name.starts_with("~$")
        || name.starts_with(".~lock.")
        || name.starts_with(".zcrypt-")
        || name.starts_with("._")
        || name.starts_with(".trashed-")
        || name.starts_with(".pending-")
        || SUFFIXES
            .iter()
            .any(|s| name.to_ascii_lowercase().ends_with(s))
}

fn mtime_ns(meta: &std::fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_nanos() as i64)
        .unwrap_or(0)
}

/// Lists the regular files under `root`, skipping ignored names and never
/// following symlinks (a link could point outside the folder).
pub fn scan(root: &Path) -> std::io::Result<Vec<Found>> {
    let mut out = Vec::new();
    let mut stack: Vec<(PathBuf, String)> = vec![(root.to_path_buf(), String::new())];
    while let Some((dir, rel)) = stack.pop() {
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(e) if dir == root => return Err(e),
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if is_ignored(&name) {
                continue;
            }
            let Ok(meta) = std::fs::symlink_metadata(entry.path()) else {
                continue;
            };
            let child_rel = if rel.is_empty() {
                name
            } else {
                format!("{rel}/{name}")
            };
            if meta.file_type().is_symlink() {
                continue;
            } else if meta.is_dir() {
                stack.push((entry.path(), child_rel));
            } else if meta.is_file() {
                out.push(Found {
                    rel_path: child_rel,
                    size: meta.len() as i64,
                    mtime_ns: mtime_ns(&meta),
                });
            }
        }
    }
    out.sort_by(|a, b| a.rel_path.cmp(&b.rel_path));
    Ok(out)
}

fn public_key(root: &BackupRoot) -> Result<[u8; 32], EngineError> {
    base64::engine::general_purpose::STANDARD
        .decode(&root.public_key)
        .ok()
        .and_then(|b| <[u8; 32]>::try_from(b.as_slice()).ok())
        .ok_or_else(|| EngineError::Other("backup: the pinned account key is malformed".into()))
}

fn folder_name(path: &Path) -> String {
    path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "Backup".into())
}

/// The vault folder mirroring `rel_dir` ("" = the backed-up folder itself),
/// creating it and any missing parents, each named under the pinned key.
async fn ensure_dir(
    ctx: &EngineContext,
    db: &LocalDb,
    root: &BackupRoot,
    public: &[u8; 32],
    rel_dir: &str,
) -> Result<String, EngineError> {
    if let Some(id) = db.backup_dir(&root.id, rel_dir)? {
        return Ok(id);
    }
    let (parent_rel, name) = match rel_dir.rsplit_once('/') {
        Some((p, n)) => (p.to_string(), n.to_string()),
        None if rel_dir.is_empty() => {
            let sealed =
                pk1::seal_pk1(public, folder_name(Path::new(&root.local_path)).as_bytes())?;
            let id = ctx.client.create_folder(&sealed, None).await?;
            db.set_backup_dir(&root.id, "", &id)?;
            db.set_backup_root_folder(&root.id, &id)?;
            return Ok(id);
        }
        None => (String::new(), rel_dir.to_string()),
    };
    let parent = Box::pin(ensure_dir(ctx, db, root, public, &parent_rel)).await?;
    let sealed = pk1::seal_pk1(public, name.as_bytes())?;
    let id = ctx.client.create_folder(&sealed, Some(&parent)).await?;
    db.set_backup_dir(&root.id, rel_dir, &id)?;
    Ok(id)
}

fn is_stable(found: &Found, now_ns: i64) -> bool {
    now_ns.saturating_sub(found.mtime_ns) >= STABLE_FOR.as_nanos() as i64
}

/// One backup pass over `root`.
pub async fn run_pass(ctx: &EngineContext, root: &BackupRoot) -> Result<BackupReport, EngineError> {
    let mut report = BackupReport::default();
    let base = PathBuf::from(&root.local_path);
    if !base.is_dir() {
        report.unavailable = true;
        return Ok(report);
    }
    let public = public_key(root)?;
    let db = ctx.db.clone();
    let scan_base = base.clone();
    let found = tokio::task::spawn_blocking(move || scan(&scan_base))
        .await
        .map_err(|e| EngineError::Other(format!("task join: {e}")))??;
    let now_ns = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos() as i64)
        .unwrap_or(0);

    for f in found {
        ctx.check_cancel()?;
        if !is_stable(&f, now_ns) {
            report.busy += 1;
            continue;
        }
        let previous = db.backup_file(&root.id, &f.rel_path)?;
        if previous
            .as_ref()
            .is_some_and(|p| p.size == f.size && p.mtime_ns == f.mtime_ns)
        {
            report.unchanged += 1;
            continue;
        }
        let rel_dir = f.rel_path.rsplit_once('/').map(|(d, _)| d).unwrap_or("");
        let outcome = async {
            let folder = ensure_dir(ctx, &db, root, &public, rel_dir).await?;
            run_sealed(
                ctx,
                &base.join(&f.rel_path),
                Sealing::PublicKey(public),
                None,
                Some(folder),
            )
            .await
        }
        .await;
        match outcome {
            Ok(file_id) => {
                db.set_backup_file(
                    &root.id,
                    &f.rel_path,
                    &BackupFileState {
                        size: f.size,
                        mtime_ns: f.mtime_ns,
                        remote_file_id: file_id.clone(),
                    },
                )?;
                if let Some(old) =
                    previous.filter(|p| !p.remote_file_id.is_empty() && p.remote_file_id != file_id)
                {
                    if let Err(e) = ctx.client.trash_file(&old.remote_file_id).await {
                        eprintln!(
                            "zcrypt backup: could not move the replaced version to the trash: {e}"
                        );
                    }
                }
                report.uploaded += 1;
            }
            Err(EngineError::Cancelled) => return Err(EngineError::Cancelled),
            Err(e) => {
                report.failed += 1;
                if report.errors.len() < MAX_REPORTED_ERRORS {
                    report.errors.push(format!("{}: {e}", f.rel_path));
                }
            }
        }
    }
    db.touch_backup_root(&root.id)?;
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ignores_system_and_temporary_files() {
        for name in [
            ".DS_Store",
            "Thumbs.db",
            "~$report.docx",
            ".~lock.sheet.ods#",
            "movie.mp4.part",
            "x.CRDOWNLOAD",
            ".git",
            "node_modules",
            "._photo.jpg",
        ] {
            assert!(is_ignored(name), "{name} should be ignored");
        }
        for name in [
            "report.docx",
            "photo.jpg",
            ".env",
            "notes.txt",
            "partial.pdf",
        ] {
            assert!(!is_ignored(name), "{name} should be backed up");
        }
    }

    #[test]
    fn scan_lists_files_with_forward_slash_paths_and_skips_links_and_junk() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("Photos/2026")).unwrap();
        std::fs::write(root.join("a.txt"), b"a").unwrap();
        std::fs::write(root.join("Photos/2026/b.jpg"), b"bb").unwrap();
        std::fs::write(root.join(".DS_Store"), b"x").unwrap();
        std::fs::create_dir_all(root.join(".git")).unwrap();
        std::fs::write(root.join(".git/config"), b"x").unwrap();
        std::fs::create_dir_all(root.join(".thumbnails")).unwrap();
        std::fs::write(root.join(".thumbnails/1.jpg"), b"x").unwrap();
        std::fs::write(root.join(".trashed-1767225600-old.jpg"), b"x").unwrap();
        std::fs::write(root.join(".pending-1767225600-new.mp4"), b"x").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink("/etc/hosts", root.join("link")).unwrap();

        let found = scan(root).unwrap();
        let paths: Vec<_> = found
            .iter()
            .map(|f| (f.rel_path.as_str(), f.size))
            .collect();
        assert_eq!(paths, vec![("Photos/2026/b.jpg", 2), ("a.txt", 1)]);
        assert!(found.iter().all(|f| f.mtime_ns > 0));
    }

    #[test]
    fn a_missing_root_is_an_error_not_an_empty_folder() {
        assert!(scan(Path::new("/definitely/not/here/zcrypt")).is_err());
    }

    #[test]
    fn files_still_being_written_wait() {
        let f = Found {
            rel_path: "a".into(),
            size: 1,
            mtime_ns: 10_000_000_000,
        };
        assert!(!is_stable(&f, 11_000_000_000));
        assert!(is_stable(&f, 14_000_000_000));
    }
}
