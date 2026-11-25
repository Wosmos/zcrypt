//go:build integration

package integration_test

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/zcrypt/zcrypt/config"
)

// A sign-in started on the bare domain must find its state cookie at the
// callback on www, so the cookie is scoped to the site domain.
func TestOAuthStateCookieCoversWholeSite(t *testing.T) {
	ts := setupTestServerWith(t, func(c *config.Config) { c.FrontendURL = "https://www.zcrypt.cloud" })
	ts.srv.EnableTestOAuth("google", "cid", "csecret")

	resp := oauthStart(ts, t, "")
	defer resp.Body.Close()
	require.Equal(t, http.StatusTemporaryRedirect, resp.StatusCode)
	var state *http.Cookie
	for _, c := range resp.Cookies() {
		if c.Name == "oauth_state" {
			state = c
		}
	}
	require.NotNil(t, state, "no oauth_state cookie")
	require.Equal(t, "zcrypt.cloud", state.Domain)
}
