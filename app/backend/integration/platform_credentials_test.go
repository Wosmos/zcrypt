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
	"github.com/zcrypt/zcrypt/crypto"
)

const integrationMasterKeyHex = "0000000000000000000000000000000000000000000000000000000000000001"

func (ts *testServer) giveSealedToken(email, platform, username, raw string, global bool) string {
	ts.t.Helper()
	ctx := context.Background()
	user, err := ts.db.GetUserByEmail(ctx, strings.ToLower(email))
	require.NoError(ts.t, err)
	mk, err := crypto.ParseMasterKey(integrationMasterKeyHex)
	require.NoError(ts.t, err)
	kek, err := crypto.DeriveUserKEK(mk, user.ID)
	require.NoError(ts.t, err)
	enc, nonce, err := crypto.EncryptToken(kek, raw)
	require.NoError(ts.t, err)
	require.NoError(ts.t, ts.db.InsertPlatformToken(ctx, user.ID, platform, username, enc, nonce, global))
	return user.ID
}

type platformCreds struct {
	Platform string `json:"platform"`
	Token    string `json:"token"`
	Account  string `json:"account"`
}

func TestPlatformCredentialsReturnsOwnPersonalToken(t *testing.T) {
	ts := setupTestServer(t)
	email := "creds-own@example.com"
	token := ts.registerAndLogin(email, newTestPassword())
	ts.giveSealedToken(email, "telegram", "my_vault_bot", "123456:ABC-own|@my_vault", false)

	resp := ts.GET("/api/platforms/credentials?platform=telegram", token)
	assert.Equal(t, "no-store", resp.Header.Get("Cache-Control"))
	var got platformCreds
	require.NoError(t, json.Unmarshal(requireStatus(t, resp, http.StatusOK), &got))
	assert.Equal(t, platformCreds{Platform: "telegram", Token: "123456:ABC-own|@my_vault", Account: "my_vault_bot"}, got)

	ts.srv.WaitBackground(context.Background())
	activity := requireStatus(t, ts.GET("/api/auth/activity", token), http.StatusOK)
	assert.Contains(t, string(activity), "platform_credentials_read")
}

func TestPlatformCredentialsNeverReturnsAGlobalToken(t *testing.T) {
	ts := setupTestServer(t)
	adminEmail := "creds-admin@example.com"
	adminToken := ts.registerAndLogin(adminEmail, newTestPassword())
	ts.giveSealedToken(adminEmail, "telegram", "shared_pool_bot", "999:POOL|@pool", true)
	userEmail := "creds-user@example.com"
	userToken := ts.registerAndLogin(userEmail, newTestPassword())

	requireStatus(t, ts.GET("/api/platforms/credentials?platform=telegram", userToken), http.StatusNotFound)
	requireStatus(t, ts.GET("/api/platforms/credentials?platform=telegram", adminToken), http.StatusNotFound)
}

func TestPlatformCredentialsNeverReturnsAnotherUsersToken(t *testing.T) {
	ts := setupTestServer(t)
	ownerEmail := "creds-owner@example.com"
	ts.registerAndLogin(ownerEmail, newTestPassword())
	ts.giveSealedToken(ownerEmail, "github", "octocat", "ghp_owner_secret", false)
	otherToken := ts.registerAndLogin("creds-other@example.com", newTestPassword())

	resp := ts.GET("/api/platforms/credentials?platform=github", otherToken)
	body := requireStatus(t, resp, http.StatusNotFound)
	assert.NotContains(t, string(body), "ghp_owner_secret")
}

func TestPlatformCredentialsRequiresAuth(t *testing.T) {
	ts := setupTestServer(t)
	requireStatus(t, ts.GET("/api/platforms/credentials?platform=telegram", ""), http.StatusUnauthorized)
}

func TestPlatformCredentialsRejectsUnknownPlatform(t *testing.T) {
	ts := setupTestServer(t)
	token := ts.registerAndLogin("creds-bad@example.com", newTestPassword())
	requireStatus(t, ts.GET("/api/platforms/credentials?platform=dropbox", token), http.StatusBadRequest)
	requireStatus(t, ts.GET("/api/platforms/credentials", token), http.StatusBadRequest)
}

func TestByosTelegramConfirmByChatIDRecordsTheConnectedAccount(t *testing.T) {
	ts := setupTestServer(t)
	email := "creds-chat@example.com"
	token := ts.registerAndLogin(email, newTestPassword())
	ts.giveSealedToken(email, "telegram", "chat_bot", "777:TOKEN|-100200300", false)

	var init struct {
		SessionID string `json:"session_id"`
		FileID    string `json:"file_id"`
	}
	require.NoError(t, json.Unmarshal(requireStatus(t, ts.POST("/api/upload/init", map[string]interface{}{
		"encrypted_name": "chat.bin", "original_size": 40, "sha256": hex64, "salt": validSalt,
		"chunk_count": 1, "platform": "telegram", "mode": "byos-direct",
	}, token), http.StatusOK), &init))

	status := requireStatus(t, ts.GET("/api/upload/"+init.SessionID+"/status", token), http.StatusOK)
	assert.Contains(t, string(status), `"mode":"byos-direct"`)

	repoID := "telegram_-100200300_vault_abcdef"
	requireStatus(t, ts.POST("/api/repos/register", map[string]interface{}{
		"id": repoID, "platform": "telegram", "account": "-100200300", "name": "vault", "url": "tg:-100200300/vault", "max_bytes": 50 << 30,
	}, token), http.StatusOK)

	requireStatus(t, ts.POST("/api/upload/"+init.SessionID+"/confirm/0", map[string]interface{}{
		"sha256": hex64, "size": 40, "remote_path": "9:FILEID",
		"platform": "telegram", "account": "@someone_else", "repo_id": repoID, "committed": true,
	}, token), http.StatusForbidden)

	requireStatus(t, ts.POST("/api/upload/"+init.SessionID+"/confirm/0", map[string]interface{}{
		"sha256": hex64, "size": 40, "remote_path": "9:FILEID",
		"platform": "telegram", "account": "-100200300", "repo_id": repoID, "committed": true,
	}, token), http.StatusOK)

	chunk, err := ts.db.GetChunkByIndex(context.Background(), init.FileID, 0)
	require.NoError(t, err)
	assert.Equal(t, "chat_bot", chunk.Account)
	assert.Equal(t, "tg:-100200300/vault", chunk.Repo)

	requireStatus(t, ts.POST("/api/repos/"+repoID+"/deactivate", map[string]interface{}{}, token), http.StatusOK)
	requireStatus(t, ts.POST("/api/repos/"+repoID+"/deactivate", map[string]interface{}{}, ts.registerAndLogin("creds-chat-other@example.com", newTestPassword())), http.StatusNotFound)
}
