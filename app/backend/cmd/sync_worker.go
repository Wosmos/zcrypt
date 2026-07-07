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

	// Resolve the disguised remote path. Reuse a path already planned on a prior
	// attempt so a retry targets the SAME path instead of leaking a second blob.
	// Only generate a fresh path the first time, and persist it BEFORE uploading:
	// remote_path is written only after a successful upload, so without a
	// pre-recorded plan a crash between Upload succeeding and that write would
	// strand the blob at a random, unknowable path — a permanent orphan. With the
	// plan persisted, deletion can always find it. Git platforms get a 2-hex-char
	// shard directory so no folder ever approaches HuggingFace's hard
	// 10k-entries-per-folder limit; Telegram keeps the flat name (a chat has no
	// folders).
	remotePath := chunk.PlannedRemotePath
	isRetry := remotePath != ""
	if remotePath == "" {
		if chunk.Platform == "telegram" {
			remotePath, err = disguise.ChunkFilename()
		} else {
			remotePath, err = disguise.ShardedChunkFilename()
		}
		if err != nil {
			failAttempt("generate filename: %v", err)
			return
		}
		if err := s.db.SetPlannedRemotePath(ctx, chunk.ChunkID, remotePath); err != nil {
			failAttempt("record planned remote path for %s: %v", chunk.ChunkID, err)
			return
		}
	}

	// Retry on a previously-planned git path: a prior attempt may have actually
	// landed the blob (a lost/timed-out response, or a crash before the
	// remote_path write). GitHub/GitLab reject a *create* over an existing path
	// (422 / "already exists"), which would brick the chunk on every retry. So
	// best-effort delete the planned path first, making the re-upload a clean
	// create. A 404 delete is a harmless no-op, and the git adapters treat it as
	// success. Telegram is skipped: its planned path is a filename, not a message
	// locator, so there is nothing to delete and re-upload just makes a new message.
	if isRetry && chunk.Platform != "telegram" {
		if delErr := adapter.Delete(ctx, types.ChunkRef{
			Platform:   chunk.Platform,
			Account:    chunk.Account,
			Repo:       chunk.Repo,
			RemotePath: remotePath,
		}); delErr != nil {
			log.Printf("sync-worker: pre-retry cleanup of %s at %s failed (continuing): %v", chunk.ChunkID, remotePath, delErr)
		}
	}

	// Per-platform push rate limit (e.g. GitHub ~7GB/hour). Wait BEFORE taking a
	// repo slot so throttling doesn't hold the slot idle and block other repos.
	if delay := s.pushLimiter.reserve(chunk.Platform, chunk.Size); delay > 0 {
		log.Printf("sync-worker: throttling %s (rate cap) — holding chunk %s for %s", chunk.Platform, chunk.ChunkID, delay.Round(time.Second))
		select {
		case <-time.After(delay):
		case <-ctx.Done():
			return // shutdown — not a failed attempt
		}
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

	// Update remote_path in DB (marks chunk as synced).
	rows, err := s.db.UpdateChunkRemotePath(ctx, chunk.ChunkID, ref.RemotePath)
	if err != nil {
		failAttempt("update remote path for %s: %v", chunk.ChunkID, err)
		return
	}
	if rows == 0 {
		// The chunk row vanished while this upload was in flight — the file was
		// purged (its planned path was queued for deletion and already processed
		// as a 404 no-op) before the blob actually landed. The blob now exists at
		// ref.RemotePath with no DB record, so queue it for deletion directly;
		// otherwise it is an orphan (invisible forever on Telegram, reconcile-only
		// on git). Then fall through to remove staging.
		log.Printf("sync-worker: chunk %s gone at mark time (purged mid-flight) — queueing orphan blob %s for deletion", chunk.ChunkID, ref.RemotePath)
		if qErr := s.db.QueueChunkDeletion(ctx, chunk.UserID, chunk.Platform, chunk.Account, chunk.Repo, ref.RemotePath); qErr != nil {
			log.Printf("sync-worker: failed to queue orphan blob %s for deletion: %v", ref.RemotePath, qErr)
		} else {
			s.signalDeletion()
		}
	}

	// Delete staging file
	if err := os.Remove(stagingPath); err != nil {
		fmt.Printf("sync-worker: warn: remove staging file %s: %v\n", stagingPath, err)
	}
}
