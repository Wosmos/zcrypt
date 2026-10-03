//go:build integration

package integration_test

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/zcrypt/zcrypt/auth"
)

func (ts *testServer) postFrom(ip, path string, body interface{}, token string) *http.Response {
	ts.t.Helper()
	data, err := json.Marshal(body)
	require.NoError(ts.t, err)
	req, err := http.NewRequest("POST", ts.URL+path, bytes.NewReader(data))
	require.NoError(ts.t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", ip)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	require.NoError(ts.t, err)
	return resp
}

func freshUser(ts *testServer, t *testing.T, email, password string) string {
	t.Helper()
	_, err := ts.db.Pool().Exec(context.Background(), `DELETE FROM users WHERE email = $1`, email)
	require.NoError(t, err)
	return ts.registerAndLogin(email, password)
}

func TestLoginLimiterCountsOnlyFailuresPerEmailAndIP(t *testing.T) {
	ts := setupTestServer(t)
	const email = "limiter@example.com"
	password := newTestPassword()
	freshUser(ts, t, email, password)

	login := func(pw string) int {
		resp := ts.POST("/api/auth/login", map[string]string{"email": email, "password": pw}, "")
		resp.Body.Close()
		return resp.StatusCode
	}

	for i := 0; i < 6; i++ {
		assert.Equal(t, http.StatusOK, login(password), "successful login %d must not spend the failure budget", i+1)
	}

	attacker := "203.0.113.7"
	for i := 0; i < 3; i++ {
		resp := ts.postFrom(attacker, "/api/auth/login", map[string]string{"email": email, "password": newTestPassword()}, "")
		resp.Body.Close()
		require.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	}
	resp := ts.postFrom(attacker, "/api/auth/login", map[string]string{"email": email, "password": password}, "")
	body := requireStatus(t, resp, http.StatusTooManyRequests)
	assert.Contains(t, string(body), "too many attempts for this email", "the guessing IP is cut off for this email")

	assert.Equal(t, http.StatusOK, login(password), "the owner, from another IP, is not locked out")
}

func TestPasswordOverBcryptLimitIsRejectedClearly(t *testing.T) {
	ts := setupTestServer(t)
	long := newTestPasswordOfLength(73)
	require.Len(t, long, 73)

	resp := ts.POST("/api/auth/register", map[string]interface{}{
		"email": "toolong@example.com", "username": "too_long_pw", "password": long, "force": true,
	}, "")
	body := requireStatus(t, resp, http.StatusBadRequest)
	assert.Contains(t, string(body), "at most 72 bytes")

	exact := newTestPasswordOfLength(72)
	_, err := ts.db.Pool().Exec(context.Background(), `DELETE FROM users WHERE email = 'exact72@example.com'`)
	require.NoError(t, err)
	resp = ts.POST("/api/auth/register", map[string]interface{}{
		"email": "exact72@example.com", "username": "exact_72_pw", "password": exact, "force": true,
	}, "")
	requireStatus(t, resp, http.StatusCreated)
}

func TestTwoFAToggleSignsOutOtherSessions(t *testing.T) {
	ts := setupTestServer(t)
	const email = "twofa-rotate@example.com"
	password := newTestPassword()
	first := freshUser(ts, t, email, password)
	other := ts.loginToken(email, password)

	body := requireStatus(t, ts.POST("/api/auth/2fa/setup", map[string]string{}, first), http.StatusOK)
	var setup struct {
		Secret string `json:"secret"`
	}
	require.NoError(t, jsonUnmarshal(body, &setup))
	secret := setup.Secret
	body = requireStatus(t, ts.POST("/api/auth/2fa/enable", map[string]string{
		"code": auth.TOTPCodeAt(secret, time.Now()),
	}, first), http.StatusOK)
	var enabled struct {
		AccessToken string `json:"access_token"`
	}
	require.NoError(t, jsonUnmarshal(body, &enabled))
	token := enabled.AccessToken

	resp := ts.GET("/api/auth/me", other)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "enabling 2FA revokes every other session")
	resp.Body.Close()
	requireStatus(t, ts.GET("/api/auth/me", token), http.StatusOK)

	resp = ts.POST("/api/auth/2fa/disable", map[string]string{
		"password": password,
		"code":     auth.TOTPCodeAt(secret, time.Now().Add(30*time.Second)),
	}, token)
	body = requireStatus(t, resp, http.StatusOK)
	var disabled struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
	}
	require.NoError(t, jsonUnmarshal(body, &disabled))
	require.NotEmpty(t, disabled.AccessToken)
	require.NotEmpty(t, disabled.RefreshToken)

	resp = ts.GET("/api/auth/me", token)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "disabling 2FA revokes the old session too")
	resp.Body.Close()
	requireStatus(t, ts.GET("/api/auth/me", disabled.AccessToken), http.StatusOK)

	resp = ts.POST("/api/auth/refresh", map[string]string{"refresh_token": disabled.RefreshToken}, "")
	requireStatus(t, resp, http.StatusOK)
}

func TestTwoFADisableIsRateLimitedBeforePasswordCheck(t *testing.T) {
	ts := setupTestServer(t)
	const email = "twofa-oracle@example.com"
	password := newTestPassword()
	token, _ := setup2FA(ts, t, email, password)

	sawLimited := false
	for i := 0; i < 8 && !sawLimited; i++ {
		resp := ts.POST("/api/auth/2fa/disable", map[string]string{"password": newTestPassword(), "code": "000000"}, token)
		resp.Body.Close()
		if resp.StatusCode == http.StatusTooManyRequests {
			sawLimited = true
		}
	}
	assert.True(t, sawLimited, "password guesses through 2FA disable must hit the limiter")
}

func TestAdminRoleChangeRequiresReauth(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	const adminEmail = "role-admin@example.com"
	adminPass := newTestPassword()
	freshUser(ts, t, adminEmail, adminPass)
	ts.makeAdmin(ctx, adminEmail)
	adminToken := ts.loginToken(adminEmail, adminPass)

	freshUser(ts, t, "role-target@example.com", newTestPassword())
	target, err := ts.db.GetUserByEmail(ctx, "role-target@example.com")
	require.NoError(t, err)

	put := func(body map[string]string) *http.Response {
		data, err := json.Marshal(body)
		require.NoError(t, err)
		req, err := http.NewRequest("PUT", ts.URL+"/api/admin/users/"+target.ID+"/role", bytes.NewReader(data))
		require.NoError(t, err)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Forwarded-For", uniqueTestIP())
		req.Header.Set("Authorization", "Bearer "+adminToken)
		resp, err := http.DefaultClient.Do(req)
		require.NoError(t, err)
		return resp
	}
	role := func() string {
		u, err := ts.db.GetUserByID(ctx, target.ID)
		require.NoError(t, err)
		return u.Role.String()
	}

	resp := put(map[string]string{"role": "admin"})
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	resp.Body.Close()
	assert.Equal(t, "user", role(), "no password, no promotion")

	resp = put(map[string]string{"role": "admin", "password": newTestPassword()})
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	resp.Body.Close()
	assert.Equal(t, "user", role())

	requireStatus(t, put(map[string]string{"role": "admin", "password": adminPass}), http.StatusOK)
	assert.Equal(t, "admin", role())
}

func TestAdminTokenChangesRequireReauth(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	const adminEmail = "token-admin@example.com"
	adminPass := newTestPassword()
	freshUser(ts, t, adminEmail, adminPass)
	ts.makeAdmin(ctx, adminEmail)
	adminToken := ts.loginToken(adminEmail, adminPass)
	const tokenID = "00000000-0000-0000-0000-000000000001"

	send := func(method, path string, body map[string]interface{}) (int, string) {
		data, err := json.Marshal(body)
		require.NoError(t, err)
		req, err := http.NewRequest(method, ts.URL+path, bytes.NewReader(data))
		require.NoError(t, err)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Forwarded-For", uniqueTestIP())
		req.Header.Set("Authorization", "Bearer "+adminToken)
		resp, err := http.DefaultClient.Do(req)
		require.NoError(t, err)
		defer resp.Body.Close()
		var out struct {
			Error string `json:"error"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&out)
		return resp.StatusCode, out.Error
	}

	status, msg := send("POST", "/api/admin/tokens", map[string]interface{}{"platform": "github", "token": "ghp_x"})
	assert.Equal(t, http.StatusForbidden, status)
	assert.Contains(t, msg, "re-authentication required")

	status, msg = send("PUT", "/api/admin/tokens/"+tokenID+"/scope", map[string]interface{}{"is_global": true})
	assert.Equal(t, http.StatusForbidden, status)
	assert.Contains(t, msg, "re-authentication required")

	status, msg = send("DELETE", "/api/admin/tokens/"+tokenID, map[string]interface{}{"password": newTestPassword()})
	assert.Equal(t, http.StatusForbidden, status)
	assert.Contains(t, msg, "re-authentication required")

	status, msg = send("DELETE", "/api/admin/tokens/"+tokenID, map[string]interface{}{"password": adminPass})
	assert.Equal(t, http.StatusForbidden, status)
	assert.Contains(t, msg, "not owned by you", "a re-authenticated admin reaches the ownership check")
}

func TestAdminReauthFailuresAreLimitedPerAdmin(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	const adminEmail = "reauth-limit-admin@example.com"
	adminPass := newTestPassword()
	freshUser(ts, t, adminEmail, adminPass)
	ts.makeAdmin(ctx, adminEmail)
	adminToken := ts.loginToken(adminEmail, adminPass)

	sawLimited := false
	for i := 0; i < 8; i++ {
		resp := ts.POST("/api/admin/tokens", map[string]interface{}{
			"platform": "github", "token": "ghp_x", "password": newTestPassword(),
		}, adminToken)
		resp.Body.Close()
		if resp.StatusCode == http.StatusTooManyRequests {
			sawLimited = true
			break
		}
		assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	}
	assert.True(t, sawLimited, "wrong passwords from rotating IPs must still hit the per-admin limiter")
}

func openEvents(ts *testServer, t *testing.T, query string) *http.Response {
	t.Helper()
	req, err := http.NewRequest("GET", ts.URL+"/api/events?"+query, nil)
	require.NoError(t, err)
	req.Header.Set("X-Forwarded-For", uniqueTestIP())
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	return resp
}

func sseTicket(ts *testServer, t *testing.T, token string) string {
	t.Helper()
	body := requireStatus(t, ts.POST("/api/sse/ticket", map[string]string{}, token), http.StatusOK)
	var out struct {
		Ticket string `json:"ticket"`
	}
	require.NoError(t, jsonUnmarshal(body, &out))
	require.NotEmpty(t, out.Ticket)
	return out.Ticket
}

func TestSSETicketIsSingleUseAndRevocable(t *testing.T) {
	ts := setupTestServer(t)
	const email = "sse-ticket@example.com"
	password := newTestPassword()
	token := freshUser(ts, t, email, password)

	ticket := sseTicket(ts, t, token)
	resp := openEvents(ts, t, "ticket="+ticket)
	require.Equal(t, http.StatusOK, resp.StatusCode)
	line, err := bufio.NewReader(resp.Body).ReadString('\n')
	require.NoError(t, err)
	assert.Equal(t, "event: connected\n", line)
	resp.Body.Close()

	resp = openEvents(ts, t, "ticket="+ticket)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "a ticket opens one stream only")
	resp.Body.Close()

	resp = openEvents(ts, t, "ticket=made-up")
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	resp.Body.Close()

	resp = ts.POST("/api/sse/ticket", map[string]string{}, "")
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "tickets need a valid session")
	resp.Body.Close()

	pending := sseTicket(ts, t, token)
	resp = ts.POST("/api/auth/change-password", map[string]interface{}{
		"current_password": password, "new_password": newTestPassword(), "force": true,
	}, token)
	requireStatus(t, resp, http.StatusOK)

	resp = openEvents(ts, t, "ticket="+pending)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "a ticket from a revoked session must not stream")
	resp.Body.Close()

	resp = openEvents(ts, t, "token="+token)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "the legacy token path checks revocation too")
	resp.Body.Close()
}
