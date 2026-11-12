//go:build integration

package integration_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/zcrypt/zcrypt/config"
)

// postWith sends a JSON POST with extra headers (client marker, forwarded
// addresses) and returns the status and decoded body.
func (ts *testServer) postWith(path string, body interface{}, headers map[string]string) (int, map[string]interface{}) {
	ts.t.Helper()
	data, err := json.Marshal(body)
	require.NoError(ts.t, err)
	req, err := http.NewRequest(http.MethodPost, ts.URL+path, bytes.NewReader(data))
	require.NoError(ts.t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", uniqueTestIP())
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := http.DefaultClient.Do(req)
	require.NoError(ts.t, err)
	defer resp.Body.Close()
	out := map[string]interface{}{}
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return resp.StatusCode, out
}

func asClient(marker string) map[string]string {
	return map[string]string{"X-Zcrypt-Client": marker}
}

func TestSessionEndsWhenAnotherAppRefreshesIt(t *testing.T) {
	ts := setupTestServer(t)
	email := uniqueEmail("swap")
	ts.registerAndLogin(email, accountTestPassword)
	creds := map[string]string{"email": email, "password": accountTestPassword}

	t.Run("the same app keeps refreshing", func(t *testing.T) {
		code, pair := ts.postWith("/api/auth/login", creds, asClient("web/0.2.3"))
		require.Equal(t, http.StatusOK, code)
		code, next := ts.postWith("/api/auth/refresh", map[string]string{"refresh_token": pair["refresh_token"].(string)}, asClient("web/0.2.4"))
		require.Equal(t, http.StatusOK, code, "a new version of the same app is the same app")
		code, _ = ts.postWith("/api/auth/refresh", map[string]string{"refresh_token": next["refresh_token"].(string)}, asClient("web/0.2.4"))
		assert.Equal(t, http.StatusOK, code)
	})

	t.Run("a different app ends the session", func(t *testing.T) {
		code, pair := ts.postWith("/api/auth/login", creds, asClient("desktop-windows/0.2.3"))
		require.Equal(t, http.StatusOK, code)
		refresh := pair["refresh_token"].(string)
		code, body := ts.postWith("/api/auth/refresh", map[string]string{"refresh_token": refresh}, nil)
		require.Equal(t, http.StatusUnauthorized, code, "a refresh without the marker is another program")
		assert.Equal(t, "session_client_changed", body["code"])

		code, _ = ts.postWith("/api/auth/refresh", map[string]string{"refresh_token": refresh}, asClient("desktop-windows/0.2.3"))
		assert.Equal(t, http.StatusUnauthorized, code, "the session is gone, even for the app that started it")
		requireStatus(t, ts.GET("/api/auth/me", pair["access_token"].(string)), http.StatusUnauthorized)
	})

	t.Run("an unknown or malformed marker counts as none", func(t *testing.T) {
		code, pair := ts.postWith("/api/auth/login", creds, asClient("android/0.2.3"))
		require.Equal(t, http.StatusOK, code)
		code, _ = ts.postWith("/api/auth/refresh", map[string]string{"refresh_token": pair["refresh_token"].(string)}, asClient("android-bot/0.2.3"))
		assert.Equal(t, http.StatusUnauthorized, code)
	})

	t.Run("a session from before the marker binds on its first marked refresh", func(t *testing.T) {
		code, pair := ts.postWith("/api/auth/login", creds, nil)
		require.Equal(t, http.StatusOK, code)
		code, next := ts.postWith("/api/auth/refresh", map[string]string{"refresh_token": pair["refresh_token"].(string)}, asClient("android/0.2.3"))
		require.Equal(t, http.StatusOK, code, "an old session keeps working")
		code, body := ts.postWith("/api/auth/refresh", map[string]string{"refresh_token": next["refresh_token"].(string)}, asClient("web/0.2.3"))
		assert.Equal(t, http.StatusUnauthorized, code, "once marked, the session belongs to that app")
		assert.Equal(t, "session_client_changed", body["code"])
	})
}

func TestCloudNetworksCantSignIn(t *testing.T) {
	ts := setupTestServer(t)
	email := uniqueEmail("cloud")
	ts.registerAndLogin(email, accountTestPassword)
	ts.srv.SetCloudNetworksForTest("203.0.113.0/24")
	creds := map[string]string{"email": email, "password": accountTestPassword}
	from := func(ip string) map[string]string { return map[string]string{"X-Forwarded-For": ip} }

	code, body := ts.postWith("/api/auth/login", creds, from("203.0.113.5"))
	assert.Equal(t, http.StatusForbidden, code)
	assert.Equal(t, "network_blocked", body["code"])

	code, _ = ts.postWith("/api/auth/register", map[string]interface{}{
		"email": uniqueEmail("cloud-new"), "username": "cloudnew", "password": accountTestPassword, "force": true,
	}, from("203.0.113.6"))
	assert.Equal(t, http.StatusForbidden, code, "sign-up is refused too")

	code, _ = ts.postWith("/api/auth/magic-link", map[string]string{"email": email}, from("203.0.113.7"))
	assert.Equal(t, http.StatusForbidden, code, "sign-in links are refused too")

	code, pair := ts.postWith("/api/auth/login", creds, from("198.51.100.7"))
	require.Equal(t, http.StatusOK, code, "a home connection signs in")

	code, _ = ts.postWith("/api/auth/refresh", map[string]string{"refresh_token": pair["refresh_token"].(string)}, from("203.0.113.8"))
	assert.Equal(t, http.StatusForbidden, code, "a session can't be refreshed from a server")

	code, _ = ts.postWith("/api/auth/login", creds, map[string]string{
		"X-Forwarded-For":        "203.0.113.9",
		"X-Vercel-Forwarded-For": "198.51.100.8",
	})
	assert.Equal(t, http.StatusOK, code, "the site's proxy runs in a cloud; the person behind it is who counts")

	code, _ = ts.postWith("/api/auth/login", creds, map[string]string{
		"X-Forwarded-For":        "203.0.113.10",
		"X-Vercel-Forwarded-For": "203.0.113.11",
	})
	assert.Equal(t, http.StatusForbidden, code, "a person on a cloud network behind the proxy is still refused")
}

func TestTurnstileOnWebForms(t *testing.T) {
	verify := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		ok := r.Form.Get("response") == "good" && r.Form.Get("secret") == "test-secret"
		_ = json.NewEncoder(w).Encode(map[string]bool{"success": ok})
	}))
	defer verify.Close()

	ts := setupTestServerWith(t, func(c *config.Config) { c.TurnstileSecret = "test-secret" })
	ts.srv.SetTurnstileURLForTest(verify.URL)

	email := uniqueEmail("bot")
	username := fmt.Sprintf("bot_%d", time.Now().UnixNano()%1_000_000_000)
	code, body := ts.postWith("/api/auth/register", map[string]interface{}{
		"email": email, "username": username, "password": accountTestPassword, "force": true,
	}, asClient("web/0.2.3"))
	require.Equal(t, http.StatusBadRequest, code)
	assert.Equal(t, "bot_check_failed", body["code"])

	code, _ = ts.postWith("/api/auth/register", map[string]interface{}{
		"email": email, "username": username, "password": accountTestPassword, "force": true, "turnstile_token": "good",
	}, asClient("web/0.2.3"))
	require.Equal(t, http.StatusCreated, code)

	creds := map[string]string{"email": email, "password": accountTestPassword, "turnstile_token": "bad"}
	code, body = ts.postWith("/api/auth/login", creds, asClient("web/0.2.3"))
	assert.Equal(t, http.StatusBadRequest, code)
	assert.Equal(t, "bot_check_failed", body["code"])

	code, _ = ts.postWith("/api/auth/login", creds, nil)
	assert.Equal(t, http.StatusBadRequest, code, "a request that names no app gets the check")

	creds["turnstile_token"] = "good"
	code, _ = ts.postWith("/api/auth/login", creds, asClient("web/0.2.3"))
	assert.Equal(t, http.StatusOK, code)

	delete(creds, "turnstile_token")
	code, _ = ts.postWith("/api/auth/login", creds, asClient("desktop-macos/0.2.3"))
	assert.Equal(t, http.StatusOK, code, "the apps have no widget and skip the check")

	code, body = ts.postWith("/api/auth/forgot-password", map[string]string{"email": email}, asClient("web/0.2.3"))
	assert.Equal(t, http.StatusBadRequest, code)
	assert.Equal(t, "bot_check_failed", body["code"])

	verify.Close()
	code, _ = ts.postWith("/api/auth/login", map[string]string{"email": email, "password": accountTestPassword, "turnstile_token": "x"}, asClient("web/0.2.3"))
	assert.Equal(t, http.StatusOK, code, "if Cloudflare can't be reached, people still get in")
}
