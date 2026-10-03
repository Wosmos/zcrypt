package cmd

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/zcrypt/zcrypt/config"
)

func TestRequestLoggerAssignsAndEchoesRequestID(t *testing.T) {
	s := &Server{cfg: &config.Config{}}
	var seen string
	h := s.RequestLogger(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = RequestID(r.Context())
		w.WriteHeader(http.StatusTeapot)
	}))

	t.Run("keeps a sane inbound id", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/files", nil)
		req.Header.Set("X-Request-ID", "edge-123.abc")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if seen != "edge-123.abc" || rec.Header().Get("X-Request-ID") != "edge-123.abc" {
			t.Fatalf("id = %q, header = %q", seen, rec.Header().Get("X-Request-ID"))
		}
		if rec.Code != http.StatusTeapot {
			t.Fatalf("status = %d", rec.Code)
		}
	})

	t.Run("replaces a malformed inbound id", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/files", nil)
		req.Header.Set("X-Request-ID", "bad id\nwith newline")
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if seen == "" || seen == "bad id\nwith newline" || rec.Header().Get("X-Request-ID") != seen {
			t.Fatalf("id = %q, header = %q", seen, rec.Header().Get("X-Request-ID"))
		}
	})

	t.Run("counts responses by status class", func(t *testing.T) {
		before := metrics.responses[4].Load()
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/api/health", nil))
		if got := metrics.responses[4].Load(); got != before+1 {
			t.Fatalf("4xx count = %d, want %d", got, before+1)
		}
	})

	t.Run("stream paths keep the raw writer", func(t *testing.T) {
		raw := httptest.NewRecorder()
		var got http.ResponseWriter
		stream := s.RequestLogger(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { got = w }))
		stream.ServeHTTP(raw, httptest.NewRequest(http.MethodGet, "/api/events", nil))
		if got != raw {
			t.Fatal("SSE must receive the original ResponseWriter")
		}
	})
}

func TestStatusRecorderUnwrapAndFlush(t *testing.T) {
	rec := httptest.NewRecorder()
	sr := &statusRecorder{ResponseWriter: rec, code: http.StatusOK}
	sr.Flush()
	if !rec.Flushed {
		t.Fatal("Flush must reach the underlying writer")
	}
	if sr.Unwrap() != rec {
		t.Fatal("Unwrap must return the underlying writer")
	}
}

func TestObserveStatusOutOfRange(t *testing.T) {
	before := metrics.responses[0].Load()
	metrics.observeStatus(999)
	if metrics.responses[0].Load() != before+1 {
		t.Fatal("out-of-range codes land in bucket 0")
	}
}

func TestHandleMetricsIsHiddenWithoutToken(t *testing.T) {
	for _, tc := range []struct{ configured, sent string }{
		{"", ""},
		{"", "anything"},
		{"secret", ""},
		{"secret", "wrong"},
	} {
		s := &Server{cfg: &config.Config{MetricsToken: tc.configured}}
		req := httptest.NewRequest(http.MethodGet, "/api/internal/metrics", nil)
		if tc.sent != "" {
			req.Header.Set("Authorization", "Bearer "+tc.sent)
		}
		rec := httptest.NewRecorder()
		s.HandleMetrics(rec, req)
		if rec.Code != http.StatusNotFound {
			t.Fatalf("configured=%q sent=%q: status = %d, want 404", tc.configured, tc.sent, rec.Code)
		}
	}
}

func TestRateLimiterCountsRejections(t *testing.T) {
	rl := newRateLimiter(1, time.Minute)
	before := metrics.rateLimited.Load()
	rl.allow("k")
	rl.allow("k")
	if metrics.rateLimited.Load() != before+1 {
		t.Fatal("a rejected request must be counted")
	}
}
