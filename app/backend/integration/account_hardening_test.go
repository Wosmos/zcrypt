//go:build integration

package integration_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/zcrypt/zcrypt/auth"
	"github.com/zcrypt/zcrypt/types"
)

func (ts *testServer) postAs(path string, body interface{}, userAgent string) *http.Response {
	ts.t.Helper()
	data, err := json.Marshal(body)
	require.NoError(ts.t, err)
	req, err := http.NewRequest("POST", ts.URL+path, bytes.NewReader(data))
	require.NoError(ts.t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", uniqueTestIP())
	req.Header.Set("User-Agent", userAgent)
	resp, err := http.DefaultClient.Do(req)
	require.NoError(ts.t, err)
	return resp
}

func (ts *testServer) sessionTokenCount(sessionID string) int {
	ts.t.Helper()
	var n int
	require.NoError(ts.t, ts.db.Pool().QueryRow(context.Background(),
		`SELECT COUNT(*) FROM refresh_tokens WHERE COALESCE(session_id, id)::text = $1`, sessionID).Scan(&n))
	return n
}

func TestRotationAfterSignOutIsRefused(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	email := uniqueEmail("rotate-revoked")
	keep := ts.registerAndLogin(email, accountTestPassword)
	gone := ts.login(email, accountTestPassword)

	rt, err := ts.db.GetRefreshTokenByHash(ctx, auth.HashToken(gone.RefreshToken))
	require.NoError(t, err)
	requireStatus(t, ts.DELETE("/api/auth/sessions/"+rt.SessionID, keep), http.StatusOK)

	rotated, err := ts.db.RotateRefreshToken(ctx, rt.ID, time.Minute, &types.RefreshToken{
		ID:               uuid.New().String(),
		UserID:           rt.UserID,
		TokenHash:        auth.HashToken("late-successor"),
		ExpiresAt:        time.Now().Add(time.Hour),
		SessionID:        rt.SessionID,
		SessionStartedAt: rt.SessionStartedAt,
	})
	require.NoError(t, err)
	assert.False(t, rotated, "a refresh that read its token before the sign-out must not store a successor")
	assert.Zero(t, ts.sessionTokenCount(rt.SessionID))
}

func TestRefreshRacingSignOutNeverResurrectsTheSession(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()

	for i := 0; i < 8; i++ {
		email := uniqueEmail("refresh-race")
		keep := ts.registerAndLogin(email, accountTestPassword)
		victim := ts.login(email, accountTestPassword)
		rt, err := ts.db.GetRefreshTokenByHash(ctx, auth.HashToken(victim.RefreshToken))
		require.NoError(t, err)

		var wg sync.WaitGroup
		for j := 0; j < 3; j++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				ts.POST("/api/auth/refresh", map[string]string{"refresh_token": victim.RefreshToken}, "").Body.Close()
			}()
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			ts.DELETE("/api/auth/sessions/"+rt.SessionID, keep).Body.Close()
		}()
		wg.Wait()
		ts.DELETE("/api/auth/sessions/"+rt.SessionID, keep).Body.Close()

		assert.Zero(t, ts.sessionTokenCount(rt.SessionID), "round %d left a live refresh token behind", i)
		requireStatus(t, ts.POST("/api/auth/refresh", map[string]string{"refresh_token": victim.RefreshToken}, ""), http.StatusUnauthorized)
	}
}

func TestNewDeviceAlerts(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	alerts := ts.srv.CaptureNewDeviceEmails()
	email := uniqueEmail("new-device")
	ts.registerAndLogin(email, accountTestPassword)
	assert.Empty(t, alerts(), "a brand-new account's first devices are not alerted")

	_, err := ts.db.Pool().Exec(ctx, `UPDATE users SET created_at = NOW() - INTERVAL '1 day' WHERE email = $1`, strings.ToLower(email))
	require.NoError(t, err)

	login := func(ua string) tokenPair {
		var out tokenPair
		decodeJSON(t, ts.postAs("/api/auth/login", map[string]string{"email": email, "password": accountTestPassword}, ua), &out)
		require.NotEmpty(t, out.RefreshToken)
		return out
	}

	const laptop = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/131.0"
	fresh := login(laptop)
	assert.Equal(t, []string{"Firefox on Windows"}, alerts())

	requireStatus(t, ts.postAs("/api/auth/refresh", map[string]string{"refresh_token": fresh.RefreshToken}, "Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0"), http.StatusOK)
	assert.Len(t, alerts(), 1, "a token refresh is not a new sign-in")

	login(laptop)
	assert.Len(t, alerts(), 1, "a device the account already uses is not alerted")
}

func TestAccountDeletionWithTwoFactor(t *testing.T) {
	ts := setupTestServer(t)
	email := uniqueEmail("delete-2fa")
	token, secret := setup2FA(ts, t, email, accountTestPassword)

	body := requireStatus(t, ts.deleteWithBody("/api/auth/me", map[string]string{"password": accountTestPassword}, token), http.StatusUnauthorized)
	assert.Contains(t, string(body), "invalid 2FA code")

	body = requireStatus(t, ts.deleteWithBody("/api/auth/me", map[string]string{"password": accountTestPassword, "code": "000000"}, token), http.StatusUnauthorized)
	assert.Contains(t, string(body), "invalid 2FA code")

	code := auth.TOTPCodeAt(secret, time.Now().Add(30*time.Second))
	requireStatus(t, ts.deleteWithBody("/api/auth/me", map[string]string{"password": accountTestPassword, "code": code}, token), http.StatusOK)
	requireStatus(t, ts.GET("/api/auth/me", token), http.StatusUnauthorized)
}

func TestAccountRoutesInDecoySessions(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	email := uniqueEmail("decoy-account")
	decoyPassword := newTestPassword()
	real := ts.registerAndLogin(email, accountTestPassword)
	requireStatus(t, ts.POST("/api/decoy/setup", map[string]interface{}{"decoy_password": decoyPassword}, real), http.StatusOK)
	requireStatus(t, ts.POST("/api/decoy/files", map[string]interface{}{"name": "tax-return-2025.pdf", "size": 1234}, real), http.StatusCreated)
	user, err := ts.db.GetUserByEmail(ctx, strings.ToLower(email))
	require.NoError(t, err)

	decoy := ts.login(email, decoyPassword)
	realID := currentSession(t, ts.sessions(real))

	t.Run("export holds only what the decoy sees", func(t *testing.T) {
		var out struct {
			Account struct {
				Email               string     `json:"email"`
				DeletionScheduledAt *time.Time `json:"deletion_scheduled_at"`
			} `json:"account"`
			Platforms       []map[string]any `json:"storage_connections"`
			Sessions        []sessionRow     `json:"sessions"`
			Files           []map[string]any `json:"files"`
			Folders         []map[string]any `json:"folders"`
			SecurityHistory []map[string]any `json:"security_history"`
		}
		resp := ts.GET("/api/auth/me/export", decoy.AccessToken)
		assert.Contains(t, resp.Header.Get("Content-Disposition"), "zcrypt-account-")
		decodeJSON(t, resp, &out)
		assert.Equal(t, strings.ToLower(email), out.Account.Email)
		require.Len(t, out.Files, 1)
		assert.Equal(t, "tax-return-2025.pdf", out.Files[0]["original_name"])
		require.Len(t, out.Sessions, 1)
		assert.True(t, out.Sessions[0].Current)
		assert.NotNil(t, out.Platforms)
		assert.NotNil(t, out.Folders)
		assert.Empty(t, out.SecurityHistory)
	})

	t.Run("signing out other devices is a quiet no-op", func(t *testing.T) {
		var out struct {
			Revoked int `json:"revoked"`
		}
		decodeJSON(t, ts.POST("/api/auth/sessions/revoke-others", nil, decoy.AccessToken), &out)
		assert.Zero(t, out.Revoked)
		requireStatus(t, ts.GET("/api/auth/me", real), http.StatusOK)
	})

	t.Run("the real session is invisible to revoke", func(t *testing.T) {
		requireStatus(t, ts.DELETE("/api/auth/sessions/"+realID, decoy.AccessToken), http.StatusNotFound)
		requireStatus(t, ts.GET("/api/auth/me", real), http.StatusOK)
	})

	t.Run("no deletion is pending to cancel", func(t *testing.T) {
		requireStatus(t, ts.POST("/api/auth/me/deletion/cancel", nil, decoy.AccessToken), http.StatusNotFound)
	})

	t.Run("delete checks the decoy password and schedules nothing", func(t *testing.T) {
		body := requireStatus(t, ts.deleteWithBody("/api/auth/me", map[string]string{"password": accountTestPassword}, decoy.AccessToken), http.StatusUnauthorized)
		assert.Contains(t, string(body), "password is incorrect")

		var out struct {
			DeletionScheduledAt time.Time `json:"deletion_scheduled_at"`
		}
		decodeJSON(t, ts.deleteWithBody("/api/auth/me", map[string]string{"password": decoyPassword}, decoy.AccessToken), &out)
		assert.WithinDuration(t, time.Now().Add(7*24*time.Hour), out.DeletionScheduledAt, time.Minute)
		requireStatus(t, ts.GET("/api/auth/me", decoy.AccessToken), http.StatusUnauthorized)

		requireStatus(t, ts.GET("/api/auth/me", real), http.StatusOK)
		after, err := ts.db.GetUserByID(ctx, user.ID)
		require.NoError(t, err)
		assert.Nil(t, after.DeletionScheduledAt)
	})

	t.Run("a real pending deletion does not show in a decoy session", func(t *testing.T) {
		requireStatus(t, ts.deleteWithBody("/api/auth/me", map[string]string{"password": accountTestPassword}, real), http.StatusOK)

		var login struct {
			AccessToken string         `json:"access_token"`
			User        map[string]any `json:"user"`
		}
		decodeJSON(t, ts.POST("/api/auth/login", map[string]string{"email": email, "password": decoyPassword}, ""), &login)
		require.NotEmpty(t, login.AccessToken)
		assert.NotContains(t, login.User, "deletion_scheduled_at")

		var me map[string]any
		decodeJSON(t, ts.GET("/api/auth/me", login.AccessToken), &me)
		assert.NotContains(t, me, "deletion_scheduled_at")

		after, err := ts.db.GetUserByID(ctx, user.ID)
		require.NoError(t, err)
		assert.NotNil(t, after.DeletionScheduledAt)
	})
}
