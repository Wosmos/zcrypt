//go:build integration

package integration_test

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// userID resolves the caller's own user id via /api/auth/me.
func (ts *testServer) userID(token string) string {
	ts.t.Helper()
	resp := ts.GET("/api/auth/me", token)
	body := requireStatus(ts.t, resp, http.StatusOK)
	var me struct {
		ID string `json:"id"`
	}
	require.NoError(ts.t, json.Unmarshal(body, &me))
	require.NotEmpty(ts.t, me.ID)
	return me.ID
}

// publishKeyBody builds a valid PublishKeyRequest with opaque (base64) blobs.
// The server stores every field verbatim, so their contents are irrelevant here.
func publishKeyBody() map[string]string {
	b := func(s string) string { return base64.StdEncoding.EncodeToString([]byte(s)) }
	return map[string]string{
		"public_key":          b("x25519-public-key-bytes"),
		"wrapped_private_key": b("private-key-encrypted-under-passphrase"),
		"kdf_salt":            b("kdf-salt-32-bytes"),
		"fingerprint":         "ABCD-1234-EF56-7890",
	}
}

func TestUserKeys(t *testing.T) {
	ts := setupTestServer(t)
	token := ts.registerAndLogin("keys-owner@example.com", "SecurePass@123!")

	t.Run("GET /api/keys/me returns null before publishing", func(t *testing.T) {
		resp := ts.GET("/api/keys/me", token)
		body := requireStatus(t, resp, http.StatusOK)
		assert.Equal(t, "null", strings.TrimSpace(string(body)), "no keypair yet")
	})

	t.Run("publishing with missing fields is rejected", func(t *testing.T) {
		resp := ts.POST("/api/keys", map[string]string{"public_key": "only-this"}, token)
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
		resp.Body.Close()
	})

	t.Run("publish then GET /api/keys/me returns the full record", func(t *testing.T) {
		body := publishKeyBody()
		requireStatus(t, ts.POST("/api/keys", body, token), http.StatusOK)

		resp := ts.GET("/api/keys/me", token)
		respBody := requireStatus(t, resp, http.StatusOK)
		var key struct {
			PublicKey         string `json:"public_key"`
			WrappedPrivateKey string `json:"wrapped_private_key"`
			Fingerprint       string `json:"fingerprint"`
		}
		require.NoError(t, json.Unmarshal(respBody, &key))
		assert.Equal(t, body["public_key"], key.PublicKey)
		assert.Equal(t, body["wrapped_private_key"], key.WrappedPrivateKey,
			"the owner's own record includes their wrapped private key")
		assert.Equal(t, body["fingerprint"], key.Fingerprint)
	})

	t.Run("publishing again rotates the key (upsert)", func(t *testing.T) {
		updated := publishKeyBody()
		updated["fingerprint"] = "9999-9999-9999-9999"
		requireStatus(t, ts.POST("/api/keys", updated, token), http.StatusOK)

		resp := ts.GET("/api/keys/me", token)
		respBody := requireStatus(t, resp, http.StatusOK)
		var key struct {
			Fingerprint string `json:"fingerprint"`
		}
		require.NoError(t, json.Unmarshal(respBody, &key))
		assert.Equal(t, "9999-9999-9999-9999", key.Fingerprint, "re-publish overwrites")
	})
}

func TestUserKeyLookup(t *testing.T) {
	ts := setupTestServer(t)
	token := ts.registerAndLogin("lookup-me@example.com", "SecurePass@123!")
	other := ts.registerAndLogin("lookup-other@example.com", "SecurePass@123!")
	requireStatus(t, ts.POST("/api/keys", publishKeyBody(), token), http.StatusOK)

	t.Run("lookup by email returns the PUBLIC key but never the wrapped private key", func(t *testing.T) {
		resp := ts.GET("/api/keys/lookup?identifier=lookup-me@example.com", other)
		body := requireStatus(t, resp, http.StatusOK)
		assert.Contains(t, string(body), "public_key")
		assert.NotContains(t, string(body), "wrapped_private_key",
			"public lookup must not leak the wrapped private key")
	})

	t.Run("lookup of a user with no published key returns 404", func(t *testing.T) {
		// `other` registered but never published a key.
		resp := ts.GET("/api/keys/lookup?identifier=lookup-other@example.com", token)
		assert.Equal(t, http.StatusNotFound, resp.StatusCode)
		resp.Body.Close()
	})

	t.Run("lookup of a nonexistent user returns 404 (indistinguishable, anti-enumeration)", func(t *testing.T) {
		resp := ts.GET("/api/keys/lookup?identifier=ghost@example.com", token)
		assert.Equal(t, http.StatusNotFound, resp.StatusCode)
		resp.Body.Close()
	})

	t.Run("lookup without an identifier is rejected", func(t *testing.T) {
		resp := ts.GET("/api/keys/lookup", token)
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
		resp.Body.Close()
	})

	t.Run("GET /api/keys/user/{id} returns the public key, not the private material", func(t *testing.T) {
		targetID := ts.userID(token)
		resp := ts.GET("/api/keys/user/"+targetID, other)
		body := requireStatus(t, resp, http.StatusOK)
		assert.Contains(t, string(body), "public_key")
		assert.NotContains(t, string(body), "wrapped_private_key")
	})

	t.Run("GET /api/keys/user/{id} for a user without a key returns 404", func(t *testing.T) {
		otherID := ts.userID(other) // never published
		resp := ts.GET("/api/keys/user/"+otherID, token)
		assert.Equal(t, http.StatusNotFound, resp.StatusCode)
		resp.Body.Close()
	})

	t.Run("key endpoints require authentication", func(t *testing.T) {
		resp := ts.GET("/api/keys/me", "")
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
		resp.Body.Close()
	})
}
