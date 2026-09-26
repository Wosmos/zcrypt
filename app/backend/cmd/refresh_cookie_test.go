package cmd

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestExtractRefreshTokenPrefersCookieOverBody(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/auth/refresh", strings.NewReader(`{"refresh_token":"from-body"}`))
	req.AddCookie(&http.Cookie{Name: refreshCookieName, Value: "from-cookie"})

	if got := extractRefreshToken(req); got != "from-cookie" {
		t.Fatalf("expected cookie value to win, got %q", got)
	}
}

func TestExtractRefreshTokenFallsBackToBody(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/auth/refresh", strings.NewReader(`{"refresh_token":"from-body"}`))

	if got := extractRefreshToken(req); got != "from-body" {
		t.Fatalf("expected body value when no cookie is present, got %q", got)
	}
}

func TestExtractRefreshTokenEmptyWhenNeitherPresent(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/auth/refresh", strings.NewReader(``))

	if got := extractRefreshToken(req); got != "" {
		t.Fatalf("expected empty string, got %q", got)
	}
}

func TestSetRefreshCookieAttributes(t *testing.T) {
	w := httptest.NewRecorder()
	setRefreshCookie(w, "my-refresh-token")

	res := w.Result()
	cookies := res.Cookies()
	if len(cookies) != 1 {
		t.Fatalf("expected exactly 1 cookie, got %d", len(cookies))
	}
	c := cookies[0]
	if c.Name != refreshCookieName {
		t.Errorf("name = %q, want %q", c.Name, refreshCookieName)
	}
	if c.Value != "my-refresh-token" {
		t.Errorf("value = %q, want %q", c.Value, "my-refresh-token")
	}
	if !c.HttpOnly {
		t.Error("expected HttpOnly=true")
	}
	if !c.Secure {
		t.Error("expected Secure=true (required for SameSite=None)")
	}
	if c.SameSite != http.SameSiteNoneMode {
		t.Errorf("SameSite = %v, want SameSiteNoneMode", c.SameSite)
	}
	if c.Path != "/api/auth" {
		t.Errorf("Path = %q, want /api/auth (scoped, not sent on every request)", c.Path)
	}
	if c.MaxAge <= 0 {
		t.Errorf("MaxAge = %d, want a positive value", c.MaxAge)
	}
}

func TestClearRefreshCookieExpiresImmediately(t *testing.T) {
	w := httptest.NewRecorder()
	clearRefreshCookie(w)

	res := w.Result()
	cookies := res.Cookies()
	if len(cookies) != 1 {
		t.Fatalf("expected exactly 1 cookie, got %d", len(cookies))
	}
	c := cookies[0]
	if c.MaxAge >= 0 {
		t.Errorf("MaxAge = %d, want negative (immediate expiry)", c.MaxAge)
	}
	if c.Value != "" {
		t.Errorf("value = %q, want empty", c.Value)
	}
}
