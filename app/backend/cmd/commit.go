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
// reconcile loop retries it (up to the cap) — a chunk is NEVER recorded durable
// on an object we haven't seen on the platform. Safe to call from both
// upload-complete and the background reconcile; commits are DB-derived and
// idempotent, so re-running is harmless.
func (s *Server) commitAndVerify(ctx context.Context, chunks []types.ChunkRef) {
	// One commit + one tree-verify per (user, platform, account, repo) group.
	type groupKey struct{ userID, platform, account, repo string }
	groups := map[groupKey][]types.ChunkRef{}
	for _, c := range chunks {
		k := groupKey{c.UserID, c.Platform, c.Account, c.Repo}
		groups[k] = append(groups[k], c)
	}

	for k, group := range groups {
		adapter := s.resolveAdapterForUser(ctx, k.userID, k.platform, k.account)
		if adapter == nil {
			log.Printf("commit-verify: no adapter for %s/%s repo=%s — leaving %d chunk(s) uncommitted for retry", k.platform, k.account, k.repo, len(group))
			s.bumpUncommitted(ctx, group)
			continue
		}

		bc, ok := adapter.(adapters.BatchCommitter)
		if !ok {
			// Non-batch platforms (GitHub/GitLab/Telegram) are durable the moment
			// Upload succeeds and should never be committed=FALSE. Defensive: if one
			// ever is, mark it so it doesn't loop in the reconcile forever.
			ids := make([]string, len(group))
			for i, c := range group {
				ids[i] = c.ChunkID
			}
			if err := s.db.MarkChunksCommitted(ctx, ids); err != nil {
				log.Printf("commit-verify: mark non-batch committed failed: %v", err)
			}
			continue
		}

		files := make([]adapters.CommitFile, len(group))
		for i, c := range group {
			files[i] = adapters.CommitFile{Path: c.RemotePath, OID: c.SHA256, Size: c.Size}
		}
		if err := bc.CommitChunks(ctx, k.repo, files); err != nil {
			log.Printf("commit-verify: commit %d chunk(s) to %s repo=%s failed: %v", len(group), k.platform, k.repo, err)
			s.bumpUncommitted(ctx, group)
			continue
		}

		// VERIFY: re-list the repo tree and mark committed ONLY the chunks whose
		// path is actually present. This is the check that makes "durable" honest —
		// a commit that returns 200 but whose object never lands (LFS dedup false
		// positive, etc.) is caught here and retried, not silently trusted.
		present, err := adapter.ListChunks(ctx, k.repo)
		if err != nil {
			log.Printf("commit-verify: list %s repo=%s to verify failed: %v — re-verifying next cycle", k.platform, k.repo, err)
			s.bumpUncommitted(ctx, group)
			continue
		}
		presentSet := make(map[string]struct{}, len(present))
		for _, p := range present {
			presentSet[p.RemotePath] = struct{}{}
		}

		var confirmed []string
		var missing []types.ChunkRef
		for _, c := range group {
			if _, ok := presentSet[c.RemotePath]; ok {
				confirmed = append(confirmed, c.ChunkID)
			} else {
				missing = append(missing, c)
			}
		}
		if err := s.db.MarkChunksCommitted(ctx, confirmed); err != nil {
			log.Printf("commit-verify: mark %d committed failed: %v", len(confirmed), err)
		}
		if len(missing) > 0 {
			log.Printf("commit-verify: %d chunk(s) still absent on %s repo=%s after commit — retrying", len(missing), k.platform, k.repo)
			s.bumpUncommitted(ctx, missing)
		}
	}
}

// bumpUncommitted increments sync_attempts on chunks that failed to commit or
// verify, so the reconcile eventually stops (and loudly logs) a chunk that can
// never be made durable instead of looping on it forever.
func (s *Server) bumpUncommitted(ctx context.Context, chunks []types.ChunkRef) {
	for _, c := range chunks {
		if err := s.db.IncrementChunkSyncAttempts(ctx, c.ChunkID); err != nil {
			log.Printf("commit-verify: bump attempts for %s: %v", c.ChunkID, err)
			continue
		}
		if c.SyncAttempts+1 >= maxSyncAttempts {
			log.Printf("commit-verify: WARNING chunk %s (file %s idx %d) hit %d commit attempts and is NOT durable on %s — data-loss risk surfaced",
				c.ChunkID, c.FileID, c.Index, maxSyncAttempts, c.Platform)
		}
	}
}
