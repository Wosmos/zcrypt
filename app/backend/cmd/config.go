package cmd

import (
	"encoding/json"
	"net/http"
)

// HandleGetConfig returns the current configuration (auth-protected).
// GET /api/config
func (s *Server) HandleGetConfig(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	type SafeConfig struct {
		DefaultPlatform string           `json:"default_platform"`
		Thresholds      map[string]int64 `json:"thresholds"`
		TokenCount      int              `json:"token_count"`
	}

	tokenCount := 0
	tokens, err := s.db.GetUserPlatformTokenInfo(ctx, userID)
	if err == nil {
		tokenCount = len(tokens)
	}

	safe := SafeConfig{
		DefaultPlatform: s.cfg.DefaultPlatform,
		Thresholds:      s.cfg.Thresholds,
		TokenCount:      tokenCount,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(safe)
}

// HandleUpdateConfig updates configuration values (admin-only).
// PUT /api/config
func (s *Server) HandleUpdateConfig(w http.ResponseWriter, r *http.Request) {
	var updates map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	if v, ok := updates["default_platform"].(string); ok {
		s.cfg.DefaultPlatform = v
	}

	if err := s.cfg.Save(); err != nil {
		http.Error(w, `{"error":"save config failed"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"success":true}`))
}

// HandleHealth returns a simple health check.
// GET /api/health
func (s *Server) HandleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"ok"}`))
}
