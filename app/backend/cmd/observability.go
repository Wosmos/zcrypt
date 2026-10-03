package cmd

import (
	"context"
	"crypto/subtle"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"runtime"
	"strings"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
)

// serverMetrics are process-wide counters exposed on the metrics endpoint.
type serverMetrics struct {
	responses   [6]atomic.Int64
	rateLimited atomic.Int64
}

var metrics serverMetrics

func (m *serverMetrics) observeStatus(code int) {
	class := code / 100
	if class < 1 || class > 5 {
		class = 0
	}
	m.responses[class].Add(1)
}

const requestIDKey contextKey = "request_id"

var validRequestID = regexp.MustCompile(`^[A-Za-z0-9._-]{1,64}$`)

// RequestID returns the id the request logger assigned to this request.
func RequestID(ctx context.Context) string {
	id, _ := ctx.Value(requestIDKey).(string)
	return id
}

type statusRecorder struct {
	http.ResponseWriter
	code int
}

func (sr *statusRecorder) WriteHeader(code int) {
	sr.code = code
	sr.ResponseWriter.WriteHeader(code)
}

func (sr *statusRecorder) Flush() {
	if f, ok := sr.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (sr *statusRecorder) Unwrap() http.ResponseWriter {
	return sr.ResponseWriter
}

// isStreamPath reports the long-lived endpoints that must keep the raw
// ResponseWriter (SSE flushing, WebSocket hijacking) and are not access-logged.
func isStreamPath(path string) bool {
	return strings.HasPrefix(path, "/api/events") || path == "/api/transfer/ws"
}

// RequestLogger tags every request with an id (a sane inbound X-Request-ID is
// kept so a proxy's id carries through), echoes it back, and writes one
// structured access-log line with the real client IP.
func (s *Server) RequestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-ID")
		if !validRequestID.MatchString(id) {
			id = uuid.NewString()
		}
		w.Header().Set("X-Request-ID", id)
		r = r.WithContext(context.WithValue(r.Context(), requestIDKey, id))

		if isStreamPath(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}

		start := time.Now()
		sr := &statusRecorder{ResponseWriter: w, code: http.StatusOK}
		next.ServeHTTP(sr, r)
		metrics.observeStatus(sr.code)

		if r.URL.Path == "/api/health" {
			return
		}
		level := slog.LevelInfo
		if sr.code >= 500 {
			level = slog.LevelError
		}
		slog.LogAttrs(r.Context(), level, "request",
			slog.String("request_id", id),
			slog.String("method", r.Method),
			slog.String("path", r.URL.Path),
			slog.Int("status", sr.code),
			slog.Int64("duration_ms", time.Since(start).Milliseconds()),
			slog.String("ip", s.clientIP(r)),
		)
	})
}

// HandleMetrics serves Prometheus text-format metrics. It is opt-in per
// environment: without METRICS_TOKEN it answers 404, and with it the caller
// must present that token as a bearer token.
// GET /api/internal/metrics
func (s *Server) HandleMetrics(w http.ResponseWriter, r *http.Request) {
	token := s.cfg.MetricsToken
	got := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if token == "" || subtle.ConstantTimeCompare([]byte(got), []byte(token)) != 1 {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}

	var b strings.Builder
	gauge := func(name, help string, v int64) {
		fmt.Fprintf(&b, "# HELP %s %s\n# TYPE %s gauge\n%s %d\n", name, help, name, name, v)
	}
	counter := func(name, help string, v int64) {
		fmt.Fprintf(&b, "# HELP %s %s\n# TYPE %s counter\n%s %d\n", name, help, name, name, v)
	}

	b.WriteString("# HELP zcrypt_http_responses_total HTTP responses by status class.\n# TYPE zcrypt_http_responses_total counter\n")
	for class := 1; class <= 5; class++ {
		fmt.Fprintf(&b, "zcrypt_http_responses_total{class=\"%dxx\"} %d\n", class, metrics.responses[class].Load())
	}
	counter("zcrypt_rate_limited_total", "Requests rejected by any rate limiter.", metrics.rateLimited.Load())
	gauge("zcrypt_sse_subscribers", "Open server-sent event streams.", int64(s.progress.SubscriberCount()))
	gauge("zcrypt_goroutines", "Live goroutines.", int64(runtime.NumGoroutine()))
	maintenance := int64(0)
	if s.InMaintenanceMode() {
		maintenance = 1
	}
	gauge("zcrypt_maintenance_mode", "1 while writes are frozen for a database rotation.", maintenance)

	q, err := s.db.SyncQueueStats(r.Context(), maxSyncAttempts)
	if err != nil {
		internalError(w, "metrics: sync queue stats", err)
		return
	}
	gauge("zcrypt_sync_queue_pending", "Chunks waiting to be pushed to a platform.", q.Pending)
	gauge("zcrypt_sync_chunks_abandoned", "Chunks that exhausted their sync retries and were never pushed.", q.Abandoned)
	gauge("zcrypt_sync_chunks_uncommitted", "Pushed chunks whose platform commit is not verified yet.", q.Uncommitted)
	gauge("zcrypt_pending_deletions", "Remote blobs queued for deletion.", q.PendingDeletions)

	w.Header().Set("Content-Type", "text/plain; version=0.0.4")
	_, _ = w.Write([]byte(b.String()))
}
