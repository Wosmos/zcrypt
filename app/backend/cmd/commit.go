package cmd

import (
	"context"
	"log"

	"github.com/zcrypt/zcrypt/adapters"
	"github.com/zcrypt/zcrypt/types"
)

// commitAndVerify takes already-uploaded-but-uncommitted chunks, commits them to
// their platform, and flips committed=TRUE ONLY for those whose object is
// afterwards CONFIRMED present in the platform tree. Anything that fails to
// commit or verify keeps committed=FALSE and gets sync_attempts bumped, so the
// reconcile loop retries it (up to the cap): a chunk is NEVER recorded durable
// on an object we haven't seen on the platform. Safe to call from both
// upload-complete and the background reconcile; commits are DB-derived and
// idempotent, so re-running is harmless.
//
// Relay uploads to non-batch platforms are marked committed by the sync worker
// the moment Upload succeeds, so a non-batch chunk reaching here was pushed by a
// client (byos-direct) and is trusted only once it is listed, or, on Telegram,
// which cannot be listed, once each of its parts is fetched back at the
// claimed size. Chunks already
// present are never re-committed, so a client that committed its own HuggingFace
// upload doesn't spend a second commit against the platform's hourly cap.
func (s *Server) commitAndVerify(ctx context.Context, chunks []types.ChunkRef) {
	type groupKey struct{ userID, platform, account, repo string }
	groups := map[groupKey][]types.ChunkRef{}
	for _, c := range chunks {
		k := groupKey{c.UserID, c.Platform, c.Account, c.Repo}
		groups[k] = append(groups[k], c)
	}

	for k, group := range groups {
		adapter := s.resolveAdapterForUser(ctx, k.userID, k.platform, k.account)
		if adapter == nil {
			log.Printf("commit-verify: no adapter for %s/%s repo=%s: leaving %d chunk(s) uncommitted for retry", k.platform, k.account, k.repo, len(group))
			s.bumpUncommitted(ctx, group)
			continue
		}

		bc, batch := adapter.(adapters.BatchCommitter)
		if cv, ok := adapter.(adapters.ChunkVerifier); ok && !batch {
			s.verifyEach(ctx, cv, k.platform, group)
			continue
		}

		confirmed, missing, err := s.splitPresent(ctx, adapter, k.repo, group)
		if err != nil {
			log.Printf("commit-verify: list %s repo=%s to verify failed: %v: re-verifying next cycle", k.platform, k.repo, err)
			s.bumpUncommitted(ctx, group)
			continue
		}

		if batch && len(missing) > 0 {
			files := make([]adapters.CommitFile, len(missing))
			for i, c := range missing {
				files[i] = adapters.CommitFile{Path: c.RemotePath, OID: c.SHA256, Size: c.Size}
			}
			if err := bc.CommitChunks(ctx, k.repo, files); err != nil {
				log.Printf("commit-verify: commit %d chunk(s) to %s repo=%s failed: %v", len(missing), k.platform, k.repo, err)
				s.markCommitted(ctx, confirmed)
				s.bumpUncommitted(ctx, missing)
				continue
			}
			// VERIFY: re-list and trust ONLY what is actually present. A commit
			// that returns 200 but whose object never lands (LFS dedup false
			// positive, etc.) is caught here and retried, not silently trusted.
			landed, still, err := s.splitPresent(ctx, adapter, k.repo, missing)
			if err != nil {
				log.Printf("commit-verify: list %s repo=%s to verify failed: %v: re-verifying next cycle", k.platform, k.repo, err)
				s.markCommitted(ctx, confirmed)
				s.bumpUncommitted(ctx, missing)
				continue
			}
			confirmed = append(confirmed, landed...)
			missing = still
		}

		s.markCommitted(ctx, confirmed)
		if len(missing) > 0 {
			log.Printf("commit-verify: %d chunk(s) absent on %s repo=%s, retrying", len(missing), k.platform, k.repo)
			s.bumpUncommitted(ctx, missing)
		}
	}
}

// verifyEach checks chunks one by one on a platform that cannot be listed,
// committing those confirmed intact and retrying the rest.
func (s *Server) verifyEach(ctx context.Context, cv adapters.ChunkVerifier, platform string, group []types.ChunkRef) {
	var confirmed, missing []types.ChunkRef
	for _, c := range group {
		if err := cv.VerifyChunk(ctx, c); err != nil {
			log.Printf("commit-verify: %s chunk %s not confirmed: %v", platform, c.ChunkID, err)
			missing = append(missing, c)
			continue
		}
		confirmed = append(confirmed, c)
	}
	s.markCommitted(ctx, confirmed)
	s.bumpUncommitted(ctx, missing)
}

// splitPresent lists a repo and partitions chunks into those whose path is in
// the platform tree and those that are not.
func (s *Server) splitPresent(ctx context.Context, adapter adapters.PlatformAdapter, repo string, chunks []types.ChunkRef) (present, absent []types.ChunkRef, err error) {
	listed, err := adapter.ListChunks(ctx, repo)
	if err != nil {
		return nil, nil, err
	}
	set := make(map[string]struct{}, len(listed))
	for _, p := range listed {
		set[p.RemotePath] = struct{}{}
	}
	for _, c := range chunks {
		if _, ok := set[c.RemotePath]; ok {
			present = append(present, c)
		} else {
			absent = append(absent, c)
		}
	}
	return present, absent, nil
}

func (s *Server) markCommitted(ctx context.Context, chunks []types.ChunkRef) {
	if len(chunks) == 0 {
		return
	}
	ids := make([]string, len(chunks))
	for i, c := range chunks {
		ids[i] = c.ChunkID
	}
	if err := s.db.MarkChunksCommitted(ctx, ids); err != nil {
		log.Printf("commit-verify: mark %d committed failed: %v", len(ids), err)
	}
}

// bumpUncommitted increments sync_attempts on chunks that failed to commit or
// verify, schedules their next attempt with backoff, and marks the file degraded
// once a chunk exhausts the budget, so the reconcile eventually stops (and loudly
// surfaces) a chunk that can never be made durable instead of looping on it.
func (s *Server) bumpUncommitted(ctx context.Context, chunks []types.ChunkRef) {
	for _, c := range chunks {
		if err := s.db.IncrementChunkSyncAttempts(ctx, c.ChunkID, syncRetryDelay(c.SyncAttempts)); err != nil {
			log.Printf("commit-verify: bump attempts for %s: %v", c.ChunkID, err)
			continue
		}
		if c.SyncAttempts+1 >= maxSyncAttempts {
			log.Printf("commit-verify: WARNING chunk %s (file %s idx %d) hit %d commit attempts and is NOT durable on %s, data-loss risk surfaced",
				c.ChunkID, c.FileID, c.Index, maxSyncAttempts, c.Platform)
			s.markDegraded(ctx, c.UserID, c.FileID)
		}
	}
}
