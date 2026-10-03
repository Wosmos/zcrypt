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

func (ts *testServer) ownTokenID(ctx context.Context, userID, username string) string {
	ts.t.Helper()
	tokens, err := ts.db.GetPlatformTokens(ctx, userID)
	require.NoError(ts.t, err)
	for _, tok := range tokens {
		if tok.UserID == userID && tok.Username == username {
			return tok.ID
		}
	}
	ts.t.Fatalf("token %s not found for user", username)
	return ""
}

func (ts *testServer) visibleUsernames(ctx context.Context, userID string) []string {
	ts.t.Helper()
	tokens, err := ts.db.GetPlatformTokens(ctx, userID)
	require.NoError(ts.t, err)
	var names []string
	for _, tok := range tokens {
		names = append(names, tok.Username)
	}
	return names
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

	userTokenID := ts.ownTokenID(ctx, user.ID, "scope_user_bot")
	adminTokenID := ts.ownTokenID(ctx, admin.ID, "scope_admin_bot")

	t.Run("a normal user is refused and the pool is unchanged", func(t *testing.T) {
		assert.Equal(t, http.StatusForbidden, ts.setScope(userTok, userTokenID, true))
		assert.NotContains(t, ts.visibleUsernames(ctx, other.ID), "scope_user_bot")
	})

	t.Run("a normal user can still keep their own token private", func(t *testing.T) {
		assert.Equal(t, http.StatusOK, ts.setScope(userTok, userTokenID, false))
	})

	t.Run("an admin can share a token with everyone", func(t *testing.T) {
		assert.Equal(t, http.StatusOK, ts.setScope(adminTok, adminTokenID, true))
		assert.Contains(t, ts.visibleUsernames(ctx, other.ID), "scope_admin_bot")
	})
}
