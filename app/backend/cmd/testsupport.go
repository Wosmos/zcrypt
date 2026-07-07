//go:build integration

package cmd

import (
	"context"

	"github.com/zcrypt/zcrypt/adapters"
	"github.com/zcrypt/zcrypt/reppool"
)

// InjectTestAdapter pre-seeds the per-user adapter and pool caches with a
// caller-supplied adapter, letting integration tests drive the upload pipeline
// without a real git platform connected.
//
// getUserAdapters/getUserPools consult these caches first and return early when
// an entry exists, so seeding them here means selectAdapter resolves the fake
// adapter and never touches the platform_tokens table.
//
// This file is compiled only under the `integration` build tag; it is never
// part of a production binary.
func (s *Server) InjectTestAdapter(userID, platform, account string, adapter adapters.PlatformAdapter, threshold int64) {
	key := platform + ":" + account

	s.adapterMu.Lock()
	defer s.adapterMu.Unlock()

	if s.adapterCache[userID] == nil {
		s.adapterCache[userID] = make(map[string]adapters.PlatformAdapter)
	}
	s.adapterCache[userID][key] = adapter

	if s.poolCache[userID] == nil {
		s.poolCache[userID] = make(map[string]*reppool.Manager)
	}
	s.poolCache[userID][key] = reppool.NewManager(s.db, adapter, userID, account, threshold)
}

// SyncAllChunks synchronously pushes every staged chunk to its platform adapter,
// draining the sync worker's queue in-line so a test doesn't depend on the
// background goroutine's timing. After it returns, synced chunks carry a
// remote_path and are therefore eligible for platform deletion on purge.
//
// integration build tag only — never in a production binary.
func (s *Server) SyncAllChunks(ctx context.Context) {
	for s.syncPendingChunks(ctx) {
	}
}

// DrainDeletions synchronously processes the pending_deletions queue to
// completion (invoking each adapter's Delete), so a test can assert the platform
// blobs are gone without waiting on the background deletion worker. Items that
// fail are left queued with a bumped attempt count, exactly as in production.
//
// integration build tag only — never in a production binary.
func (s *Server) DrainDeletions(ctx context.Context) {
	for s.processPendingDeletions(ctx) {
	}
}
