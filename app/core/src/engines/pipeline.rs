//! Per-chunk processing — the NORMATIVE order from docs/CRYPTO_FORMAT.md §4:
//! zstd-compress (when eligible and ≥5% smaller) → AES-256-GCM encrypt with the
//! CEK → SHA-256 of the ENCRYPTED wire bytes. Mirrors `sidecar/pipeline/worker.go`
//! and the web crypto-worker.

use crate::compression;
use crate::crypto;

use super::EngineError;

pub struct ProcessedChunk {
    pub encrypted: Vec<u8>,
    pub sha256: String,
    pub compressed: bool,
    pub original_size: usize,
    pub compressed_size: usize,
}

/// CPU-bound; callers run it under `spawn_blocking`.
pub fn process_chunk(
    data: &[u8],
    cek: &[u8],
    try_compress: bool,
    zstd_level: i32,
) -> Result<ProcessedChunk, EngineError> {
    let original_size = data.len();
    let (payload, compressed) = if try_compress {
        compression::compress(data, zstd_level)
    } else {
        (data.to_vec(), false)
    };
    let compressed_size = payload.len();
    let encrypted = crypto::encrypt_chunk(cek, &payload)?;
    let sha256 = crypto::sha256_hex(&encrypted);
    Ok(ProcessedChunk {
        encrypted,
        sha256,
        compressed,
        original_size,
        compressed_size,
    })
}

/// Reverse of `process_chunk` for downloads: decrypt → decompress-if-flagged.
pub fn unprocess_chunk(wire: &[u8], key: &[u8], compressed: bool) -> Result<Vec<u8>, EngineError> {
    let plain = crypto::decrypt_chunk(key, wire)?;
    if compressed {
        compression::decompress(&plain).map_err(|e| EngineError::Integrity(e.to_string()))
    } else {
        Ok(plain)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_compressed_and_raw() {
        let cek = crypto::generate_cek();
        let compressible = b"zcrypt chunk pipeline ".repeat(500);

        let p = process_chunk(&compressible, &cek, true, 2).unwrap();
        assert!(p.compressed);
        assert!(p.compressed_size < p.original_size);
        assert_eq!(p.sha256, crypto::sha256_hex(&p.encrypted));
        let back = unprocess_chunk(&p.encrypted, &cek, p.compressed).unwrap();
        assert_eq!(back, compressible);

        // Compression disabled (skip-list path) → raw payload inside.
        let p2 = process_chunk(&compressible, &cek, false, 2).unwrap();
        assert!(!p2.compressed);
        assert_eq!(p2.compressed_size, p2.original_size);
        let back2 = unprocess_chunk(&p2.encrypted, &cek, false).unwrap();
        assert_eq!(back2, compressible);
    }
}
