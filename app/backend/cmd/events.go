package cmd

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/zcrypt/zcrypt/auth"
	"github.com/zcrypt/zcrypt/types"
)

const (
	sseTicketTTL = 30 * time.Second
	// maxStreamsPerUser bounds one account's open event streams. A tab holds
	// up to three (operation status, file events, devices), so this leaves
	// room for a few tabs and the desktop app.
	maxStreamsPerUser = 12
	// legacySSETokenRemoval is when /api/events stops accepting ?token=<jwt>.
	// Only frontends built before SSE tickets still send it (old desktop and
	// Android bundles); each use is logged so the cut-over can be watched.
	legacySSETokenRemoval = "2027-01-01"
)

// legacySSETokenLog keeps the deprecation log to one line per user per hour.
var legacySSETokenLog = newRateLimiter(1, time.Hour)

// sseTicket is what a stream needs to know about its caller, captured from the
// access token when the ticket was issued.
type sseTicket struct {
	userID string
	// subscriber is the stream identity events are routed by (see
	// sseSubscriber): the user for a real session, a decoy-only id otherwise.
	subscriber string
	// sessionID lets a stream end as soon as its sign-in is revoked.
	sessionID    string
	isAdmin      bool
	tokenVersion int
	streamUntil  time.Time
	expiresAt    time.Time
}

type sseTicketStore struct {
	mu      sync.Mutex
	tickets map[string]sseTicket
}

func newSSETicketStore() *sseTicketStore {
	return &sseTicketStore{tickets: make(map[string]sseTicket)}
}

// issue stores t under a fresh random ticket and returns the ticket. Only its
// hash is kept, and expired tickets are dropped on the way in.
func (st *sseTicketStore) issue(t sseTicket) (string, error) {
	raw, err := auth.GenerateRandomToken()
	if err != nil {
		return "", err
	}
	st.mu.Lock()
	defer st.mu.Unlock()
	now := time.Now()
	for k, v := range st.tickets {
		if now.After(v.expiresAt) {
			delete(st.tickets, k)
		}
	}
	st.tickets[auth.HashToken(raw)] = t
	return raw, nil
}

// redeem consumes a ticket: it works once, and only before it expires.
func (st *sseTicketStore) redeem(raw string) (sseTicket, bool) {
	st.mu.Lock()
	defer st.mu.Unlock()
	key := auth.HashToken(raw)
	t, ok := st.tickets[key]
	delete(st.tickets, key)
	if !ok || time.Now().After(t.expiresAt) {
		return sseTicket{}, false
	}
	return t, true
}

// HandleSSETicket issues a single-use ticket for opening /api/events.
// POST /api/sse/ticket
func (s *Server) HandleSSETicket(w http.ResponseWriter, r *http.Request) {
	claims := GetUserClaims(r)
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	t := sseTicketFor(claims)
	t.expiresAt = time.Now().Add(sseTicketTTL)
	ticket, err := s.sseTickets.issue(t)
	if err != nil {
		internalError(w, "sse ticket", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"ticket": ticket})
}

// sseCaller resolves who is opening a stream: a ticket from HandleSSETicket,
// or a raw access token from clients built before tickets existed.
func (s *Server) sseCaller(r *http.Request) (sseTicket, bool) {
	q := r.URL.Query()
	if raw := q.Get("ticket"); raw != "" {
		return s.sseTickets.redeem(raw)
	}
	token := q.Get("token")
	if token == "" {
		return sseTicket{}, false
	}
	claims, err := auth.ValidateAccessToken(s.cfg.JWTSecret, token)
	if err != nil {
		return sseTicket{}, false
	}
	if legacySSETokenLog.allow(claims.Sub) {
		log.Printf("deprecated: /api/events?token= used by user %s (%s); ticket auth required after %s", claims.Sub, r.UserAgent(), legacySSETokenRemoval)
	}
	return sseTicketFor(claims), true
}

// sseTicketFor captures a stream's caller from its access token claims.
func sseTicketFor(claims *auth.Claims) sseTicket {
	subscriber, isAdmin := sseSubscriber(claims)
	return sseTicket{
		userID:       claims.Sub,
		subscriber:   subscriber,
		sessionID:    claims.SessionID,
		isAdmin:      isAdmin,
		tokenVersion: claims.TokenVersion,
		streamUntil:  time.Unix(claims.Exp, 0),
	}
}

// HandleSSE serves Server-Sent Events for real-time progress and audit updates.
// GET /api/events?ticket=<single-use ticket>
// EventSource can't send an Authorization header, so the caller first trades
// its access token for a ticket. The stream ends when that access token would
// have expired or as soon as the user's sessions are revoked.
func (s *Server) HandleSSE(w http.ResponseWriter, r *http.Request) {
	caller, ok := s.sseCaller(r)
	if !ok {
		http.Error(w, `{"error":"invalid or expired ticket"}`, http.StatusUnauthorized)
		return
	}
	if !time.Now().Before(caller.streamUntil) {
		http.Error(w, `{"error":"invalid or expired token"}`, http.StatusUnauthorized)
		return
	}
	revoked := func() (bool, error) {
		cur, err := s.tokenVersions.current(r.Context(), caller.userID)
		return err == nil && (cur != caller.tokenVersion || s.revokedSessions.has(caller.sessionID)), err
	}
	gone, err := revoked()
	if err != nil {
		internalError(w, "sse token version", err)
		return
	}
	if gone {
		http.Error(w, `{"error":"token revoked, please log in again"}`, http.StatusUnauthorized)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	subID := uuid.New().String()
	ch, ok := s.progress.SubscribeLimited(subID, caller.subscriber, caller.isAdmin, maxStreamsPerUser)
	if !ok {
		http.Error(w, `{"error":"too many open event streams"}`, http.StatusTooManyRequests)
		return
	}
	defer s.progress.Unsubscribe(subID)

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	// Send initial connected event
	fmt.Fprintf(w, "event: connected\ndata: {\"id\":\"%s\"}\n\n", subID)
	flusher.Flush()

	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()
	expiry := time.NewTimer(time.Until(caller.streamUntil))
	defer expiry.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-expiry.C:
			return
		case <-ticker.C:
			if gone, _ := revoked(); gone {
				return
			}
			fmt.Fprintf(w, ": heartbeat\n\n")
			flusher.Flush()
		case event, ok := <-ch:
			if !ok {
				return
			}
			data, _ := json.Marshal(event.Payload)
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.Type, data)
			flusher.Flush()
		}
	}
}

// sseSubscriber picks the stream identity for a session. A decoy session gets
// one no real event targets, so it never sees the real vault's uploads or audit.
func sseSubscriber(claims *auth.Claims) (string, bool) {
	if claims.Decoy {
		return "decoy:" + claims.Sub, false
	}
	return claims.Sub, claims.Role == types.RoleAdmin.String()
}
