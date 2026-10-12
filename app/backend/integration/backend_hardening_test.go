//go:build integration

package integration_test

import (
	"context"
	"encoding/base64"
	"net/http"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCreateFolderValidatesParent(t *testing.T) {
	ts := setupTestServer(t)
	owner := ts.registerAndLogin("mkdir-owner@example.com", newTestPassword())
	other := ts.registerAndLogin("mkdir-other@example.com", newTestPassword())
	foreign := ts.createFolder(other, nil)
	own := ts.createFolder(owner, nil)
	trashed := ts.createFolder(owner, nil)
	requireStatus(t, ts.DELETE("/api/folders/"+trashed, owner), http.StatusOK)

	body := func(parent interface{}) map[string]interface{} {
		return map[string]interface{}{"encrypted_name": "bmFtZQ==", "parent_id": parent}
	}
	requireStatus(t, ts.POST("/api/folders", body(foreign), owner), http.StatusNotFound)
	requireStatus(t, ts.POST("/api/folders", body(trashed), owner), http.StatusNotFound)
	requireStatus(t, ts.POST("/api/folders", body(uuid.NewString()), owner), http.StatusNotFound)
	requireStatus(t, ts.POST("/api/folders", body("nope"), owner), http.StatusBadRequest)
	requireStatus(t, ts.POST("/api/folders", body(own), owner), http.StatusCreated)
	requireStatus(t, ts.POST("/api/folders", body(nil), owner), http.StatusCreated)
}

func TestBurnAfterReadPadIsReadableOnce(t *testing.T) {
	ts := setupTestServer(t)
	blob := base64.StdEncoding.EncodeToString(make([]byte, 64))
	raw := requireStatus(t, ts.POST("/api/pad", map[string]interface{}{
		"encrypted_blob": blob, "content_size": 32, "burn_after_read": true, "expires_hours": 1,
	}, ""), http.StatusOK)
	var created struct {
		Token string `json:"token"`
	}
	require.NoError(t, jsonUnmarshal(raw, &created))

	requireStatus(t, ts.GET("/api/pad/"+created.Token+"/content", ""), http.StatusOK)
	requireStatus(t, ts.GET("/api/pad/"+created.Token+"/content", ""), http.StatusGone)
}

func TestLargePadBodyIsAccepted(t *testing.T) {
	ts := setupTestServer(t)
	blob := base64.StdEncoding.EncodeToString(make([]byte, 1<<20))
	requireStatus(t, ts.POST("/api/pad", map[string]interface{}{
		"encrypted_blob": blob, "content_size": (1 << 20) - 28, "expires_hours": 1,
	}, ""), http.StatusOK)
}

func TestClientDeletedPurgeNeedsOwnPlatformAccount(t *testing.T) {
	ts := setupTestServer(t)
	const email = "purge-owner@example.com"
	token := ts.registerAndLogin(email, newTestPassword())
	user, err := ts.db.GetUserByEmail(context.Background(), email)
	require.NoError(t, err)

	fileID := ts.insertOwnedFile(email)
	_, err = ts.db.Pool().Exec(context.Background(),
		`INSERT INTO chunks (file_id, user_id, idx, size, sha256, platform, account, repo, remote_path)
		 VALUES ($1, $2, 0, 10, 'x', 'github', 'shared-pool', 'r', 'p')`, fileID, user.ID)
	require.NoError(t, err)

	requireStatus(t, ts.DELETE("/api/files/"+fileID+"/purge?client_deleted=true", token), http.StatusOK)
	assert.Equal(t, 1, ts.countScalar(`SELECT count(*) FROM pending_deletions WHERE user_id = $1 AND remote_path = 'p'`, user.ID),
		"a chunk outside the caller's own accounts is queued for server-side deletion, not trusted away")

	requireStatus(t, ts.DELETE("/api/files/"+uuid.NewString()+"/purge?client_deleted=true", token), http.StatusNotFound)
}
