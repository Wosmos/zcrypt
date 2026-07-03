package cmd

import (
	"sort"
	"sync"
	"time"
)

// pushLimiter throttles the bytes pushed to a storage platform so the backend
// stays under a per-platform cap within a trailing window — e.g. GitHub's
// ~7GB/hour push rate. It is a sliding-window reservation limiter: reserve()
// accounts a push and returns how long the caller should wait before actually
// sending so the trailing-window total stays at or under the limit.
//
// The clock is injectable so the behaviour is unit-testable without real time.
// Safe for concurrent callers.
type pushLimiter struct {
	mu     sync.Mutex
	limits map[string]int64 // platform -> max bytes per window; <=0 or absent = unlimited
	window time.Duration
	events map[string][]rateEvent
	now    func() time.Time
}

type rateEvent struct {
	at    time.Time
	bytes int64
}

func newPushLimiter(limits map[string]int64, window time.Duration) *pushLimiter {
	return &pushLimiter{
		limits: limits,
		window: window,
		events: make(map[string][]rateEvent),
		now:    time.Now,
	}
}

// reserve accounts `bytes` for `platform` and returns how long the caller should
// wait before sending, so the trailing-window total stays within the limit.
// Returns 0 when the platform is unlimited or there is room right now.
func (l *pushLimiter) reserve(platform string, bytes int64) time.Duration {
	l.mu.Lock()
	defer l.mu.Unlock()

	limit, ok := l.limits[platform]
	if !ok || limit <= 0 {
		return 0 // unlimited platform — no throttling
	}

	now := l.now()
	l.prune(platform, now)

	var sum int64
	for _, e := range l.events[platform] {
		sum += e.bytes
	}

	// Fits within the window right now — record and go.
	if sum+bytes <= limit {
		l.events[platform] = append(l.events[platform], rateEvent{at: now, bytes: bytes})
		return 0
	}

	// Over the cap — wait until enough of the oldest reserved bytes age out of
	// the trailing window to make room for this push.
	need := sum + bytes - limit
	ordered := append([]rateEvent(nil), l.events[platform]...)
	sort.Slice(ordered, func(i, j int) bool { return ordered[i].at.Before(ordered[j].at) })

	var freed int64
	sendAt := now
	for _, e := range ordered {
		freed += e.bytes
		if freed >= need {
			sendAt = e.at.Add(l.window)
			break
		}
	}
	delay := sendAt.Sub(now)
	if delay < 0 {
		delay = 0
	}
	// Record at `now` (conservative: the bytes count from now, so they age out
	// no later than the real send at now+delay).
	l.events[platform] = append(l.events[platform], rateEvent{at: now, bytes: bytes})
	return delay
}

// prune drops events that have fully aged out of the trailing window. Order
// independent, so it's correct regardless of insertion order.
func (l *pushLimiter) prune(platform string, now time.Time) {
	cutoff := now.Add(-l.window)
	ev := l.events[platform]
	kept := ev[:0]
	for _, e := range ev {
		if !e.at.Before(cutoff) {
			kept = append(kept, e)
		}
	}
	l.events[platform] = kept
}
