//! zstd compression, mirroring the Go sidecar (`sidecar/compression`) and the
//! web worker: standard zstd frames (interoperable regardless of encoder),
//! compression kept only when it saves ≥ 5%, and a skip-list of extensions
//! that are already compressed.

/// Profile levels 1..=3 map to real zstd levels: fastest / default / better.
/// (Byte output need not match other implementations — only the frame format.)
fn zstd_level(profile_level: i32) -> i32 {
    match profile_level {
        i32::MIN..=1 => 1,
        2 => 3, // zstd's default
        _ => 8, // "better compression" tier
    }
}

/// Compress `data`; returns `(compressed, true)` only if it saves ≥ 5%,
/// otherwise `(original, false)` — identical policy to Go/web.
pub fn compress(data: &[u8], profile_level: i32) -> (Vec<u8>, bool) {
    match zstd::bulk::compress(data, zstd_level(profile_level)) {
        Ok(compressed) if (compressed.len() as f64) < (data.len() as f64) * 0.95 => {
            (compressed, true)
        }
        _ => (data.to_vec(), false),
    }
}

#[derive(Debug, thiserror::Error)]
#[error("zstd decompress: {0}")]
pub struct DecompressError(#[from] std::io::Error);

/// Decompress a standard zstd frame (any conforming encoder's output).
pub fn decompress(data: &[u8]) -> Result<Vec<u8>, DecompressError> {
    let mut out = Vec::new();
    let mut decoder = zstd::stream::read::Decoder::new(data)?;
    std::io::Read::read_to_end(&mut decoder, &mut out)?;
    Ok(out)
}

/// Extensions that are already compressed — skip zstd for these.
/// Matches `sidecar/compression/extensions.go` / the web skip-list exactly.
const COMPRESSED_EXTENSIONS: &[&str] = &[
    // Images
    "jpg", "jpeg", "png", "gif", "webp", "avif", "heic", "heif", // Video
    "mp4", "mkv", "avi", "mov", "webm", "flv", "m4v", // Audio
    "mp3", "aac", "ogg", "flac", "opus", "wma", "m4a", // Archives
    "zip", "rar", "7z", "gz", "bz2", "xz", "zst", "lz4", "br",
    // Documents (already compressed internally)
    "pdf", "docx", "xlsx", "pptx", // Fonts
    "woff", "woff2",
];

/// Whether a filename would benefit from compression.
pub fn should_compress(filename: &str) -> bool {
    let lower = filename.to_lowercase();
    if lower.ends_with(".tar.gz") {
        return false;
    }
    match lower.rsplit_once('.') {
        Some((_, ext)) => !COMPRESSED_EXTENSIONS.contains(&ext),
        None => true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skip_list_matches_policy() {
        assert!(!should_compress("photo.JPG"));
        assert!(!should_compress("archive.tar.gz"));
        assert!(!should_compress("doc.pdf"));
        assert!(should_compress("notes.txt"));
        assert!(should_compress("Makefile"));
    }

    #[test]
    fn five_percent_rule() {
        let compressible = b"zcrypt zero-knowledge storage ".repeat(200);
        let (out, ok) = compress(&compressible, 2);
        assert!(ok);
        assert!(out.len() < compressible.len());
        assert_eq!(decompress(&out).unwrap(), compressible);

        // PRNG bytes don't compress → returned as-is, flagged false.
        let mut state = 0x9e3779b97f4a7c15u64;
        let incompressible: Vec<u8> = (0..4096)
            .map(|_| {
                state ^= state << 13;
                state ^= state >> 7;
                state ^= state << 17;
                (state >> 56) as u8
            })
            .collect();
        let (out, ok) = compress(&incompressible, 2);
        assert!(!ok);
        assert_eq!(out, incompressible);
    }
}
