//go:build integration

package integration_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/zcrypt/zcrypt/cmd"
	"github.com/zcrypt/zcrypt/config"
	"github.com/zcrypt/zcrypt/crypto"
	"github.com/zcrypt/zcrypt/pipeline"
)

func (ts *testServer) restart() *testServer {
	ts.t.Helper()
	masterKey, err := crypto.ParseMasterKey("0000000000000000000000000000000000000000000000000000000000000001")
	require.NoError(ts.t, err)
	cfg := &config.Config{
		JWTSecret:         integrationJWTSecret,
		FrontendURL:       "http://localhost:3000",
		BackendURL:        "http://localhost:8080",
		TrustedProxyCount: 1,
	}
	server := cmd.NewServer(ts.db, cfg, pipeline.NewProgressEmitter(), masterKey)
	hs := httptest.NewServer(buildMux(server))
	ts.t.Cleanup(hs.Close)
	return &testServer{Server: hs, db: ts.db, srv: server, t: ts.t}
}

func TestRevokedSessionSurvivesRestart(t *testing.T) {
	ts := setupTestServer(t)
	email := uniqueEmail("restart")
	ts.registerAndLogin(email, accountTestPassword)
	a := ts.login(email, accountTestPassword)
	b := ts.login(email, accountTestPassword)

	bID := currentSession(t, ts.sessions(b.AccessToken))
	requireStatus(t, ts.DELETE("/api/auth/sessions/"+bID, a.AccessToken), http.StatusOK)

	fresh := ts.restart()
	requireStatus(t, fresh.GET("/api/auth/me", b.AccessToken), http.StatusUnauthorized)
	requireStatus(t, fresh.GET("/api/auth/me", a.AccessToken), http.StatusOK)
}

func TestMalformedAndMissingIDs(t *testing.T) {
	ts := setupTestServer(t)
	token := ts.registerAndLogin(uniqueEmail("ids"), accountTestPassword)

	t.Run("non-UUID folder id is a 400", func(t *testing.T) {
		requireStatus(t, ts.DELETE("/api/folders/not-a-uuid", token), http.StatusBadRequest)
	})

	t.Run("updating a missing note is a 404", func(t *testing.T) {
		body := []byte(`{"encrypted_title":"AAAA","encrypted_body":"AAAA","content_size":1}`)
		requireStatus(t, ts.PUT("/api/notes/00000000-0000-0000-0000-000000000001", body, token), http.StatusNotFound)
	})

	t.Run("non-UUID note id is a 400", func(t *testing.T) {
		requireStatus(t, ts.GET("/api/notes/not-a-uuid", token), http.StatusBadRequest)
	})

	t.Run("invalid folder_id on upload init is a 400", func(t *testing.T) {
		resp := ts.POST("/api/upload/init", map[string]interface{}{
			"encrypted_name": "AAAA",
			"folder_id":      "nope",
			"original_size":  10,
			"sha256":         "x",
			"salt":           "x",
			"chunk_count":    1,
		}, token)
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
		resp.Body.Close()
	})
}
