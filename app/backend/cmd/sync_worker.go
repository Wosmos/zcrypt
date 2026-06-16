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

// maxSyncAttempts caps how many times the sync worker will retry a single
// pending chunk before giving up on it. A chunk whose staging file is gone (or
// that fails every upload) would otherwise be retried forever, starving the
// queue. Once a chunk hits this cap it's left in place (remote_path still '')
// and logged so the data-loss risk is visible rather than silently looping.
const maxSyncAttempts = 8

// StartSyncWorker launches a background goroutine that flushes pending chunks
// to their respective storage adapters.
//
// It wakes instantly when the upload handler signals syncCh (event-driven),
// and falls back to a 30s poll to catch any chunks left over from a restart.
// Zero DB hits when there are no uploads in flight.
func (s *Server) StartSyncWorker(ctx context.Context) {
	go func() {
		// Recover so a panic in chunk syncing (e.g. a nil adapter deref or a
		// malformed chunk) doesn't permanently kill all platform syncing for
		// the process — which would strand every staged chunk on local disk.
		// On panic, relaunch the worker so syncing self-heals.
		defer func() {
			if r := recover(); r != nil {
				log.Printf("sync-worker: panic recovered, restarting: %v", r)
				if ctx.Err() == nil {
					s.StartSyncWorker(ctx)
				}
			}
		}()

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
	chunks, err := s.db.GetPendingChunks(ctx, 10, maxSyncAttempts)
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

	// failAttempt records a failed sync attempt and bumps the retry counter so
	// the cap in GetPendingChunks eventually engages. When the chunk reaches the
	// cap it'll stop being retried; log loudly at that point so the stranded
	// chunk (a real data-loss risk) is visible rather than silently looping.
	failAttempt := func(format string, args ...interface{}) {
		log.Printf("sync-worker: "+format, args...)
		if err := s.db.IncrementChunkSyncAttempts(ctx, chunk.ChunkID); err != nil {
			log.Printf("sync-worker: increment attempts for %s: %v", chunk.ChunkID, err)
			return
		}
		if chunk.SyncAttempts+1 >= maxSyncAttempts {
			log.Printf("sync-worker: WARNING chunk %s (file %s, idx %d) hit %d sync attempts and will no longer be retried — it is NOT durable on any platform",
				chunk.ChunkID, chunk.FileID, chunk.Index, maxSyncAttempts)
		}
	}

	// Read chunk data from staging
	data, err := os.ReadFile(stagingPath)
	if err != nil {
		failAttempt("read staging file %s: %v", chunk.ChunkID, err)
		return
	}

	// Resolve adapter
	adapter := s.resolveAdapterForUser(ctx, chunk.UserID, chunk.Platform, chunk.Account)
	if adapter == nil {
		failAttempt("no adapter for chunk %s (platform=%s account=%s)", chunk.ChunkID, chunk.Platform, chunk.Account)
		return
	}

	// Generate disguised remote path
	remotePath, err := disguise.ChunkFilename()
	if err != nil {
		failAttempt("generate filename: %v", err)
		return
	}

	// Acquire per-repo slot to prevent GitHub 409 storms
	releaseRepo, err := acquireRepoSlot(ctx, chunk.Repo)
	if err != nil {
		return // context cancelled — shutdown, not a real failure; don't count it
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
		failAttempt("upload chunk %s to %s failed: %v", chunk.ChunkID, chunk.Platform, err)
		return
	}

	// Update remote_path in DB (marks chunk as synced)
	if err := s.db.UpdateChunkRemotePath(ctx, chunk.ChunkID, ref.RemotePath); err != nil {
		failAttempt("update remote path for %s: %v", chunk.ChunkID, err)
		return
	}

	// Delete staging file
	if err := os.Remove(stagingPath); err != nil {
		fmt.Printf("sync-worker: warn: remove staging file %s: %v\n", stagingPath, err)
	}
}
