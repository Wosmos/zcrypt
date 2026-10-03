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
// byte budget breaks first (risking storage-account throttling), move state
// to Redis/PG at that point, not before.
type rateLimiter struct {
	mu        sync.Mutex
	requests  map[string][]time.Time
	limit     int
	window    time.Duration
	lastSweep time.Time
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	return &rateLimiter{
		requests:  make(map[string][]time.Time),
		limit:     limit,
		window:    window,
		lastSweep: time.Now(),
	}
}

// allow records an attempt for key and reports whether it is within the limit.
func (rl *rateLimiter) allow(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	rl.sweepLocked(now)
	valid := rl.liveLocked(key, now)
	if len(valid) >= rl.limit {
		metrics.rateLimited.Add(1)
		return false
	}
	rl.requests[key] = append(valid, now)
	return true
}

// exceeded reports whether key is already at its limit without recording an
// attempt. Paired with record, it lets a caller count only failures.
func (rl *rateLimiter) exceeded(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	rl.sweepLocked(now)
	return len(rl.liveLocked(key, now)) >= rl.limit
}

// record counts one attempt against key.
func (rl *rateLimiter) record(key string) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	rl.sweepLocked(now)
	rl.requests[key] = append(rl.liveLocked(key, now), now)
}

// liveLocked trims key's expired attempts, dropping the key once none remain.
func (rl *rateLimiter) liveLocked(key string, now time.Time) []time.Time {
	cutoff := now.Add(-rl.window)
	times := rl.requests[key]
	valid := times[:0]
	for _, t := range times {
		if t.After(cutoff) {
			valid = append(valid, t)
		}
	}
	if len(valid) == 0 {
		delete(rl.requests, key)
		return nil
	}
	rl.requests[key] = valid
	return valid
}

// sweepLocked drops every idle key at most once per window, so keys an
// attacker invents (emails, IPs) cannot grow the map without bound.
func (rl *rateLimiter) sweepLocked(now time.Time) {
	if now.Sub(rl.lastSweep) < rl.window {
		return
	}
	rl.lastSweep = now
	for key := range rl.requests {
		rl.liveLocked(key, now)
	}
}

// RateLimitMiddleware limits requests per client IP to the given rate. trustedHops
// is the number of trusted reverse-proxy hops used to resolve the real client IP
// (see clientIP), so the limit cannot be bypassed by spoofing X-Forwarded-For.
func RateLimitMiddleware(limit int, window time.Duration, trustedHops int, next http.Handler) http.Handler {
	rl := newRateLimiter(limit, window)

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
