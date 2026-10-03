package cmd

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/zcrypt/zcrypt/auth"
)

func TestRevokedSessions(t *testing.T) {
	var nilSet *revokedSessions
	nilSet.add("a")
	if nilSet.has("a") {
		t.Fatal("nil set must report nothing revoked")
	}

	rs := newRevokedSessions()
	if rs.has("") {
		t.Fatal("empty session id is never revoked")
	}
	rs.add("a", "b")
	if !rs.has("a") || !rs.has("b") || rs.has("c") {
		t.Fatal("add/has mismatch")
	}

	rs.until["old"] = time.Now().Add(-time.Second)
	if rs.has("old") {
		t.Fatal("expired entry must not count as revoked")
	}
	rs.add("d")
	if _, ok := rs.until["old"]; ok {
		t.Fatal("add should prune expired entries")
	}
}

func TestAuthMiddlewareRejectsRevokedSession(t *testing.T) {
	token, err := auth.GenerateSessionAccessToken(mwTestSecret, "user-1", "u@test.com", "user", "user", 0, "sess-1", false)
	if err != nil {
		t.Fatalf("generate token: %v", err)
	}
	s := newTestServer(func(context.Context, string) (int, error) { return 0, nil })
	s.revokedSessions = newRevokedSessions()

	if rec := callAuthMiddleware(s, token); rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200 before revocation", rec.Code)
	}
	s.revokedSessions.add("sess-1")
	if rec := callAuthMiddleware(s, token); rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401 after revocation", rec.Code)
	}
}

func TestDescribeUserAgent(t *testing.T) {
	cases := map[string]string{
		"": "Unknown device",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36":        "Chrome on Windows",
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15": "Safari on macOS",
		"Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0":                                             "Firefox on Linux",
		"Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 Edg/120.0": "Edge on Android",
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1":       "Safari on iOS",
		"zcrypt-core/0.1.6": "zcrypt app on unknown OS",
		"curl/8.0":          "Unknown browser on unknown OS",
	}
	for ua, want := range cases {
		if got := describeUserAgent(ua); got != want {
			t.Errorf("describeUserAgent(%q) = %q, want %q", ua, got, want)
		}
	}
}
