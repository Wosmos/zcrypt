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

// TestPresignHealDeadRepoRotatesSession proves the REAL mechanism behind "an
// upload session spans two repos": it is NOT the reppool threshold (that only
// affects the next session that calls GetOrCreateRepo, see
// TestThresholdRotationIsInterSessionOnly) -- it is healDeadRepo
// (cmd/upload.go:889), wired into exactly one call site, HandlePresignChunk
// (cmd/upload.go:834), triggered when the platform reports the session's repo
// itself is gone ("repository not found").
func TestPresignHealDeadRepoRotatesSession(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("healrepo@example.com", "SecurePass@123!")
	user, err := ts.db.GetUserByEmail(ctx, "healrepo@example.com")
	require.NoError(t, err)

	direct := newMockDirectAdapter()
	ts.srv.InjectTestAdapter(user.ID, "mock", "testacct", direct, 10<<30)

	initBody := requireStatus(t, ts.POST("/api/upload/init", map[string]interface{}{
		"filename":      "healed.bin",
		"original_size": 80,
		"sha256":        hex64,
		"salt":          validSalt,
		"chunk_count":   2,
	}, token), http.StatusOK)
	var init struct {
		SessionID    string `json:"session_id"`
		RepoURL      string `json:"repo_url"`
		DirectUpload bool   `json:"direct_upload"`
	}
	require.NoError(t, json.Unmarshal(initBody, &init))
	require.True(t, init.DirectUpload, "a DirectUploader-capable adapter must route this upload direct (presign), not relay")
	oldRepoURL := init.RepoURL
	require.NotEmpty(t, oldRepoURL)

	// The platform has removed this repo out from under the session.
	direct.setDeadRepo(oldRepoURL)

	presignBody := requireStatus(t, ts.POST("/api/upload/"+init.SessionID+"/presign/0",
		map[string]interface{}{"sha256": hex64, "size": 40}, token), http.StatusOK)
	var presign struct {
		UploadURL  string `json:"upload_url"`
		RemotePath string `json:"remote_path"`
	}
	require.NoError(t, json.Unmarshal(presignBody, &presign))
	assert.NotEmpty(t, presign.UploadURL, "self-heal must succeed and still return a usable upload URL")

	// The session moved to a NEW repo.
	updated, err := ts.db.GetUploadSession(ctx, init.SessionID, user.ID)
	require.NoError(t, err)
	assert.NotEqual(t, oldRepoURL, updated.RepoURL, "healDeadRepo must repoint the session to a fresh repo")

	// The old repo is deactivated so the pool never routes to it again.
	var oldActive bool
	require.NoError(t, ts.db.Pool().QueryRow(ctx, `SELECT active FROM repos WHERE url=$1`, oldRepoURL).Scan(&oldActive))
	assert.False(t, oldActive, "the dead repo must be deactivated")

	// A second presign for the next chunk goes straight to the new repo, no
	// further self-heal needed (deadRepo only matches the old URL).
	presignBody2 := requireStatus(t, ts.POST("/api/upload/"+init.SessionID+"/presign/1",
		map[string]interface{}{"sha256": hex64, "size": 40}, token), http.StatusOK)
	var presign2 struct {
		UploadURL string `json:"upload_url"`
	}
	require.NoError(t, json.Unmarshal(presignBody2, &presign2))
	assert.NotEmpty(t, presign2.UploadURL)
}

// TestRelayModeHasNoSelfHealForDeadRepo documents CURRENT behavior: unlike the
// presign path, relay-mode uploads (GitHub/GitLab/Telegram today, and the
// background sync worker generally) have healDeadRepo wired in nowhere. A
// "repository not found" error from the adapter is treated as an ordinary
// retryable failure: the sync worker retries the SAME dead repo until
// maxSyncAttempts, then gives up with the chunk permanently stuck
// (remote_path still empty), rather than rotating to a new repo. This is a
// verified asymmetry, not an assumption -- see cmd/upload.go:834 (only
// HandlePresignChunk calls healDeadRepo) vs cmd/sync_worker.go's syncOneChunk
// (no isRepoNotFound check at all). If relay-mode self-heal is added later,
// this test's expectations flip and it becomes the regression test for that
// fix.
func TestRelayModeHasNoSelfHealForDeadRepo(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("relaynoheal@example.com", "SecurePass@123!")
	mock := ts.enableMockStorage("relaynoheal@example.com")

	// The relay path's adapter reports the repo itself is gone on every
	// attempt -- the same error shape isRepoNotFound checks for on the
	// presign path, proving this is about missing wiring, not error shape.
	mock.setFailUploadsPermanent("repository not found")

	initBody := requireStatus(t, ts.POST("/api/upload/init", map[string]interface{}{
		"filename":      "stuck.bin",
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

	// Drains the sync queue; GetPendingChunks excludes a chunk once its
	// sync_attempts hits the cap, so one call exhausts all retries.
	ts.srv.SyncAllChunks(ctx)

	assert.Equal(t, 1, ts.countScalar(
		`SELECT count(*) FROM chunks WHERE file_id=$1 AND remote_path=''`, init.FileID),
		"the chunk stays stuck: relay mode never rotates off the dead repo")
	assert.GreaterOrEqual(t, ts.countScalar(
		`SELECT sync_attempts FROM chunks WHERE file_id=$1`, init.FileID), 8,
		"it exhausted the retry cap fighting the same dead repo instead of self-healing")

	// The gap this surfaces: HandleUploadComplete only checks that every chunk
	// was RECEIVED (staged), not that it actually reached the platform, so the
	// client-visible flow reports success even though the data never landed.
	requireStatus(t, ts.POST("/api/upload/"+init.SessionID+"/complete", map[string]interface{}{}, token), http.StatusOK)
	status := requireStatus(t, ts.GET("/api/upload/"+init.SessionID+"/status", token), http.StatusOK)
	var statusResult struct {
		CompletedCount int `json:"completed_count"`
	}
	require.NoError(t, json.Unmarshal(status, &statusResult))
	assert.Equal(t, 1, statusResult.CompletedCount,
		"status reports the chunk as done because it was staged, with no signal that it never reached the platform")
}

// TestReconcileNoFalsePositiveAcrossMultiRepoSession proves a session whose
// chunks genuinely landed on two DIFFERENT repos (via a mid-session
// healDeadRepo) doesn't confuse the per-repo orphan diff: each repo's known
// paths are exactly what commitAndVerify confirmed for it, and reconcile finds
// zero orphans on either.
func TestReconcileNoFalsePositiveAcrossMultiRepoSession(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("multirepo@example.com", "SecurePass@123!")
	user, err := ts.db.GetUserByEmail(ctx, "multirepo@example.com")
	require.NoError(t, err)

	direct := newMockDirectAdapter()
	ts.srv.InjectTestAdapter(user.ID, "mock", "testacct", direct, 10<<30)

	initBody := requireStatus(t, ts.POST("/api/upload/init", map[string]interface{}{
		"filename":      "spans-two-repos.bin",
		"original_size": 80,
		"sha256":        hex64,
		"salt":          validSalt,
		"chunk_count":   2,
	}, token), http.StatusOK)
	var init struct {
		SessionID string `json:"session_id"`
		FileID    string `json:"file_id"`
		RepoURL   string `json:"repo_url"`
	}
	require.NoError(t, json.Unmarshal(initBody, &init))
	repoA := init.RepoURL

	// Chunk 0 lands cleanly on repo A.
	p0 := requireStatus(t, ts.POST("/api/upload/"+init.SessionID+"/presign/0",
		map[string]interface{}{"sha256": hex64, "size": 40}, token), http.StatusOK)
	var presign0 struct {
		RemotePath string `json:"remote_path"`
	}
	require.NoError(t, json.Unmarshal(p0, &presign0))
	requireStatus(t, ts.POST("/api/upload/"+init.SessionID+"/confirm/0", map[string]interface{}{
		"sha256": hex64, "size": 40, "remote_path": presign0.RemotePath,
	}, token), http.StatusOK)

	// Repo A is removed from under the session before chunk 1.
	direct.setDeadRepo(repoA)
	p1 := requireStatus(t, ts.POST("/api/upload/"+init.SessionID+"/presign/1",
		map[string]interface{}{"sha256": hex64, "size": 40}, token), http.StatusOK)
	var presign1 struct {
		RemotePath string `json:"remote_path"`
	}
	require.NoError(t, json.Unmarshal(p1, &presign1))
	requireStatus(t, ts.POST("/api/upload/"+init.SessionID+"/confirm/1", map[string]interface{}{
		"sha256": hex64, "size": 40, "remote_path": presign1.RemotePath,
	}, token), http.StatusOK)

	updated, err := ts.db.GetUploadSession(ctx, init.SessionID, user.ID)
	require.NoError(t, err)
	require.NotEqual(t, repoA, updated.RepoURL, "sanity: the session really did move to a second repo")
	require.Equal(t, 2, ts.countScalar(
		`SELECT count(DISTINCT repo) FROM chunks WHERE file_id=$1`, init.FileID),
		"the two chunks really landed on two different repos")

	// Drives commitAndVerify (one commit+verify group per repo, since its
	// groupKey includes repo), populating each repo's ListChunks state to
	// match what got confirmed.
	ts.srv.ReconcileAllUncommitted(ctx)

	report, err := ts.srv.ReconcileUserOrphans(ctx, user.ID)
	require.NoError(t, err)
	assert.Zero(t, report.TotalOrphans, "no false-positive orphans when a session's chunks are split across two repos")
}
