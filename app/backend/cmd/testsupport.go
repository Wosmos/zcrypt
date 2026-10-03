//go:build integration

package cmd

import (
	"context"
	"math"
	"sync"
	"time"

	"github.com/zcrypt/zcrypt/config"

	"github.com/zcrypt/zcrypt/adapters"
	"github.com/zcrypt/zcrypt/reppool"
	"github.com/zcrypt/zcrypt/types"
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
// Each pass first makes every backed-off chunk due, standing in for the time
// that passes between real worker ticks, so a failing chunk still spends its
// whole retry budget before this returns.
//
// integration build tag only, never in a production binary.
func (s *Server) SyncAllChunks(ctx context.Context) {
	for s.ExpireSyncBackoff(ctx); s.syncPendingChunks(ctx); s.ExpireSyncBackoff(ctx) {
	}
}

// SyncPendingOnce runs exactly one sync pass WITHOUT touching backoff, so a test
// can observe that a just-failed chunk is not retried before it is due.
//
// integration build tag only, never in a production binary.
func (s *Server) SyncPendingOnce(ctx context.Context) bool {
	return s.syncPendingChunks(ctx)
}

// StoreStagedChunk exposes the relay chunk insert + staging cleanup so a test can
// drive the duplicate-index race deterministically.
//
// integration build tag only, never in a production binary.
func (s *Server) StoreStagedChunk(ctx context.Context, userID string, c *types.ChunkRef, stagingPath string) (bool, error) {
	return s.storeStagedChunk(ctx, userID, c, stagingPath, math.MaxInt64)
}

// ExpireSyncBackoff makes every backed-off chunk due now, simulating the wait.
//
// integration build tag only, never in a production binary.
func (s *Server) ExpireSyncBackoff(ctx context.Context) {
	if _, err := s.db.Pool().Exec(ctx, `UPDATE chunks SET next_attempt_at = NULL WHERE next_attempt_at IS NOT NULL`); err != nil {
		panic(err)
	}
}

// ReconcileAllUncommitted synchronously drains the commit+verify reconcile loop
// for uploaded-but-uncommitted chunks (remote_path set, committed still false),
// so a test doesn't depend on either the async goroutine HandleUploadComplete
// launches or the background sync worker's timing. Safe to call even if some
// chunks were already committed by the time this runs (commitAndVerify is
// idempotent). Loops to exhaustion, so a chunk that keeps failing verification
// will have its retry budget fully spent by the time this returns; a test that
// needs to observe an intermediate state (e.g. toggle a fault mid-retry) should
// use ReconcileUncommittedOnce instead.
//
// integration build tag only, never in a production binary.
func (s *Server) ReconcileAllUncommitted(ctx context.Context) {
	for s.ExpireSyncBackoff(ctx); s.reconcileUncommitted(ctx); s.ExpireSyncBackoff(ctx) {
	}
}

// ReconcileUncommittedOnce runs exactly one reconcile pass (matching a single
// production background-worker tick that fires once the previous attempt's
// backoff has elapsed, unlike ReconcileAllUncommitted's loop to exhaustion), so
// a test can inspect state between retries. Returns true if it found any work.
//
// integration build tag only, never in a production binary.
func (s *Server) ReconcileUncommittedOnce(ctx context.Context) bool {
	s.ExpireSyncBackoff(ctx)
	return s.reconcileUncommitted(ctx)
}

// DrainDeletions synchronously processes the pending_deletions queue to
// completion (invoking each adapter's Delete), so a test can assert the platform
// blobs are gone without waiting on the background deletion worker. Items that
// fail are left queued with a bumped attempt count, exactly as in production.
//
// integration build tag only, never in a production binary.
func (s *Server) DrainDeletions(ctx context.Context) {
	for s.processPendingDeletions(ctx) {
	}
}

// PurgeScheduledDeletions runs the cleanup pass that erases accounts whose
// deletion date has passed.
//
// integration build tag only, never in a production binary.
func (s *Server) PurgeScheduledDeletions(ctx context.Context) int {
	return s.purgeScheduledDeletions(ctx)
}

// SetMetricsToken enables the metrics endpoint with the given bearer token.
//
// integration build tag only, never in a production binary.
func (s *Server) SetMetricsToken(token string) {
	s.cfg.MetricsToken = token
}

// EnableTestOAuth registers a fake provider config so the OAuth callback can be
// driven against a stub provider server in integration tests.
func (s *Server) EnableTestOAuth(provider, clientID, clientSecret string) {
	if s.cfg.OAuth == nil {
		s.cfg.OAuth = &config.OAuthConfig{}
	}
	pc := &config.OAuthProviderConfig{ClientID: clientID, ClientSecret: clientSecret}
	switch provider {
	case "google":
		s.cfg.OAuth.Google = pc
	case "github":
		s.cfg.OAuth.GitHub = pc
	}
}

// CaptureNewDeviceEmails records new-device alerts instead of emailing them and
// returns a function listing the device labels alerted so far.
//
// integration build tag only, never in a production binary.
func (s *Server) CaptureNewDeviceEmails() func() []string {
	var mu sync.Mutex
	var devices []string
	s.newDeviceMailer = func(_, device, _ string, _ time.Time, _ string) error {
		mu.Lock()
		defer mu.Unlock()
		devices = append(devices, device)
		return nil
	}
	return func() []string {
		s.WaitBackground(context.Background())
		mu.Lock()
		defer mu.Unlock()
		return append([]string(nil), devices...)
	}
}
