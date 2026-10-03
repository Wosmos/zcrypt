package cmd

import (
	"context"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/zcrypt/zcrypt/auth"
	"github.com/zcrypt/zcrypt/types"
)

// revokedSessions remembers sessions signed out from another device for as long
// as an access token minted for them can still be alive. Deleting the refresh
// tokens stops the session from refreshing; this rejects the access token it
// already holds. In-memory is enough because zcrypt runs a single instance (see
// rateLimiter).
type revokedSessions struct {
	mu    sync.Mutex
	until map[string]time.Time
}

func newRevokedSessions() *revokedSessions {
	return &revokedSessions{until: make(map[string]time.Time)}
}

func (rs *revokedSessions) add(ids ...string) {
	if rs == nil {
		return
	}
	rs.mu.Lock()
	defer rs.mu.Unlock()
	now := time.Now()
	for id, t := range rs.until {
		if now.After(t) {
			delete(rs.until, id)
		}
	}
	for _, id := range ids {
		rs.until[id] = now.Add(auth.AccessTokenDuration)
	}
}

func (rs *revokedSessions) has(id string) bool {
	if rs == nil || id == "" {
		return false
	}
	rs.mu.Lock()
	defer rs.mu.Unlock()
	t, ok := rs.until[id]
	return ok && time.Now().Before(t)
}

// HandleListSessions lists the caller's signed-in devices.
// GET /api/auth/sessions
func (s *Server) HandleListSessions(w http.ResponseWriter, r *http.Request) {
	sessions, err := s.visibleSessions(r)
	if err != nil {
		internalError(w, "list sessions", err)
		return
	}
	writeJSON(w, http.StatusOK, sessions)
}

// visibleSessions lists the caller's sessions with the calling one marked. A
// decoy session sees only itself.
func (s *Server) visibleSessions(r *http.Request) ([]types.Session, error) {
	claims := GetUserClaims(r)
	sessions, err := s.db.ListSessions(r.Context(), claims.Sub)
	if err != nil {
		return nil, err
	}
	visible := make([]types.Session, 0, len(sessions))
	for _, ss := range sessions {
		ss.Current = ss.ID == claims.SessionID
		if claims.Decoy && !ss.Current {
			continue
		}
		visible = append(visible, ss)
	}
	return visible, nil
}

// HandleRevokeSession signs one of the caller's devices out. A decoy session
// sees only itself, so any other session is answered as not found.
// DELETE /api/auth/sessions/{id}
func (s *Server) HandleRevokeSession(w http.ResponseWriter, r *http.Request) {
	claims := GetUserClaims(r)
	userID := claims.Sub
	sessionID := r.PathValue("id")
	if claims.Decoy && sessionID != claims.SessionID {
		http.Error(w, `{"error":"session not found"}`, http.StatusNotFound)
		return
	}
	found, err := s.db.DeleteSession(r.Context(), userID, sessionID)
	if err != nil {
		internalError(w, "revoke session", err)
		return
	}
	if !found {
		http.Error(w, `{"error":"session not found"}`, http.StatusNotFound)
		return
	}
	s.revokedSessions.add(sessionID)
	s.audit(r, &userID, "session_revoke", map[string]interface{}{"session_id": sessionID})
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// HandleRevokeOtherSessions signs out every device except the one calling. A
// decoy session has no other devices to sign out.
// POST /api/auth/sessions/revoke-others
func (s *Server) HandleRevokeOtherSessions(w http.ResponseWriter, r *http.Request) {
	if IsDecoy(r) {
		writeJSON(w, http.StatusOK, map[string]int{"revoked": 0})
		return
	}
	claims := GetUserClaims(r)
	if claims.SessionID == "" {
		http.Error(w, `{"error":"this sign-in predates device management, sign in again and retry"}`, http.StatusConflict)
		return
	}
	userID := claims.Sub
	ids, err := s.db.DeleteOtherSessions(r.Context(), userID, claims.SessionID)
	if err != nil {
		internalError(w, "revoke other sessions", err)
		return
	}
	s.revokedSessions.add(ids...)
	s.audit(r, &userID, "sessions_revoke_others", map[string]interface{}{"count": len(ids)})
	writeJSON(w, http.StatusOK, map[string]int{"revoked": len(ids)})
}

// newDeviceGrace keeps a brand-new account's first sign-ins from triggering
// new-device alerts: every device is new to an account that is minutes old.
const newDeviceGrace = 10 * time.Minute

// notifyNewDevice emails the owner when a new session starts from a user agent
// the account has not used before. Best-effort: it never blocks the sign-in.
func (s *Server) notifyNewDevice(ctx context.Context, r *http.Request, user *types.User) {
	send := s.newDeviceMailer
	if send == nil {
		cfg := s.emailCfg()
		if cfg == nil {
			return
		}
		send = func(to, device, location string, when time.Time, baseURL string) error {
			return auth.SendNewDeviceEmail(cfg, to, device, location, when, baseURL)
		}
	}
	if user.Email == "" || time.Since(user.CreatedAt) < newDeviceGrace {
		return
	}
	ua := r.UserAgent()
	known, err := s.db.IsKnownDevice(ctx, user.ID, ua)
	if err != nil || known {
		return
	}
	device, location, baseURL, to := describeUserAgent(ua), anonIP(s.clientIP(r)), s.baseURL(r), user.Email
	s.goBackground(func() {
		if err := send(to, device, location, time.Now(), baseURL); err != nil {
			log.Printf("send new device email: %v", err)
		}
	})
}

// describeUserAgent turns a user agent into a short "Browser on OS" label.
func describeUserAgent(ua string) string {
	if ua == "" {
		return "Unknown device"
	}
	browser := "Unknown browser"
	switch {
	case strings.Contains(ua, "zcrypt"):
		browser = "zcrypt app"
	case strings.Contains(ua, "Firefox/"):
		browser = "Firefox"
	case strings.Contains(ua, "Edg/"):
		browser = "Edge"
	case strings.Contains(ua, "Chrome/"):
		browser = "Chrome"
	case strings.Contains(ua, "Safari/"):
		browser = "Safari"
	}
	os := "unknown OS"
	switch {
	case strings.Contains(ua, "Windows"):
		os = "Windows"
	case strings.Contains(ua, "Android"):
		os = "Android"
	case strings.Contains(ua, "iPhone"), strings.Contains(ua, "iPad"):
		os = "iOS"
	case strings.Contains(ua, "Mac OS X"):
		os = "macOS"
	case strings.Contains(ua, "Linux"):
		os = "Linux"
	}
	return browser + " on " + os
}
