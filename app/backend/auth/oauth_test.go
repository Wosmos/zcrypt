package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// withProvider temporarily overrides the "google" provider entry to point token
// and userinfo endpoints at a local httptest server, so the HTTP parsing paths
// can be exercised without any real network access. It restores the original on
// cleanup.
func withProvider(t *testing.T, tokenURL, userinfoURL string) {
	t.Helper()
	orig := oauthProviders["google"]
	updated := orig
	if tokenURL != "" {
		updated.TokenURL = tokenURL
	}
	if userinfoURL != "" {
		updated.UserinfoURL = userinfoURL
	}
	oauthProviders["google"] = updated
	t.Cleanup(func() { oauthProviders["google"] = orig })
}

func newServer(t *testing.T, status int, body string) string {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return srv.URL
}

func TestBuildOAuthURLGoogle(t *testing.T) {
	raw, err := BuildOAuthURL("google", "client-abc", "https://app/callback", "state-xyz")
	require.NoError(t, err)

	u, err := url.Parse(raw)
	require.NoError(t, err)
	assert.Equal(t, "accounts.google.com", u.Host)

	q := u.Query()
	assert.Equal(t, "client-abc", q.Get("client_id"))
	assert.Equal(t, "https://app/callback", q.Get("redirect_uri"))
	assert.Equal(t, "code", q.Get("response_type"))
	assert.Equal(t, "state-xyz", q.Get("state"))
	assert.Equal(t, "openid email profile", q.Get("scope"))
	// Google-specific params.
	assert.Equal(t, "offline", q.Get("access_type"))
	assert.Equal(t, "select_account", q.Get("prompt"))
}

func TestBuildOAuthURLGitHub(t *testing.T) {
	raw, err := BuildOAuthURL("github", "gh-client", "https://app/cb", "st")
	require.NoError(t, err)

	u, err := url.Parse(raw)
	require.NoError(t, err)
	assert.Equal(t, "github.com", u.Host)

	q := u.Query()
	assert.Equal(t, "gh-client", q.Get("client_id"))
	assert.Equal(t, "read:user user:email", q.Get("scope"))
	// GitHub gets no google-only params.
	assert.Empty(t, q.Get("access_type"))
	assert.Empty(t, q.Get("prompt"))
}

func TestBuildOAuthURLUnsupported(t *testing.T) {
	_, err := BuildOAuthURL("facebook", "c", "r", "s")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unsupported provider")
}

func TestExchangeOAuthCodeUnsupportedProvider(t *testing.T) {
	// Guard branch returns before any network call.
	_, err := ExchangeOAuthCode(context.Background(), "nope", "c", "s", "code", "r")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unsupported provider")
}

func TestExchangeOAuthCodeCancelledContext(t *testing.T) {
	// A cancelled context makes client.Do fail immediately without a real
	// network round-trip, exercising the request/error path deterministically.
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := ExchangeOAuthCode(ctx, "google", "c", "s", "code", "https://app/cb")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "token exchange")
}

func TestExchangeOAuthCodeSuccess(t *testing.T) {
	withProvider(t, newServer(t, 200, `{"access_token":"tok-123"}`), "")
	tok, err := ExchangeOAuthCode(context.Background(), "google", "c", "s", "code", "https://app/cb")
	require.NoError(t, err)
	assert.Equal(t, "tok-123", tok)
}

func TestExchangeOAuthCodeProviderError(t *testing.T) {
	withProvider(t, newServer(t, 200, `{"error":"invalid_grant","error_description":"bad code"}`), "")
	_, err := ExchangeOAuthCode(context.Background(), "google", "c", "s", "code", "https://app/cb")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "invalid_grant")
	assert.Contains(t, err.Error(), "bad code")
}

func TestExchangeOAuthCodeNoToken(t *testing.T) {
	withProvider(t, newServer(t, 200, `{}`), "")
	_, err := ExchangeOAuthCode(context.Background(), "google", "c", "s", "code", "https://app/cb")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "no access_token")
}

func TestExchangeOAuthCodeBadJSON(t *testing.T) {
	withProvider(t, newServer(t, 200, `not-json`), "")
	_, err := ExchangeOAuthCode(context.Background(), "google", "c", "s", "code", "https://app/cb")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "parse token response")
}

func TestFetchOAuthUserInfoGoogleSuccess(t *testing.T) {
	withProvider(t, "", newServer(t, 200, `{"id":"g-1","email":"a@b.com","name":"Alice"}`))
	info, err := FetchOAuthUserInfo(context.Background(), "google", "tok")
	require.NoError(t, err)
	assert.Equal(t, "g-1", info.ProviderID)
	assert.Equal(t, "a@b.com", info.Email)
	assert.Equal(t, "Alice", info.Name)
}

func TestFetchOAuthUserInfoBadJSON(t *testing.T) {
	withProvider(t, "", newServer(t, 200, `not-json`))
	_, err := FetchOAuthUserInfo(context.Background(), "google", "tok")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "parse userinfo")
}

func TestFetchOAuthUserInfoMissingID(t *testing.T) {
	withProvider(t, "", newServer(t, 200, `{"email":"a@b.com"}`))
	_, err := FetchOAuthUserInfo(context.Background(), "google", "tok")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "no provider ID")
}

func TestFetchOAuthUserInfoMissingEmail(t *testing.T) {
	withProvider(t, "", newServer(t, 200, `{"id":"g-1","name":"Alice"}`))
	_, err := FetchOAuthUserInfo(context.Background(), "google", "tok")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "no email")
}

func TestFetchOAuthUserInfoGitHubSuccess(t *testing.T) {
	// GitHub returns a numeric id (float64 after JSON decode) and, here, an
	// inline email so the separate /user/emails call is not needed.
	orig := oauthProviders["github"]
	updated := orig
	updated.UserinfoURL = newServer(t, 200, `{"id":424242,"email":"gh@user.com","name":"Octo"}`)
	oauthProviders["github"] = updated
	t.Cleanup(func() { oauthProviders["github"] = orig })

	info, err := FetchOAuthUserInfo(context.Background(), "github", "tok")
	require.NoError(t, err)
	assert.Equal(t, "424242", info.ProviderID)
	assert.Equal(t, "gh@user.com", info.Email)
	assert.Equal(t, "Octo", info.Name)
}

func TestFetchOAuthUserInfoUnsupportedProvider(t *testing.T) {
	_, err := FetchOAuthUserInfo(context.Background(), "nope", "token")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unsupported provider")
}

func TestFetchOAuthUserInfoCancelledContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := FetchOAuthUserInfo(ctx, "github", "token")
	require.Error(t, err)
	assert.True(t, strings.Contains(err.Error(), "userinfo request"), "expected userinfo request error, got: %v", err)
}
