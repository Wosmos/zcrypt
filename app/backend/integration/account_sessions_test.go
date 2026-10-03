//go:build integration

package integration_test

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var accountTestPassword = newTestPassword()

func uniqueEmail(prefix string) string {
	return fmt.Sprintf("%s-%d@example.com", prefix, time.Now().UnixNano())
}

type tokenPair struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

func (ts *testServer) login(email, password string) tokenPair {
	ts.t.Helper()
	var out tokenPair
	decodeJSON(ts.t, ts.POST("/api/auth/login", map[string]string{"email": email, "password": password}, ""), &out)
	require.NotEmpty(ts.t, out.AccessToken)
	return out
}

type sessionRow struct {
	ID        string `json:"id"`
	UserAgent string `json:"user_agent"`
	Current   bool   `json:"current"`
}

func (ts *testServer) sessions(token string) []sessionRow {
	ts.t.Helper()
	resp := ts.GET("/api/auth/sessions", token)
	require.Equal(ts.t, http.StatusOK, resp.StatusCode)
	var out []sessionRow
	decodeJSON(ts.t, resp, &out)
	return out
}

func currentSession(t *testing.T, rows []sessionRow) string {
	t.Helper()
	for _, r := range rows {
		if r.Current {
			return r.ID
		}
	}
	t.Fatal("no current session in list")
	return ""
}

func TestSessionManagement(t *testing.T) {
	ts := setupTestServer(t)
	email := uniqueEmail("sessions")
	first := ts.registerAndLogin(email, accountTestPassword)

	a := ts.login(email, accountTestPassword)
	b := ts.login(email, accountTestPassword)

	t.Run("lists each sign-in once and marks the caller", func(t *testing.T) {
		rows := ts.sessions(a.AccessToken)
		require.Len(t, rows, 3)
		current := 0
		for _, r := range rows {
			if r.Current {
				current++
			}
		}
		assert.Equal(t, 1, current)
	})

	t.Run("refresh stays in the same session", func(t *testing.T) {
		before := currentSession(t, ts.sessions(b.AccessToken))
		var refreshed tokenPair
		decodeJSON(t, ts.POST("/api/auth/refresh", map[string]string{"refresh_token": b.RefreshToken}, ""), &refreshed)
		require.NotEmpty(t, refreshed.AccessToken)
		rows := ts.sessions(refreshed.AccessToken)
		assert.Len(t, rows, 3, "a rotation must not show up as another device")
		assert.Equal(t, before, currentSession(t, rows))
		b = refreshed
	})

	t.Run("revoking one session signs only that device out", func(t *testing.T) {
		bID := currentSession(t, ts.sessions(b.AccessToken))
		requireStatus(t, ts.DELETE("/api/auth/sessions/"+bID, a.AccessToken), http.StatusOK)

		requireStatus(t, ts.GET("/api/auth/me", b.AccessToken), http.StatusUnauthorized)
		requireStatus(t, ts.POST("/api/auth/refresh", map[string]string{"refresh_token": b.RefreshToken}, ""), http.StatusUnauthorized)
		requireStatus(t, ts.GET("/api/auth/me", a.AccessToken), http.StatusOK)
		requireStatus(t, ts.DELETE("/api/auth/sessions/"+bID, a.AccessToken), http.StatusNotFound)
	})

	t.Run("cannot revoke another user's session", func(t *testing.T) {
		other := ts.registerAndLogin(uniqueEmail("sessions-other"), accountTestPassword)
		aID := currentSession(t, ts.sessions(a.AccessToken))
		requireStatus(t, ts.DELETE("/api/auth/sessions/"+aID, other), http.StatusNotFound)
		requireStatus(t, ts.GET("/api/auth/me", a.AccessToken), http.StatusOK)
	})

	t.Run("sign out other devices keeps the caller", func(t *testing.T) {
		var out struct {
			Revoked int `json:"revoked"`
		}
		decodeJSON(t, ts.POST("/api/auth/sessions/revoke-others", nil, a.AccessToken), &out)
		assert.Equal(t, 1, out.Revoked)
		requireStatus(t, ts.GET("/api/auth/me", first), http.StatusUnauthorized)
		rows := ts.sessions(a.AccessToken)
		require.Len(t, rows, 1)
		assert.True(t, rows[0].Current)
	})
}

func TestAccountDeletion(t *testing.T) {
	ts := setupTestServer(t)
	email := uniqueEmail("delete-me")
	token := ts.registerAndLogin(email, accountTestPassword)

	t.Run("wrong password is refused", func(t *testing.T) {
		resp := ts.deleteWithBody("/api/auth/me", map[string]string{"password": "nope"}, token)
		body := requireStatus(t, resp, http.StatusUnauthorized)
		assert.Contains(t, string(body), "password is incorrect")
	})

	t.Run("schedules deletion and signs everything out", func(t *testing.T) {
		resp := ts.deleteWithBody("/api/auth/me", map[string]string{"password": accountTestPassword}, token)
		var out struct {
			DeletionScheduledAt time.Time `json:"deletion_scheduled_at"`
		}
		decodeJSON(t, resp, &out)
		assert.WithinDuration(t, time.Now().Add(7*24*time.Hour), out.DeletionScheduledAt, time.Minute)
		requireStatus(t, ts.GET("/api/auth/me", token), http.StatusUnauthorized)
	})

	t.Run("owner can sign back in and keep the account", func(t *testing.T) {
		fresh := ts.login(email, accountTestPassword)
		var me struct {
			DeletionScheduledAt *time.Time `json:"deletion_scheduled_at"`
		}
		decodeJSON(t, ts.GET("/api/auth/me", fresh.AccessToken), &me)
		require.NotNil(t, me.DeletionScheduledAt)

		requireStatus(t, ts.POST("/api/auth/me/deletion/cancel", nil, fresh.AccessToken), http.StatusOK)
		requireStatus(t, ts.POST("/api/auth/me/deletion/cancel", nil, fresh.AccessToken), http.StatusNotFound)
		me.DeletionScheduledAt = nil
		decodeJSON(t, ts.GET("/api/auth/me", fresh.AccessToken), &me)
		assert.Nil(t, me.DeletionScheduledAt)
		token = fresh.AccessToken
	})

	t.Run("purge erases the account once the grace period is over", func(t *testing.T) {
		requireStatus(t, ts.deleteWithBody("/api/auth/me", map[string]string{"password": accountTestPassword}, token), http.StatusOK)
		ctx := context.Background()
		user, err := ts.db.GetUserByEmail(ctx, strings.ToLower(email))
		require.NoError(t, err)

		ts.srv.PurgeScheduledDeletions(ctx)
		_, err = ts.db.GetUserByEmail(ctx, strings.ToLower(email))
		require.NoError(t, err, "nothing is erased before the deletion date")

		_, err = ts.db.Pool().Exec(ctx, `UPDATE users SET deletion_scheduled_at = NOW() - INTERVAL '1 minute' WHERE id = $1`, user.ID)
		require.NoError(t, err)
		assert.GreaterOrEqual(t, ts.srv.PurgeScheduledDeletions(ctx), 1)
		_, err = ts.db.GetUserByEmail(ctx, strings.ToLower(email))
		assert.Error(t, err, "account must be gone after purge")
	})
}

func TestMetricsEndpoint(t *testing.T) {
	ts := setupTestServer(t)

	requireStatus(t, ts.GET("/api/internal/metrics", ""), http.StatusNotFound)

	ts.srv.SetMetricsToken("metrics-test-token")
	requireStatus(t, ts.GET("/api/internal/metrics", "wrong"), http.StatusNotFound)
	body := string(requireStatus(t, ts.GET("/api/internal/metrics", "metrics-test-token"), http.StatusOK))
	for _, name := range []string{
		`zcrypt_http_responses_total{class="5xx"}`,
		"zcrypt_rate_limited_total",
		"zcrypt_sse_subscribers",
		"zcrypt_sync_queue_pending",
		"zcrypt_sync_chunks_abandoned",
		"zcrypt_sync_chunks_uncommitted",
		"zcrypt_pending_deletions",
		"zcrypt_maintenance_mode 0",
	} {
		assert.Contains(t, body, name)
	}
}

func TestAccountExport(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	email := uniqueEmail("export")
	token := ts.registerAndLogin(email, accountTestPassword)
	user, err := ts.db.GetUserByEmail(ctx, strings.ToLower(email))
	require.NoError(t, err)

	operatorEmail := uniqueEmail("export-operator")
	ts.registerAndLogin(operatorEmail, accountTestPassword)
	operator, err := ts.db.GetUserByEmail(ctx, strings.ToLower(operatorEmail))
	require.NoError(t, err)

	var ownID, globalID string
	require.NoError(t, ts.db.Pool().QueryRow(ctx,
		`INSERT INTO platform_tokens (user_id, platform, username, token_encrypted, token_nonce)
		 VALUES ($1, 'github', 'own-export-acct', '\x01', '\x02') RETURNING id::text`, user.ID).Scan(&ownID))
	require.NoError(t, ts.db.Pool().QueryRow(ctx,
		`INSERT INTO platform_tokens (user_id, platform, username, token_encrypted, token_nonce, is_global)
		 VALUES ($1, 'gitlab', 'operator-shared-acct', '\x01', '\x02', TRUE) RETURNING id::text`, operator.ID).Scan(&globalID))
	t.Cleanup(func() {
		_, _ = ts.db.Pool().Exec(ctx, `DELETE FROM platform_tokens WHERE id IN ($1, $2)`, ownID, globalID)
	})

	resp := ts.GET("/api/auth/me/export", token)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	assert.Contains(t, resp.Header.Get("Content-Disposition"), "zcrypt-account-")
	raw := requireStatus(t, resp, http.StatusOK)
	var out struct {
		Version int `json:"version"`
		Account struct {
			Email string `json:"email"`
		} `json:"account"`
		Platforms []struct {
			ID string `json:"id"`
		} `json:"storage_connections"`
		Sessions []sessionRow     `json:"sessions"`
		Files    []map[string]any `json:"files"`
		Folders  []map[string]any `json:"folders"`
	}
	require.NoError(t, jsonUnmarshal(raw, &out))
	assert.Equal(t, 1, out.Version)
	assert.Equal(t, strings.ToLower(email), out.Account.Email)
	assert.NotEmpty(t, out.Sessions)
	assert.NotNil(t, out.Files)
	assert.NotNil(t, out.Folders)

	require.Len(t, out.Platforms, 1, "only the user's own storage connections are exported")
	assert.Equal(t, ownID, out.Platforms[0].ID)
	body := string(raw)
	for _, leak := range []string{globalID, operator.ID, "operator-shared-acct", "password", "totp_secret", "token_encrypted", "token_hash", "refresh_token"} {
		assert.NotContains(t, body, leak)
	}

	requireStatus(t, ts.GET("/api/auth/me/export", ""), http.StatusUnauthorized)
}
