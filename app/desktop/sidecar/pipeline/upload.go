package pipeline

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"

	"github.com/zcrypt/zcrypt-sidecar/api"
	"github.com/zcrypt/zcrypt-sidecar/compression"
	"github.com/zcrypt/zcrypt-sidecar/crypto"
)

// UploadEngine orchestrates the full upload pipeline.
type UploadEngine struct {
	client  *api.Client
	profile Profile
}

// NewUploadEngine creates a new upload engine.
func NewUploadEngine(client *api.Client, profile Profile) *UploadEngine {
	return &UploadEngine{client: client, profile: profile}
}

// Upload processes and uploads a file. Calls progressFn with updates.
func (e *UploadEngine) Upload(ctx context.Context, filePath, passphrase string, progressFn func(UploadProgress)) error {
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

	// 1. Get file info
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

	// 3. Generate salt and derive key
	emit("deriving_key", 0, 0, 0, fileSize)
	salt, err := crypto.GenerateSalt()
	if err != nil {
		return fmt.Errorf("generate salt: %w", err)
	}
	keyBytes := crypto.DeriveKey(passphrase, salt)
	saltB64 := base64.StdEncoding.EncodeToString(salt)

	// 4. Calculate chunk count
	chunkSize := int64(e.profile.ChunkSize)
	chunkCount := int((fileSize + chunkSize - 1) / chunkSize)
	if chunkCount == 0 {
		chunkCount = 1
	}

	// 5. Init upload session
	emit("processing", 0, chunkCount, 0, fileSize)
	session, err := e.client.InitUpload(api.UploadInitRequest{
		Filename:     fileName,
		OriginalSize: fileSize,
		SHA256:       fileSHA256,
		Salt:         saltB64,
		ChunkCount:   chunkCount,
	})
	if err != nil {
		return fmt.Errorf("init upload: %w", err)
	}

	// 6. Create worker pool
	pool := NewWorkerPool(e.profile.Workers)
	shouldCompress := compression.ShouldCompress(fileName)

	// 7. Read file and submit chunks to workers
	go func() {
		defer pool.Close()

		f, openErr := os.Open(filePath)
		if openErr != nil {
			pool.Submit(ChunkJob{Index: -1}) // sentinel won't be used; pool will close
			return
		}
		defer f.Close()

		for i := 0; i < chunkCount; i++ {
			select {
			case <-ctx.Done():
				return
			default:
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
				KeyBytes:  keyBytes,
				Compress:  shouldCompress,
				ZstdLevel: e.profile.ZstdLevel,
			})
		}
	}()

	// 8. Consume results and upload
	var totalEncrypted, totalCompressed int64
	var chunksDone int32
	var uploadErr error
	var uploadWg sync.WaitGroup
	uploadSem := make(chan struct{}, e.profile.ConcurrentUploads)
	errOnce := sync.Once{}
	startTime := time.Now()

	for result := range pool.Results() {
		if ctx.Err() != nil {
			_ = e.client.CancelUpload(session.SessionID)
			return ctx.Err()
		}

		if result.Error != nil {
			_ = e.client.CancelUpload(session.SessionID)
			return fmt.Errorf("process chunk %d: %w", result.Index, result.Error)
		}

		uploadSem <- struct{}{} // acquire slot
		uploadWg.Add(1)

		go func(r ChunkResult) {
			defer uploadWg.Done()
			defer func() { <-uploadSem }()

			var err error
			if session.DirectUpload {
				err = e.uploadDirect(session.SessionID, r)
			} else {
				err = e.client.UploadChunk(session.SessionID, r.Index, r.Encrypted, r.SHA256, r.Compressed)
			}

			if err != nil {
				errOnce.Do(func() { uploadErr = fmt.Errorf("upload chunk %d: %w", r.Index, err) })
				return
			}

			atomic.AddInt64(&totalEncrypted, int64(r.EncryptedSize))
			atomic.AddInt64(&totalCompressed, int64(r.CompressedSize))
			done := int(atomic.AddInt32(&chunksDone, 1))

			elapsed := time.Since(startTime).Seconds()
			bytesDone := atomic.LoadInt64(&totalEncrypted)
			speed := float64(bytesDone) / elapsed

			if progressFn != nil {
				progressFn(UploadProgress{
					FileID:      session.FileID,
					FileName:    fileName,
					Stage:       "uploading",
					ChunksDone:  done,
					ChunksTotal: chunkCount,
					BytesDone:   bytesDone,
					BytesTotal:  fileSize,
					Speed:       speed,
				})
			}
		}(result)
	}

	uploadWg.Wait()

	if uploadErr != nil {
		_ = e.client.CancelUpload(session.SessionID)
		return uploadErr
	}

	// 9. Complete upload
	emit("finalizing", chunkCount, chunkCount, fileSize, fileSize)
	_, err = e.client.CompleteUpload(session.SessionID, totalEncrypted, totalCompressed)
	if err != nil {
		return fmt.Errorf("complete upload: %w", err)
	}

	emit("done", chunkCount, chunkCount, fileSize, fileSize)
	return nil
}

func (e *UploadEngine) uploadDirect(sessionID string, r ChunkResult) error {
	presign, err := e.client.PresignChunk(sessionID, r.Index, r.SHA256, int64(r.EncryptedSize))
	if err != nil {
		return fmt.Errorf("presign: %w", err)
	}

	if !presign.AlreadyExists {
		if err := e.client.DirectUploadWithRetry(presign.UploadURL, presign.UploadHeaders, r.Encrypted, 3); err != nil {
			return fmt.Errorf("direct upload: %w", err)
		}
	}

	if err := e.client.ConfirmChunk(sessionID, r.Index, r.SHA256, int64(r.EncryptedSize), presign.RemotePath, r.Compressed); err != nil {
		return fmt.Errorf("confirm: %w", err)
	}

	return nil
}
