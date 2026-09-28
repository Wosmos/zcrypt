//go:build integration

package integration_test

import (
	"context"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/zcrypt/zcrypt/reppool"
)

// TestThresholdRotationIsInterSessionOnly proves rotation happens only on the
// NEXT call to GetOrCreateRepo that observes usage over threshold, never
// intra-session: HandleUploadInit (cmd/upload.go:233) calls GetOrCreateRepo
// exactly once, at session creation, and the session's repo is then fixed for
// its whole lifetime. This drives reppool.Manager directly (rather than two
// full HTTP upload sessions racing HandleUploadComplete's un-instrumented
// background usage-update goroutine) to make the exact contract deterministic
// and explicit.
func TestThresholdRotationIsInterSessionOnly(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	ts.registerAndLogin("threshold@example.com", "SecurePass@123!")
	user, err := ts.db.GetUserByEmail(ctx, "threshold@example.com")
	require.NoError(t, err)

	mock := newMockAdapter()
	const threshold = int64(100)
	mgr := reppool.NewManager(ts.db, mock, user.ID, "testacct", threshold)

	repo1, err := mgr.GetOrCreateRepo(ctx)
	require.NoError(t, err)

	// Stand in for a session's usage update (HandleUploadComplete's background
	// goroutine calls the same UpdateUsage after the real upload finishes)
	// pushing this repo just over threshold.
	require.NoError(t, mgr.UpdateUsage(repo1.ID, threshold+1))

	// A second, independent call -- standing in for a brand-new upload
	// session's init -- must land on a NEW repo.
	repo2, err := mgr.GetOrCreateRepo(ctx)
	require.NoError(t, err)
	assert.NotEqual(t, repo1.ID, repo2.ID, "a session created after crossing threshold gets a new repo")

	repos, err := ts.db.ListRepos(ctx, user.ID, "mock")
	require.NoError(t, err)
	var found1, found2 bool
	for _, r := range repos {
		if r.ID == repo1.ID {
			found1 = true
			assert.False(t, r.Active, "the over-threshold repo is deactivated, not repointed")
		}
		if r.ID == repo2.ID {
			found2 = true
			assert.True(t, r.Active)
		}
	}
	assert.True(t, found1, "repo1 must still exist")
	assert.True(t, found2, "repo2 must exist")

	// A THIRD call, immediately after, reuses repo2 (still under threshold):
	// proof that rotation only ever happens on the call that observes the
	// crossed threshold, never proactively or mid-flight.
	repo3, err := mgr.GetOrCreateRepo(ctx)
	require.NoError(t, err)
	assert.Equal(t, repo2.ID, repo3.ID, "a repo under threshold is reused, not rotated again")
}

// TestConcurrentGetOrCreateRepoAtThreshold proves the system stays SAFE (no
// panic, no error, no data corruption) under concurrent GetOrCreateRepo calls
// racing right at the threshold boundary, even though GetOrCreateRepo
// (reppool/manager.go:36-50) is NOT transactional (read-active, check
// threshold, deactivate, create-new are three unguarded round trips) and the
// schema has no uniqueness constraint enforcing exactly one active repo per
// platform/account. This documents (rather than assumes away) whether more
// than one repo can end up simultaneously active.
func TestConcurrentGetOrCreateRepoAtThreshold(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	ts.registerAndLogin("concurrentrepo@example.com", "SecurePass@123!")
	user, err := ts.db.GetUserByEmail(ctx, "concurrentrepo@example.com")
	require.NoError(t, err)

	mock := newMockAdapter()
	const threshold = int64(100)
	mgr := reppool.NewManager(ts.db, mock, user.ID, "testacct", threshold)

	repo, err := mgr.GetOrCreateRepo(ctx)
	require.NoError(t, err)
	require.NoError(t, mgr.UpdateUsage(repo.ID, threshold+1))

	const n = 8
	var wg sync.WaitGroup
	errs := make([]error, n)
	ids := make([]string, n)
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			r, gerr := mgr.GetOrCreateRepo(ctx)
			errs[i] = gerr
			if r != nil {
				ids[i] = r.ID
			}
		}(i)
	}
	wg.Wait()

	for i, gerr := range errs {
		assert.NoError(t, gerr, "call %d must not error/panic under concurrent threshold-boundary access", i)
	}

	repos, err := ts.db.ListRepos(ctx, user.ID, "mock")
	require.NoError(t, err)
	activeByID := map[string]bool{}
	for _, r := range repos {
		if r.Active {
			activeByID[r.ID] = true
		}
	}
	for i, id := range ids {
		assert.True(t, activeByID[id], "call %d's returned repo %s must be a real, currently-active repo row", i, id)
	}

	t.Logf("concurrent GetOrCreateRepo at the threshold boundary left %d simultaneously active repo(s) out of %d calls (no schema constraint enforces exactly one)",
		len(activeByID), n)
}
