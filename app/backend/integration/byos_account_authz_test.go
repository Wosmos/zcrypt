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

func TestDirectConfirmCannotClaimAnotherAccount(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	pw := newTestPassword()

	adminEmail := "byosz-admin@example.com"
	ts.registerAndLogin(adminEmail, pw)
	ts.makeAdmin(ctx, adminEmail)
	admin, err := ts.db.GetUserByEmail(ctx, strings.ToLower(adminEmail))
	require.NoError(t, err)
	require.NoError(t, ts.db.InsertPlatformToken(ctx, admin.ID, "telegram", "shared_pool_bot", []byte("enc"), []byte("nonce"), true))

	userEmail := "byosz-user@example.com"
	token := ts.registerAndLogin(userEmail, pw)
	ts.givePersonalToken(userEmail, "telegram", "my_own_bot")

	initResp := ts.POST("/api/upload/init", map[string]interface{}{
		"filename":      "x.bin",
		"original_size": 40,
		"sha256":        hex64,
		"salt":          validSalt,
		"chunk_count":   1,
		"platform":      "telegram",
		"mode":          "byos-direct",
	}, token)
	var init struct {
		SessionID string `json:"session_id"`
	}
	require.NoError(t, json.Unmarshal(requireStatus(t, initResp, http.StatusOK), &init))

	confirm := func(account string) int {
		resp := ts.POST("/api/upload/"+init.SessionID+"/confirm/0", map[string]interface{}{
			"sha256":      "chunkshahex",
			"size":        40,
			"remote_path": "1:7001",
			"platform":    "telegram",
			"account":     account,
			"committed":   true,
		}, token)
		defer resp.Body.Close()
		return resp.StatusCode
	}

	t.Run("claiming the shared pool's account is refused", func(t *testing.T) {
		assert.Equal(t, http.StatusForbidden, confirm("shared_pool_bot"))
	})
	t.Run("claiming an account nobody has connected is refused", func(t *testing.T) {
		assert.Equal(t, http.StatusForbidden, confirm("some_other_bot"))
	})
	t.Run("the user's own account is accepted", func(t *testing.T) {
		assert.Equal(t, http.StatusOK, confirm("my_own_bot"))
	})
}
