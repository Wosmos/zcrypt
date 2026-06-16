package pipeline

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"sync"
	"sync/atomic"
	"time"

	"github.com/zcrypt/zcrypt-sidecar/api"
	"github.com/zcrypt/zcrypt-sidecar/compression"
	"github.com/zcrypt/zcrypt-sidecar/crypto"
)

// DownloadEngine orchestrates the full download pipeline.
type DownloadEngine struct {
	client  *api.Client
	profile Profile
}

// NewDownloadEngine creates a new download engine.
func NewDownloadEngine(client *api.Client, profile Profile) *DownloadEngine {
	return &DownloadEngine{client: client, profile: profile}
}

// Download fetches, decrypts, and saves a file. Calls progressFn with updates.
func (e *DownloadEngine) Download(ctx context.Context, fileID, passphrase, savePath string, progressFn func(DownloadProgress)) error {
	emit := func(stage string, chunksDone, chunksTotal int, bytesDone, bytesTotal int64) {
		if progressFn != nil {
			progressFn(DownloadProgress{
				FileID:      fileID,
				Stage:       stage,
				ChunksDone:  chunksDone,
				ChunksTotal: chunksTotal,
				BytesDone:   bytesDone,
				BytesTotal:  bytesTotal,
			})
		}
	}

	// 1. Fetch file metadata
	emit("fetching_meta", 0, 0, 0, 0)
	meta, err := e.client.GetFileMeta(fileID)
	if err != nil {
		return fmt.Errorf("get file meta: %w", err)
	}

	emit("deriving_key", 0, meta.ChunkCount, 0, meta.OriginalSize)

	// 2. Decode salt and resolve the file key. Envelope files carry a
	//    wrapped_cek: derive the KEK from the passphrase, then unwrap the CEK
	//    that actually decrypts chunks. Legacy files (no wrapped_cek) used the
	//    passphrase-derived key directly. Mirrors resolveFileKey() in the web client.
	salt, err := base64.StdEncoding.DecodeString(meta.Salt)
	if err != nil {
		return fmt.Errorf("decode salt: %w", err)
	}
	keyBytes := crypto.DeriveKey(passphrase, salt)
	if meta.WrappedCek != "" {
		wrapped, derr := base64.StdEncoding.DecodeString(meta.WrappedCek)
		if derr != nil {
			return fmt.Errorf("decode wrapped_cek: %w", derr)
		}
		cek, uerr := crypto.UnwrapCEK(keyBytes, wrapped)
		if uerr != nil {
			return fmt.Errorf("unwrap CEK: %w (wrong passphrase?)", uerr)
		}
		keyBytes = cek
	}

	// 3. Download and decrypt chunks concurrently
	decryptedChunks := make([][]byte, meta.ChunkCount)
	var chunksDone int32
	var downloadErr error
	var mu sync.Mutex
	errOnce := sync.Once{}
	sem := make(chan struct{}, e.profile.ConcurrentDownloads)
	var wg sync.WaitGroup
	startTime := time.Now()

	for i := 0; i < meta.ChunkCount; i++ {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		sem <- struct{}{}
		wg.Add(1)

		go func(index int) {
			defer wg.Done()
			defer func() { <-sem }()

			// Download encrypted chunk
			chunk, dlErr := e.client.GetFileChunk(fileID, index)
			if dlErr != nil {
				errOnce.Do(func() { downloadErr = fmt.Errorf("download chunk %d: %w", index, dlErr) })
				return
			}

			// Decrypt
			plaintext, decErr := crypto.DecryptChunk(keyBytes, chunk.Data)
			if decErr != nil {
				errOnce.Do(func() { downloadErr = fmt.Errorf("decrypt chunk %d: %w (wrong passphrase?)", index, decErr) })
				return
			}

			// Decompress if needed
			if chunk.Compressed {
				decompressed, decErr := compression.Decompress(plaintext)
				if decErr != nil {
					errOnce.Do(func() { downloadErr = fmt.Errorf("decompress chunk %d: %w", index, decErr) })
					return
				}
				plaintext = decompressed
			}

			mu.Lock()
			decryptedChunks[index] = plaintext
			mu.Unlock()

			done := int(atomic.AddInt32(&chunksDone, 1))
			elapsed := time.Since(startTime).Seconds()
			speed := float64(done) * float64(meta.OriginalSize) / float64(meta.ChunkCount) / elapsed

			if progressFn != nil {
				progressFn(DownloadProgress{
					FileID:      fileID,
					FileName:    meta.OriginalName,
					Stage:       "downloading",
					ChunksDone:  done,
					ChunksTotal: meta.ChunkCount,
					BytesDone:   int64(done) * meta.OriginalSize / int64(meta.ChunkCount),
					BytesTotal:  meta.OriginalSize,
					Speed:       speed,
				})
			}
		}(i)
	}

	wg.Wait()

	if downloadErr != nil {
		return downloadErr
	}

	// 4. Concatenate and verify SHA-256
	emit("verifying", meta.ChunkCount, meta.ChunkCount, meta.OriginalSize, meta.OriginalSize)

	totalSize := 0
	for _, chunk := range decryptedChunks {
		totalSize += len(chunk)
	}

	combined := make([]byte, 0, totalSize)
	for _, chunk := range decryptedChunks {
		combined = append(combined, chunk...)
	}

	hash := crypto.SHA256Hex(combined)
	if hash != meta.SHA256 {
		return fmt.Errorf("integrity check failed: SHA-256 mismatch (expected %s, got %s)", meta.SHA256, hash)
	}

	// 5. Write to disk
	emit("saving", meta.ChunkCount, meta.ChunkCount, meta.OriginalSize, meta.OriginalSize)

	if err := os.WriteFile(savePath, combined, 0644); err != nil {
		return fmt.Errorf("write file: %w", err)
	}

	emit("done", meta.ChunkCount, meta.ChunkCount, meta.OriginalSize, meta.OriginalSize)
	return nil
}
