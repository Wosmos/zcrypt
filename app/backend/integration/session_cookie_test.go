//go:build integration

package integration_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/zcrypt/zcrypt/config"
)

// A browser can hold an old host-only session cookie next to the current
// site-wide one. Refresh must use whichever is still live instead of failing
// on the first and signing the user out, and the new cookie is site-wide.
func TestRefreshSurvivesAStaleCookieAndSetsTheSiteCookie(t *testing.T) {
	ts := setupTestServerWith(t, func(c *config.Config) { c.FrontendURL = "https://www.example.com" })
	ts.POST("/api/auth/register", map[string]interface{}{
		"email": "cookie@example.com", "password": "SecurePass@123!", "username": "cookieuser", "force": true,
	}, "").Body.Close()
	body := requireStatus(t, ts.POST("/api/auth/login", map[string]string{
		"email": "cookie@example.com", "password": "SecurePass@123!",
	}, ""), http.StatusOK)
	var tokens struct {
		RefreshToken string `json:"refresh_token"`
	}
	require.NoError(t, jsonUnmarshal(body, &tokens))

	data, _ := json.Marshal(map[string]string{"refresh_token": ""})
	req, err := http.NewRequest(http.MethodPost, ts.URL+"/api/auth/refresh", bytes.NewReader(data))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Sec-Fetch-Site", "same-origin")
	req.Header.Add("Cookie", "zcrypt_rt=long-gone-token; zcrypt_rt="+tokens.RefreshToken)
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	requireStatus(t, resp, http.StatusOK)

	var site *http.Cookie
	for _, c := range resp.Cookies() {
		if c.Name == "zcrypt_rt" && c.MaxAge > 0 {
			site = c
		}
	}
	require.NotNil(t, site, "refresh must set a live session cookie")
	assert.Equal(t, "example.com", site.Domain)
}
