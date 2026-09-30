//go:build integration

package integration_test

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/zcrypt/zcrypt/auth"
)

func desktopChallenge(verifier string) string {
	sum := sha256.Sum256([]byte(verifier))
	return hex.EncodeToString(sum[:])
}

func oauthStart(ts *testServer, t *testing.T, query string) *http.Response {
	t.Helper()
	req, err := http.NewRequest("GET", ts.URL+"/api/auth/oauth/google?"+query, nil)
	require.NoError(t, err)
	req.Header.Set("X-Forwarded-For", uniqueTestIP())
	client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := client.Do(req)
	require.NoError(t, err)
	return resp
}

func TestDesktopOAuthPKCE(t *testing.T) {
	ts := setupTestServer(t)
	const email = "oauth-desktop-pkce@example.com"
	_, err := ts.db.Pool().Exec(context.Background(), `DELETE FROM users WHERE email = $1`, email)
	require.NoError(t, err)
	ts.registerAndLogin(email, "SecurePass@123!")
	_, err = ts.db.Pool().Exec(context.Background(), `UPDATE users SET email_verified = true WHERE email = $1`, email)
	require.NoError(t, err)
	_, err = ts.db.Pool().Exec(context.Background(), `DELETE FROM oauth_providers WHERE provider_id = 'g-desktop-pkce'`)
	require.NoError(t, err)

	stub := oauthStubProvider(t, "g-desktop-pkce", email)
	restore := auth.SetOAuthEndpointsForTest("google", stub.URL+"/token", stub.URL+"/userinfo")
	t.Cleanup(restore)
	ts.srv.EnableTestOAuth("google", "cid", "csecret")

	session := "00112233445566778899aabbccddeeff"
	verifier := "a1a2a3a4a5a6a7a8a9b1b2b3b4b5b6b7b8b9c1c2c3c4c5c6c7c8c9d1d2d3d4d5"
	challenge := desktopChallenge(verifier)

	resp := oauthStart(ts, t, "platform=desktop&session="+session+"&challenge=abcd")
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	resp.Body.Close()

	resp = oauthStart(ts, t, "platform=desktop&session="+session+"&challenge="+challenge)
	require.Equal(t, http.StatusTemporaryRedirect, resp.StatusCode)
	var state string
	for _, c := range resp.Cookies() {
		if c.Name == "oauth_state" {
			state = c.Value
		}
	}
	resp.Body.Close()
	require.Equal(t, "desktop:"+session+":"+challenge+":", state[:len("desktop:")+len(session)+len(challenge)+2])

	resp = oauthCallback(ts, t, state)
	require.Equal(t, http.StatusTemporaryRedirect, resp.StatusCode)
	relay := resp.Header.Get("Location")
	resp.Body.Close()
	approveDesktopRelay(ts, t, relay)

	base := "/api/auth/oauth/desktop-poll?session=" + session

	resp = ts.GET(base, "")
	assert.Equal(t, http.StatusNotFound, resp.StatusCode, "a PKCE session cannot be polled without its verifier")
	resp.Body.Close()

	resp = ts.GET(base+"&verifier=zz", "")
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	resp.Body.Close()

	wrong := "0000000000000000000000000000000000000000000000000000000000000000"
	resp = ts.GET(base+"&verifier="+wrong, "")
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
	resp.Body.Close()

	resp = ts.GET(base+"&verifier="+challenge, "")
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
	resp.Body.Close()

	resp = ts.GET(base+"&verifier="+verifier, "")
	body := requireStatus(t, resp, http.StatusOK)
	var tokens struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
		Challenge    string `json:"challenge"`
	}
	require.NoError(t, jsonUnmarshal(body, &tokens))
	assert.NotEmpty(t, tokens.AccessToken)
	assert.NotEmpty(t, tokens.RefreshToken)
	assert.Empty(t, tokens.Challenge)

	resp = ts.GET(base+"&verifier="+verifier, "")
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
	resp.Body.Close()
}

func desktopRelayParams(t *testing.T, location string) url.Values {
	t.Helper()
	i := strings.Index(location, "#")
	require.GreaterOrEqual(t, i, 0, "relay redirect must carry the approval in the fragment: %s", location)
	v, err := url.ParseQuery(location[i+1:])
	require.NoError(t, err)
	return v
}

func approveDesktopRelay(ts *testServer, t *testing.T, location string) {
	t.Helper()
	p := desktopRelayParams(t, location)
	requireStatus(t, ts.POST("/api/auth/oauth/desktop-approve", map[string]string{
		"session": p.Get("session"), "token": p.Get("approve"),
	}, ""), http.StatusOK)
}

func setupDesktopOAuth(t *testing.T, ts *testServer, email, providerID string) {
	t.Helper()
	_, err := ts.db.Pool().Exec(context.Background(), `DELETE FROM users WHERE email = $1`, email)
	require.NoError(t, err)
	ts.registerAndLogin(email, "SecurePass@123!")
	_, err = ts.db.Pool().Exec(context.Background(), `UPDATE users SET email_verified = true WHERE email = $1`, email)
	require.NoError(t, err)
	_, err = ts.db.Pool().Exec(context.Background(), `DELETE FROM oauth_providers WHERE provider_id = $1`, providerID)
	require.NoError(t, err)
	stub := oauthStubProvider(t, providerID, email)
	restore := auth.SetOAuthEndpointsForTest("google", stub.URL+"/token", stub.URL+"/userinfo")
	t.Cleanup(restore)
	ts.srv.EnableTestOAuth("google", "cid", "csecret")
}

func startDesktopState(ts *testServer, t *testing.T, query string) string {
	t.Helper()
	resp := oauthStart(ts, t, query)
	defer resp.Body.Close()
	require.Equal(t, http.StatusTemporaryRedirect, resp.StatusCode)
	for _, c := range resp.Cookies() {
		if c.Name == "oauth_state" {
			return c.Value
		}
	}
	t.Fatal("no oauth_state cookie")
	return ""
}

func TestDesktopOAuthRequiresBrowserApproval(t *testing.T) {
	ts := setupTestServer(t)
	setupDesktopOAuth(t, ts, "oauth-desktop-approve@example.com", "g-desktop-approve")

	session := "aabbccddeeff00112233445566778899"
	verifier := "b1b2b3b4b5b6b7b8b9c1c2c3c4c5c6c7c8c9d1d2d3d4d5d6d7d8d9e1e2e3e4e5"
	challenge := desktopChallenge(verifier)
	poll := "/api/auth/oauth/desktop-poll?session=" + session + "&verifier=" + verifier

	t.Run("a link crafted by an attacker yields nothing until the victim approves", func(t *testing.T) {
		state := startDesktopState(ts, t, "platform=desktop&session="+session+"&challenge="+challenge)
		resp := oauthCallback(ts, t, state)
		relay := resp.Header.Get("Location")
		resp.Body.Close()
		p := desktopRelayParams(t, relay)
		assert.Equal(t, strings.ToUpper(challenge[:6]), p.Get("code"))

		resp = ts.GET(poll, "")
		assert.Equal(t, http.StatusNotFound, resp.StatusCode, "correct verifier, but not approved")
		resp.Body.Close()

		bad := ts.POST("/api/auth/oauth/desktop-approve", map[string]string{
			"session": session, "token": "00000000000000000000000000000000",
		}, "")
		assert.Equal(t, http.StatusNotFound, bad.StatusCode)
		bad.Body.Close()
		resp = ts.GET(poll, "")
		assert.Equal(t, http.StatusNotFound, resp.StatusCode, "a wrong approval token releases nothing")
		resp.Body.Close()

		approveDesktopRelay(ts, t, relay)
		resp = ts.GET(poll, "")
		body := requireStatus(t, resp, http.StatusOK)
		assert.Contains(t, string(body), "access_token")
	})

	t.Run("a guessed approval token is refused", func(t *testing.T) {
		other := "99887766554433221100ffeeddccbbaa"
		state := startDesktopState(ts, t, "platform=desktop&session="+other+"&challenge="+challenge)
		resp := oauthCallback(ts, t, state)
		resp.Body.Close()
		stale := ts.POST("/api/auth/oauth/desktop-approve", map[string]string{
			"session": other, "token": "00000000000000000000000000000001",
		}, "")
		assert.Equal(t, http.StatusNotFound, stale.StatusCode)
		stale.Body.Close()
	})
}

func TestDesktopOAuthLegacyClientNeedsApproval(t *testing.T) {
	ts := setupTestServer(t)
	setupDesktopOAuth(t, ts, "oauth-desktop-legacy@example.com", "g-desktop-legacy")

	session := "1122334455667788990011223344aabb"
	state := startDesktopState(ts, t, "platform=desktop&session="+session)
	resp := oauthCallback(ts, t, state)
	relay := resp.Header.Get("Location")
	resp.Body.Close()
	assert.Empty(t, desktopRelayParams(t, relay).Get("code"), "no challenge, no code to compare")

	poll := "/api/auth/oauth/desktop-poll?session=" + session
	resp = ts.GET(poll, "")
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
	resp.Body.Close()

	approveDesktopRelay(ts, t, relay)
	resp = ts.GET(poll, "")
	body := requireStatus(t, resp, http.StatusOK)
	assert.Contains(t, string(body), "access_token")

	resp = ts.GET(poll, "")
	assert.Equal(t, http.StatusNotFound, resp.StatusCode)
	resp.Body.Close()
}
