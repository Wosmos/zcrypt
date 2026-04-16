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

// StartSyncWorker launches a background goroutine that flushes pending chunks
// (received from clients but not yet pushed to the git platform) to their
// respective storage adapters. It runs continuously until ctx is cancelled.
func (s *Server) StartSyncWorker(ctx context.Context) {
	go func() {
		log.Println("sync-worker: started")
		ticker := time.NewTicker(500 * time.Millisecond)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				log.Println("sync-worker: stopped")
				return
			case <-ticker.C:
				s.syncPendingChunks(ctx)
			}
		}
	}()
}

func (s *Server) syncPendingChunks(ctx context.Context) {
	// Grab a batch of pending chunks
	chunks, err := s.db.GetPendingChunks(ctx, 10)
	if err != nil {
		log.Printf("sync-worker: get pending chunks: %v", err)
		return
	}
	if len(chunks) == 0 {
		return
	}

	stagingDir, err := config.StagingDir()
	if err != nil {
		log.Printf("sync-worker: staging dir: %v", err)
		return
	}

	for _, chunk := range chunks {
		if ctx.Err() != nil {
			return
		}
		s.syncOneChunk(ctx, chunk, stagingDir)
	}
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
