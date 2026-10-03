//go:build integration

package integration_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/zcrypt/zcrypt/auth"
	"github.com/zcrypt/zcrypt/types"
)

const integrationJWTSecret = "integration-test-secret-must-be-32chars!!"

func TestDecoySessionStaysIsolated(t *testing.T) {
	ts := setupTestServer(t)
	const email = "decoy-isolation@example.com"
	realToken := ts.registerAndLogin(email, "SecurePass@123!")

	user, err := ts.db.GetUserByEmail(context.Background(), email)
	require.NoError(t, err)
	require.NoError(t, ts.db.SetUserRole(context.Background(), user.ID, types.RoleAdmin))

	requireStatus(t, ts.POST("/api/decoy/setup", map[string]string{"decoy_password": "DecoyPass@123!"}, realToken), 200)
	requireStatus(t, ts.POST("/api/notes", map[string]interface{}{"encrypted_title": "c2VjcmV0", "encrypted_body": "c2VjcmV0", "tags": []string{}}, realToken), 201)

	var login struct {
		AccessToken  string     `json:"access_token"`
		RefreshToken string     `json:"refresh_token"`
		User         types.User `json:"user"`
	}
	decodeJSON(t, ts.POST("/api/auth/login", map[string]string{"email": email, "password": "DecoyPass@123!"}, ""), &login)
	require.NotEmpty(t, login.AccessToken)
	assert.Equal(t, types.RoleUser, login.User.Role, "a decoy login must not present the admin role")

	claims, err := auth.ValidateAccessToken(integrationJWTSecret, login.AccessToken)
	require.NoError(t, err)
	require.True(t, claims.Decoy)

	t.Run("refresh keeps the session a decoy", func(t *testing.T) {
		var refreshed struct {
			AccessToken string `json:"access_token"`
		}
		decodeJSON(t, ts.POST("/api/auth/refresh", map[string]string{"refresh_token": login.RefreshToken}, ""), &refreshed)
		c, err := auth.ValidateAccessToken(integrationJWTSecret, refreshed.AccessToken)
		require.NoError(t, err)
		assert.True(t, c.Decoy, "refreshing a decoy session must not mint a real access token")
	})

	var cookieLogin struct {
		RefreshToken string `json:"refresh_token"`
	}
	decodeJSON(t, ts.POST("/api/auth/login", map[string]string{"email": email, "password": "DecoyPass@123!"}, ""), &cookieLogin)
	require.NotEmpty(t, cookieLogin.RefreshToken)
	rt := cookieLogin.RefreshToken

	cookieRefresh := func(t *testing.T, origin, fetchSite string) *http.Response {
		t.Helper()
		req, err := http.NewRequest(http.MethodPost, ts.URL+"/api/auth/refresh", nil)
		require.NoError(t, err)
		req.AddCookie(&http.Cookie{Name: "zcrypt_rt", Value: rt})
		req.Header.Set("Origin", origin)
		if fetchSite != "" {
			req.Header.Set("Sec-Fetch-Site", fetchSite)
		}
		resp, err := http.DefaultClient.Do(req)
		require.NoError(t, err)
		return resp
	}
	type refreshed struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
	}

	t.Run("cookie refresh from an allowed origin stays a decoy", func(t *testing.T) {
		var out refreshed
		decodeJSON(t, cookieRefresh(t, "http://localhost:3000", "cross-site"), &out)
		c, err := auth.ValidateAccessToken(integrationJWTSecret, out.AccessToken)
		require.NoError(t, err)
		assert.True(t, c.Decoy)
		rt = out.RefreshToken
	})

	t.Run("cookie refresh through the same-origin proxy is accepted", func(t *testing.T) {
		var out refreshed
		require.NoError(t, json.Unmarshal(requireStatus(t, cookieRefresh(t, "https://preview.zcrypt.example", "same-origin"), 200), &out))
		rt = out.RefreshToken
	})

	t.Run("cookie refresh from a foreign origin is refused", func(t *testing.T) {
		requireStatus(t, cookieRefresh(t, "https://evil.example", "cross-site"), 403)
	})

	t.Run("real data and admin routes are hidden", func(t *testing.T) {
		assert.Equal(t, "[]", string(requireStatus(t, ts.GET("/api/notes", login.AccessToken), 200)))
		requireStatus(t, ts.GET("/api/admin/users", login.AccessToken), 403)
		requireStatus(t, ts.POST("/api/auth/change-password", map[string]string{"current_password": "DecoyPass@123!", "new_password": "Other@Pass123!"}, login.AccessToken), 403)

		var me types.User
		decodeJSON(t, ts.GET("/api/auth/me", login.AccessToken), &me)
		assert.Equal(t, types.RoleUser, me.Role)

		var status map[string]interface{}
		decodeJSON(t, ts.GET("/api/decoy", login.AccessToken), &status)
		assert.Equal(t, false, status["configured"], "a decoy session must not learn the decoy exists")
	})

	t.Run("the real session is unaffected", func(t *testing.T) {
		var notes []map[string]interface{}
		decodeJSON(t, ts.GET("/api/notes", realToken), &notes)
		assert.Len(t, notes, 1)
	})
}
