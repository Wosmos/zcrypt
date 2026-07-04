package cmd

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"runtime/debug"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/zcrypt/zcrypt/adapters"
	"github.com/zcrypt/zcrypt/auth"
	"github.com/zcrypt/zcrypt/config"
	"github.com/zcrypt/zcrypt/index"
	"github.com/zcrypt/zcrypt/types"
)

const (
	// Deletion worker poll bounds. It is event-driven via deletionCh (a delete
	// signals it instantly), so the timer is only a safety net / retry cadence for
	// failed deletions. It backs off from min to max while the queue stays empty so
	// an idle server stops waking Neon.
	deletionMinInterval = 30 * time.Second
	// Idle cap on the fallback poll. Deletes signal deletionCh instantly and a
	// restart re-drains on boot, so this only governs how often an IDLE server
	// retries FAILED deletions. Pushed out to 3h pre-launch so an idle DB sleeps;
	// lower it (to minutes) once there are users.
	deletionMaxInterval = 3 * time.Hour
	cleanupInterval     = 6 * time.Hour
	batchSize           = 10
	maxAttempts         = 5
	// slowLaneMaxAttempts is the hard cap for the slow retry lane: items that
	// exhausted the fast worker's maxAttempts get one more try per 6-hourly
	// cleanup cycle until they reach this cap, after which they are dead-lettered
	// (left in the table, loudly logged) instead of silently stranded at 5.
	slowLaneMaxAttempts = 15
)

// StartCleanupWorker runs two background goroutines:
//   - deletion worker: processes pending file deletions from git platforms every 15 min
//   - cleanup worker:  expires sessions, pads, vaults, etc. every 6 hours
func (s *Server) StartCleanupWorker(ctx context.Context) {
	// Deletion worker — users expect deleted files to disappear "soon". Event-driven
	// via deletionCh (a delete wakes it immediately) with an idle-backoff safety poll.
	s.runDeletionWorker(ctx)

	// One-shot boot-time staging sweeper: removes orphaned .enc files whose
	// chunk rows are gone (left behind by historical cancel/purge/expiry paths
	// that deleted DB rows without touching the staging dir).
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("staging sweeper panic: %v", r)
			}
		}()
		time.Sleep(20 * time.Second)
		s.sweepOrphanedStagingFiles(ctx)
	}()

	// Cleanup worker — non-urgent expiry, 6 hours is plenty
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("cleanup worker panic: %v", r)
			}
		}()
		time.Sleep(30 * time.Second)
		s.runCleanupBatch(ctx)
		ticker := time.NewTicker(cleanupInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.runCleanupBatch(ctx)
			}
		}
	}()
}

// runDeletionWorker launches the deletion-drain goroutine. Like the sync worker, it
// self-restarts on panic: with the event-driven design the goroutine is the ONLY
// reader of deletionCh, so if it died without relaunching, every future signalDeletion
// would hit the full buffer and be dropped — silently stranding all deletions for the
// life of the process. Relaunching keeps deletions self-healing.
func (s *Server) runDeletionWorker(ctx context.Context) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("deletion worker panic, restarting: %v\n%s", r, debug.Stack())
				if ctx.Err() == nil {
					s.runDeletionWorker(ctx)
				}
			}
		}()

		time.Sleep(10 * time.Second)
		// Clear any backlog left by a previous run before settling into the loop.
		for s.processPendingDeletions(ctx) {
		}

		backoff := deletionMinInterval
		timer := time.NewTimer(backoff)
		defer timer.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-s.deletionCh:
				// A file was just deleted — drain the whole queue now.
				for s.processPendingDeletions(ctx) {
				}
				backoff = deletionMinInterval
				resetTimer(timer, backoff)
			case <-timer.C:
				worked := false
				for s.processPendingDeletions(ctx) {
					worked = true
				}
				if worked {
					backoff = deletionMinInterval
				} else {
					backoff *= 2
					if backoff > deletionMaxInterval {
						backoff = deletionMaxInterval
					}
				}
				resetTimer(timer, backoff)
			}
		}
	}()
}

// runCleanupBatch handles non-urgent expiry tasks (runs every 6 hours).
func (s *Server) runCleanupBatch(ctx context.Context) {
	// Expire upload sessions. Synced chunks are queued into pending_deletions
	// inside the same transaction (wake the worker); unsynced chunks only exist
	// as staged .enc files, which are removed here.
	if cleaned, staged, err := s.db.CleanupExpiredUploadSessions(ctx); err != nil {
		log.Printf("cleanup: expired sessions: %v", err)
	} else if cleaned > 0 || len(staged) > 0 {
		removeStagedChunkFiles(staged)
		s.signalDeletion()
		log.Printf("cleanup: cancelled %d expired upload sessions (%d staged chunk files removed)", cleaned, len(staged))
	}

	s.cleanupExpiredSendTransfers(ctx)

	// Slow retry lane: give deletions that exhausted the fast worker's attempt
	// budget (e.g. a platform outage that outlasted 5 quick retries) one more
	// chance per cleanup cycle, up to slowLaneMaxAttempts.
	s.retryStaleDeletions(ctx)

	if cleaned, err := s.db.CleanupExpiredPads(ctx); err != nil {
		log.Printf("cleanup: expired pads: %v", err)
	} else if cleaned > 0 {
		log.Printf("cleanup: deleted %d expired pads", cleaned)
	}

	if cleaned, err := s.db.CleanupOldClipboardItems(ctx); err != nil {
		log.Printf("cleanup: old clipboard items: %v", err)
	} else if cleaned > 0 {
		log.Printf("cleanup: deleted %d old clipboard items", cleaned)
	}

	if expired, err := s.db.ExpireVaults(ctx); err != nil {
		log.Printf("cleanup: expire vaults: %v", err)
	} else if expired > 0 {
		log.Printf("cleanup: expired %d vaults", expired)
	}

	if switches, err := s.db.GetExpiredDeadManSwitches(ctx); err != nil {
		log.Printf("cleanup: dead man switches: %v", err)
	} else {
		for _, dms := range switches {
			s.triggerDeadManSwitch(ctx, dms)
		}
	}
}

// triggerDeadManSwitch notifies the configured contact that the user failed to
// check in, then marks the switch as triggered. The switch is only marked
// triggered if the notification was sent (or email is intentionally disabled),
// so a transient email failure is retried on the next cleanup pass rather than
// silently swallowing the one notification this feature exists to deliver.
func (s *Server) triggerDeadManSwitch(ctx context.Context, dms types.DeadManSwitch) {
	log.Printf("cleanup: dead man's switch triggered for user %s, notifying contact: %s", dms.UserID, dms.ContactEmail)

	cfg := s.emailCfg()
	if cfg == nil {
		// Email isn't configured for this deployment. There's no delivery
		// channel, so retrying forever is pointless — mark it triggered and
		// log loudly so it's visible in ops.
		log.Printf("cleanup: WARNING dead man's switch %s expired but email is not configured; cannot notify %s", dms.ID, dms.ContactEmail)
		if err := s.db.MarkDeadManSwitchTriggered(ctx, dms.ID); err != nil {
			log.Printf("cleanup: mark dead man's switch %s triggered: %v", dms.ID, err)
		}
		return
	}

	// Resolve a human-friendly label for the account holder for the email body.
	ownerName := "A zcrypt user"
	if owner, err := s.db.GetUserByID(ctx, dms.UserID); err == nil && owner != nil {
		if owner.Username != "" {
			ownerName = owner.Username
		} else if owner.Email != "" {
			ownerName = owner.Email
		}
	}

	if err := auth.SendDeadManSwitchEmail(cfg, dms.ContactEmail, dms.ContactName, ownerName, dms.Message, dms.IncludeFiles); err != nil {
		// Leave triggered = FALSE so the next cleanup pass retries delivery.
		log.Printf("cleanup: send dead man's switch email to %s failed (will retry): %v", dms.ContactEmail, err)
		return
	}

	if err := s.db.MarkDeadManSwitchTriggered(ctx, dms.ID); err != nil {
		log.Printf("cleanup: mark dead man's switch %s triggered: %v", dms.ID, err)
	}
}

// processPendingDeletions deletes one batch of chunks from git platforms for files
// the user has deleted. It returns true when a FULL batch was processed (so the
// caller should loop to drain the rest) and false when the queue is drained, errored,
// or the context was cancelled. Persistently-failing items eventually fall out of the
// eligible set once they exceed maxAttempts, so the drain loop always terminates.
func (s *Server) processPendingDeletions(ctx context.Context) bool {
	pending, err := s.db.GetPendingDeletions(ctx, batchSize, maxAttempts)
	if err != nil {
		log.Printf("deletion: get pending: %v", err)
		return false
	}
	if len(pending) == 0 {
		return false
	}

	log.Printf("deletion: processing %d pending deletions", len(pending))

	for _, item := range pending {
		select {
		case <-ctx.Done():
			return false
		default:
		}
		s.processDeletionItem(ctx, item)
	}

	if remaining, _ := s.db.PendingDeletionCount(ctx); remaining > 0 {
		fmt.Printf("deletion: %d deletions remaining in queue\n", remaining)
	}

	// A full batch likely means more remain — tell the caller to keep draining.
	return len(pending) == batchSize
}

// processDeletionItem attempts one queued platform deletion with per-item panic
// isolation: a panic inside one adapter's Delete (e.g. a nil dereference on a
// malformed/already-gone chunk) must NOT take down the whole batch. Without
// this, the worker-level recover re-ran the SAME batch forever, crash-looping
// and stranding every other deletion too.
func (s *Server) processDeletionItem(ctx context.Context, item index.PendingDeletion) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("deletion: recovered panic on item %d (%s:%s %s): %v",
				item.ID, item.Platform, item.Account, item.RemotePath, r)
			s.markDeletionFailed(ctx, item, fmt.Sprintf("panic: %v", r))
		}
	}()

	// Resolve the adapter. Items whose user was deleted (user_id NULL → "")
	// and anonymous-send deletions have no per-user tokens; and a per-user
	// lookup can also come back empty when the user row is gone. Fall back to
	// the global adapter set in both cases, mirroring send-transfer cleanup.
	var adapter adapters.PlatformAdapter
	if item.UserID != "" {
		adapter = s.resolveAdapterForUser(ctx, item.UserID, item.Platform, item.Account)
	}
	if adapter == nil {
		if ga, err := s.resolveGlobalAdapter(ctx, item.Platform, item.Account); err == nil {
			adapter = ga
		}
	}
	if adapter == nil {
		log.Printf("deletion: no adapter for %s:%s (user=%q), skipping", item.Platform, item.Account, item.UserID)
		s.markDeletionFailed(ctx, item, "no adapter available")
		return
	}

	ref := types.ChunkRef{
		Platform:   item.Platform,
		Account:    item.Account,
		Repo:       item.Repo,
		RemotePath: item.RemotePath,
	}

	if err := adapter.Delete(ctx, ref); err != nil {
		log.Printf("deletion: delete %s from %s: %v", item.RemotePath, item.Repo, err)
		s.markDeletionFailed(ctx, item, err.Error())
		time.Sleep(2 * time.Second)
		return
	}

	if err := s.db.MarkDeletionDone(ctx, item.ID); err != nil {
		log.Printf("deletion: mark done: %v", err)
	}
	log.Printf("deletion: deleted %s from %s", item.RemotePath, item.Repo)
	time.Sleep(1 * time.Second)
}

// markDeletionFailed records a failed attempt and surfaces dead-letter
// transitions loudly: hitting maxAttempts moves the item to the slow retry
// lane; hitting slowLaneMaxAttempts permanently strands the platform blob,
// which is a real orphan and must be visible in the logs, not just a row
// quietly ageing in pending_deletions.
func (s *Server) markDeletionFailed(ctx context.Context, item index.PendingDeletion, msg string) {
	if err := s.db.MarkDeletionFailed(ctx, item.ID, msg); err != nil {
		log.Printf("deletion: mark failed for item %d: %v", item.ID, err)
		return
	}
	attempts := item.Attempts + 1
	switch {
	case attempts >= slowLaneMaxAttempts:
		log.Printf("deletion: WARNING item %d exhausted all %d attempts — platform=%s account=%s repo=%s remote_path=%s is ORPHANED on the platform and needs manual cleanup (last error: %s)",
			item.ID, slowLaneMaxAttempts, item.Platform, item.Account, item.Repo, item.RemotePath, msg)
	case attempts == maxAttempts:
		log.Printf("deletion: WARNING item %d hit %d attempts — platform=%s account=%s repo=%s remote_path=%s moves to the slow retry lane (one attempt per %s, cap %d)",
			item.ID, maxAttempts, item.Platform, item.Account, item.Repo, item.RemotePath, cleanupInterval, slowLaneMaxAttempts)
	}
}

// retryStaleDeletions is the slow retry lane, run once per cleanup cycle: it
// re-attempts deletions that already exhausted the fast worker's maxAttempts
// but are still under slowLaneMaxAttempts.
func (s *Server) retryStaleDeletions(ctx context.Context) {
	items, err := s.db.GetStalePendingDeletions(ctx, batchSize, maxAttempts, slowLaneMaxAttempts)
	if err != nil {
		log.Printf("deletion: get stale deletions: %v", err)
		return
	}
	if len(items) == 0 {
		return
	}
	log.Printf("deletion: slow lane retrying %d stale deletions", len(items))
	for _, item := range items {
		select {
		case <-ctx.Done():
			return
		default:
		}
		s.processDeletionItem(ctx, item)
	}
}

// cleanupExpiredSendTransfers queues expired send transfers' remote chunks into
// pending_deletions (user_id NULL → the deletion worker resolves them via the
// global adapter set) and removes the DB records, in one transaction inside the
// index layer. The durable retry queue replaces the old inline best-effort
// delete loop, whose failures orphaned the platform blobs permanently. Returns
// true if any transfers were cleaned up.
func (s *Server) cleanupExpiredSendTransfers(ctx context.Context) bool {
	cleaned, queued, err := s.db.CleanupExpiredSendTransfers(ctx)
	if err != nil {
		log.Printf("cleanup: expired send transfers: %v", err)
		return false
	}
	if queued > 0 {
		s.signalDeletion()
	}
	if cleaned > 0 {
		log.Printf("cleanup: deleted %d expired send transfers (%d remote chunk deletions queued)", cleaned, queued)
		return true
	}
	return false
}

// removeStagedChunkFiles best-effort deletes the staging-dir .enc files for
// chunks whose DB rows were just deleted before the chunk ever synced to a
// platform (upload cancel, purge, session expiry). Missing files are fine —
// the sync worker may have raced us — anything else is logged.
func removeStagedChunkFiles(chunkIDs []string) {
	if len(chunkIDs) == 0 {
		return
	}
	stagingDir, err := config.StagingDir()
	if err != nil {
		log.Printf("cleanup: staging dir: %v", err)
		return
	}
	for _, id := range chunkIDs {
		p := filepath.Join(stagingDir, id+".enc")
		if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
			log.Printf("cleanup: remove staged chunk file %s: %v", p, err)
		}
	}
}

// sweepOrphanedStagingFiles removes staged .enc files that no longer have a
// chunks row — orphans accumulated by every historical cancel/purge/expiry
// that deleted DB rows without touching the staging dir. Runs once at boot.
// Files younger than an hour are skipped: HandleChunkUpload stages the file
// BEFORE inserting its chunk row, so a very fresh file can be live yet not in
// the DB for a moment.
func (s *Server) sweepOrphanedStagingFiles(ctx context.Context) {
	stagingDir, err := config.StagingDir()
	if err != nil {
		log.Printf("cleanup: staging sweeper: staging dir: %v", err)
		return
	}
	entries, err := os.ReadDir(stagingDir)
	if err != nil {
		log.Printf("cleanup: staging sweeper: read dir: %v", err)
		return
	}

	const minAge = time.Hour
	var ids []string
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".enc") {
			continue
		}
		id := strings.TrimSuffix(e.Name(), ".enc")
		// chunk_id is a UUID; anything else isn't ours to judge (and would break
		// the uuid[] cast in the batch lookup).
		if _, err := uuid.Parse(id); err != nil {
			continue
		}
		if info, err := e.Info(); err != nil || time.Since(info.ModTime()) < minAge {
			continue
		}
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		return
	}

	removed := 0
	const lookupBatch = 500
	for start := 0; start < len(ids); start += lookupBatch {
		if ctx.Err() != nil {
			return
		}
		end := min(start+lookupBatch, len(ids))
		batch := ids[start:end]
		existing, err := s.db.FilterExistingChunkIDs(ctx, batch)
		if err != nil {
			log.Printf("cleanup: staging sweeper: check chunk ids: %v", err)
			return
		}
		for _, id := range batch {
			if existing[id] {
				continue
			}
			p := filepath.Join(stagingDir, id+".enc")
			if err := os.Remove(p); err != nil && !os.IsNotExist(err) {
				log.Printf("cleanup: staging sweeper: remove %s: %v", p, err)
				continue
			}
			removed++
		}
	}
	if removed > 0 {
		log.Printf("cleanup: staging sweeper removed %d orphaned chunk files", removed)
	}
}
