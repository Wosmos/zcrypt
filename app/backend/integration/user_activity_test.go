//go:build integration

package integration_test

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUserActivityOwnEventsForNonAdmin(t *testing.T) {
	ts := setupTestServer(t)

	tokenA := ts.registerAndLogin("activity-a@example.com", "SecurePass@123!")
	tokenB := ts.registerAndLogin("activity-b@example.com", "SecurePass@123!")

	type event struct {
		UserID    *string `json:"user_id"`
		EventType string  `json:"event_type"`
	}
	fetch := func(token string) []event {
		var out []event
		require.Eventually(t, func() bool {
			resp := ts.GET("/api/auth/activity", token)
			if resp.StatusCode != 200 {
				resp.Body.Close()
				return false
			}
			out = nil
			decodeJSON(t, resp, &out)
			return len(out) > 0
		}, 5*time.Second, 100*time.Millisecond)
		return out
	}

	t.Run("unauthenticated is rejected", func(t *testing.T) {
		resp := ts.GET("/api/auth/activity", "")
		defer resp.Body.Close()
		assert.Equal(t, 401, resp.StatusCode)
	})

	t.Run("non-admin gets own events only", func(t *testing.T) {
		a := fetch(tokenA)
		b := fetch(tokenB)
		require.NotEmpty(t, a)
		require.NotEmpty(t, b)
		var idA, idB string
		for _, e := range a {
			require.NotNil(t, e.UserID)
			if idA == "" {
				idA = *e.UserID
			}
			assert.Equal(t, idA, *e.UserID)
		}
		for _, e := range b {
			require.NotNil(t, e.UserID)
			if idB == "" {
				idB = *e.UserID
			}
			assert.Equal(t, idB, *e.UserID)
		}
		assert.NotEqual(t, idA, idB)
	})
}

func TestUserActivityHiddenFromDecoySessions(t *testing.T) {
	ts := setupTestServer(t)
	const email = "activity-decoy@example.com"
	password := newTestPassword()
	decoyPassword := newTestPassword()

	_, err := ts.db.Pool().Exec(context.Background(), `DELETE FROM users WHERE email = $1`, email)
	require.NoError(t, err)
	real := ts.registerAndLogin(email, password)
	requireStatus(t, ts.POST("/api/decoy/setup", map[string]interface{}{"decoy_password": decoyPassword}, real), 200)

	resp := ts.POST("/api/auth/login", map[string]string{"email": email, "password": decoyPassword}, "")
	body := requireStatus(t, resp, 200)
	var tokens struct {
		AccessToken string `json:"access_token"`
	}
	require.NoError(t, jsonUnmarshal(body, &tokens))
	require.NotEmpty(t, tokens.AccessToken)

	t.Run("a decoy session sees no events at all", func(t *testing.T) {
		resp := ts.GET("/api/auth/activity", tokens.AccessToken)
		body := requireStatus(t, resp, 200)
		assert.JSONEq(t, `[]`, string(body))
		assert.NotContains(t, string(body), "login_decoy")
	})

	t.Run("the real session still sees its own history including the decoy sign-in", func(t *testing.T) {
		require.Eventually(t, func() bool {
			resp := ts.GET("/api/auth/activity", real)
			if resp.StatusCode != 200 {
				resp.Body.Close()
				return false
			}
			var out []struct {
				EventType string `json:"event_type"`
			}
			decodeJSON(t, resp, &out)
			for _, e := range out {
				if e.EventType == "login_decoy" {
					return true
				}
			}
			return false
		}, 5*time.Second, 100*time.Millisecond)
	})
}
