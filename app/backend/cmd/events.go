package cmd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/zcrypt/zcrypt/auth"
	"github.com/zcrypt/zcrypt/types"
)

// HandleSSE serves Server-Sent Events for real-time progress and audit updates.
// GET /api/events?token=<jwt>
// EventSource doesn't support Authorization headers, so JWT is passed via query param.
func (s *Server) HandleSSE(w http.ResponseWriter, r *http.Request) {
	// Validate JWT from query parameter
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, `{"error":"token required"}`, http.StatusUnauthorized)
		return
	}

	claims, err := auth.ValidateAccessToken(s.cfg.JWTSecret, token)
	if err != nil {
		http.Error(w, `{"error":"invalid or expired token"}`, http.StatusUnauthorized)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	subID := uuid.New().String()
	isAdmin := claims.Role == types.RoleAdmin.String()
	ch := s.progress.Subscribe(subID, claims.Sub, isAdmin)
	defer s.progress.Unsubscribe(subID)

	// Send initial connected event
	fmt.Fprintf(w, "event: connected\ndata: {\"id\":\"%s\"}\n\n", subID)
	flusher.Flush()

	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
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
