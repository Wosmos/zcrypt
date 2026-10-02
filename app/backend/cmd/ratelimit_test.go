package cmd

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRateLimiterAllowCapsPerKey(t *testing.T) {
	rl := newRateLimiter(2, time.Minute)
	assert.True(t, rl.allow("a"))
	assert.True(t, rl.allow("a"))
	assert.False(t, rl.allow("a"))
	assert.True(t, rl.allow("b"), "keys have separate buckets")
}

func TestRateLimiterExceededCountsOnlyRecorded(t *testing.T) {
	rl := newRateLimiter(2, time.Minute)
	for i := 0; i < 5; i++ {
		assert.False(t, rl.exceeded("k"), "checking alone never spends budget")
	}
	rl.record("k")
	assert.False(t, rl.exceeded("k"))
	rl.record("k")
	assert.True(t, rl.exceeded("k"))
	assert.Empty(t, rl.requests["missing"])
	_, kept := rl.requests["missing"]
	assert.False(t, kept, "a check on an unknown key must not create an entry")
}

func TestRateLimiterSweepsIdleKeys(t *testing.T) {
	rl := newRateLimiter(3, time.Minute)
	for i := 0; i < 100; i++ {
		rl.record(strings.Repeat("x", i+1))
	}
	require.Len(t, rl.requests, 100)

	old := time.Now().Add(-2 * time.Minute)
	for k := range rl.requests {
		rl.requests[k] = []time.Time{old}
	}
	rl.lastSweep = old

	assert.True(t, rl.allow("fresh"))
	assert.Len(t, rl.requests, 1, "expired keys are dropped once a window has passed")
}

func TestRateLimiterSweepWaitsForAWindow(t *testing.T) {
	rl := newRateLimiter(3, time.Hour)
	rl.requests["stale"] = []time.Time{time.Now().Add(-2 * time.Hour)}
	rl.allow("other")
	_, kept := rl.requests["stale"]
	assert.True(t, kept, "no full sweep until a window has elapsed since the last one")
}

func TestValidatePasswordLength(t *testing.T) {
	assert.NoError(t, validatePassword("Aa1!"+strings.Repeat("x", 68)))
	err := validatePassword("Aa1!" + strings.Repeat("x", 69))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "at most 72 bytes")
	assert.Error(t, validatePassword("Aa1!x"))
}

func TestSSETicketStoreRedeemsOnce(t *testing.T) {
	st := newSSETicketStore()
	raw, err := st.issue(sseTicket{userID: "u1", expiresAt: time.Now().Add(time.Minute)})
	require.NoError(t, err)

	_, stored := st.tickets[raw]
	assert.False(t, stored, "only the hash of a ticket is kept")

	got, ok := st.redeem(raw)
	require.True(t, ok)
	assert.Equal(t, "u1", got.userID)

	_, ok = st.redeem(raw)
	assert.False(t, ok, "a ticket works once")
	_, ok = st.redeem("unknown")
	assert.False(t, ok)
}

func TestSSETicketStoreExpiry(t *testing.T) {
	st := newSSETicketStore()
	raw, err := st.issue(sseTicket{userID: "u1", expiresAt: time.Now().Add(-time.Second)})
	require.NoError(t, err)
	_, ok := st.redeem(raw)
	assert.False(t, ok, "an expired ticket is refused")

	_, err = st.issue(sseTicket{userID: "u2", expiresAt: time.Now().Add(-time.Second)})
	require.NoError(t, err)
	_, err = st.issue(sseTicket{userID: "u3", expiresAt: time.Now().Add(time.Minute)})
	require.NoError(t, err)
	assert.Len(t, st.tickets, 1, "expired tickets are dropped when a new one is issued")
}
