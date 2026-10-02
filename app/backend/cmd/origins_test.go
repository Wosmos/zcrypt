package cmd

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAllowedOrigins(t *testing.T) {
	t.Setenv("ALLOWED_ORIGINS", "https://a.example, https://b.example")
	t.Setenv("FRONTEND_URL", "https://app.example/")
	got := AllowedOrigins()
	for _, o := range []string{"https://a.example", "https://b.example", "https://app.example", "tauri://localhost", "https://tauri.localhost"} {
		if !got[o] {
			t.Errorf("%s missing from %v", o, got)
		}
	}
	if got["http://localhost:3000"] {
		t.Error("dev default must not be added when origins are configured")
	}

	t.Setenv("ALLOWED_ORIGINS", "")
	t.Setenv("FRONTEND_URL", "")
	if !AllowedOrigins()["http://localhost:3000"] {
		t.Error("dev default missing when nothing is configured")
	}
}

func TestRefreshCookieCrossSite(t *testing.T) {
	s := &Server{allowedOrigins: map[string]bool{"https://app.example": true}}
	cases := []struct {
		name               string
		cookie             bool
		origin, fetchSite  string
		wantCrossSiteBlock bool
	}{
		{"no cookie, foreign origin", false, "https://evil.example", "cross-site", false},
		{"cookie from the app", true, "https://app.example", "cross-site", false},
		{"cookie from a foreign page", true, "https://evil.example", "cross-site", true},
		{"cookie from an opaque origin", true, "null", "", true},
		{"cookie, no origin, cross-site fetch", true, "", "cross-site", true},
		{"cookie, no browser headers", true, "", "", false},
	}
	for _, c := range cases {
		r := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
		if c.cookie {
			r.AddCookie(&http.Cookie{Name: refreshCookieName, Value: "rt"}) //nolint:gosec // test fixture simulating an incoming request cookie, not a cookie this server sets
		}
		if c.origin != "" {
			r.Header.Set("Origin", c.origin)
		}
		if c.fetchSite != "" {
			r.Header.Set("Sec-Fetch-Site", c.fetchSite)
		}
		if got := s.refreshCookieCrossSite(r); got != c.wantCrossSiteBlock {
			t.Errorf("%s: got %v, want %v", c.name, got, c.wantCrossSiteBlock)
		}
	}
}

func TestLogoutRefusesCrossSiteCookie(t *testing.T) {
	s := &Server{allowedOrigins: map[string]bool{}}
	r := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	r.AddCookie(&http.Cookie{Name: refreshCookieName, Value: "rt"}) //nolint:gosec // test fixture simulating an incoming request cookie, not a cookie this server sets
	r.Header.Set("Origin", "https://evil.example")
	rec := httptest.NewRecorder()
	s.HandleLogout(rec, r)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", rec.Code)
	}
	rec = httptest.NewRecorder()
	s.HandleRefreshToken(rec, r)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("refresh status = %d, want 403", rec.Code)
	}
}

func TestWriteErrorEscapesMessages(t *testing.T) {
	rec := httptest.NewRecorder()
	writeError(rec, http.StatusBadRequest, `bad "quoted" \ value`)
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("response is not valid JSON: %v (%q)", err, rec.Body.String())
	}
	if body["error"] != `bad "quoted" \ value` || rec.Header().Get("Content-Type") != "application/json" {
		t.Fatalf("got %v with content type %q", body, rec.Header().Get("Content-Type"))
	}

	rec = httptest.NewRecorder()
	internalError(rec, "ctx", errors.New(`pq: relation "users" does not exist`))
	if rec.Code != http.StatusInternalServerError || rec.Body.String() != "{\"error\":\"internal error\"}\n" {
		t.Fatalf("internalError leaked or malformed: %d %q", rec.Code, rec.Body.String())
	}
}
