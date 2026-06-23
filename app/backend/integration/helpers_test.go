//go:build integration

package integration_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
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
	db  *index.DB
	srv *cmd.Server
	t   *testing.T
}

// testIPCounter yields a unique X-Forwarded-For per request so each request looks
// like a distinct client. This keeps the per-IP rate limiter (and the real IP
// extraction path) active without functional tests tripping it by hammering one IP.
// A rate-limit-specific test can pin a fixed X-Forwarded-For to exercise the limiter.
var testIPCounter atomic.Uint32

func uniqueTestIP() string {
	n := testIPCounter.Add(1)
	return fmt.Sprintf("10.%d.%d.%d", byte(n>>16), byte(n>>8), byte(n))
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
		// Trust one proxy hop so the per-request X-Forwarded-For set by the request
		// helpers is honored as the client IP. This keeps the per-IP rate limiter
		// (and the real IP-extraction path) fully active, while letting each request
		// look like a distinct client so functional tests don't trip it.
		TrustedProxyCount: 1,
	}

	require.NoError(t, config.EnsureDirs())

	progress := pipeline.NewProgressEmitter()
	server := cmd.NewServer(db, cfg, progress, masterKey)

	ts := httptest.NewServer(buildMux(server))
	t.Cleanup(ts.Close)

	return &testServer{Server: ts, db: db, srv: server, t: t}
}

// enableMockStorage attaches an in-memory storage adapter to the given user so
// upload-pipeline tests can run without a real git platform connected. Call it
// after the user has been registered (e.g. via registerAndLogin) and before any
// /api/upload/init request.
func (ts *testServer) enableMockStorage(email string) {
	ts.t.Helper()
	user, err := ts.db.GetUserByEmail(context.Background(), strings.ToLower(email))
	require.NoError(ts.t, err, "look up user to enable mock storage")
	ts.srv.InjectTestAdapter(user.ID, "mock", "testacct", &mockAdapter{}, 10<<30)
}

// POST sends a JSON POST request and returns the response.
func (ts *testServer) POST(path string, body interface{}, token string) *http.Response {
	ts.t.Helper()
	data, err := json.Marshal(body)
	require.NoError(ts.t, err)

	req, err := http.NewRequest("POST", ts.URL+path, bytes.NewReader(data))
	require.NoError(ts.t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", uniqueTestIP())
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
	req.Header.Set("X-Forwarded-For", uniqueTestIP())
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
	req.Header.Set("X-Forwarded-For", uniqueTestIP())
	// The chunk upload handler requires the hex SHA-256 of the body and rejects
	// its absence with 400 before it even looks up the session.
	sum := sha256.Sum256(body)
	req.Header.Set("X-Chunk-SHA256", hex.EncodeToString(sum[:]))
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
	req.Header.Set("X-Forwarded-For", uniqueTestIP())
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
//
// Registration intentionally does NOT return tokens (the handler responds with
// {success, user}); tokens are obtained via a separate login, matching what the
// real frontend and TUI clients do.
func (ts *testServer) registerAndLogin(email, password string) string {
	ts.t.Helper()

	// Derive a collision-free username from the full email. A naive
	// first-N-chars-of-email scheme collides for addresses sharing a prefix
	// (e.g. userA@/userB@ both start with "user"), which would make the second
	// registration fail with a username conflict.
	sum := sha256.Sum256([]byte(email))
	username := fmt.Sprintf("user_%x", sum[:6])

	// force=true bypasses the HaveIBeenPwned breach warning so the account is
	// always created, with no dependency on the external HIBP API.
	ts.POST("/api/auth/register", map[string]interface{}{
		"email":    email,
		"password": password,
		"username": username,
		"force":    true,
	}, "").Body.Close()

	// Obtain tokens via login (register does not auto-login).
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
