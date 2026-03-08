package cmd

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/zpush/zpush/types"
)

const (
	cleanupInterval = 5 * time.Minute
	batchSize       = 10
	maxAttempts     = 5
)

// StartCleanupWorker runs a background goroutine that processes pending deletions.
func (s *Server) StartCleanupWorker(ctx context.Context) {
	go func() {
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
