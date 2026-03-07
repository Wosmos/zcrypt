package cmd

import (
	"encoding/json"
	"fmt"
	"net/http"
)

// HandleGetConfig returns the current configuration (with tokens redacted).
// GET /api/config
func (s *Server) HandleGetConfig(w http.ResponseWriter, r *http.Request) {
	type SafeConfig struct {
		HasGithubToken  bool             `json:"has_github_token"`
		DefaultPlatform string           `json:"default_platform"`
		Thresholds      map[string]int64 `json:"thresholds"`
		AccountCount    int              `json:"account_count"`
	}

	safe := SafeConfig{
		HasGithubToken:  len(s.cfg.Accounts["github"]) > 0,
		DefaultPlatform: s.cfg.DefaultPlatform,
		Thresholds:      s.cfg.Thresholds,
		AccountCount:    len(s.accountKeys),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(safe)
}

// HandleUpdateConfig updates configuration values.
// PUT /api/config
func (s *Server) HandleUpdateConfig(w http.ResponseWriter, r *http.Request) {
	var updates map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"invalid request: %s"}`, err), http.StatusBadRequest)
		return
	}

	if v, ok := updates["default_platform"].(string); ok {
		s.cfg.DefaultPlatform = v
	}

	if err := s.cfg.Save(); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"save config: %s"}`, err), http.StatusInternalServerError)
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
