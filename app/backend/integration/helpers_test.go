//go:build integration

package integration_test

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/stretchr/testify/require"
	"github.com/zcrypt/zcrypt/cmd"
	"github.com/zcrypt/zcrypt/config"
	"github.com/zcrypt/zcrypt/crypto"
	"github.com/zcrypt/zcrypt/index"
	"github.com/zcrypt/zcrypt/pipeline"
)

// testServer wraps an httptest.Server with convenience helpers.
type testServer struct {
	*httptest.Server
	db *index.DB
	t  *testing.T
}

// setupTestServer creates an isolated test server with a real DB.
// The test database is cleaned between tests via schema drop+recreate.
func setupTestServer(t *testing.T) *testServer {
	t.Helper()

	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://zcrypt:testpassword@localhost:5433/zcrypt_test"
	}

	db, err := index.Open(dbURL)
	require.NoError(t, err, "connect to test database — is docker-compose.test.yml running?")
	t.Cleanup(func() { db.Close() })

	// Fixed test master key — 32 bytes hex-encoded
	masterKeyHex := "0000000000000000000000000000000000000000000000000000000000000001"
	masterKey, err := crypto.ParseMasterKey(masterKeyHex)
	require.NoError(t, err)

	cfg := &config.Config{
		JWTSecret:   "integration-test-secret-must-be-32chars!!",
		FrontendURL: "http://localhost:3000",
		BackendURL:  "http://localhost:8080",
	}

	require.NoError(t, config.EnsureDirs())

	progress := pipeline.NewProgressEmitter()
	server := cmd.NewServer(db, cfg, progress, masterKey)

	ts := httptest.NewServer(buildMux(server))
	t.Cleanup(ts.Close)

	return &testServer{Server: ts, db: db, t: t}
}

// POST sends a JSON POST request and returns the response.
func (ts *testServer) POST(path string, body interface{}, token string) *http.Response {
	ts.t.Helper()
	data, err := json.Marshal(body)
	require.NoError(ts.t, err)

	req, err := http.NewRequest("POST", ts.URL+path, bytes.NewReader(data))
	require.NoError(ts.t, err)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := http.DefaultClient.Do(req)
	require.NoError(ts.t, err)
	return resp
}

// GET sends an authenticated GET request and returns the response.
func (ts *testServer) GET(path string, token string) *http.Response {
	ts.t.Helper()
	req, err := http.NewRequest("GET", ts.URL+path, nil)
	require.NoError(ts.t, err)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	require.NoError(ts.t, err)
	return resp
}

// PUT sends a raw-body PUT request (used for chunk uploads).
func (ts *testServer) PUT(path string, body []byte, token string) *http.Response {
	ts.t.Helper()
	req, err := http.NewRequest("PUT", ts.URL+path, bytes.NewReader(body))
	require.NoError(ts.t, err)
	req.Header.Set("Content-Type", "application/octet-stream")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	require.NoError(ts.t, err)
	return resp
}

// DELETE sends an authenticated DELETE request.
func (ts *testServer) DELETE(path string, token string) *http.Response {
	ts.t.Helper()
	req, err := http.NewRequest("DELETE", ts.URL+path, nil)
	require.NoError(ts.t, err)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	require.NoError(ts.t, err)
	return resp
}

// decodeJSON decodes the response body into v and closes the body.
func decodeJSON(t *testing.T, resp *http.Response, v interface{}) {
	t.Helper()
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	require.NoError(t, err)
	require.NoError(t, json.Unmarshal(body, v), "decode response body: %s", string(body))
}

// requireStatus asserts the response has the expected status code and returns the body.
func requireStatus(t *testing.T, resp *http.Response, expected int) []byte {
	t.Helper()
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	require.Equal(t, expected, resp.StatusCode,
		"expected %d but got %d — body: %s", expected, resp.StatusCode, string(body))
	return body
}

// registerAndLogin creates a test user and returns their access token.
func (ts *testServer) registerAndLogin(email, password string) string {
	ts.t.Helper()

	// Register
	resp := ts.POST("/api/auth/register", map[string]string{
		"email":    email,
		"password": password,
		"username": fmt.Sprintf("user_%s", hex.EncodeToString([]byte(email))[:8]),
	}, "")

	if resp.StatusCode == http.StatusCreated || resp.StatusCode == http.StatusOK {
		var result struct {
			AccessToken string `json:"access_token"`
		}
		decodeJSON(ts.t, resp, &result)
		if result.AccessToken != "" {
			return result.AccessToken
		}
	}
	resp.Body.Close()

	// If registration fails (user exists), try login
	loginResp := ts.POST("/api/auth/login", map[string]string{
		"email":    email,
		"password": password,
	}, "")
	var loginResult struct {
		AccessToken string `json:"access_token"`
	}
	decodeJSON(ts.t, loginResp, &loginResult)
	require.NotEmpty(ts.t, loginResult.AccessToken, "failed to get access token")
	return loginResult.AccessToken
}

// cleanDB truncates all test data between tests.
func cleanDB(t *testing.T, db *index.DB) {
	t.Helper()
	ctx := context.Background()
	// Delete in dependency order (FK constraints)
	tables := []string{
		"audit_events", "upload_sessions", "chunks", "files",
		"platform_tokens", "refresh_tokens", "email_tokens", "users",
	}
	for _, table := range tables {
		_, err := db.Pool().Exec(ctx, fmt.Sprintf("DELETE FROM %s", table))
		require.NoError(t, err, "clean table %s", table)
	}
}
