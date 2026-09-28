//go:build integration

package integration_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// uploadRelayChunkAwaitingCommit runs init -> chunk -> complete against the
// given adapter and returns the file id and chunk id, WITHOUT running
// commitAndVerify: the chunk is synced (remote_path set) but still
// committed=FALSE, exactly the state GetUncommittedChunks looks for.
func (ts *testServer) uploadRelayChunkAwaitingCommit(ctx context.Context, token, filename string) (fileID, chunkID string) {
	ts.t.Helper()
	initBody := requireStatus(ts.t, ts.POST("/api/upload/init", map[string]interface{}{
		"filename":      filename,
		"original_size": 40,
		"sha256":        hex64,
		"salt":          validSalt,
		"chunk_count":   1,
	}, token), http.StatusOK)
	var init struct {
		SessionID string `json:"session_id"`
		FileID    string `json:"file_id"`
	}
	require.NoError(ts.t, json.Unmarshal(initBody, &init))

	requireStatus(ts.t, ts.PUT("/api/upload/"+init.SessionID+"/chunk/0",
		[]byte("encrypted-chunk-payload-0123456789ABCDEF-"+filename), token), http.StatusOK)
	requireStatus(ts.t, ts.POST("/api/upload/"+init.SessionID+"/complete", map[string]interface{}{}, token), http.StatusOK)

	// Relay-sync only (does NOT run commitAndVerify): the chunk lands on the
	// platform (remote_path set) but stays committed=FALSE until reconcile runs.
	ts.srv.SyncAllChunks(ctx)

	chunk, err := ts.db.GetChunkByIndex(ctx, init.FileID, 0)
	require.NoError(ts.t, err)
	require.NotEmpty(ts.t, chunk.RemotePath, "chunk must have synced before commit-verify can run on it")
	return init.FileID, chunk.ChunkID
}

// TestCommitVerifyCatchesPhantomCommit is a named regression test for the
// historical bug (docs/TEST_COVERAGE_ROADMAP.md P0): a platform commit that
// reports success but whose object never actually lands must NOT be trusted
// durable. commitAndVerify's re-list check (cmd/commit.go) is exactly the fix;
// this reproduces the bug shape on demand via a fake CommitChunks+ListChunks
// where the "commit" silently drops the path.
func TestCommitVerifyCatchesPhantomCommit(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("phantom@example.com", "SecurePass@123!")
	user, err := ts.db.GetUserByEmail(ctx, "phantom@example.com")
	require.NoError(t, err)

	batch := newMockBatchAdapter()
	ts.srv.InjectTestAdapter(user.ID, "mock", "testacct", batch, 10<<30)

	fileID, chunkID := ts.uploadRelayChunkAwaitingCommit(ctx, token, "phantom.bin")
	chunk, err := ts.db.GetChunkByIndex(ctx, fileID, 0)
	require.NoError(t, err)

	// The "commit" for this exact path will succeed, but the platform's
	// re-list will never show it -- the historical bug shape. One reconcile
	// PASS (matching a single production worker tick, not a loop to
	// exhaustion) must not trust it.
	batch.setPhantom(chunk.Repo, chunk.RemotePath)

	ts.srv.ReconcileUncommittedOnce(ctx)

	assert.False(t, ts.chunkCommitted(ctx, chunkID),
		"a chunk whose object never verifiably lands must stay committed=FALSE, not be trusted durable")
	assert.GreaterOrEqual(t, ts.countScalar(
		`SELECT sync_attempts FROM chunks WHERE chunk_id=$1`, chunkID), 1,
		"the missed verification must bump sync_attempts so reconcile keeps retrying it")

	// It self-heals once the platform (eventually) actually reflects the
	// object: this is the reconcile loop's job every subsequent cycle.
	batch.mu.Lock()
	delete(batch.phantom, blobKey(chunk.Repo, chunk.RemotePath))
	batch.mu.Unlock()
	ts.srv.ReconcileUncommittedOnce(ctx)
	assert.True(t, ts.chunkCommitted(ctx, chunkID), "once verified present, the chunk is finally marked committed")
}

// TestNonBatchAdapterGetsNoPostWriteVerification locks in a deliberate trust
// boundary (cmd/commit.go:36-48): an adapter that does NOT implement
// BatchCommitter (GitHub/GitLab/Telegram today) is trusted durable the moment
// Upload succeeds -- commitAndVerify marks it committed immediately with NO
// re-list call. This is intentional (Upload succeeding IS the durability
// signal for those platforms), not an oversight; this test makes that
// boundary explicit rather than implicit.
func TestNonBatchAdapterGetsNoPostWriteVerification(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("nobatch@example.com", "SecurePass@123!")
	mock := ts.enableMockStorage("nobatch@example.com")

	fileID, chunkID := ts.uploadRelayChunkAwaitingCommit(ctx, token, "nobatch.bin")
	_ = fileID

	before := mock.listChunksCallCount()
	ts.srv.ReconcileAllUncommitted(ctx)

	assert.True(t, ts.chunkCommitted(ctx, chunkID),
		"a plain (non-BatchCommitter) adapter's successful Upload is trusted immediately")
	assert.Equal(t, before, mock.listChunksCallCount(),
		"no re-verification call is made for a non-batch adapter -- Upload succeeding IS the durability signal")
}

// chunkCommitted reads the committed flag for a single chunk row.
func (ts *testServer) chunkCommitted(ctx context.Context, chunkID string) bool {
	ts.t.Helper()
	var committed bool
	require.NoError(ts.t, ts.db.Pool().QueryRow(ctx,
		`SELECT committed FROM chunks WHERE chunk_id=$1`, chunkID).Scan(&committed))
	return committed
}
