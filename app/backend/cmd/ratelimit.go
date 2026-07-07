package cmd

import (
	"net/http"
	"sync"
	"time"
)

// rateLimiter is deliberately in-memory and per-instance: zcrypt commits to a
// single-instance deployment (one VM), where this is simpler and strictly
// better than a Redis round-trip. If the backend ever scales horizontally,
// these limits multiply by instance count and the push limiter's per-platform
// byte budget breaks first (risking storage-account throttling) — move state
// to Redis/PG at that point, not before.
type rateLimiter struct {
	mu       sync.Mutex
	requests map[string][]time.Time
	limit    int
	window   time.Duration
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	return &rateLimiter{
		requests: make(map[string][]time.Time),
		limit:    limit,
		window:   window,
	}
}

func (rl *rateLimiter) allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-rl.window)

	// Remove expired entries
	times := rl.requests[key]
	valid := times[:0]
	for _, t := range times {
		if t.After(cutoff) {
			valid = append(valid, t)
		}
	}

	if len(valid) >= rl.limit {
		rl.requests[key] = valid
		return false
	}

	rl.requests[key] = append(valid, now)
	return true
}

// RateLimitMiddleware limits requests per client IP to the given rate. trustedHops
// is the number of trusted reverse-proxy hops used to resolve the real client IP
// (see clientIP), so the limit cannot be bypassed by spoofing X-Forwarded-For.
func RateLimitMiddleware(limit int, window time.Duration, trustedHops int, next http.Handler) http.Handler {
	rl := newRateLimiter(limit, window)

	// Cleanup stale entries every minute
	go func() {
		for {
			time.Sleep(time.Minute)
			rl.mu.Lock()
			now := time.Now()
			cutoff := now.Add(-rl.window)
			for key, times := range rl.requests {
				valid := times[:0]
				for _, t := range times {
					if t.After(cutoff) {
						valid = append(valid, t)
					}
				}
				if len(valid) == 0 {
					delete(rl.requests, key)
				} else {
					rl.requests[key] = valid
				}
			}
			rl.mu.Unlock()
		}
	}()

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !rl.allow(clientIP(r, trustedHops)) {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", "1")
			w.WriteHeader(http.StatusTooManyRequests)
			w.Write([]byte(`{"error":"too many requests, please slow down"}`))
			return
		}

		next.ServeHTTP(w, r)
	})
}
