package cmd

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/zcrypt/zcrypt/types"
)

const (
	deletionInterval = 15 * time.Minute
	cleanupInterval  = 6 * time.Hour
	batchSize        = 10
	maxAttempts      = 5
)

// StartCleanupWorker runs two background goroutines:
//   - deletion worker: processes pending file deletions from git platforms every 15 min
//   - cleanup worker:  expires sessions, pads, vaults, etc. every 6 hours
func (s *Server) StartCleanupWorker(ctx context.Context) {
	// Deletion worker — users expect deleted files to disappear "soon"
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("deletion worker panic: %v", r)
			}
		}()
		time.Sleep(10 * time.Second)
		s.processPendingDeletions(ctx)
		ticker := time.NewTicker(deletionInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.processPendingDeletions(ctx)
			}
		}
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
			log.Printf("cleanup: dead man's switch triggered for user %s, contact: %s", dms.UserID, dms.ContactEmail)
			s.db.MarkDeadManSwitchTriggered(ctx, dms.ID)
		}
	}
}

// processPendingDeletions deletes chunks from git platforms for files the user has deleted.
// Runs every 15 min so deletions are visible "soon" without hammering the DB.
func (s *Server) processPendingDeletions(ctx context.Context) {
	pending, err := s.db.GetPendingDeletions(ctx, batchSize, maxAttempts)
	if err != nil {
		log.Printf("deletion: get pending: %v", err)
		return
	}
	if len(pending) == 0 {
		return
	}

	log.Printf("deletion: processing %d pending deletions", len(pending))

	for _, item := range pending {
		select {
		case <-ctx.Done():
			return
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
