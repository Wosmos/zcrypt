package cmd

import (
	"context"
	"sync"
	"time"
)

// sessionLiveCache confirms against refresh_tokens that the session an access
// token claims still exists. Only positive answers are cached, for a short
// TTL; invalidate drops them when a session is revoked.
type sessionLiveCache struct {
	mu    sync.Mutex
	until map[string]time.Time
	ttl   time.Duration
	load  func(ctx context.Context, userID, sessionID string) (bool, error)
}

func newSessionLiveCache(ttl time.Duration, load func(ctx context.Context, userID, sessionID string) (bool, error)) *sessionLiveCache {
	return &sessionLiveCache{until: make(map[string]time.Time), ttl: ttl, load: load}
}

func (c *sessionLiveCache) live(ctx context.Context, userID, sessionID string) (bool, error) {
	if c == nil {
		return true, nil
	}
	key := userID + "/" + sessionID
	now := time.Now()
	if c.ttl > 0 {
		c.mu.Lock()
		t, ok := c.until[key]
		c.mu.Unlock()
		if ok && now.Before(t) {
			return true, nil
		}
	}
	ok, err := c.load(ctx, userID, sessionID)
	if err != nil || !ok {
		return false, err
	}
	if c.ttl > 0 {
		c.mu.Lock()
		for k, t := range c.until {
			if now.After(t) {
				delete(c.until, k)
			}
		}
		c.until[key] = now.Add(c.ttl)
		c.mu.Unlock()
	}
	return true, nil
}

func (c *sessionLiveCache) invalidate(userID string, sessionIDs ...string) {
	if c == nil {
		return
	}
	c.mu.Lock()
	for _, id := range sessionIDs {
		delete(c.until, userID+"/"+id)
	}
	c.mu.Unlock()
}

// sessionRevoked reports whether the session behind an access token has been
// signed out: in memory first, then against the database so a restart does
// not resurrect it. Tokens without a session id predate device management.
func (s *Server) sessionRevoked(ctx context.Context, userID, sessionID string) (bool, error) {
	if sessionID == "" {
		return false, nil
	}
	if s.revokedSessions.has(sessionID) {
		return true, nil
	}
	live, err := s.sessionLive.live(ctx, userID, sessionID)
	if err != nil {
		return false, err
	}
	return !live, nil
}

// revokeSessionIDs records signed-out sessions of a user in memory and drops
// their cached liveness.
func (s *Server) revokeSessionIDs(userID string, ids ...string) {
	s.revokedSessions.add(ids...)
	s.sessionLive.invalidate(userID, ids...)
}
