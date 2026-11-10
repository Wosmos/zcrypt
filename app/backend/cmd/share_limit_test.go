package cmd

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/zcrypt/zcrypt/config"
)

func TestShareChunkDownloadsGetTheirOwnLargerLimit(t *testing.T) {
	s := &Server{
		cfg:               &config.Config{},
		shareLimiter:      newRateLimiter(30, time.Minute),
		shareChunkLimiter: newRateLimiter(600, time.Minute),
	}
	ok := func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) }
	serve := func(h http.HandlerFunc) int {
		r := httptest.NewRequest(http.MethodGet, "/api/share/t/chunks/0", nil)
		r.RemoteAddr = "203.0.113.7:1234"
		w := httptest.NewRecorder()
		h(w, r)
		return w.Code
	}

	chunks := s.ShareChunkRateLimitMiddleware(ok)
	for i := 0; i < 200; i++ {
		if code := serve(chunks); code != http.StatusOK {
			t.Fatalf("chunk %d of a large shared file got %d", i, code)
		}
	}
	info := s.ShareRateLimitMiddleware(ok)
	for i := 0; i < 30; i++ {
		serve(info)
	}
	if code := serve(info); code != http.StatusTooManyRequests {
		t.Fatalf("link info past its limit got %d, want 429", code)
	}
	if code := serve(chunks); code != http.StatusOK {
		t.Fatalf("chunks share the link-info budget: got %d", code)
	}
}
