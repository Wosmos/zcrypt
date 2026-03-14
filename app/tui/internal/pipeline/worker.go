package pipeline

import (
	"github.com/zcrypt/zcrypt-tui/internal/compression"
	"github.com/zcrypt/zcrypt-tui/internal/crypto"
)

// ProcessChunk compresses (optional), encrypts, and hashes a single chunk.
// This mirrors the browser's crypto-worker.ts exactly.
func ProcessChunk(job ChunkJob) ChunkResult {
	originalSize := len(job.Data)
	processedData := job.Data
	compressed := false

	// Compress if requested and beneficial
	if job.Compress {
		compressedData, wasCompressed := compression.Compress(job.Data, job.ZstdLevel)
		if wasCompressed {
			processedData = compressedData
			compressed = true
		}
	}

	compressedSize := len(processedData)

	// Encrypt with AES-256-GCM
	encrypted, err := crypto.EncryptChunk(job.KeyBytes, processedData)
	if err != nil {
		return ChunkResult{Index: job.Index, Error: err}
	}

	// Hash the encrypted output (what the server will verify)
	sha256hex := crypto.SHA256Hex(encrypted)

	return ChunkResult{
		Index:          job.Index,
		Encrypted:      encrypted,
		SHA256:         sha256hex,
		Compressed:     compressed,
		OriginalSize:   originalSize,
		CompressedSize: compressedSize,
		EncryptedSize:  len(encrypted),
	}
}
