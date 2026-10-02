//go:build integration

package integration_test

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/zcrypt/zcrypt/config"
	"github.com/zcrypt/zcrypt/types"
)

// initRelayUpload opens a relay session and stages `chunks` chunks.
func (ts *testServer) initRelayUpload(token, filename string, chunks int) (sessionID, fileID string) {
	ts.t.Helper()
	var init struct {
		SessionID string `json:"session_id"`
		FileID    string `json:"file_id"`
	}
	require.NoError(ts.t, json.Unmarshal(requireStatus(ts.t, ts.POST("/api/upload/init", map[string]interface{}{
		"filename":      filename,
		"original_size": 40 * chunks,
		"sha256":        hex64,
		"salt":          validSalt,
		"chunk_count":   chunks,
	}, token), http.StatusOK), &init))
	for i := 0; i < chunks; i++ {
		requireStatus(ts.t, ts.PUT("/api/upload/"+init.SessionID+"/chunk/"+strconv.Itoa(i),
			[]byte("encrypted-chunk-payload-0123456789ABCDEF-"+filename+strconv.Itoa(i)), token), http.StatusOK)
	}
	return init.SessionID, init.FileID
}

func (ts *testServer) fileHealth(fileID string) string {
	ts.t.Helper()
	var h string
	require.NoError(ts.t, ts.db.Pool().QueryRow(context.Background(),
		`SELECT health FROM files WHERE id = $1`, fileID).Scan(&h))
	return h
}

// listedHealth returns the health the file list API reports for a file.
func (ts *testServer) listedHealth(token, fileID string) string {
	ts.t.Helper()
	var files []struct {
		ID     string `json:"id"`
		Health string `json:"health"`
	}
	require.NoError(ts.t, json.Unmarshal(requireStatus(ts.t, ts.GET("/api/files", token), http.StatusOK), &files))
	for _, f := range files {
		if f.ID == fileID {
			return f.Health
		}
	}
	ts.t.Fatalf("file %s not in listing", fileID)
	return ""
}

// DATA-01: one failed attempt must schedule the next one in the future instead
// of being re-selected immediately (which burned all retries in seconds).
func TestSyncFailureBacksOffInsteadOfBurningRetries(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("backoff@example.com", "SecurePass@123!")
	mock := ts.enableMockStorage("backoff@example.com")
	_, fileID := ts.initRelayUpload(token, "backoff.bin", 1)

	mock.setFailUploadsPermanent("simulated outage")
	for i := 0; i < 5; i++ {
		ts.srv.SyncPendingOnce(ctx)
	}

	assert.Equal(t, 1, ts.countScalar(`SELECT sync_attempts FROM chunks WHERE file_id=$1`, fileID),
		"back-to-back passes must not retry a chunk before its backoff elapses")
	assert.Equal(t, 1, ts.countScalar(
		`SELECT count(*) FROM chunks WHERE file_id=$1 AND next_attempt_at > NOW() + interval '10 seconds'`, fileID),
		"the failed attempt schedules the next one into the future")

	mock.setFailUploadsTransient(0)
	ts.srv.ExpireSyncBackoff(ctx)
	ts.srv.SyncPendingOnce(ctx)
	assert.Zero(t, ts.countScalar(`SELECT count(*) FROM chunks WHERE file_id=$1 AND remote_path=''`, fileID),
		"once due, the chunk is retried and lands")
}

// DATA-01: a rate-limited / 5xx platform pauses the rest of its queue for the
// backoff window without spending those chunks' attempts.
func TestPlatformOutagePausesQueueWithoutSpendingAttempts(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("outage@example.com", "SecurePass@123!")
	mock := ts.enableMockStorage("outage@example.com")
	_, fileID := ts.initRelayUpload(token, "outage.bin", 3)

	mock.setFailUploadsPermanent("503 Service Unavailable")
	ts.srv.SyncPendingOnce(ctx)

	assert.Equal(t, 1, ts.countScalar(`SELECT COALESCE(SUM(sync_attempts), 0) FROM chunks WHERE file_id=$1`, fileID),
		"only the chunk that hit the outage spends an attempt")
	assert.Equal(t, 3, ts.countScalar(
		`SELECT count(*) FROM chunks WHERE file_id=$1 AND next_attempt_at > NOW()`, fileID),
		"the whole platform queue waits out the outage")
	assert.False(t, ts.srv.SyncPendingOnce(ctx), "nothing is due while the platform is paused")
}

// DATA-01: a chunk that exhausts its budget marks its file degraded (visible in
// the list), and the retry action gives it a fresh budget that can succeed.
func TestExhaustedSyncMarksFileDegradedAndRetryRecovers(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("degraded@example.com", "SecurePass@123!")
	mock := ts.enableMockStorage("degraded@example.com")
	sessionID, fileID := ts.initRelayUpload(token, "degraded.bin", 1)
	requireStatus(t, ts.POST("/api/upload/"+sessionID+"/complete", map[string]interface{}{}, token), http.StatusOK)

	mock.setFailUploadsPermanent("simulated permanent failure")
	ts.srv.SyncAllChunks(ctx)

	assert.Equal(t, "degraded", ts.fileHealth(fileID))
	assert.Equal(t, "degraded", ts.listedHealth(token, fileID), "the list API surfaces the degraded state")

	mock.setFailUploadsTransient(0)
	var res struct {
		Requeued int `json:"requeued"`
	}
	require.NoError(t, json.Unmarshal(requireStatus(t,
		ts.POST("/api/files/"+fileID+"/retry-sync", map[string]interface{}{}, token), http.StatusOK), &res))
	assert.Equal(t, 1, res.Requeued)
	assert.Equal(t, "ok", ts.fileHealth(fileID))

	ts.srv.SyncAllChunks(ctx)
	assert.Zero(t, ts.countScalar(`SELECT count(*) FROM chunks WHERE file_id=$1 AND (remote_path='' OR NOT committed)`, fileID),
		"after a retry the chunk is synced and committed")
}

func TestRetrySyncRejectsAnotherUsersFile(t *testing.T) {
	ts := setupTestServer(t)
	owner := ts.registerAndLogin("retryowner@example.com", "SecurePass@123!")
	ts.enableMockStorage("retryowner@example.com")
	other := ts.registerAndLogin("retryother@example.com", "SecurePass@123!")
	_, fileID := ts.initRelayUpload(owner, "mine.bin", 1)

	requireStatus(t, ts.POST("/api/files/"+fileID+"/retry-sync", map[string]interface{}{}, other), http.StatusNotFound)
}

// DATA-02: a committed chunk the platform no longer has is lost data: 410 (not a
// retryable 500) and the file is marked damaged.
func TestDownloadOfMissingChunkReturnsGoneAndMarksDamaged(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("gone@example.com", "SecurePass@123!")
	mock := ts.enableMockStorage("gone@example.com")
	fileID := ts.uploadAndSync(ctx, token, "gone.bin", 1)

	chunk, err := ts.db.GetChunkByIndex(ctx, fileID, 0)
	require.NoError(t, err)
	require.True(t, chunk.Committed)
	require.NoError(t, mock.Delete(ctx, *chunk))

	body := requireStatus(t, ts.GET("/api/files/"+fileID+"/chunks/0", token), http.StatusGone)
	assert.Contains(t, string(body), "chunk_missing")
	assert.Equal(t, "damaged", ts.fileHealth(fileID))
	assert.Equal(t, "damaged", ts.listedHealth(token, fileID))
}

// DATA-02: a chunk whose commit was never verified may still be landing, so a
// 404 for it stays retryable and does not brand the file damaged.
func TestDownloadOfUncommittedMissingChunkIsRetryable(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("pending@example.com", "SecurePass@123!")
	mock := ts.enableMockStorage("pending@example.com")
	fileID := ts.uploadAndSync(ctx, token, "pending.bin", 1)

	chunk, err := ts.db.GetChunkByIndex(ctx, fileID, 0)
	require.NoError(t, err)
	require.NoError(t, mock.Delete(ctx, *chunk))
	_, err = ts.db.Pool().Exec(ctx, `UPDATE chunks SET committed = FALSE WHERE chunk_id = $1`, chunk.ChunkID)
	require.NoError(t, err)

	requireStatus(t, ts.GET("/api/files/"+fileID+"/chunks/0", token), http.StatusServiceUnavailable)
	assert.Equal(t, "ok", ts.fileHealth(fileID))
}

// DATA-02: the user-run verify sweep finds chunks the DB thinks are durable but
// the platform lost, and clears the flag once they are back.
func TestVerifyFilesMarksMissingDamagedAndClearsRecovered(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("verify@example.com", "SecurePass@123!")
	mock := ts.enableMockStorage("verify@example.com")
	lost := ts.uploadAndSync(ctx, token, "lost.bin", 2)
	intact := ts.uploadAndSync(ctx, token, "intact.bin", 1)

	chunk, err := ts.db.GetChunkByIndex(ctx, lost, 1)
	require.NoError(t, err)
	data, err := mock.Download(ctx, *chunk)
	require.NoError(t, err)
	require.NoError(t, mock.Delete(ctx, *chunk))

	var report struct {
		CheckedFiles   int      `json:"checked_files"`
		DamagedFiles   []string `json:"damaged_files"`
		RecoveredFiles []string `json:"recovered_files"`
	}
	require.NoError(t, json.Unmarshal(requireStatus(t,
		ts.POST("/api/files/verify", map[string]interface{}{}, token), http.StatusOK), &report))
	assert.Equal(t, 2, report.CheckedFiles)
	assert.Equal(t, []string{lost}, report.DamagedFiles)
	assert.Equal(t, "damaged", ts.fileHealth(lost))
	assert.Equal(t, "ok", ts.fileHealth(intact))

	_, err = mock.Upload(ctx, chunk.Repo, types.Chunk{Ref: types.ChunkRef{RemotePath: chunk.RemotePath, Size: chunk.Size}, Data: data})
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal(requireStatus(t,
		ts.POST("/api/files/verify", map[string]interface{}{}, token), http.StatusOK), &report))
	assert.Empty(t, report.DamagedFiles)
	assert.Equal(t, []string{lost}, report.RecoveredFiles)
	assert.Equal(t, "ok", ts.fileHealth(lost))

	adminReport, err := ts.srv.ReconcileUserOrphans(ctx, ts.userID(token))
	require.NoError(t, err)
	assert.Zero(t, adminReport.TotalMissing)
}

// DATA-02: the admin reconcile reports DB chunks missing from the platform.
func TestAdminReconcileReportsMissingChunks(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("missingrep@example.com", "SecurePass@123!")
	mock := ts.enableMockStorage("missingrep@example.com")
	fileID := ts.uploadAndSync(ctx, token, "half.bin", 2)

	chunk, err := ts.db.GetChunkByIndex(ctx, fileID, 0)
	require.NoError(t, err)
	require.NoError(t, mock.Delete(ctx, *chunk))

	report, err := ts.srv.ReconcileUserOrphans(ctx, ts.userID(token))
	require.NoError(t, err)
	assert.Equal(t, 1, report.TotalMissing)
}

// DATA-03: a presigned confirm must name the exact path, hash and size minted at
// presign; a client can't point the chunk at another blob or skip the presign.
func TestConfirmMustMatchPresign(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("presignpin@example.com", "SecurePass@123!")
	user, err := ts.db.GetUserByEmail(ctx, "presignpin@example.com")
	require.NoError(t, err)
	ts.srv.InjectTestAdapter(user.ID, "mock", "testacct", newMockDirectAdapter(), 10<<30)

	var init struct {
		SessionID string `json:"session_id"`
		FileID    string `json:"file_id"`
	}
	require.NoError(t, json.Unmarshal(requireStatus(t, ts.POST("/api/upload/init", map[string]interface{}{
		"filename": "pinned.bin", "original_size": 80, "sha256": hex64, "salt": validSalt, "chunk_count": 2,
	}, token), http.StatusOK), &init))

	requireStatus(t, ts.POST("/api/upload/"+init.SessionID+"/confirm/1", map[string]interface{}{
		"sha256": hex64, "size": 40, "remote_path": "ab/never-presigned.bin",
	}, token), http.StatusConflict)

	var p struct {
		RemotePath string `json:"remote_path"`
	}
	require.NoError(t, json.Unmarshal(requireStatus(t, ts.POST("/api/upload/"+init.SessionID+"/presign/0",
		map[string]interface{}{"sha256": hex64, "size": 40}, token), http.StatusOK), &p))

	requireStatus(t, ts.POST("/api/upload/"+init.SessionID+"/confirm/0", map[string]interface{}{
		"sha256": hex64, "size": 40, "remote_path": "ab/somebody-elses.bin",
	}, token), http.StatusConflict)
	requireStatus(t, ts.POST("/api/upload/"+init.SessionID+"/confirm/0", map[string]interface{}{
		"sha256": hex64, "size": 41, "remote_path": p.RemotePath,
	}, token), http.StatusConflict)
	assert.Zero(t, ts.countScalar(`SELECT count(*) FROM chunks WHERE file_id=$1`, init.FileID),
		"no mismatched confirm records a chunk")

	requireStatus(t, ts.POST("/api/upload/"+init.SessionID+"/confirm/0", map[string]interface{}{
		"sha256": hex64, "size": 40, "remote_path": p.RemotePath,
	}, token), http.StatusOK)
	assert.Equal(t, 1, ts.countScalar(`SELECT count(*) FROM chunks WHERE file_id=$1 AND remote_path=$2`, init.FileID, p.RemotePath))
}

// DATA-03: a byos-direct chunk is not trusted durable on the client's word; it is
// committed only once the server lists it on the user's platform.
func TestByosDirectChunkTrustedOnlyOnceListed(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	email := "byosverify@example.com"
	token := ts.registerAndLogin(email, "SecurePass@123!")
	ts.givePersonalToken(email, "github", "octocat")
	user, err := ts.db.GetUserByEmail(ctx, email)
	require.NoError(t, err)
	mock := newMockAdapter()
	ts.srv.InjectTestAdapter(user.ID, "github", "octocat", mock, 10<<30)

	var init struct {
		SessionID string `json:"session_id"`
		FileID    string `json:"file_id"`
	}
	require.NoError(t, json.Unmarshal(requireStatus(t, ts.POST("/api/upload/init", map[string]interface{}{
		"filename": "byos-claim.bin", "original_size": 40, "sha256": hex64, "salt": validSalt,
		"chunk_count": 1, "platform": "github", "mode": "byos-direct",
	}, token), http.StatusOK), &init))
	repoID := "github_octocat_claim_" + uuid.NewString()[:8]
	requireStatus(t, ts.POST("/api/repos/register", map[string]interface{}{
		"id": repoID, "platform": "github", "account": "octocat", "name": "claim", "url": "octocat/claim", "max_bytes": 850 << 20,
	}, token), http.StatusOK)

	requireStatus(t, ts.POST("/api/upload/"+init.SessionID+"/confirm/0", map[string]interface{}{
		"sha256": hex64, "size": 40, "remote_path": "ab/claimed.bin",
		"platform": "github", "account": "octocat", "repo_id": repoID, "committed": true,
	}, token), http.StatusOK)
	requireStatus(t, ts.POST("/api/upload/"+init.SessionID+"/complete", map[string]interface{}{}, token), http.StatusOK)
	ts.srv.WaitBackground(ctx)
	ts.srv.ReconcileUncommittedOnce(ctx)

	chunk, err := ts.db.GetChunkByIndex(ctx, init.FileID, 0)
	require.NoError(t, err)
	assert.False(t, chunk.Committed, "a claimed-but-absent chunk must not be trusted durable")

	mock.seedOrphan("octocat/claim", "ab/claimed.bin")
	ts.srv.ReconcileUncommittedOnce(ctx)
	chunk, err = ts.db.GetChunkByIndex(ctx, init.FileID, 0)
	require.NoError(t, err)
	assert.True(t, chunk.Committed, "once listed on the platform the chunk is committed")
}

// DATA-03: a byos-direct confirm can't alias a second chunk onto a path that
// already holds one of the user's chunks.
func TestByosConfirmRejectsTakenRemotePath(t *testing.T) {
	ts := setupTestServer(t)
	email := "byosalias@example.com"
	token := ts.registerAndLogin(email, "SecurePass@123!")
	ts.givePersonalToken(email, "github", "octocat")
	repoID := "github_octocat_alias_" + uuid.NewString()[:8]
	requireStatus(t, ts.POST("/api/repos/register", map[string]interface{}{
		"id": repoID, "platform": "github", "account": "octocat", "name": "alias", "url": "octocat/alias", "max_bytes": 850 << 20,
	}, token), http.StatusOK)

	confirm := func(filename string) int {
		var init struct {
			SessionID string `json:"session_id"`
		}
		require.NoError(t, json.Unmarshal(requireStatus(t, ts.POST("/api/upload/init", map[string]interface{}{
			"filename": filename, "original_size": 40, "sha256": hex64[:63] + filename[:1], "salt": validSalt,
			"chunk_count": 1, "platform": "github", "mode": "byos-direct",
		}, token), http.StatusOK), &init))
		resp := ts.POST("/api/upload/"+init.SessionID+"/confirm/0", map[string]interface{}{
			"sha256": hex64, "size": 40, "remote_path": "ab/shared.bin",
			"platform": "github", "account": "octocat", "repo_id": repoID,
		}, token)
		resp.Body.Close()
		return resp.StatusCode
	}
	assert.Equal(t, http.StatusOK, confirm("a.bin"))
	assert.Equal(t, http.StatusConflict, confirm("b.bin"))
}

func (ts *testServer) insertFolder(userID string) string {
	ts.t.Helper()
	var id string
	require.NoError(ts.t, ts.db.Pool().QueryRow(context.Background(),
		`INSERT INTO folders (user_id, encrypted_name) VALUES ($1, 'enc') RETURNING id`, userID).Scan(&id))
	return id
}

func (ts *testServer) fileKey(fileID string) (folder *string, salt []byte, wrapped string) {
	ts.t.Helper()
	require.NoError(ts.t, ts.db.Pool().QueryRow(context.Background(),
		`SELECT folder_id::text, salt, wrapped_cek FROM files WHERE id = $1`, fileID).Scan(&folder, &salt, &wrapped))
	return folder, salt, wrapped
}

func saltOf(b byte) string {
	s := make([]byte, 32)
	for i := range s {
		s[i] = b
	}
	return base64.StdEncoding.EncodeToString(s)
}

// DATA-04: a move across a protection boundary carries the new envelope, and
// the key and the folder change together or not at all.
func TestMoveWithRekeyIsAtomic(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("moverekey@example.com", "SecurePass@123!")
	uid := ts.userID(token)
	folder := ts.insertFolder(uid)
	fileID := ts.insertFile(ctx, uid, "m.bin")

	requireStatus(t, ts.patchJSON("/api/files/"+fileID+"/move", map[string]interface{}{
		"folder_id": folder, "salt": "not-base64", "wrapped_cek": "w",
	}, token), http.StatusBadRequest)
	got, _, wrapped := ts.fileKey(fileID)
	assert.Nil(t, got, "a rejected rekey must not move the file")
	assert.Empty(t, wrapped)

	requireStatus(t, ts.patchJSON("/api/files/"+fileID+"/move", map[string]interface{}{
		"folder_id": folder, "salt": saltOf(7), "wrapped_cek": "folder-wrapped",
	}, token), http.StatusOK)
	got, salt, wrapped := ts.fileKey(fileID)
	require.NotNil(t, got)
	assert.Equal(t, folder, *got)
	assert.Equal(t, saltOf(7), base64.StdEncoding.EncodeToString(salt))
	assert.Equal(t, "folder-wrapped", wrapped)

	requireStatus(t, ts.patchJSON("/api/files/"+fileID+"/move", map[string]interface{}{"folder_id": nil}, token), http.StatusOK)
	got, salt, wrapped = ts.fileKey(fileID)
	assert.Nil(t, got)
	assert.Equal(t, saltOf(7), base64.StdEncoding.EncodeToString(salt), "a plain move leaves the envelope alone")
	assert.Equal(t, "folder-wrapped", wrapped)

	other := ts.registerAndLogin("moverekey2@example.com", "SecurePass@123!")
	requireStatus(t, ts.patchJSON("/api/files/"+fileID+"/move", map[string]interface{}{"folder_id": nil}, other), http.StatusNotFound)
}

// DATA-04: protecting a folder applies every file re-key and the protection
// record in one transaction; a bad entry leaves everything untouched.
func TestFolderProtectWithRekeysIsAtomic(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("protectatomic@example.com", "SecurePass@123!")
	uid := ts.userID(token)
	folder := ts.insertFolder(uid)
	a := ts.insertFile(ctx, uid, "a.bin")
	b := ts.insertFile(ctx, uid, "b.bin")
	outside := ts.insertFile(ctx, uid, "outside.bin")
	for _, id := range []string{a, b} {
		_, err := ts.db.Pool().Exec(ctx, `UPDATE files SET folder_id = $1 WHERE id = $2`, folder, id)
		require.NoError(t, err)
	}
	protected := func() bool {
		var n int
		require.NoError(t, ts.db.Pool().QueryRow(ctx, `SELECT count(*) FROM folders WHERE id=$1 AND pw_salt IS NOT NULL`, folder).Scan(&n))
		return n == 1
	}

	requireStatus(t, ts.POST("/api/folders/"+folder+"/password", map[string]interface{}{
		"pw_salt": "s", "pw_verifier": "v",
		"rekeys": []map[string]string{
			{"file_id": a, "salt": saltOf(1), "wrapped_cek": "wa"},
			{"file_id": outside, "salt": saltOf(1), "wrapped_cek": "wo"},
		},
	}, token), http.StatusConflict)
	assert.False(t, protected(), "a failed protect must not mark the folder protected")
	_, _, wa := ts.fileKey(a)
	assert.Empty(t, wa, "a failed protect must roll back the files it already re-keyed")

	requireStatus(t, ts.POST("/api/folders/"+folder+"/password", map[string]interface{}{
		"pw_salt": "s", "pw_verifier": "v",
		"rekeys": []map[string]string{
			{"file_id": a, "salt": saltOf(1), "wrapped_cek": "wa"},
			{"file_id": b, "salt": saltOf(2), "wrapped_cek": "wb"},
		},
	}, token), http.StatusOK)
	assert.True(t, protected())
	_, _, wa = ts.fileKey(a)
	_, _, wb := ts.fileKey(b)
	assert.Equal(t, "wa", wa)
	assert.Equal(t, "wb", wb)

	requireStatus(t, ts.deleteWithBody("/api/folders/"+folder+"/password", map[string]interface{}{
		"rekeys": []map[string]string{
			{"file_id": a, "salt": saltOf(3), "wrapped_cek": "va"},
			{"file_id": b, "salt": "short", "wrapped_cek": "vb"},
		},
	}, token), http.StatusBadRequest)
	assert.True(t, protected(), "a rejected unprotect keeps the folder protected")
	_, _, wa = ts.fileKey(a)
	assert.Equal(t, "wa", wa)

	requireStatus(t, ts.deleteWithBody("/api/folders/"+folder+"/password", map[string]interface{}{
		"rekeys": []map[string]string{
			{"file_id": a, "salt": saltOf(3), "wrapped_cek": "va"},
			{"file_id": b, "salt": saltOf(4), "wrapped_cek": "vb"},
		},
	}, token), http.StatusOK)
	assert.False(t, protected())
	_, _, wa = ts.fileKey(a)
	assert.Equal(t, "va", wa)
}

// DATA-09: a retried complete whose first response was lost succeeds with the
// same body instead of failing a finished upload.
func TestUploadCompleteIsIdempotent(t *testing.T) {
	ts := setupTestServer(t)
	token := ts.registerAndLogin("completetwice@example.com", "SecurePass@123!")
	ts.enableMockStorage("completetwice@example.com")
	sessionID, fileID := ts.initRelayUpload(token, "twice.bin", 1)

	var first, second map[string]interface{}
	require.NoError(t, json.Unmarshal(requireStatus(t,
		ts.POST("/api/upload/"+sessionID+"/complete", map[string]interface{}{}, token), http.StatusOK), &first))
	require.NoError(t, json.Unmarshal(requireStatus(t,
		ts.POST("/api/upload/"+sessionID+"/complete", map[string]interface{}{}, token), http.StatusOK), &second))
	assert.Equal(t, first, second)
	assert.Equal(t, fileID, second["file_id"])

	requireStatus(t, ts.DELETE("/api/upload/"+sessionID, token), http.StatusBadRequest)
	requireStatus(t, ts.POST("/api/upload/"+sessionID+"/complete", map[string]interface{}{}, token), http.StatusOK)
}

// DATA-10: when a racing duplicate PUT loses the insert, its staged copy is
// removed instead of leaking on disk forever.
func TestDuplicateStagedChunkFileIsRemoved(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("stageleak@example.com", "SecurePass@123!")
	ts.enableMockStorage("stageleak@example.com")
	_, fileID := ts.initRelayUpload(token, "leak.bin", 1)
	existing, err := ts.db.GetChunkByIndex(ctx, fileID, 0)
	require.NoError(t, err)

	stagingDir, err := config.StagingDir()
	require.NoError(t, err)
	loserID := uuid.NewString()
	loserPath := filepath.Join(stagingDir, loserID+".enc")
	require.NoError(t, os.WriteFile(loserPath, []byte("duplicate-bytes"), 0600))
	sum := sha256.Sum256([]byte("duplicate-bytes"))

	inserted, err := ts.srv.StoreStagedChunk(ctx, existing.UserID, &types.ChunkRef{
		ChunkID: loserID, FileID: fileID, Index: 0, Size: 15, SHA256: hex.EncodeToString(sum[:]),
		Platform: existing.Platform, Account: existing.Account, Repo: existing.Repo,
	}, loserPath)
	require.NoError(t, err)
	assert.False(t, inserted)
	_, statErr := os.Stat(loserPath)
	assert.True(t, os.IsNotExist(statErr), "the losing duplicate's staged file must be removed")

	winner := filepath.Join(stagingDir, existing.ChunkID+".enc")
	_, statErr = os.Stat(winner)
	assert.NoError(t, statErr, "the winning row's staged file is untouched")
}
