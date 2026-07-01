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

// The sync worker is event-driven: the upload handler signals syncCh the instant a
// chunk is staged, so the fallback timer is only a safety net for chunks stranded by
// a crash/restart. It starts at syncMinInterval and, each time a poll finds nothing,
// backs off (doubling) up to syncMaxInterval. Any signal or any work found resets it
// to the minimum. This is what lets Neon auto-suspend: an idle server stops pinging
// the DB every 30s and instead drifts out to a multi-minute poll, leaving long idle
// gaps for the compute to suspend in.
const (
	syncMinInterval = 30 * time.Second
	// Idle cap on the fallback poll. Uploads signal syncCh instantly and a restart
	// re-drains on boot, so this only governs how often an IDLE server retries
	// chunks that failed to sync / re-checks for leftovers. Pushed out to 3h
	// pre-launch so an idle DB sleeps; lower it (to minutes) once there are users.
	syncMaxInterval = 3 * time.Hour
)

// resetTimer safely reschedules t to fire after d. Per the time.Timer contract, a
// timer that has already fired must have its channel drained before Reset.
func resetTimer(t *time.Timer, d time.Duration) {
	if !t.Stop() {
		select {
		case <-t.C:
		default:
		}
	}
	t.Reset(d)
}

// maxSyncAttempts caps how many times the sync worker will retry a single
// pending chunk before giving up on it. A chunk whose staging file is gone (or
// that fails every upload) would otherwise be retried forever, starving the
// queue. Once a chunk hits this cap it's left in place (remote_path still ”)
// and logged so the data-loss risk is visible rather than silently looping.
const maxSyncAttempts = 8

// StartSyncWorker launches a background goroutine that flushes pending chunks
// to their respective storage adapters.
//
// It wakes instantly when the upload handler signals syncCh (event-driven), and
// otherwise polls on an idle-backoff timer (syncMinInterval -> syncMaxInterval) that
// only catches chunks left over from a restart. When idle there are no DB hits beyond
// the slow backoff poll, so Neon can auto-suspend.
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

		// Drain anything stranded by a previous run before settling into the loop.
		for s.syncPendingChunks(ctx) {
		}

		backoff := syncMinInterval
		fallback := time.NewTimer(backoff)
		defer fallback.Stop()

		for {
			select {
			case <-ctx.Done():
				log.Println("sync-worker: stopped")
				return
			case <-s.syncCh:
				// Upload just happened — drain the whole queue, then poll promptly
				// in case more chunks land right behind it.
				for s.syncPendingChunks(ctx) {
				}
				backoff = syncMinInterval
				resetTimer(fallback, backoff)
			case <-fallback.C:
				// Safety net: catch any chunks left over from a restart.
				worked := false
				for s.syncPendingChunks(ctx) {
					worked = true
				}
				if worked {
					backoff = syncMinInterval
				} else {
					// Idle: back off so the DB connection drains and Neon can
					// auto-suspend instead of being pinged every 30s forever.
					backoff *= 2
					if backoff > syncMaxInterval {
						backoff = syncMaxInterval
					}
				}
				resetTimer(fallback, backoff)
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
