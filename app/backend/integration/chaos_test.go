//go:build integration

package integration_test

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestSyncRecoversFromTransientAdapterFailures proves the retry lane works as
// designed: a run of chunks that fail for a while (not "repository not
// found", just an ordinary transient error) eventually all land once the
// platform recovers, with nothing silently dropped.
func TestSyncRecoversFromTransientAdapterFailures(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("transient@example.com", "SecurePass@123!")
	mock := ts.enableMockStorage("transient@example.com")

	const chunkCount = 4
	initBody := requireStatus(t, ts.POST("/api/upload/init", map[string]interface{}{
		"filename":      "flaky-run.bin",
		"original_size": 40 * chunkCount,
		"sha256":        hex64,
		"salt":          validSalt,
		"chunk_count":   chunkCount,
	}, token), http.StatusOK)
	var init struct {
		SessionID string `json:"session_id"`
		FileID    string `json:"file_id"`
	}
	require.NoError(t, json.Unmarshal(initBody, &init))

	for i := 0; i < chunkCount; i++ {
		requireStatus(t, ts.PUT("/api/upload/"+init.SessionID+"/chunk/"+strconv.Itoa(i),
			[]byte("encrypted-chunk-payload-0123456789ABCDEF-"+strconv.Itoa(i)), token), http.StatusOK)
	}

	// Fail exactly as many upload attempts as there are chunks (one failed
	// round), then recover: the very next round succeeds for all of them.
	mock.setFailUploadsTransient(chunkCount)

	ts.srv.SyncAllChunks(ctx)

	assert.Zero(t, ts.countScalar(
		`SELECT count(*) FROM chunks WHERE file_id=$1 AND remote_path=''`, init.FileID),
		"every chunk must eventually sync once the platform recovers, none dropped")
	assert.Equal(t, chunkCount, mock.blobCount())
}

// TestSyncSurfacesPermanentAdapterFailureAsStuck exercises the OTHER side of
// the same coin: a platform that never recovers. The chunks are left
// unsynced (remote_path empty, sync_attempts at the cap) rather than
// silently vanishing -- but this test also surfaces a real gap: nothing in
// the client-visible upload-complete/status flow distinguishes "received and
// durably stored" from "received but never reached the platform". Complete
// and status both report success/100% based only on GetReceivedChunkIndices,
// which counts staged rows regardless of remote_path. This is the same shape
// of risk as the historical HuggingFace silent-loss bug, just for a platform
// this repo has no batch-commit verification for.
func TestSyncSurfacesPermanentAdapterFailureAsStuck(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("permanentfail@example.com", "SecurePass@123!")
	mock := ts.enableMockStorage("permanentfail@example.com")

	const chunkCount = 3
	initBody := requireStatus(t, ts.POST("/api/upload/init", map[string]interface{}{
		"filename":      "dead-platform.bin",
		"original_size": 40 * chunkCount,
		"sha256":        hex64,
		"salt":          validSalt,
		"chunk_count":   chunkCount,
	}, token), http.StatusOK)
	var init struct {
		SessionID string `json:"session_id"`
		FileID    string `json:"file_id"`
	}
	require.NoError(t, json.Unmarshal(initBody, &init))

	for i := 0; i < chunkCount; i++ {
		requireStatus(t, ts.PUT("/api/upload/"+init.SessionID+"/chunk/"+strconv.Itoa(i),
			[]byte("encrypted-chunk-payload-0123456789ABCDEF-"+strconv.Itoa(i)), token), http.StatusOK)
	}

	mock.setFailUploadsPermanent("simulated permanent platform outage")
	ts.srv.SyncAllChunks(ctx)

	assert.Equal(t, chunkCount, ts.countScalar(
		`SELECT count(*) FROM chunks WHERE file_id=$1 AND remote_path=''`, init.FileID),
		"all chunks stay visibly unsynced in the DB, not silently lost")
	assert.Zero(t, mock.blobCount(), "nothing actually reached the platform")

	// The gap: the client-facing flow doesn't know or care.
	requireStatus(t, ts.POST("/api/upload/"+init.SessionID+"/complete", map[string]interface{}{}, token), http.StatusOK)
	status := requireStatus(t, ts.GET("/api/upload/"+init.SessionID+"/status", token), http.StatusOK)
	var statusResult struct {
		CompletedCount int `json:"completed_count"`
	}
	require.NoError(t, json.Unmarshal(status, &statusResult))
	assert.Equal(t, chunkCount, statusResult.CompletedCount,
		"status reports full completion even though zero chunks are durable on any platform")
}

// TestCreateRepoFailureLeavesNoOrphanedSession proves a platform that rejects
// new repo creation fails HandleUploadInit cleanly, BEFORE any file or
// session row is written (cmd/upload.go:233-238 returns before InsertFile),
// so a client retry starts genuinely fresh with nothing to clean up.
func TestCreateRepoFailureLeavesNoOrphanedSession(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("createrepofail@example.com", "SecurePass@123!")
	user, err := ts.db.GetUserByEmail(ctx, "createrepofail@example.com")
	require.NoError(t, err)

	mock := newMockAdapter()
	mock.setFailCreateRepo(true)
	ts.srv.InjectTestAdapter(user.ID, "mock", "testacct", mock, 10<<30)

	resp := ts.POST("/api/upload/init", map[string]interface{}{
		"filename":      "neverstarts.bin",
		"original_size": 40,
		"sha256":        hex64,
		"salt":          validSalt,
		"chunk_count":   1,
	}, token)
	assert.Equal(t, http.StatusInternalServerError, resp.StatusCode)
	resp.Body.Close()

	assert.Zero(t, ts.countScalar(`SELECT count(*) FROM files WHERE user_id=$1`, user.ID),
		"no file row must be created when repo creation fails")
	assert.Zero(t, ts.countScalar(`SELECT count(*) FROM upload_sessions WHERE user_id=$1`, user.ID),
		"no orphaned upload session must be created when repo creation fails")
}

// TestCancelDuringInFlightUploadQueuesOrphanBlob exercises the already-defended
// "chunk row vanished while this upload was in flight" branch
// (cmd/sync_worker.go:303-316): the user cancels while the sync worker's
// adapter.Upload call for that exact chunk is still blocked, so the DB row is
// gone by the time the upload finally lands. The blob must be queued for
// deletion (via sync_worker's own fallback, and/or DeleteFile's
// planned_remote_path fallback which already ran during cancel) rather than
// becoming a silent, permanent orphan.
func TestCancelDuringInFlightUploadQueuesOrphanBlob(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("cancelrace@example.com", "SecurePass@123!")
	user, err := ts.db.GetUserByEmail(ctx, "cancelrace@example.com")
	require.NoError(t, err)

	mock := newMockAdapter()
	ts.srv.InjectTestAdapter(user.ID, "mock", "testacct", mock, 10<<30)
	t.Cleanup(func() { ts.clearUserDeletions(ctx, user.ID) })

	initBody := requireStatus(t, ts.POST("/api/upload/init", map[string]interface{}{
		"filename":      "racer.bin",
		"original_size": 40,
		"sha256":        hex64,
		"salt":          validSalt,
		"chunk_count":   1,
	}, token), http.StatusOK)
	var init struct {
		SessionID string `json:"session_id"`
		FileID    string `json:"file_id"`
	}
	require.NoError(t, json.Unmarshal(initBody, &init))

	requireStatus(t, ts.PUT("/api/upload/"+init.SessionID+"/chunk/0",
		[]byte("encrypted-chunk-payload-0123456789ABCDEF"), token), http.StatusOK)

	entered := make(chan struct{}, 1)
	gate := make(chan struct{})
	mock.setUploadGate(entered, gate)

	done := make(chan struct{})
	go func() {
		defer close(done)
		ts.srv.SyncAllChunks(ctx)
	}()

	<-entered // Upload is now blocked "mid-flight" to the platform.

	// Cancel while the blob is still being written to the "platform".
	requireStatus(t, ts.DELETE("/api/upload/"+init.SessionID, token), http.StatusOK)
	assert.Zero(t, ts.countScalar(`SELECT count(*) FROM chunks WHERE file_id=$1`, init.FileID),
		"the chunk row is gone (cascaded by file deletion) while the upload is still in flight")

	close(gate) // let the blocked Upload complete.
	<-done

	assert.Equal(t, 1, mock.blobCount(), "the blob DID land on the platform, after the DB row was already gone")
	assert.GreaterOrEqual(t, ts.countScalar(`SELECT count(*) FROM pending_deletions`), 1,
		"the orphaned blob must be queued for deletion instead of leaking silently")

	ts.srv.DrainDeletions(ctx)
	assert.Zero(t, mock.blobCount(), "the orphan must actually get cleaned up, not just queued")
}
