//go:build integration

package integration_test

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func (ts *testServer) setScope(token, tokenID string, global bool) int {
	ts.t.Helper()
	body := `{"is_global":false}`
	if global {
		body = `{"is_global":true}`
	}
	req, err := http.NewRequest(http.MethodPut, ts.URL+"/api/platforms/tokens/"+tokenID+"/scope", strings.NewReader(body))
	require.NoError(ts.t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", uniqueTestIP())
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := http.DefaultClient.Do(req)
	require.NoError(ts.t, err)
	defer resp.Body.Close()
	return resp.StatusCode
}

func TestOnlyAdminsCanShareATokenWithEveryone(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	pw := newTestPassword()

	adminEmail := "scope-admin@example.com"
	ts.registerAndLogin(adminEmail, pw)
	ts.makeAdmin(ctx, adminEmail)
	adminTok := ts.loginToken(adminEmail, pw)

	userEmail := "scope-user@example.com"
	userTok := ts.registerAndLogin(userEmail, pw)
	otherEmail := "scope-other@example.com"
	ts.registerAndLogin(otherEmail, pw)
	ts.givePersonalToken(userEmail, "telegram", "scope_user_bot")
	ts.givePersonalToken(adminEmail, "telegram", "scope_admin_bot")

	user, err := ts.db.GetUserByEmail(ctx, strings.ToLower(userEmail))
	require.NoError(t, err)
	other, err := ts.db.GetUserByEmail(ctx, strings.ToLower(otherEmail))
	require.NoError(t, err)
	admin, err := ts.db.GetUserByEmail(ctx, strings.ToLower(adminEmail))
	require.NoError(t, err)

	userTokens, err := ts.db.GetPlatformTokens(ctx, user.ID)
	require.NoError(t, err)
	require.Len(t, userTokens, 1)
	adminTokens, err := ts.db.GetPlatformTokens(ctx, admin.ID)
	require.NoError(t, err)
	require.Len(t, adminTokens, 1)

	t.Run("a normal user is refused and the pool is unchanged", func(t *testing.T) {
		assert.Equal(t, http.StatusForbidden, ts.setScope(userTok, userTokens[0].ID, true))
		visible, err := ts.db.GetPlatformTokens(ctx, other.ID)
		require.NoError(t, err)
		assert.Empty(t, visible)
	})

	t.Run("a normal user can still keep their own token private", func(t *testing.T) {
		assert.Equal(t, http.StatusOK, ts.setScope(userTok, userTokens[0].ID, false))
	})

	t.Run("an admin can share a token with everyone", func(t *testing.T) {
		assert.Equal(t, http.StatusOK, ts.setScope(adminTok, adminTokens[0].ID, true))
		visible, err := ts.db.GetPlatformTokens(ctx, other.ID)
		require.NoError(t, err)
		require.Len(t, visible, 1)
		assert.Equal(t, "scope_admin_bot", visible[0].Username)
	})
}
