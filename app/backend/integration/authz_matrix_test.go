//go:build integration

package integration_test

import (
	"net/http"
	"os"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type routeSpec struct {
	method string
	path   string
	class  string
}

var routeLine = regexp.MustCompile(`mux\.HandleFunc\("([A-Z]+) ([^"]+)",\s*(.+)\)\s*$`)

func registeredRoutes(t *testing.T) []routeSpec {
	t.Helper()
	src, err := os.ReadFile("../cmd/server.go")
	require.NoError(t, err)
	var out []routeSpec
	for _, line := range strings.Split(string(src), "\n") {
		m := routeLine.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		wrapped := m[3]
		class := "public"
		switch {
		case strings.Contains(wrapped, "AdminMiddleware"):
			class = "admin"
		case strings.Contains(wrapped, "OptionalAuthMiddleware"):
			class = "optional"
		case strings.Contains(wrapped, "AuthMiddleware"):
			class = "user"
		}
		out = append(out, routeSpec{method: m[1], path: m[2], class: class})
	}
	require.NotEmpty(t, out)
	return out
}

var publicRouteAllowlist = []string{
	"GET /api/auth/oauth/config",
	"GET /api/auth/oauth/desktop-poll",
	"GET /api/auth/oauth/{provider}",
	"GET /api/auth/oauth/{provider}/callback",
	"GET /api/download/{target}",
	"GET /api/downloads/stats",
	"GET /api/folder-share/{token}",
	"GET /api/folder-share/{token}/files/{fid}/chunks/{idx}",
	"GET /api/folder-share/{token}/files/{fid}/meta",
	"GET /api/health",
	"GET /api/internal/metrics",
	"GET /api/pad/{token}",
	"GET /api/pad/{token}/content",
	"GET /api/plans",
	"GET /api/reviews/public",
	"GET /api/send/{token}",
	"GET /api/send/{token}/chunks/{idx}",
	"GET /api/send/{token}/meta",
	"GET /api/share/{token}",
	"GET /api/share/{token}/chunks/{idx}",
	"GET /api/share/{token}/meta",
	"GET /api/transfer/ws",
	"POST /api/auth/2fa/verify",
	"POST /api/auth/forgot-password",
	"POST /api/auth/login",
	"POST /api/auth/magic-link",
	"POST /api/auth/magic-link/verify",
	"POST /api/auth/oauth/desktop-approve",
	"POST /api/auth/refresh",
	"POST /api/auth/register",
	"POST /api/auth/resend-verification",
	"POST /api/auth/reset-password",
	"POST /api/auth/verify-email",
	"POST /api/folder-share/{token}/files/{fid}/complete",
	"POST /api/internal/maintenance",
	"POST /api/pad",
	"POST /api/send/init",
	"POST /api/send/{sid}/complete",
	"POST /api/share/{token}/complete",
	"PUT /api/send/{sid}/chunk/{idx}",
}

func concretePath(p string) string {
	return regexp.MustCompile(`\{[^}]+\}`).ReplaceAllString(p, "00000000-0000-4000-8000-000000000000")
}

func (ts *testServer) call(method, path, token string) int {
	ts.t.Helper()
	body := strings.NewReader("{}")
	req, err := http.NewRequest(method, ts.URL+path, body)
	require.NoError(ts.t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", uniqueTestIP())
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	require.NoError(ts.t, err)
	defer resp.Body.Close()
	return resp.StatusCode
}

func TestAuthzMatrix(t *testing.T) {
	routes := registeredRoutes(t)
	ts := setupTestServer(t)
	pw := newTestPassword()
	ts.registerAndLogin("authz-first@example.com", pw)
	userTok := ts.registerAndLogin("authz-user@example.com", pw)

	var public []string
	for _, r := range routes {
		if r.class == "public" {
			public = append(public, r.method+" "+r.path)
		}
	}
	sort.Strings(public)
	expected := append([]string(nil), publicRouteAllowlist...)
	sort.Strings(expected)
	assert.Equal(t, expected, public, "the set of unauthenticated routes changed: every new public route needs a deliberate review and an allowlist entry")

	for _, r := range routes {
		path := concretePath(r.path)
		name := r.method + " " + r.path
		switch r.class {
		case "admin":
			t.Run("admin route refuses anonymous: "+name, func(t *testing.T) {
				assert.Equal(t, http.StatusUnauthorized, ts.call(r.method, path, ""))
			})
			t.Run("admin route refuses a normal user: "+name, func(t *testing.T) {
				assert.Equal(t, http.StatusForbidden, ts.call(r.method, path, userTok))
			})
		case "user":
			t.Run("user route refuses anonymous: "+name, func(t *testing.T) {
				assert.Equal(t, http.StatusUnauthorized, ts.call(r.method, path, ""))
			})
		}
	}
}
