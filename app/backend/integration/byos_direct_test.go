//go:build integration

package integration_test

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// hex64 is a syntactically valid (non-empty) 64-char hex sha256 for init.
const hex64 = "abababababababababababababababababababababababababababababababab"

// givePersonalToken inserts a PERSONAL (non-global) platform token so the
// byos-direct init/register personal-token gate passes. The encrypted bytes are
// dummy — byos-direct never decrypts the token server-side (the client holds the
// real one); PersonalTokenAccount only reads the username.
func (ts *testServer) givePersonalToken(email, platform, username string) {
	ts.t.Helper()
	user, err := ts.db.GetUserByEmail(context.Background(), strings.ToLower(email))
	require.NoError(ts.t, err)
	require.NoError(ts.t, ts.db.InsertPlatformToken(
		context.Background(), user.ID, platform, username,
		[]byte("enc"), []byte("nonce"), false,
	))
}

// TestByosDirectFlow drives the full client-direct control plane: init
// (metadata-only session) → register a client-created repo → confirm a
// client-uploaded+committed chunk → complete → owner-only locators → change
// feed → client-deleted metadata-only purge.
func TestByosDirectFlow(t *testing.T) {
	ts := setupTestServer(t)
	email := "byos@example.com"
	token := ts.registerAndLogin(email, "SecurePass@123!")
	ts.givePersonalToken(email, "github", "octocat")

	// 1. init byos-direct → metadata-only session, no server repo.
	initResp := ts.POST("/api/upload/init", map[string]interface{}{
		"filename":      "byos.bin",
		"original_size": 40,
		"sha256":        hex64,
		"salt":          validSalt,
		"chunk_count":   1,
		"platform":      "github",
		"mode":          "byos-direct",
	}, token)
	var init struct {
		SessionID    string `json:"session_id"`
		FileID       string `json:"file_id"`
		Mode         string `json:"mode"`
		DirectUpload bool   `json:"direct_upload"`
		RepoURL      string `json:"repo_url"`
	}
	require.NoError(t, json.Unmarshal(requireStatus(t, initResp, http.StatusOK), &init))
	assert.Equal(t, "byos-direct", init.Mode)
	assert.True(t, init.DirectUpload)
	assert.Empty(t, init.RepoURL, "byos-direct opens no server repo")

	// 2. register the repo the client created on its own platform.
	repoID := "github_octocat_brave-lynx_deadbeef"
	regResp := ts.POST("/api/repos/register", map[string]interface{}{
		"id":        repoID,
		"platform":  "github",
		"account":   "octocat",
		"name":      "brave-lynx",
		"url":       "octocat/brave-lynx",
		"max_bytes": 850 << 20,
	}, token)
	requireStatus(t, regResp, http.StatusOK)
	// Idempotent: a re-register of the same id is a no-op success.
	requireStatus(t, ts.POST("/api/repos/register", map[string]interface{}{
		"id": repoID, "platform": "github", "account": "octocat",
		"name": "brave-lynx", "url": "octocat/brave-lynx", "max_bytes": 850 << 20,
	}, token), http.StatusOK)

	// 3. confirm the client-uploaded, client-committed chunk.
	confirmResp := ts.POST("/api/upload/"+init.SessionID+"/confirm/0", map[string]interface{}{
		"sha256":      "chunkshahex",
		"size":        40,
		"remote_path": "ab/cd.bin",
		"compressed":  false,
		"platform":    "github",
		"account":     "octocat",
		"repo_id":     repoID,
		"committed":   true,
	}, token)
	requireStatus(t, confirmResp, http.StatusOK)

	// 4. complete.
	requireStatus(t, ts.POST("/api/upload/"+init.SessionID+"/complete",
		map[string]interface{}{}, token), http.StatusOK)

	// 5. owner-only locators point at the user's own storage.
	var loc struct {
		FileID string `json:"file_id"`
		Chunks []struct {
			Index      int    `json:"index"`
			Platform   string `json:"platform"`
			Repo       string `json:"repo"`
			RemotePath string `json:"remote_path"`
			Committed  bool   `json:"committed"`
		} `json:"chunks"`
	}
	require.NoError(t, json.Unmarshal(
		requireStatus(t, ts.GET("/api/files/"+init.FileID+"/locators", token), http.StatusOK), &loc))
	require.Len(t, loc.Chunks, 1)
	assert.Equal(t, "github", loc.Chunks[0].Platform)
	assert.Equal(t, "octocat/brave-lynx", loc.Chunks[0].Repo)
	assert.Equal(t, "ab/cd.bin", loc.Chunks[0].RemotePath)

	// 6. the change feed reflects the added file at a positive rev.
	var ch struct {
		Changes []struct {
			FileID  string `json:"file_id"`
			Rev     int64  `json:"rev"`
			Deleted bool   `json:"deleted"`
		} `json:"changes"`
		Cursor int64 `json:"cursor"`
	}
	require.NoError(t, json.Unmarshal(
		requireStatus(t, ts.GET("/api/changes?since=0", token), http.StatusOK), &ch))
	assert.Greater(t, ch.Cursor, int64(0))
	found := false
	for _, c := range ch.Changes {
		if c.FileID == init.FileID {
			found = true
			assert.False(t, c.Deleted)
			assert.Greater(t, c.Rev, int64(0))
		}
	}
	assert.True(t, found, "added file must appear in /api/changes")

	// 7. client-deleted metadata-only purge (device already removed the bytes).
	requireStatus(t, ts.DELETE("/api/files/"+init.FileID+"/purge?client_deleted=true", token),
		http.StatusOK)

	// 8. file is gone from the listing.
	var files []interface{}
	require.NoError(t, json.Unmarshal(
		requireStatus(t, ts.GET("/api/files", token), http.StatusOK), &files))
	assert.Len(t, files, 0, "purged file must be gone")
}

// TestByosDirectRequiresPersonalToken: byos-direct init is refused (403) when
// the user has not connected their own token for the platform — the managed
// pool token is never eligible for a client-direct transfer.
func TestByosDirectRequiresPersonalToken(t *testing.T) {
	ts := setupTestServer(t)
	token := ts.registerAndLogin("nopersonal@example.com", "SecurePass@123!")

	resp := ts.POST("/api/upload/init", map[string]interface{}{
		"filename": "x.bin", "original_size": 10, "sha256": hex64,
		"salt": validSalt, "chunk_count": 1,
		"platform": "github", "mode": "byos-direct",
	}, token)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	resp.Body.Close()
}

// TestByosDirectRejectsUnsupportedPlatform: mode byos-direct with a platform
// outside the supported set is a 400. The supported-platform gate fires before
// the personal-token check, so no token is needed to exercise it.
func TestByosDirectRejectsUnsupportedPlatform(t *testing.T) {
	ts := setupTestServer(t)
	token := ts.registerAndLogin("badplatform@example.com", "SecurePass@123!")

	resp := ts.POST("/api/upload/init", map[string]interface{}{
		"filename": "x.bin", "original_size": 10, "sha256": hex64,
		"salt": validSalt, "chunk_count": 1,
		"platform": "dropbox", "mode": "byos-direct",
	}, token)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	resp.Body.Close()
}

// TestByosConfirmRejectsUnownedRepo: a byos-direct confirm that names a repo_id
// the caller does not own is rejected (400) — never trust a client repo_id.
func TestByosConfirmRejectsUnownedRepo(t *testing.T) {
	ts := setupTestServer(t)
	email := "unowned@example.com"
	token := ts.registerAndLogin(email, "SecurePass@123!")
	ts.givePersonalToken(email, "telegram", "tgacct")

	var init struct {
		SessionID string `json:"session_id"`
	}
	require.NoError(t, json.Unmarshal(requireStatus(t, ts.POST("/api/upload/init", map[string]interface{}{
		"filename": "x.bin", "original_size": 10, "sha256": hex64,
		"salt": validSalt, "chunk_count": 1,
		"platform": "telegram", "mode": "byos-direct",
	}, token), http.StatusOK), &init))

	resp := ts.POST("/api/upload/"+init.SessionID+"/confirm/0", map[string]interface{}{
		"sha256": "s", "size": 10, "remote_path": "1:2", "compressed": false,
		"platform": "telegram", "account": "tgacct",
		"repo_id": "telegram_tgacct_nope_ffff", "committed": true,
	}, token)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	resp.Body.Close()
}

// TestSoftDeleteAppearsInChangeFeed: a soft delete (Trash) keeps the row, so it
// surfaces in /api/changes with deleted=true for offline devices to catch up.
func TestSoftDeleteAppearsInChangeFeed(t *testing.T) {
	ts := setupTestServer(t)
	email := "softdel@example.com"
	token := ts.registerAndLogin(email, "SecurePass@123!")
	ts.enableMockStorage(email)

	// A normal relay upload (managed mock storage) so a real file exists.
	var init struct {
		SessionID string `json:"session_id"`
		FileID    string `json:"file_id"`
	}
	require.NoError(t, json.Unmarshal(requireStatus(t, ts.POST("/api/upload/init", map[string]interface{}{
		"filename": "trash-me.txt", "original_size": 40, "sha256": hex64,
		"salt": validSalt, "chunk_count": 1,
	}, token), http.StatusOK), &init))
	requireStatus(t, ts.PUT("/api/upload/"+init.SessionID+"/chunk/0",
		[]byte("encrypted-chunk-payload-0123456789ABCDEF"), token), http.StatusOK)
	requireStatus(t, ts.POST("/api/upload/"+init.SessionID+"/complete",
		map[string]interface{}{}, token), http.StatusOK)

	// Soft delete → Trash (row survives).
	requireStatus(t, ts.DELETE("/api/files/"+init.FileID, token), http.StatusOK)

	var ch struct {
		Changes []struct {
			FileID  string `json:"file_id"`
			Deleted bool   `json:"deleted"`
		} `json:"changes"`
	}
	require.NoError(t, json.Unmarshal(
		requireStatus(t, ts.GET("/api/changes?since=0", token), http.StatusOK), &ch))
	sawDeleted := false
	for _, c := range ch.Changes {
		if c.FileID == init.FileID && c.Deleted {
			sawDeleted = true
		}
	}
	assert.True(t, sawDeleted, "soft-deleted file must appear as deleted in /api/changes")
}
