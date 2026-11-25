//go:build integration

package integration_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/zcrypt/zcrypt/adapters"
	"github.com/zcrypt/zcrypt/cmd"
	"github.com/zcrypt/zcrypt/config"
	"github.com/zcrypt/zcrypt/types"
)

func (ts *testServer) quiesceOtherChunks(userID string) {
	ts.t.Helper()
	_, err := ts.db.Pool().Exec(context.Background(),
		`UPDATE chunks SET sync_attempts = $2 WHERE remote_path = '' AND user_id <> $1 AND sync_attempts < $2`, userID, 12)
	require.NoError(ts.t, err)
}

func (ts *testServer) dropChunks(fileID string) {
	ts.t.Cleanup(func() {
		_, _ = ts.db.Pool().Exec(context.Background(), `DELETE FROM chunks WHERE file_id=$1`, fileID)
	})
}

func stagingFile(t *testing.T, chunkID string) string {
	t.Helper()
	dir, err := config.StagingDir()
	require.NoError(t, err)
	return filepath.Join(dir, chunkID+".enc")
}

func (ts *testServer) uploadRelayChunkWithoutSync(ctx context.Context, token, filename string) {
	ts.t.Helper()
	ts.uploadRelayChunkWithoutSyncID(ctx, token, filename)
}

func (ts *testServer) uploadRelayChunkWithoutSyncID(ctx context.Context, token, filename string) (fileID, chunkID string) {
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
		FileID    string `json:"file_id"`
	}
	require.NoError(ts.t, json.Unmarshal(initBody, &init))
	requireStatus(ts.t, ts.PUT("/api/upload/"+init.SessionID+"/chunk/0",
		[]byte("encrypted-chunk-payload-0123456789ABCDEF-"+filename), token), http.StatusOK)
	requireStatus(ts.t, ts.POST("/api/upload/"+init.SessionID+"/complete", map[string]interface{}{}, token), http.StatusOK)
	chunk, err := ts.db.GetChunkByIndex(ctx, init.FileID, 0)
	require.NoError(ts.t, err)
	return init.FileID, chunk.ChunkID
}

func TestBatchPlatformStagingKeptUntilCommitConfirmed(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("staging-keep@example.com", "SecurePass@123!")
	ts.quiesceOtherChunks(ts.userID(token))
	user, err := ts.db.GetUserByEmail(ctx, "staging-keep@example.com")
	require.NoError(t, err)

	batch := newMockBatchAdapter()
	ts.srv.InjectTestAdapter(user.ID, "mock", "testacct", batch, 10<<30)
	ts.quiesceOtherChunks(user.ID)

	fileID, chunkID := ts.uploadRelayChunkAwaitingCommit(ctx, token, "keep-"+uuid.NewString())
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
	ts.quiesceOtherChunks(ts.userID(token))
	ts.enableMockStorage("staging-drop@example.com")

	_, chunkID := ts.uploadRelayChunkAwaitingCommit(ctx, token, "drop-"+uuid.NewString())
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
	token := ts.registerAndLogin("hang-bound@example.com", "SecurePass@123!")
	ts.quiesceOtherChunks(ts.userID(token))
	user, err := ts.db.GetUserByEmail(ctx, "hang-bound@example.com")
	require.NoError(t, err)
	ts.srv.InjectTestAdapter(user.ID, "mock", "testacct", &hangAdapter{newMockAdapter()}, 10<<30)
	defer cmd.SetSyncChunkMaxDurationForTest(300 * time.Millisecond)()

	start := time.Now()
	hangFile, _ := ts.uploadRelayChunkWithoutSyncID(ctx, token, "hang-"+uuid.NewString())
	ts.dropChunks(hangFile)
	ts.srv.SyncPendingOnce(ctx)
	assert.Less(t, time.Since(start), 10*time.Second, "a hung platform call must not block the sync goroutine forever")
}

func TestUploadSessionExpiryExtendsWithEachChunk(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("session-expiry@example.com", "SecurePass@123!")
	ts.quiesceOtherChunks(ts.userID(token))
	ts.enableMockStorage("session-expiry@example.com")

	initBody := requireStatus(t, ts.POST("/api/upload/init", map[string]interface{}{
		"encrypted_name": "exp-" + uuid.NewString(), "original_size": 40, "sha256": hex64, "salt": validSalt, "chunk_count": 1,
	}, token), http.StatusOK)
	var init struct {
		SessionID string `json:"session_id"`
	}
	require.NoError(t, json.Unmarshal(initBody, &init))
	_, err := ts.db.Pool().Exec(ctx, `UPDATE upload_sessions SET expires_at = NOW() + INTERVAL '1 day' WHERE id=$1`, init.SessionID)
	require.NoError(t, err)

	pb := requireStatus(t, ts.PUT("/api/upload/"+init.SessionID+"/chunk/0",
		[]byte("encrypted-chunk-payload-0123456789ABCDEF-exp"), token), http.StatusOK)
	assert.NotContains(t, string(pb), "duplicate")

	var days float64
	require.NoError(t, ts.db.Pool().QueryRow(ctx,
		`SELECT EXTRACT(EPOCH FROM (expires_at - NOW()))/86400 FROM upload_sessions WHERE id=$1`, init.SessionID).Scan(&days))
	assert.Greater(t, days, 6.9, "a chunk landing must push the session expiry out to ~7 days")
}

func TestDuplicateChunkWithLostBytesIsResent(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("dup-lost@example.com", "SecurePass@123!")
	ts.quiesceOtherChunks(ts.userID(token))
	ts.enableMockStorage("dup-lost@example.com")

	initBody := requireStatus(t, ts.POST("/api/upload/init", map[string]interface{}{
		"encrypted_name": "dup-" + uuid.NewString(), "original_size": 40, "sha256": hex64, "salt": validSalt, "chunk_count": 1,
	}, token), http.StatusOK)
	var init struct {
		SessionID string `json:"session_id"`
		FileID    string `json:"file_id"`
	}
	require.NoError(t, json.Unmarshal(initBody, &init))
	payload := []byte("encrypted-chunk-payload-0123456789ABCDEF-dup")
	requireStatus(t, ts.PUT("/api/upload/"+init.SessionID+"/chunk/0", payload, token), http.StatusOK)

	chunk, err := ts.db.GetChunkByIndex(ctx, init.FileID, 0)
	require.NoError(t, err)
	ts.dropChunks(init.FileID)
	require.NoError(t, os.Remove(stagingFile(t, chunk.ChunkID)))

	body := requireStatus(t, ts.PUT("/api/upload/"+init.SessionID+"/chunk/0", payload, token), http.StatusOK)
	assert.NotContains(t, string(body), "duplicate", "lost bytes must not be reported as a stored duplicate")
	_, statErr := os.Stat(stagingFile(t, chunk.ChunkID))
	assert.NoError(t, statErr, "the re-sent bytes are staged again under the same chunk row")
}

func TestChunkDownloadWithNoBytesAnywhereIs503Pending(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("chunk-pending@example.com", "SecurePass@123!")
	ts.quiesceOtherChunks(ts.userID(token))
	ts.enableMockStorage("chunk-pending@example.com")
	fileID, chunkID := ts.uploadRelayChunkWithoutSyncID(ctx, token, "pending-"+uuid.NewString())
	ts.dropChunks(fileID)
	require.NoError(t, os.Remove(stagingFile(t, chunkID)))

	resp := ts.GET("/api/files/"+fileID+"/chunks/0", token)
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	assert.Equal(t, http.StatusServiceUnavailable, resp.StatusCode, string(body))
	assert.Contains(t, string(body), "chunk_pending")
}

func TestChunkDownloadResolvesSyncThenDeleteRace(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("chunk-race@example.com", "SecurePass@123!")
	ts.quiesceOtherChunks(ts.userID(token))
	mock := ts.enableMockStorage("chunk-race@example.com")
	fileID, chunkID := ts.uploadRelayChunkWithoutSyncID(ctx, token, "race-"+uuid.NewString())

	ts.srv.SyncAllChunks(ctx)
	_, statErr := os.Stat(stagingFile(t, chunkID))
	require.True(t, os.IsNotExist(statErr))
	require.Equal(t, 1, mock.uploadCount())

	resp := ts.GET("/api/files/"+fileID+"/chunks/0", token)
	body, _ := io.ReadAll(resp.Body)
	resp.Body.Close()
	assert.Equal(t, http.StatusOK, resp.StatusCode, string(body))
	assert.Contains(t, string(body), "encrypted-chunk-payload")
}

type unreachableListAdapter struct{ *mockAdapter }

func (unreachableListAdapter) ListChunks(context.Context, string) ([]types.ChunkRef, error) {
	return nil, fmt.Errorf("get tree: %w", adapters.ErrRepoNotFound)
}

func TestScheduledVerifyMarksDamagedAndClearsRecovered(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	email := "sched-verify-" + uuid.NewString()[:8] + "@example.com"
	token := ts.registerAndLogin(email, newTestPassword())
	ts.quiesceOtherChunks(ts.userID(token))
	mock := ts.enableMockStorage(email)
	lost := ts.uploadAndSync(ctx, token, "sl"+uuid.NewString()[:6], 2)
	intact := ts.uploadAndSync(ctx, token, "so"+uuid.NewString()[:6], 1)

	chunk, err := ts.db.GetChunkByIndex(ctx, lost, 1)
	require.NoError(t, err)
	data, err := mock.Download(ctx, *chunk)
	require.NoError(t, err)
	require.NoError(t, mock.Delete(ctx, *chunk))

	ts.srv.RunScheduledVerifyOnce(ctx)
	assert.Equal(t, "damaged", ts.fileHealth(lost), "the scheduled sweep finds a chunk missing on its platform")
	assert.Equal(t, "ok", ts.fileHealth(intact))

	_, err = mock.Upload(ctx, chunk.Repo, types.Chunk{Ref: types.ChunkRef{RemotePath: chunk.RemotePath, Size: chunk.Size}, Data: data})
	require.NoError(t, err)
	ts.srv.RunScheduledVerifyOnce(ctx)
	assert.Equal(t, "ok", ts.fileHealth(lost), "and clears it once the chunk is back")
}

func TestScheduledVerifyDoesNotMarkDamagedWhenRepoUnreachable(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	email := "sched-gone-" + uuid.NewString()[:8] + "@example.com"
	token := ts.registerAndLogin(email, newTestPassword())
	ts.quiesceOtherChunks(ts.userID(token))
	mock := ts.enableMockStorage(email)
	fileID := ts.uploadAndSync(ctx, token, "g"+uuid.NewString()[:6], 1)

	user, err := ts.db.GetUserByEmail(ctx, email)
	require.NoError(t, err)
	ts.srv.InjectTestAdapter(user.ID, "mock", "testacct", unreachableListAdapter{mock}, 10<<30)

	ts.srv.RunScheduledVerifyOnce(ctx)
	assert.Equal(t, "ok", ts.fileHealth(fileID), "a repo that cannot be listed says nothing about the chunks")
}

func TestAdminReconcileMarksMissingFilesDamaged(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	email := "recon-damage-" + uuid.NewString()[:8] + "@example.com"
	token := ts.registerAndLogin(email, newTestPassword())
	ts.quiesceOtherChunks(ts.userID(token))
	mock := ts.enableMockStorage(email)
	lost := ts.uploadAndSync(ctx, token, "rl"+uuid.NewString()[:6], 2)
	_ = ts.uploadAndSync(ctx, token, "ro"+uuid.NewString()[:6], 1)

	chunk, err := ts.db.GetChunkByIndex(ctx, lost, 1)
	require.NoError(t, err)
	require.NoError(t, mock.Delete(ctx, *chunk))

	report, err := ts.srv.ReconcileUserOrphans(ctx, ts.userID(token))
	require.NoError(t, err)
	assert.Equal(t, 1, report.TotalMissing)
	assert.Equal(t, 1, report.DamagedFiles)
	assert.Equal(t, "damaged", ts.fileHealth(lost), "reconcile must flag the file, not only report the count")
}
