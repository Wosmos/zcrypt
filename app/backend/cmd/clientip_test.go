package cmd

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestClientIPTrustedProxy is the S3 regression: a client must not be able to
// spoof its IP (and so get a fresh rate-limit bucket per request) via
// X-Forwarded-For / X-Real-IP unless a trusted proxy hop is configured.
func TestClientIPTrustedProxy(t *testing.T) {
	tests := []struct {
		name       string
		remoteAddr string
		xff        string
		xRealIP    string
		hops       int
		want       string
	}{
		{"no trust ignores spoofed XFF", "203.0.113.9:5000", "1.2.3.4", "", 0, "203.0.113.9"},
		{"no trust ignores spoofed X-Real-IP", "203.0.113.9:5000", "", "1.2.3.4", 0, "203.0.113.9"},
		{"single proxy returns proxy-set client", "172.16.0.1:5000", "198.51.100.23", "", 1, "198.51.100.23"},
		{"single proxy ignores client-prepended spoof", "172.16.0.1:5000", "1.1.1.1, 198.51.100.23", "", 1, "198.51.100.23"},
		{"two proxies resolve original client", "172.16.0.2:5000", "198.51.100.23, 172.16.0.1", "", 2, "198.51.100.23"},
		{"strips port from peer", "203.0.113.9:9999", "", "", 0, "203.0.113.9"},
		{"ipv6 peer", "[2001:db8::1]:8080", "", "", 0, "2001:db8::1"},
		{"misconfigured hops fall back to peer", "172.16.0.1:5000", "198.51.100.23", "", 5, "172.16.0.1"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "/", nil)
			r.RemoteAddr = tt.remoteAddr
			if tt.xff != "" {
				r.Header.Set("X-Forwarded-For", tt.xff)
			}
			if tt.xRealIP != "" {
				r.Header.Set("X-Real-IP", tt.xRealIP)
			}
			if got := clientIP(r, tt.hops); got != tt.want {
				t.Fatalf("clientIP(hops=%d) = %q, want %q", tt.hops, got, tt.want)
			}
		})
	}
}
