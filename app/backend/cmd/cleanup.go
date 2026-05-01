package cmd

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/zcrypt/zcrypt/types"
)

const (
	cleanupMinInterval = 5 * time.Minute
	cleanupMaxInterval = 30 * time.Minute
	batchSize          = 10
	maxAttempts        = 5
)

// StartCleanupWorker runs a background goroutine that processes pending deletions.
// Interval backs off up to 30 min when idle, resetting to 5 min when work is found.
func (s *Server) StartCleanupWorker(ctx context.Context) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("cleanup worker panic: %v", r)
			}
		}()

		// Run once on startup after a short delay
		time.Sleep(10 * time.Second)
		s.runCleanupBatch(ctx)

		interval := cleanupMinInterval
		timer := time.NewTimer(interval)
		defer timer.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
				if s.runCleanupBatch(ctx) {
					interval = cleanupMinInterval
				} else if interval < cleanupMaxInterval {
					interval *= 2
					if interval > cleanupMaxInterval {
						interval = cleanupMaxInterval
					}
				}
				timer.Reset(interval)
			}
		}
	}()
}

// runCleanupBatch runs all cleanup tasks. Returns true if any work was done
// (caller should keep interval short); false if everything was empty (back off).
func (s *Server) runCleanupBatch(ctx context.Context) bool {
	found := false

	// Clean up expired upload sessions first
	if cleaned, err := s.db.CleanupExpiredUploadSessions(ctx); err != nil {
		log.Printf("cleanup: expired sessions: %v", err)
	} else if cleaned > 0 {
		log.Printf("cleanup: cancelled %d expired upload sessions", cleaned)
		found = true
	}

	// Clean up expired anonymous send transfers
	if s.cleanupExpiredSendTransfers(ctx) {
		found = true
	}

	// Clean up expired pads
	if cleaned, err := s.db.CleanupExpiredPads(ctx); err != nil {
		log.Printf("cleanup: expired pads: %v", err)
	} else if cleaned > 0 {
		log.Printf("cleanup: deleted %d expired pads", cleaned)
		found = true
	}

	// Clean up old clipboard items (older than 24h)
	if cleaned, err := s.db.CleanupOldClipboardItems(ctx); err != nil {
		log.Printf("cleanup: old clipboard items: %v", err)
	} else if cleaned > 0 {
		log.Printf("cleanup: deleted %d old clipboard items", cleaned)
		found = true
	}

	// Expire vaults past their deadline
	if expired, err := s.db.ExpireVaults(ctx); err != nil {
		log.Printf("cleanup: expire vaults: %v", err)
	} else if expired > 0 {
		log.Printf("cleanup: expired %d vaults", expired)
		found = true
	}

	// Check dead man's switches (log only; actual notification needs email service)
	if switches, err := s.db.GetExpiredDeadManSwitches(ctx); err != nil {
		log.Printf("cleanup: check dead man switches: %v", err)
	} else if len(switches) > 0 {
		found = true
		for _, dms := range switches {
			log.Printf("cleanup: dead man's switch triggered for user %s, contact: %s", dms.UserID, dms.ContactEmail)
			s.db.MarkDeadManSwitchTriggered(ctx, dms.ID)
		}
	}

	pending, err := s.db.GetPendingDeletions(ctx, batchSize, maxAttempts)
	if err != nil {
		log.Printf("cleanup: get pending: %v", err)
		return found
	}

	if len(pending) == 0 {
		return found
	}

	log.Printf("cleanup: processing %d pending deletions", len(pending))

	for _, item := range pending {
		select {
		case <-ctx.Done():
			return true
		default:
		}

		// Resolve adapter for the owning user
		adapter := s.resolveAdapterForUser(ctx, item.UserID, item.Platform, item.Account)
		if adapter == nil {
			log.Printf("cleanup: no adapter for %s:%s (user=%s), skipping", item.Platform, item.Account, item.UserID)
			s.db.MarkDeletionFailed(ctx, item.ID, "no adapter available")
			continue
		}

		ref := types.ChunkRef{
			Platform:   item.Platform,
			Account:    item.Account,
			Repo:       item.Repo,
			RemotePath: item.RemotePath,
		}

		err := adapter.Delete(ctx, ref)
		if err != nil {
			log.Printf("cleanup: delete %s from %s: %v", item.RemotePath, item.Repo, err)
			s.db.MarkDeletionFailed(ctx, item.ID, err.Error())

			// Rate limit: wait between failures
			time.Sleep(2 * time.Second)
			continue
		}

		if err := s.db.MarkDeletionDone(ctx, item.ID); err != nil {
			log.Printf("cleanup: mark done: %v", err)
		}

		log.Printf("cleanup: deleted %s from %s", item.RemotePath, item.Repo)

		// Rate limit: wait between successful deletes too
		time.Sleep(1 * time.Second)
	}

	remaining, _ := s.db.PendingDeletionCount(ctx)
	if remaining > 0 {
		fmt.Printf("cleanup: %d deletions remaining in queue\n", remaining)
	}
	return true
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
