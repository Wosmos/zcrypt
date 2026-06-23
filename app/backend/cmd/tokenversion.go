package cmd

import (
	"context"
	"sync"
	"time"
)

// tokenVersionCache enforces JWT revocation by comparing a token's embedded
// version against the user's current token_version in the DB. Bumping a user's
// token_version (on password reset, forced logout, or role change) invalidates
// every access token already issued to them. Without this check those tokens
// stay valid until they expire (up to the access-token lifetime), so "reset my
// password" and "demote this admin" do not actually revoke live sessions.
//
// Lookups are cached for a short TTL to avoid a DB round-trip on every
// authenticated request; invalidate() drops a user's entry so a bump takes
// effect immediately on the paths that trigger it.
type tokenVersionCache struct {
	mu      sync.RWMutex
	entries map[string]tvEntry
	ttl     time.Duration
	load    func(ctx context.Context, userID string) (int, error)
}

type tvEntry struct {
	version int
	expires time.Time
}

func newTokenVersionCache(ttl time.Duration, load func(ctx context.Context, userID string) (int, error)) *tokenVersionCache {
	return &tokenVersionCache{
		entries: make(map[string]tvEntry),
		ttl:     ttl,
		load:    load,
	}
}

// current returns the user's current token version, using the cache when fresh
// and otherwise loading from the backing store. A ttl <= 0 disables caching
// (every call reloads), which keeps tests deterministic.
func (c *tokenVersionCache) current(ctx context.Context, userID string) (int, error) {
	if c.ttl > 0 {
		c.mu.RLock()
		e, ok := c.entries[userID]
		c.mu.RUnlock()
		if ok && time.Now().Before(e.expires) {
			return e.version, nil
		}
	}

	v, err := c.load(ctx, userID)
	if err != nil {
		return 0, err
	}

	if c.ttl > 0 {
		c.mu.Lock()
		c.entries[userID] = tvEntry{version: v, expires: time.Now().Add(c.ttl)}
		c.mu.Unlock()
	}
	return v, nil
}

// invalidate drops the cached version for a user so the next check reloads from
// the backing store. Call this immediately after bumping token_version.
func (c *tokenVersionCache) invalidate(userID string) {
	c.mu.Lock()
	delete(c.entries, userID)
	c.mu.Unlock()
}
