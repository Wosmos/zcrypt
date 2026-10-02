package cmd

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/zcrypt/zcrypt/auth"
)

var routeLine = regexp.MustCompile(`mux\.HandleFunc\("([A-Z]+) (/[^"]*)", (.*)\)\s*$`)

type registeredRoute struct {
	method, path, wrap string
}

func (r registeredRoute) pattern() string { return r.method + " " + r.path }

func registeredRoutes(t *testing.T) []registeredRoute {
	t.Helper()
	src, err := os.ReadFile("server.go")
	if err != nil {
		t.Fatalf("read server.go: %v", err)
	}
	var out []registeredRoute
	for _, line := range strings.Split(string(src), "\n") {
		if m := routeLine.FindStringSubmatch(line); m != nil {
			out = append(out, registeredRoute{method: m[1], path: m[2], wrap: m[3]})
		}
	}
	if len(out) < 100 {
		t.Fatalf("parsed only %d routes from server.go; the pattern no longer matches RegisterRoutes", len(out))
	}
	return out
}

var pathParam = regexp.MustCompile(`\{[^}]+\}`)

func decoyToken(t *testing.T, role string) string {
	t.Helper()
	tok, err := auth.GenerateDecoyAccessToken(mwTestSecret, "11111111-1111-1111-1111-111111111111", "u@test.com", "u", role, 0)
	if err != nil {
		t.Fatalf("generate decoy token: %v", err)
	}
	return tok
}

func serveDecoy(t *testing.T, mux *http.ServeMux, rt registeredRoute, token string) (rec *httptest.ResponseRecorder) {
	t.Helper()
	path := pathParam.ReplaceAllString(rt.path, "22222222-2222-2222-2222-222222222222")
	if strings.Contains(rt.path, "{idx}") {
		path = strings.ReplaceAll(rt.path, "{idx}", "0")
		path = pathParam.ReplaceAllString(path, "22222222-2222-2222-2222-222222222222")
	}
	req := httptest.NewRequest(rt.method, path, strings.NewReader(`{}`))
	req.Header.Set("Authorization", "Bearer "+token)
	rec = httptest.NewRecorder()
	defer func() {
		if p := recover(); p != nil {
			t.Fatalf("%s: a decoy session reached the real handler (%v)", rt.pattern(), p)
		}
	}()
	mux.ServeHTTP(rec, req)
	return rec
}

// TestDecoyGateCoversEveryAuthenticatedRoute walks the real route table: any
// authenticated route a decoy token can reach must be on the reviewed pass list,
// and every other one must answer from the gate without running its handler
// (the test server has no database, so a leaked request panics).
func TestDecoyGateCoversEveryAuthenticatedRoute(t *testing.T) {
	s := newTestServer(func(context.Context, string) (int, error) { return 0, nil })
	mux := http.NewServeMux()
	s.RegisterRoutes(mux)
	token := decoyToken(t, "user")

	authed := map[string]bool{}
	var passed []string
	for _, rt := range registeredRoutes(t) {
		if !strings.Contains(rt.wrap, "s.AuthMiddleware(") {
			continue
		}
		authed[rt.pattern()] = true
		rule, listed := decoyRoutes[rt.pattern()]
		if listed && rule.pass {
			passed = append(passed, rt.pattern())
			continue
		}
		rec := serveDecoy(t, mux, rt, token)
		switch {
		case listed:
			if rec.Code != http.StatusOK || rec.Body.String() != rule.body {
				t.Errorf("%s: got %d %q, want canned 200 %q", rt.pattern(), rec.Code, rec.Body.String(), rule.body)
			}
		case rt.method == http.MethodGet:
			if rec.Code != http.StatusNotFound {
				t.Errorf("%s: got %d, want 404", rt.pattern(), rec.Code)
			}
		default:
			if rec.Code != http.StatusForbidden {
				t.Errorf("%s: got %d, want 403", rt.pattern(), rec.Code)
			}
		}
	}

	for pattern := range decoyRoutes {
		if !authed[pattern] {
			t.Errorf("decoyRoutes lists %q, which is not an authenticated route", pattern)
		}
	}

	sort.Strings(passed)
	want := []string{
		"GET /api/analytics/file-types",
		"GET /api/analytics/storage-growth",
		"GET /api/analytics/summary",
		"GET /api/analytics/timeseries",
		"GET /api/auth/activity",
		"GET /api/auth/me",
		"GET /api/config",
		"GET /api/files",
		"GET /api/platforms/status",
		"GET /api/preferences",
		"GET /api/quota",
		"PATCH /api/files/{id}/name",
		"PUT /api/preferences",
	}
	if strings.Join(passed, "\n") != strings.Join(want, "\n") {
		t.Errorf("decoy pass-through routes changed; each one must be decoy-aware or vault-free.\ngot:\n%s\nwant:\n%s",
			strings.Join(passed, "\n"), strings.Join(want, "\n"))
	}
}

// TestDecoyNeverReachesAdminRoutes covers a decoy token that still carries the
// admin role: AdminMiddleware must refuse it on every admin route.
func TestDecoyNeverReachesAdminRoutes(t *testing.T) {
	s := newTestServer(func(context.Context, string) (int, error) { return 0, nil })
	mux := http.NewServeMux()
	s.RegisterRoutes(mux)
	token := decoyToken(t, "admin")

	n := 0
	for _, rt := range registeredRoutes(t) {
		if !strings.Contains(rt.wrap, "s.AdminMiddleware(") {
			continue
		}
		n++
		if rec := serveDecoy(t, mux, rt, token); rec.Code != http.StatusForbidden {
			t.Errorf("%s: got %d, want 403", rt.pattern(), rec.Code)
		}
	}
	if n == 0 {
		t.Fatal("found no admin routes")
	}
}

func TestDecoyGatePassesRealSessions(t *testing.T) {
	s := newTestServer(func(context.Context, string) (int, error) { return 0, nil })
	tok, err := auth.GenerateAccessToken(mwTestSecret, "user-1", "u@test.com", "u", "user", 0)
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/notes", s.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTeapot)
	}))
	req := httptest.NewRequest(http.MethodGet, "/api/notes", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	if rec.Code != http.StatusTeapot {
		t.Fatalf("status = %d, want the handler's 418", rec.Code)
	}
}

func TestSSESubscriberIsolatesDecoy(t *testing.T) {
	id, admin := sseSubscriber(&auth.Claims{Sub: "u1", Role: "admin", Decoy: true})
	if id == "u1" || admin {
		t.Fatalf("decoy subscriber = (%q, %v), want a non-matching id and no admin fan-out", id, admin)
	}
	id, admin = sseSubscriber(&auth.Claims{Sub: "u1", Role: "admin"})
	if id != "u1" || !admin {
		t.Fatalf("real subscriber = (%q, %v), want (u1, true)", id, admin)
	}
}
