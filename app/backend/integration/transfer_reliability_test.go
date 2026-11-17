//go:build integration

package integration_test

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/zcrypt/zcrypt/cmd"
	"github.com/zcrypt/zcrypt/config"
	"github.com/zcrypt/zcrypt/types"
)

func stagingFile(t *testing.T, chunkID string) string {
	t.Helper()
	dir, err := config.StagingDir()
	require.NoError(t, err)
	return filepath.Join(dir, chunkID+".enc")
}

func (ts *testServer) uploadRelayChunkWithoutSync(ctx context.Context, token, filename string) {
	ts.t.Helper()
	initBody := requireStatus(ts.t, ts.POST("/api/upload/init", map[string]interface{}{
		"encrypted_name": filename,
		"original_size":  40,
		"sha256":         hex64,
		"salt":           validSalt,
		"chunk_count":    1,
	}, token), http.StatusOK)
	var init struct {
		SessionID string `json:"session_id"`
	}
	require.NoError(ts.t, json.Unmarshal(initBody, &init))
	requireStatus(ts.t, ts.PUT("/api/upload/"+init.SessionID+"/chunk/0",
		[]byte("encrypted-chunk-payload-0123456789ABCDEF-"+filename), token), http.StatusOK)
	requireStatus(ts.t, ts.POST("/api/upload/"+init.SessionID+"/complete", map[string]interface{}{}, token), http.StatusOK)
}

func TestBatchPlatformStagingKeptUntilCommitConfirmed(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("staging-keep@example.com", "SecurePass@123!")
	user, err := ts.db.GetUserByEmail(ctx, "staging-keep@example.com")
	require.NoError(t, err)

	batch := newMockBatchAdapter()
	ts.srv.InjectTestAdapter(user.ID, "mock", "testacct", batch, 10<<30)

	fileID, chunkID := ts.uploadRelayChunkAwaitingCommit(ctx, token, "keep.bin")
	chunk, err := ts.db.GetChunkByIndex(ctx, fileID, 0)
	require.NoError(t, err)

	_, statErr := os.Stat(stagingFile(t, chunkID))
	assert.NoError(t, statErr, "staging must survive the upload until the commit is confirmed")

	batch.setPhantom(chunk.Repo, chunk.RemotePath)
	ts.srv.ReconcileUncommittedOnce(ctx)
	_, statErr = os.Stat(stagingFile(t, chunkID))
	assert.NoError(t, statErr, "a commit that never lands keeps staging so it can be re-pushed")
	assert.False(t, ts.chunkCommitted(ctx, chunkID))
	assert.GreaterOrEqual(t, batch.uploadCount(), 2, "the missing blob is re-pushed from staging")

	batch.mu.Lock()
	delete(batch.phantom, blobKey(chunk.Repo, chunk.RemotePath))
	batch.mu.Unlock()
	ts.srv.ReconcileUncommittedOnce(ctx)
	require.True(t, ts.chunkCommitted(ctx, chunkID))
	_, statErr = os.Stat(stagingFile(t, chunkID))
	assert.True(t, os.IsNotExist(statErr), "staging is removed once the commit is confirmed")
}

func TestNonBatchPlatformStagingRemovedAfterUpload(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("staging-drop@example.com", "SecurePass@123!")
	ts.enableMockStorage("staging-drop@example.com")

	_, chunkID := ts.uploadRelayChunkAwaitingCommit(ctx, token, "drop.bin")
	_, statErr := os.Stat(stagingFile(t, chunkID))
	assert.True(t, os.IsNotExist(statErr), "a plain adapter is durable on upload, staging goes at once")
}

type hangAdapter struct{ *mockAdapter }

func (h *hangAdapter) Upload(ctx context.Context, repo string, c types.Chunk) (types.ChunkRef, error) {
	<-ctx.Done()
	return types.ChunkRef{}, ctx.Err()
}

func TestHungUploadIsBoundedPerChunk(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("hang@example.com", "SecurePass@123!")
	user, err := ts.db.GetUserByEmail(ctx, "hang@example.com")
	require.NoError(t, err)
	ts.srv.InjectTestAdapter(user.ID, "mock", "testacct", &hangAdapter{newMockAdapter()}, 10<<30)
	defer cmd.SetSyncChunkMaxDurationForTest(300 * time.Millisecond)()

	start := time.Now()
	ts.uploadRelayChunkWithoutSync(ctx, token, "hang.bin")
	ts.srv.SyncPendingOnce(ctx)
	assert.Less(t, time.Since(start), 10*time.Second, "a hung platform call must not block the sync goroutine forever")
}
