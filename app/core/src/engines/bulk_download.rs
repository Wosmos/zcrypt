//! Bulk download: fetch N files (reusing the streaming `download` engine per
//! file — byos-direct, DNS/relay-fallback resilience, whole-file integrity,
//! all unchanged) and pack them into ONE ZIP. Streams one file at a time
//! through a scratch temp path, so at most one file's plaintext exists on
//! disk (never fully in memory) at any moment — not the sum of the whole
//! batch, which the in-browser implementation held simultaneously (hence its
//! 2GB total cap).
//!
//! Matches the existing in-browser bulk-ZIP behavior exactly: any single
//! file's failure (wrong passphrase, integrity, network) aborts the WHOLE
//! batch — never a partial zip of "whichever files happened to succeed" —
//! and duplicate filenames get a " (1)", " (2)", ... suffix.

use std::collections::HashSet;
use std::path::Path;

use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

use super::download;
use super::{EngineContext, EngineError};

pub struct BulkFile {
    pub file_id: String,
    pub filename: String,
    /// This file's OWN resolved passphrase — the vault passphrase for an
    /// unprotected file, or the relevant folder password for a
    /// protected-folder file. Per-file (not one shared passphrase for the
    /// whole batch) because a bulk selection can span files from DIFFERENT
    /// password-protected folders; the caller (frontend) already resolves
    /// this per file for the web bulk-ZIP path, so desktop mirrors it exactly
    /// rather than silently failing whichever files don't match one guess.
    pub passphrase: String,
}

pub async fn run(
    ctx: &EngineContext,
    files: &[BulkFile],
    user_id: &str,
    save_path: &Path,
) -> Result<(), EngineError> {
    let scratch_dir = save_path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let result = run_inner(ctx, files, user_id, save_path, scratch_dir).await;
    if result.is_err() {
        // Never leave a partial/corrupt zip behind — same principle as
        // download's own .zcrypt-part cleanup on failure.
        let _ = std::fs::remove_file(save_path);
    }
    result
}

async fn run_inner(
    ctx: &EngineContext,
    files: &[BulkFile],
    user_id: &str,
    save_path: &Path,
    scratch_dir: &Path,
) -> Result<(), EngineError> {
    let zip_file = std::fs::File::create(save_path)?;
    let mut zip = ZipWriter::new(std::io::BufWriter::new(zip_file));
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    let mut used_names: HashSet<String> = HashSet::new();

    for f in files {
        // Abort between files on cancel; download::run also honors the token
        // mid-file. run()'s caller removes the partial zip on this Err.
        ctx.check_cancel()?;
        let temp_path = scratch_dir.join(format!("zcrypt-bulk-{}.tmp", uuid::Uuid::new_v4()));
        let dl_result =
            download::run(ctx, &f.file_id, &f.passphrase, user_id, None, &temp_path).await;
        if let Err(e) = dl_result {
            let _ = std::fs::remove_file(&temp_path);
            return Err(e);
        }

        let entry_name = dedupe_name(&f.filename, &mut used_names);
        zip.start_file(&entry_name, options)
            .map_err(|e| EngineError::Other(format!("zip start_file {entry_name}: {e}")))?;
        let copy_result: std::io::Result<()> = (|| {
            let mut temp = std::fs::File::open(&temp_path)?;
            std::io::copy(&mut temp, &mut zip)?;
            Ok(())
        })();
        let _ = std::fs::remove_file(&temp_path);
        copy_result?;
    }

    zip.finish()
        .map_err(|e| EngineError::Other(format!("zip finish: {e}")))?;
    Ok(())
}

/// Claims `name` as-is if unused, otherwise finds the first free
/// "base (n).ext" suffix — mirrors lib/bulk-download.ts's exact scheme.
fn dedupe_name(name: &str, used: &mut HashSet<String>) -> String {
    if used.insert(name.to_string()) {
        return name.to_string();
    }
    let (base, ext) = match name.rfind('.') {
        Some(dot) if dot > 0 => (&name[..dot], &name[dot..]),
        _ => (name, ""),
    };
    let mut n = 1;
    loop {
        let candidate = format!("{base} ({n}){ext}");
        if used.insert(candidate.clone()) {
            return candidate;
        }
        n += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read as _;
    use std::sync::Arc;

    use crate::engines::{no_creds, CancelToken};
    use crate::localdb::LocalDb;
    use crate::profiles;
    use crate::types::Progress;

    // A pre-cancelled transfer must abort at the first file boundary — before
    // any network call — and leave no partial zip behind. Exercises the real
    // run() -> run_inner() -> ctx.check_cancel()? path without a mock HTTP
    // harness (the client points at a dead address that is never contacted
    // because the cancel check fires first).
    #[tokio::test]
    async fn cancelled_bulk_download_aborts_before_network_and_cleans_up() {
        let dir = std::env::temp_dir().join(format!("zcrypt-bulk-cancel-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let db = Arc::new(LocalDb::open_at(&dir.join("db.sqlite")).unwrap());

        let cancel = CancelToken::new();
        cancel.cancel();
        let ctx = EngineContext {
            client: Arc::new(crate::api::Client::new("http://127.0.0.1:0", "", "")),
            db,
            profile: profiles::NORMAL,
            progress: Arc::new(|_p: Progress| {}),
            creds: no_creds(),
            cancel,
        };

        let files = vec![BulkFile {
            file_id: "does-not-exist".into(),
            filename: "a.txt".into(),
            passphrase: "pw".into(),
        }];
        let save_path = dir.join("out.zip");

        let res = run(&ctx, &files, "user", &save_path).await;
        assert!(matches!(res, Err(EngineError::Cancelled)));
        assert!(
            !save_path.exists(),
            "a cancelled bulk download must not leave a partial zip"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn zip_writer_round_trips_multiple_entries() {
        // Exercises the exact ZipWriter::start_file + io::copy + finish
        // sequence run_inner uses, independent of download::run's network
        // dependency (no mock HTTP harness in this crate — see the #5
        // integrity-scheme tests for the same constraint). Reads the result
        // back via ZipArchive to prove the bytes are genuinely recoverable,
        // not just "no error was returned."
        let dir = std::env::temp_dir().join(format!("zcrypt-zip-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let zip_path = dir.join("out.zip");

        let zip_file = std::fs::File::create(&zip_path).unwrap();
        let mut zip = ZipWriter::new(std::io::BufWriter::new(zip_file));
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

        let entries: &[(&str, &[u8])] = &[
            ("a.txt", b"hello zcrypt bulk download"),
            ("nested/b.bin", &[0u8, 1, 2, 3, 255, 254, 253]),
        ];
        for (name, data) in entries {
            zip.start_file(*name, options).unwrap();
            std::io::Write::write_all(&mut zip, data).unwrap();
        }
        zip.finish().unwrap();

        let file = std::fs::File::open(&zip_path).unwrap();
        let mut archive = zip::ZipArchive::new(file).unwrap();
        assert_eq!(archive.len(), entries.len());
        for (name, expected) in entries {
            let mut entry = archive.by_name(name).unwrap();
            let mut got = Vec::new();
            entry.read_to_end(&mut got).unwrap();
            assert_eq!(&got, expected, "entry {name} content mismatch");
        }
    }

    #[test]
    fn dedupe_name_leaves_first_occurrence_untouched() {
        let mut used = HashSet::new();
        assert_eq!(dedupe_name("a.txt", &mut used), "a.txt");
    }

    #[test]
    fn dedupe_name_suffixes_repeats_in_order() {
        let mut used = HashSet::new();
        assert_eq!(dedupe_name("a.txt", &mut used), "a.txt");
        assert_eq!(dedupe_name("a.txt", &mut used), "a (1).txt");
        assert_eq!(dedupe_name("a.txt", &mut used), "a (2).txt");
    }

    #[test]
    fn dedupe_name_handles_no_extension() {
        let mut used = HashSet::new();
        assert_eq!(dedupe_name("README", &mut used), "README");
        assert_eq!(dedupe_name("README", &mut used), "README (1)");
    }

    #[test]
    fn dedupe_name_skips_an_already_taken_suffix() {
        // If "a (1).txt" is ALSO already a real filename in the batch, the
        // second "a.txt" must skip straight to "a (2).txt", not collide.
        let mut used = HashSet::new();
        used.insert("a (1).txt".to_string());
        assert_eq!(dedupe_name("a.txt", &mut used), "a.txt");
        assert_eq!(dedupe_name("a.txt", &mut used), "a (2).txt");
    }
}
