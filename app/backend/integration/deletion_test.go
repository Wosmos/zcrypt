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

// countScalar runs a single-column COUNT/aggregate query and returns the int.
func (ts *testServer) countScalar(query string, args ...interface{}) int {
	ts.t.Helper()
	var n int
	err := ts.db.Pool().QueryRow(context.Background(), query, args...).Scan(&n)
	require.NoError(ts.t, err, "count query: %s", query)
	return n
}

// uploadAndSync uploads a file with the given number of chunks, drives the sync
// worker so the chunks reach the (mock) platform, and returns the file id.
func (ts *testServer) uploadAndSync(ctx context.Context, token, filename string, chunks int) string {
	ts.t.Helper()
	initBody := requireStatus(ts.t, ts.POST("/api/upload/init", map[string]interface{}{
		"filename":      filename,
		"original_size": 40 * chunks,
		"sha256":        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		"salt":          validSalt,
		"chunk_count":   chunks,
	}, token), http.StatusOK)
	var init struct {
		SessionID string `json:"session_id"`
		FileID    string `json:"file_id"`
	}
	require.NoError(ts.t, json.Unmarshal(initBody, &init))

	for i := 0; i < chunks; i++ {
		// Body must be >= 28 bytes (12B IV + 16B GCM tag) to pass validation.
		payload := []byte("encrypted-chunk-payload-0123456789ABCDEF-" + filename)
		requireStatus(ts.t, ts.PUT(
			"/api/upload/"+init.SessionID+"/chunk/"+strconv.Itoa(i), payload, token), http.StatusOK)
	}
	requireStatus(ts.t, ts.POST(
		"/api/upload/"+init.SessionID+"/complete", map[string]interface{}{}, token), http.StatusOK)

	ts.srv.SyncAllChunks(ctx)
	return init.FileID
}

// TestPurgeDeletesBlobsFromPlatform is the end-to-end guarantee: once a file is
// purged and the deletion worker drains, NOTHING remains on the platform for it.
func TestPurgeDeletesBlobsFromPlatform(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("purge@example.com", "SecurePass@123!")
	mock := ts.enableMockStorage("purge@example.com")

	fileID := ts.uploadAndSync(ctx, token, "secret.bin", 2)

	// After sync, both chunks are on the platform and marked synced in the DB.
	require.Equal(t, 2, mock.blobCount(), "both chunks should be on the platform after sync")
	require.Equal(t, 2, ts.countScalar(
		`SELECT count(*) FROM chunks WHERE file_id=$1 AND remote_path <> ''`, fileID),
		"both chunk rows should be marked synced")

	// Purge (hard delete). DB rows go immediately; platform deletions are queued.
	requireStatus(t, ts.DELETE("/api/files/"+fileID+"/purge", token), http.StatusOK)

	assert.Zero(t, ts.countScalar(`SELECT count(*) FROM chunks WHERE file_id=$1`, fileID),
		"chunk rows removed synchronously on purge")
	assert.Zero(t, ts.countScalar(`SELECT count(*) FROM files WHERE id=$1`, fileID),
		"file row removed synchronously on purge")
	require.Equal(t, 2, ts.countScalar(`SELECT count(*) FROM pending_deletions`),
		"both synced chunks queued for platform deletion")
	require.Equal(t, 2, mock.blobCount(),
		"blobs still on the platform until the deletion worker runs")

	// Drain the deletion worker.
	ts.srv.DrainDeletions(ctx)

	assert.Equal(t, 0, mock.blobCount(), "blobs must be deleted from the platform")
	assert.Equal(t, 2, mock.deleteCount(), "Delete called exactly once per chunk")
	assert.Zero(t, ts.countScalar(`SELECT count(*) FROM pending_deletions`),
		"deletion queue fully drained")
}

// TestPurgeDeletesCrashWindowBlob proves the orphan-prevention guarantee: a blob
// written to the platform in the crash window — after adapter.Upload succeeded but
// before remote_path was committed — is STILL deleted on purge, via the
// planned_remote_path fallback. Without it, such a blob would be a permanent,
// untrackable orphan (its disguised path was random and never recorded).
//
// A normal sync sets planned_remote_path == remote_path (the worker records the
// plan before uploading, then uses the same path), so the crash state is
// reproduced faithfully by clearing ONLY remote_path: the blob stays on the mock
// at the planned path, exactly as a real crash would leave it.
func TestPurgeDeletesCrashWindowBlob(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("crash@example.com", "SecurePass@123!")
	mock := ts.enableMockStorage("crash@example.com")

	fileID := ts.uploadAndSync(ctx, token, "crashed.bin", 1)
	require.Equal(t, 1, mock.blobCount(), "blob on platform after sync")

	// Simulate the crash: upload landed, remote_path never committed. planned
	// stays set, the blob stays on the platform.
	_, err := ts.db.Pool().Exec(ctx,
		`UPDATE chunks SET remote_path = '' WHERE file_id = $1`, fileID)
	require.NoError(t, err)
	require.Equal(t, 1, ts.countScalar(
		`SELECT count(*) FROM chunks WHERE file_id=$1 AND remote_path='' AND planned_remote_path<>''`, fileID),
		"chunk is now in the crash state: remote_path empty, planned set")
	require.Equal(t, 1, mock.blobCount(), "blob still physically on the platform")

	// Purge. The queueing must fall back to planned_remote_path.
	requireStatus(t, ts.DELETE("/api/files/"+fileID+"/purge", token), http.StatusOK)
	require.Equal(t, 1, ts.countScalar(`SELECT count(*) FROM pending_deletions`),
		"crash-window blob queued for deletion via planned_remote_path fallback")

	ts.srv.DrainDeletions(ctx)
	assert.Equal(t, 0, mock.blobCount(), "crash-window blob must be deleted from the platform")
	assert.Zero(t, ts.countScalar(`SELECT count(*) FROM pending_deletions`), "queue drained")
}

// TestReconcileReportsOrphansWithoutDeleting proves the report-only sweep: a blob
// physically on the platform that no DB row references is flagged as an orphan,
// live blobs are NOT flagged, and NOTHING is deleted (the sweep is diagnostic).
func TestReconcileReportsOrphansWithoutDeleting(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("reconcile@example.com", "SecurePass@123!")
	mock := ts.enableMockStorage("reconcile@example.com")

	ts.uploadAndSync(ctx, token, "kept.bin", 2) // 2 legit, DB-tracked blobs

	user, err := ts.db.GetUserByEmail(ctx, "reconcile@example.com")
	require.NoError(t, err)

	// Find the repo the chunks landed in and plant an orphan the DB knows nothing about.
	var repoURL string
	require.NoError(t, ts.db.Pool().QueryRow(ctx,
		`SELECT url FROM repos WHERE user_id=$1 AND platform='mock' LIMIT 1`, user.ID).Scan(&repoURL))
	mock.seedOrphan(repoURL, "99/deadbeefcafe01.bin")
	require.Equal(t, 3, mock.blobCount(), "2 live + 1 planted orphan")

	report, err := ts.srv.ReconcileUserOrphans(ctx, user.ID)
	require.NoError(t, err)

	assert.Equal(t, 1, report.TotalOrphans, "exactly the planted orphan is flagged")
	var found bool
	for _, rr := range report.Repos {
		if rr.Repo != repoURL {
			continue
		}
		found = true
		assert.True(t, rr.Listable)
		assert.Equal(t, 3, rr.RemoteBlobs, "all three blobs seen on the platform")
		assert.Equal(t, 2, rr.KnownPaths, "two blobs are DB-tracked")
		assert.Equal(t, 1, rr.OrphanCount)
		assert.Contains(t, rr.Orphans, "99/deadbeefcafe01.bin", "the planted orphan is named")
	}
	require.True(t, found, "the mock repo appears in the report")

	// Report-only: nothing was deleted and nothing was queued.
	assert.Equal(t, 3, mock.blobCount(), "reconcile must not delete any blob")
	assert.Zero(t, ts.countScalar(`SELECT count(*) FROM pending_deletions`),
		"reconcile must not queue any deletion")
}

// TestDeletionRetriesOnPlatformFailure proves a failed platform delete does NOT
// silently drop the blob: the item stays queued (attempts bumped) and the next
// drain cleans it up once the platform recovers.
func TestDeletionRetriesOnPlatformFailure(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("retry@example.com", "SecurePass@123!")
	mock := ts.enableMockStorage("retry@example.com")

	fileID := ts.uploadAndSync(ctx, token, "flaky.bin", 1)
	require.Equal(t, 1, mock.blobCount())

	// Platform rejects deletes; purge and drain.
	mock.setFailDeletes(true)
	requireStatus(t, ts.DELETE("/api/files/"+fileID+"/purge", token), http.StatusOK)
	ts.srv.DrainDeletions(ctx)

	assert.Equal(t, 1, mock.blobCount(), "failed delete must leave the blob in place")
	assert.Equal(t, 1, ts.countScalar(`SELECT count(*) FROM pending_deletions`),
		"item remains queued for retry")
	assert.GreaterOrEqual(t, ts.countScalar(`SELECT coalesce(max(attempts),0) FROM pending_deletions`), 1,
		"a failed attempt was recorded")

	// Platform recovers; the next drain clears it.
	mock.setFailDeletes(false)
	ts.srv.DrainDeletions(ctx)

	assert.Equal(t, 0, mock.blobCount(), "blob deleted once the platform recovers")
	assert.Zero(t, ts.countScalar(`SELECT count(*) FROM pending_deletions`),
		"queue drained after recovery")
}
