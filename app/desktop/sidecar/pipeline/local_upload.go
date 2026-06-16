package pipeline

import (
	"context"
	crand "crypto/rand"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"

	"github.com/zcrypt/zcrypt-sidecar/compression"
	"github.com/zcrypt/zcrypt-sidecar/crypto"
	"github.com/zcrypt/zcrypt-sidecar/localdb"
)

// LocalUploadEngine encrypts a file and stores it locally in SQLite + disk.
// No network calls — the background sync worker handles remote upload later.
type LocalUploadEngine struct {
	db      *localdb.DB
	profile Profile
}

func NewLocalUploadEngine(db *localdb.DB, profile Profile) *LocalUploadEngine {
	return &LocalUploadEngine{db: db, profile: profile}
}

// Upload encrypts the file and stores chunks locally. Returns almost instantly
// since there are no network calls — just CPU (crypto) and disk I/O.
func (e *LocalUploadEngine) Upload(ctx context.Context, filePath, passphrase string, progressFn func(UploadProgress)) error {
	fileName := filepath.Base(filePath)

	emit := func(stage string, chunksDone, chunksTotal int, bytesDone, bytesTotal int64) {
		if progressFn != nil {
			progressFn(UploadProgress{
				FileName:    fileName,
				Stage:       stage,
				ChunksDone:  chunksDone,
				ChunksTotal: chunksTotal,
				BytesDone:   bytesDone,
				BytesTotal:  bytesTotal,
			})
		}
	}

	// 1. Stat file
	info, err := os.Stat(filePath)
	if err != nil {
		return fmt.Errorf("stat file: %w", err)
	}
	fileSize := info.Size()

	// 2. Hash the original file
	emit("hashing", 0, 0, 0, fileSize)
	fileSHA256, err := crypto.SHA256File(filePath)
	if err != nil {
		return fmt.Errorf("hash file: %w", err)
	}

	// 3. Generate salt, derive KEK, and create a per-file CEK (envelope
	//    encryption — see crypto.GenerateCEK). Chunks are encrypted with the
	//    random CEK; the CEK is wrapped with the passphrase-derived KEK and
	//    sent to the backend on init so the file can later be shared.
	emit("deriving_key", 0, 0, 0, fileSize)
	salt, err := crypto.GenerateSalt()
	if err != nil {
		return fmt.Errorf("generate salt: %w", err)
	}
	kek := crypto.DeriveKey(passphrase, salt)
	cek, err := crypto.GenerateCEK()
	if err != nil {
		return fmt.Errorf("generate CEK: %w", err)
	}
	wrappedCek, err := crypto.WrapCEK(kek, cek)
	if err != nil {
		return fmt.Errorf("wrap CEK: %w", err)
	}

	// 4. Calculate chunk count
	chunkSize := int64(e.profile.ChunkSize)
	chunkCount := int((fileSize + chunkSize - 1) / chunkSize)
	if chunkCount == 0 {
		chunkCount = 1
	}

	// 5. Generate file ID and insert into local DB
	fileID := generateID()
	localFile := &localdb.LocalFile{
		ID:           fileID,
		OriginalName: fileName,
		OriginalSize: fileSize,
		SHA256:       fileSHA256,
		Salt:         salt,
		WrappedCek:   wrappedCek,
		ChunkCount:   chunkCount,
		Status:       "complete",
	}
	if err := e.db.InsertFile(localFile); err != nil {
		return fmt.Errorf("insert file: %w", err)
	}

	// 6. Get staging dir
	stagingDir, err := localdb.StagingDir()
	if err != nil {
		return fmt.Errorf("staging dir: %w", err)
	}

	// 7. Create worker pool for parallel crypto
	emit("processing", 0, chunkCount, 0, fileSize)
	pool := NewWorkerPool(e.profile.Workers)
	shouldCompress := compression.ShouldCompress(fileName)

	// 8. Read file and submit chunks to workers
	go func() {
		defer pool.Close()

		f, openErr := os.Open(filePath)
		if openErr != nil {
			return
		}
		defer f.Close()

		for i := 0; i < chunkCount; i++ {
			if ctx.Err() != nil {
				return
			}

			size := int(chunkSize)
			if remaining := fileSize - int64(i)*chunkSize; remaining < chunkSize {
				size = int(remaining)
			}

			buf := make([]byte, size)
			n, readErr := f.Read(buf)
			if readErr != nil && n == 0 {
				return
			}

			pool.Submit(ChunkJob{
				Index:     i,
				Data:      buf[:n],
				KeyBytes:  cek, // encrypt chunk data with the CEK, not the KEK
				Compress:  shouldCompress,
				ZstdLevel: e.profile.ZstdLevel,
			})
		}
	}()

	// 9. Consume results and write to disk + SQLite
	var chunksDone int32
	var writeErr error
	var writeWg sync.WaitGroup
	errOnce := sync.Once{}
	startTime := time.Now()

	for result := range pool.Results() {
		if ctx.Err() != nil {
			return ctx.Err()
		}

		if result.Error != nil {
			return fmt.Errorf("process chunk %d: %w", result.Index, result.Error)
		}

		writeWg.Add(1)
		go func(r ChunkResult) {
			defer writeWg.Done()

			chunkID := generateID()
			stagingPath := filepath.Join(stagingDir, chunkID+".enc")

			// Write encrypted data to disk
			if err := os.WriteFile(stagingPath, r.Encrypted, 0600); err != nil {
				errOnce.Do(func() { writeErr = fmt.Errorf("write chunk %d: %w", r.Index, err) })
				return
			}

			// Insert chunk record into local DB
			if err := e.db.InsertChunk(&localdb.LocalChunk{
				ID:             chunkID,
				FileID:         fileID,
				Index:          r.Index,
				Size:           int64(r.OriginalSize),
				EncryptedSize:  r.EncryptedSize,
				CompressedSize: r.CompressedSize,
				SHA256:         r.SHA256,
				Compressed:     r.Compressed,
				StagingPath:    stagingPath,
			}); err != nil {
				errOnce.Do(func() { writeErr = fmt.Errorf("insert chunk %d: %w", r.Index, err) })
				return
			}

			done := int(atomic.AddInt32(&chunksDone, 1))
			elapsed := time.Since(startTime).Seconds()
			speed := float64(r.EncryptedSize) / elapsed

			if progressFn != nil {
				progressFn(UploadProgress{
					FileID:      fileID,
					FileName:    fileName,
					Stage:       "encrypting",
					ChunksDone:  done,
					ChunksTotal: chunkCount,
					BytesDone:   int64(done) * chunkSize,
					BytesTotal:  fileSize,
					Speed:       speed,
				})
			}
		}(result)
	}

	writeWg.Wait()

	if writeErr != nil {
		return writeErr
	}

	emit("done", chunkCount, chunkCount, fileSize, fileSize)

	// File is now locally encrypted and ready for background sync.
	// The sync worker will pick it up and push to the backend.
	return nil
}

// generateID creates a random UUID-like ID.
func generateID() string {
	b := make([]byte, 16)
	crand.Read(b)
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:])
}
