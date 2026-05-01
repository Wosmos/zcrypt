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

const (
	syncMinInterval = 500 * time.Millisecond
	syncMaxInterval = 30 * time.Second
)

// StartSyncWorker launches a background goroutine that flushes pending chunks
// (received from clients but not yet pushed to the git platform) to their
// respective storage adapters. It runs continuously until ctx is cancelled.
//
// Polling interval adapts to load: tight (500ms) while chunks are queued,
// backing off exponentially up to 30s when idle. Idle backoff prevents
// constant DB pings from holding serverless DBs (e.g. Neon) in active state.
func (s *Server) StartSyncWorker(ctx context.Context) {
	go func() {
		log.Println("sync-worker: started")
		interval := syncMinInterval
		timer := time.NewTimer(interval)
		defer timer.Stop()

		for {
			select {
			case <-ctx.Done():
				log.Println("sync-worker: stopped")
				return
			case <-timer.C:
				if s.syncPendingChunks(ctx) {
					interval = syncMinInterval
				} else if interval < syncMaxInterval {
					interval *= 2
					if interval > syncMaxInterval {
						interval = syncMaxInterval
					}
				}
				timer.Reset(interval)
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
