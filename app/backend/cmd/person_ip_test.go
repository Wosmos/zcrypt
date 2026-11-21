package cmd

import (
	"net/http/httptest"
	"testing"

	"github.com/zcrypt/zcrypt/config"
)

func TestPersonIPTrustsForwardedHeaderOnlyWithProxySecret(t *testing.T) {
	cases := []struct {
		name     string
		secret   string
		sent     string
		wantFrom string
	}{
		{"matching secret", "s3cret", "s3cret", "198.51.100.8"},
		{"wrong secret", "s3cret", "nope", "203.0.113.9"},
		{"no secret sent", "s3cret", "", "203.0.113.9"},
		{"secret unset on the server", "", "", "203.0.113.9"},
		{"secret unset, empty header sent", "", "x", "203.0.113.9"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := &Server{cfg: &config.Config{ProxySecret: tc.secret, ClientIPHeader: "X-Real-IP"}}
			r := httptest.NewRequest("GET", "/", nil)
			r.Header.Set("X-Real-IP", "203.0.113.9")
			r.Header.Set("X-Vercel-Forwarded-For", "198.51.100.8")
			if tc.sent != "" {
				r.Header.Set("X-Zcrypt-Proxy-Secret", tc.sent)
			}
			if got := s.personIP(r); got != tc.wantFrom {
				t.Fatalf("personIP = %s, want %s", got, tc.wantFrom)
			}
		})
	}
}

func TestPersonIPReadsWorkerVisitorHeaderOnlyWithProxySecret(t *testing.T) {
	cases := []struct {
		name string
		sent string
		want string
	}{
		{"matching secret", "s3cret", "192.0.2.44"},
		{"wrong secret", "nope", "203.0.113.9"},
		{"no secret sent", "", "203.0.113.9"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			s := &Server{cfg: &config.Config{ProxySecret: "s3cret", ClientIPHeader: "X-Real-IP"}}
			r := httptest.NewRequest("GET", "/", nil)
			r.Header.Set("X-Real-IP", "203.0.113.9")
			r.Header.Set("X-Zcrypt-Visitor-IP", "192.0.2.44")
			if tc.sent != "" {
				r.Header.Set("X-Zcrypt-Proxy-Secret", tc.sent)
			}
			if got := s.personIP(r); got != tc.want {
				t.Fatalf("personIP = %s, want %s", got, tc.want)
			}
		})
	}
}
