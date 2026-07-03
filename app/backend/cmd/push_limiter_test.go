package cmd

import (
	"testing"
	"time"
)

func TestPushLimiterThrottlesOverCap(t *testing.T) {
	base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	clock := base
	l := newPushLimiter(map[string]int64{"github": 1000}, time.Hour)
	l.now = func() time.Time { return clock }

	// Two 400-byte pushes fit under the 1000 cap → no wait.
	if d := l.reserve("github", 400); d != 0 {
		t.Fatalf("first reserve should not wait, got %v", d)
	}
	if d := l.reserve("github", 400); d != 0 {
		t.Fatalf("second reserve should not wait, got %v", d)
	}

	// A third 400 would total 1200 > 1000 → must wait until the oldest ages out
	// of the 1h window (≈ 1h from now).
	d := l.reserve("github", 400)
	if d < time.Hour-time.Minute || d > time.Hour {
		t.Fatalf("over-cap reserve should wait ~1h, got %v", d)
	}

	// Advance past the window → the early pushes age out → room again, no wait.
	clock = base.Add(time.Hour + time.Minute)
	if d := l.reserve("github", 400); d != 0 {
		t.Fatalf("after the window elapses, reserve should not wait, got %v", d)
	}
}

func TestPushLimiterUnlimited(t *testing.T) {
	// A platform with no configured limit is unlimited — never throttled.
	l := newPushLimiter(map[string]int64{"github": 1000}, time.Hour)
	if d := l.reserve("telegram", 1<<40); d != 0 {
		t.Fatalf("unlisted platform should be unlimited, got %v", d)
	}
	// An explicit non-positive limit is also treated as unlimited.
	l2 := newPushLimiter(map[string]int64{"github": 0}, time.Hour)
	if d := l2.reserve("github", 1<<40); d != 0 {
		t.Fatalf("zero limit should be unlimited, got %v", d)
	}
}

func TestPushLimiterPerPlatformIsolation(t *testing.T) {
	base := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	l := newPushLimiter(map[string]int64{"github": 1000, "gitlab": 1000}, time.Hour)
	l.now = func() time.Time { return base }

	// Saturating github must not affect gitlab's budget.
	l.reserve("github", 1000)
	if d := l.reserve("gitlab", 1000); d != 0 {
		t.Fatalf("gitlab budget should be independent of github, got %v", d)
	}
	if d := l.reserve("github", 100); d <= 0 {
		t.Fatalf("github is saturated, should throttle, got %v", d)
	}
}
