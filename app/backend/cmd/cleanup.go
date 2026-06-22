package cmd

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/zcrypt/zcrypt/auth"
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
)

// StartCleanupWorker runs two background goroutines:
//   - deletion worker: processes pending file deletions from git platforms every 15 min
//   - cleanup worker:  expires sessions, pads, vaults, etc. every 6 hours
func (s *Server) StartCleanupWorker(ctx context.Context) {
	// Deletion worker — users expect deleted files to disappear "soon". Event-driven
	// via deletionCh (a delete wakes it immediately) with an idle-backoff safety poll.
	s.runDeletionWorker(ctx)

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
				log.Printf("deletion worker panic, restarting: %v", r)
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
	if cleaned, err := s.db.CleanupExpiredUploadSessions(ctx); err != nil {
		log.Printf("cleanup: expired sessions: %v", err)
	} else if cleaned > 0 {
		log.Printf("cleanup: cancelled %d expired upload sessions", cleaned)
	}

	s.cleanupExpiredSendTransfers(ctx)

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

		adapter := s.resolveAdapterForUser(ctx, item.UserID, item.Platform, item.Account)
		if adapter == nil {
			log.Printf("deletion: no adapter for %s:%s (user=%s), skipping", item.Platform, item.Account, item.UserID)
			s.db.MarkDeletionFailed(ctx, item.ID, "no adapter available")
			continue
		}

		ref := types.ChunkRef{
			Platform:   item.Platform,
			Account:    item.Account,
			Repo:       item.Repo,
			RemotePath: item.RemotePath,
		}

		if err := adapter.Delete(ctx, ref); err != nil {
			log.Printf("deletion: delete %s from %s: %v", item.RemotePath, item.Repo, err)
			s.db.MarkDeletionFailed(ctx, item.ID, err.Error())
			time.Sleep(2 * time.Second)
			continue
		}

		if err := s.db.MarkDeletionDone(ctx, item.ID); err != nil {
			log.Printf("deletion: mark done: %v", err)
		}
		log.Printf("deletion: deleted %s from %s", item.RemotePath, item.Repo)
		time.Sleep(1 * time.Second)
	}

	if remaining, _ := s.db.PendingDeletionCount(ctx); remaining > 0 {
		fmt.Printf("deletion: %d deletions remaining in queue\n", remaining)
	}

	// A full batch likely means more remain — tell the caller to keep draining.
	return len(pending) == batchSize
}

// cleanupExpiredSendTransfers deletes remote chunks for expired send transfers,
// then removes the DB records. Returns true if any transfers were cleaned up.
func (s *Server) cleanupExpiredSendTransfers(ctx context.Context) bool {
	expiredChunks, err := s.db.GetExpiredSendChunks(ctx)
	if err != nil {
		log.Printf("cleanup: get expired send chunks: %v", err)
	}

	if len(expiredChunks) > 0 {
		_, adapter, aErr := s.selectGlobalAdapter(ctx)
		if aErr != nil {
			log.Printf("cleanup: no global adapter for send cleanup: %v", aErr)
		} else {
			for _, chunk := range expiredChunks {
				ref := types.ChunkRef{
					Platform:   chunk.Platform,
					Account:    chunk.Account,
					Repo:       chunk.Repo,
					RemotePath: chunk.RemotePath,
				}
				if dErr := adapter.Delete(ctx, ref); dErr != nil {
					log.Printf("cleanup: delete send chunk %s: %v", chunk.RemotePath, dErr)
				}
				time.Sleep(500 * time.Millisecond) // rate limit
			}
		}
	}

	cleaned, err := s.db.CleanupExpiredSendTransfers(ctx)
	if err != nil {
		log.Printf("cleanup: expired send transfers: %v", err)
		return false
	}
	if cleaned > 0 {
		log.Printf("cleanup: deleted %d expired send transfers (%d remote chunks)", cleaned, len(expiredChunks))
		return true
	}
	return false
}
