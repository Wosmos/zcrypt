package cmd

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/zcrypt/zcrypt/config"
	"github.com/zcrypt/zcrypt/disguise"
	"github.com/zcrypt/zcrypt/types"
)

// syncFallbackInterval is a safety net poll for chunks that were staged before
// the server started (e.g. after a crash/restart). Under normal operation the
// upload handler signals syncCh immediately, so this timer rarely fires.
const syncFallbackInterval = 30 * time.Second

// StartSyncWorker launches a background goroutine that flushes pending chunks
// to their respective storage adapters.
//
// It wakes instantly when the upload handler signals syncCh (event-driven),
// and falls back to a 30s poll to catch any chunks left over from a restart.
// Zero DB hits when there are no uploads in flight.
func (s *Server) StartSyncWorker(ctx context.Context) {
	go func() {
		log.Println("sync-worker: started")
		fallback := time.NewTimer(syncFallbackInterval)
		defer fallback.Stop()

		for {
			select {
			case <-ctx.Done():
				log.Println("sync-worker: stopped")
				return
			case <-s.syncCh:
				// Upload just happened — drain the whole queue
				for s.syncPendingChunks(ctx) {
				}
				fallback.Reset(syncFallbackInterval)
			case <-fallback.C:
				// Safety net: catch any chunks left over from a restart
				for s.syncPendingChunks(ctx) {
				}
				fallback.Reset(syncFallbackInterval)
			}
		}
	}()
}

// syncPendingChunks processes a batch of pending chunks. Returns true if
// any chunks were found (caller should poll fast); false if the queue
// was empty (caller should back off).
func (s *Server) syncPendingChunks(ctx context.Context) bool {
	chunks, err := s.db.GetPendingChunks(ctx, 10)
	if err != nil {
		log.Printf("sync-worker: get pending chunks: %v", err)
		return false
	}
	if len(chunks) == 0 {
		return false
	}

	stagingDir, err := config.StagingDir()
	if err != nil {
		log.Printf("sync-worker: staging dir: %v", err)
		return true
	}

	for _, chunk := range chunks {
		if ctx.Err() != nil {
			return true
		}
		s.syncOneChunk(ctx, chunk, stagingDir)
	}
	return true
}

func (s *Server) syncOneChunk(ctx context.Context, chunk types.ChunkRef, stagingDir string) {
	stagingPath := filepath.Join(stagingDir, chunk.ChunkID+".enc")

	// Read chunk data from staging
	data, err := os.ReadFile(stagingPath)
	if err != nil {
		log.Printf("sync-worker: read staging file %s: %v", chunk.ChunkID, err)
		return
	}

	// Resolve adapter
	adapter := s.resolveAdapterForUser(ctx, chunk.UserID, chunk.Platform, chunk.Account)
	if adapter == nil {
		log.Printf("sync-worker: no adapter for chunk %s (platform=%s account=%s)", chunk.ChunkID, chunk.Platform, chunk.Account)
		return
	}

	// Generate disguised remote path
	remotePath, err := disguise.ChunkFilename()
	if err != nil {
		log.Printf("sync-worker: generate filename: %v", err)
		return
	}

	// Acquire per-repo slot to prevent GitHub 409 storms
	releaseRepo, err := acquireRepoSlot(ctx, chunk.Repo)
	if err != nil {
		return // context cancelled
	}
	defer releaseRepo()

	// Upload to git platform
	ref, err := adapter.Upload(ctx, chunk.Repo, types.Chunk{
		Ref: types.ChunkRef{
			FileID:     chunk.FileID,
			Index:      chunk.Index,
			Size:       chunk.Size,
			SHA256:     chunk.SHA256,
			RemotePath: remotePath,
		},
		Data: data,
	})
	if err != nil {
		log.Printf("sync-worker: upload chunk %s to %s failed: %v", chunk.ChunkID, chunk.Platform, err)
		return
	}

	// Update remote_path in DB (marks chunk as synced)
	if err := s.db.UpdateChunkRemotePath(ctx, chunk.ChunkID, ref.RemotePath); err != nil {
		log.Printf("sync-worker: update remote path for %s: %v", chunk.ChunkID, err)
		return
	}

	// Delete staging file
	if err := os.Remove(stagingPath); err != nil {
		fmt.Printf("sync-worker: warn: remove staging file %s: %v\n", stagingPath, err)
	}
}
