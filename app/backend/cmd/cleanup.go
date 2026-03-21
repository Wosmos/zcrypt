package cmd

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/zcrypt/zcrypt/types"
)

const (
	cleanupInterval = 5 * time.Minute
	batchSize       = 10
	maxAttempts     = 5
)

// StartCleanupWorker runs a background goroutine that processes pending deletions.
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

func (s *Server) runCleanupBatch(ctx context.Context) {
	// Clean up expired upload sessions first
	if cleaned, err := s.db.CleanupExpiredUploadSessions(ctx); err != nil {
		log.Printf("cleanup: expired sessions: %v", err)
	} else if cleaned > 0 {
		log.Printf("cleanup: cancelled %d expired upload sessions", cleaned)
	}

	// Clean up expired anonymous send transfers
	s.cleanupExpiredSendTransfers(ctx)

	// Clean up expired pads
	if cleaned, err := s.db.CleanupExpiredPads(ctx); err != nil {
		log.Printf("cleanup: expired pads: %v", err)
	} else if cleaned > 0 {
		log.Printf("cleanup: deleted %d expired pads", cleaned)
	}

	// Clean up old clipboard items (older than 24h)
	if cleaned, err := s.db.CleanupOldClipboardItems(ctx); err != nil {
		log.Printf("cleanup: old clipboard items: %v", err)
	} else if cleaned > 0 {
		log.Printf("cleanup: deleted %d old clipboard items", cleaned)
	}

	// Expire vaults past their deadline
	if expired, err := s.db.ExpireVaults(ctx); err != nil {
		log.Printf("cleanup: expire vaults: %v", err)
	} else if expired > 0 {
		log.Printf("cleanup: expired %d vaults", expired)
	}

	// Check dead man's switches (log only; actual notification needs email service)
	if switches, err := s.db.GetExpiredDeadManSwitches(ctx); err != nil {
		log.Printf("cleanup: check dead man switches: %v", err)
	} else {
		for _, dms := range switches {
			log.Printf("cleanup: dead man's switch triggered for user %s, contact: %s", dms.UserID, dms.ContactEmail)
			s.db.MarkDeadManSwitchTriggered(ctx, dms.ID)
		}
	}

	pending, err := s.db.GetPendingDeletions(ctx, batchSize, maxAttempts)
	if err != nil {
		log.Printf("cleanup: get pending: %v", err)
		return
	}

	if len(pending) == 0 {
		return
	}

	log.Printf("cleanup: processing %d pending deletions", len(pending))

	for _, item := range pending {
		select {
		case <-ctx.Done():
			return
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
}

// cleanupExpiredSendTransfers deletes remote chunks for expired send transfers,
// then removes the DB records.
func (s *Server) cleanupExpiredSendTransfers(ctx context.Context) {
	// Get chunks from expired transfers (before deleting the DB records)
	expiredChunks, err := s.db.GetExpiredSendChunks(ctx)
	if err != nil {
		log.Printf("cleanup: get expired send chunks: %v", err)
	}

	// Delete remote chunks via global adapter
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

	// Now delete the DB records (CASCADE deletes send_chunks too)
	if cleaned, err := s.db.CleanupExpiredSendTransfers(ctx); err != nil {
		log.Printf("cleanup: expired send transfers: %v", err)
	} else if cleaned > 0 {
		log.Printf("cleanup: deleted %d expired send transfers (%d remote chunks)", cleaned, len(expiredChunks))
	}
}
