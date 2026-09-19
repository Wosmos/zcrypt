package cmd

import (
	"encoding/json"
	"net/http"
	"os"
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

// deployedCommit is the git SHA this binary was built from. Railway injects
// RAILWAY_GIT_COMMIT_SHA into every deployment it builds from the connected
// repo; it is empty for a local run or any other host, and the endpoint just
// omits the field then.
var deployedCommit = os.Getenv("RAILWAY_GIT_COMMIT_SHA")

// HandleHealth reports liveness and which commit is actually serving.
// GET /api/health
//
// The commit is the load-bearing half. This endpoint used to return a bare
// {"status":"ok"}, so it answered 200 for a week while production ran a
// week-old image: the deploy had silently stopped and nothing could see it,
// because "something is answering" and "the right thing is answering" looked
// identical from outside. Reporting the commit makes that difference visible,
// and CI compares it to the SHA it just pushed.
func (s *Server) HandleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	body := []byte(`{"status":"ok"}`)
	if deployedCommit != "" {
		// Marshal cannot realistically fail for a map of strings; if it ever
		// did, the plain liveness body is still a correct answer.
		if b, err := json.Marshal(map[string]string{"status": "ok", "commit": deployedCommit}); err == nil {
			body = b
		}
	}
	_, _ = w.Write(body)
}
