package pipeline

import (
	"context"
	"encoding/base64"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/zcrypt/zcrypt-sidecar/api"
	"github.com/zcrypt/zcrypt-sidecar/localdb"
)

// SyncWorker pushes locally-encrypted files to the backend in the background.
type SyncWorker struct {
	db     *localdb.DB
	client *api.Client
}

func NewSyncWorker(db *localdb.DB, client *api.Client) *SyncWorker {
	return &SyncWorker{db: db, client: client}
}

// Run starts the sync loop. It checks for pending files every interval
// and pushes them through the backend API. Blocks until ctx is cancelled.
func (w *SyncWorker) Run(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.syncOnce(ctx)
		}
	}
}

func (w *SyncWorker) syncOnce(ctx context.Context) {
	files, err := w.db.GetPendingFiles()
	if err != nil {
		log.Printf("sync: get pending files: %v", err)
		return
	}
	if len(files) == 0 {
		return
	}

	log.Printf("sync: found %d pending file(s)", len(files))
	for _, f := range files {
		if ctx.Err() != nil {
			return
		}
		w.syncFile(ctx, f)
	}
}

func (w *SyncWorker) syncFile(ctx context.Context, f localdb.LocalFile) {
	switch f.SyncStatus {
	case "pending":
		w.initRemoteSession(ctx, f)
	case "init_done":
		w.uploadChunks(ctx, f)
	case "uploading":
		w.uploadChunks(ctx, f)
	}
}

// initRemoteSession creates an upload session on the backend.
func (w *SyncWorker) initRemoteSession(ctx context.Context, f localdb.LocalFile) {
	saltB64 := base64.StdEncoding.EncodeToString(f.Salt)
	wrappedCekB64 := base64.StdEncoding.EncodeToString(f.WrappedCek)

	session, err := w.client.InitUpload(api.UploadInitRequest{
		Filename:     f.OriginalName,
		OriginalSize: f.OriginalSize,
		SHA256:       f.SHA256,
		Salt:         saltB64,
		WrappedCek:   wrappedCekB64,
		ChunkCount:   f.ChunkCount,
	})
	if err != nil {
		log.Printf("sync: init upload for %s failed: %v", f.OriginalName, err)
		w.db.UpdateFileSyncError(f.ID, fmt.Sprintf("init failed: %v", err))
		return
	}

	err = w.db.UpdateFileSyncState(f.ID, "init_done", session.SessionID, session.FileID, session.Platform, "", session.DirectUpload)
	if err != nil {
		log.Printf("sync: update sync state for %s: %v", f.ID, err)
		return
	}

	// Immediately start uploading chunks
	f.SyncStatus = "init_done"
	f.SessionID = session.SessionID
	f.BackendFileID = session.FileID
	f.DirectUpload = session.DirectUpload
	w.uploadChunks(ctx, f)
}

// uploadChunks pushes pending chunks to the backend.
func (w *SyncWorker) uploadChunks(ctx context.Context, f localdb.LocalFile) {
	if f.SessionID == "" {
		// Somehow lost session — reset to pending
		w.db.UpdateFileSyncStatus(f.ID, "pending")
		return
	}

	_ = w.db.UpdateFileSyncStatus(f.ID, "uploading")

	chunks, err := w.db.GetPendingChunks(f.ID)
	if err != nil {
		log.Printf("sync: get pending chunks for %s: %v", f.ID, err)
		return
	}

	for _, chunk := range chunks {
		if ctx.Err() != nil {
			return
		}

		// Read encrypted data from staging
		data, err := os.ReadFile(chunk.StagingPath)
		if err != nil {
			log.Printf("sync: read staging %s: %v", chunk.ID, err)
			w.db.UpdateChunkError(chunk.ID, fmt.Sprintf("read staging: %v", err))
			continue
		}

		if f.DirectUpload {
			err = w.uploadChunkDirect(f.SessionID, chunk, data)
		} else {
			err = w.client.UploadChunk(f.SessionID, chunk.Index, data, chunk.SHA256, chunk.Compressed)
		}

		if err != nil {
			log.Printf("sync: upload chunk %d of %s failed: %v", chunk.Index, f.OriginalName, err)
			w.db.UpdateChunkError(chunk.ID, fmt.Sprintf("upload: %v", err))
			continue
		}

		// Mark chunk as synced
		w.db.UpdateChunkSynced(chunk.ID, "synced")

		// Delete staging file — data is now on the platform
		os.Remove(chunk.StagingPath)
	}

	// Check if all chunks are synced
	allSynced, err := w.db.AllChunksSynced(f.ID)
	if err != nil || !allSynced {
		return
	}

	// Complete the upload
	w.completeUpload(f)
}

func (w *SyncWorker) uploadChunkDirect(sessionID string, chunk localdb.LocalChunk, data []byte) error {
	presign, err := w.client.PresignChunk(sessionID, chunk.Index, chunk.SHA256, int64(chunk.EncryptedSize))
	if err != nil {
		return fmt.Errorf("presign: %w", err)
	}

	if !presign.AlreadyExists {
		if err := w.client.DirectUploadWithRetry(presign.UploadURL, presign.UploadHeaders, data, 3); err != nil {
			return fmt.Errorf("direct upload: %w", err)
		}
	}

	if err := w.client.ConfirmChunk(sessionID, chunk.Index, chunk.SHA256, int64(chunk.EncryptedSize), presign.RemotePath, chunk.Compressed); err != nil {
		return fmt.Errorf("confirm: %w", err)
	}

	return nil
}

func (w *SyncWorker) completeUpload(f localdb.LocalFile) {
	totalEncrypted, totalCompressed, err := w.db.GetChunkTotals(f.ID)
	if err != nil {
		log.Printf("sync: get chunk totals for %s: %v", f.ID, err)
		return
	}

	_, err = w.client.CompleteUpload(f.SessionID, totalEncrypted, totalCompressed)
	if err != nil {
		log.Printf("sync: complete upload for %s failed: %v", f.OriginalName, err)
		w.db.UpdateFileSyncError(f.ID, fmt.Sprintf("complete: %v", err))
		return
	}

	w.db.UpdateFileSyncStatus(f.ID, "synced")
	log.Printf("sync: %s fully synced", f.OriginalName)
}
