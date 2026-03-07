package cmd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/zpush/zpush/config"
	"github.com/zpush/zpush/types"
)

// ConnectRequest is the JSON body for connecting a platform.
type ConnectRequest struct {
	Platform string `json:"platform"`
	Token    string `json:"token"`
}

// DisconnectRequest is the JSON body for disconnecting an account.
type DisconnectRequest struct {
	Platform string `json:"platform"`
	Username string `json:"username"`
}

// HandlePlatformStatus returns the connection status of all platforms.
// Returns one entry per connected account, plus one "not connected" entry per platform with zero accounts.
// GET /api/platforms/status
func (s *Server) HandlePlatformStatus(w http.ResponseWriter, r *http.Request) {
	var statuses []types.PlatformStatus

	// Track which platforms have at least one connected account
	platformHasAccount := map[string]bool{}

	for key, adapter := range s.allAdapters {
		parts := strings.SplitN(key, ":", 2)
		platform := parts[0]
		username := getAdapterUsername(adapter)

		platformHasAccount[platform] = true
		statuses = append(statuses, types.PlatformStatus{
			Platform:  platform,
			Account:   username,
			Connected: true,
			Username:  username,
		})
	}

	// Add disconnected entries for platforms with no accounts
	for _, p := range []string{"github", "gitlab", "huggingface"} {
		if !platformHasAccount[p] {
			statuses = append(statuses, types.PlatformStatus{
				Platform:  p,
				Connected: false,
			})
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(statuses)
}

// HandleConnectPlatform connects a new platform account with the given token.
// POST /api/platforms/connect
func (s *Server) HandleConnectPlatform(w http.ResponseWriter, r *http.Request) {
	var req ConnectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"invalid request: %s"}`, err), http.StatusBadRequest)
		return
	}

	if req.Token == "" {
		http.Error(w, `{"error":"token required"}`, http.StatusBadRequest)
		return
	}

	switch req.Platform {
	case "github", "gitlab", "huggingface":
		// supported
	default:
		http.Error(w, `{"error":"unsupported platform, use github, gitlab, or huggingface"}`, http.StatusBadRequest)
		return
	}

	key, err := s.initAccount(req.Platform, req.Token)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"connect failed: %s"}`, err), http.StatusBadRequest)
		return
	}

	// Extract username from key
	username := key[strings.Index(key, ":")+1:]

	// Save to config Accounts
	if s.cfg.Accounts == nil {
		s.cfg.Accounts = make(map[string][]config.AccountConfig)
	}
	// Check if already present
	alreadyExists := false
	for _, acc := range s.cfg.Accounts[req.Platform] {
		if acc.Username == username {
			alreadyExists = true
			break
		}
	}
	if !alreadyExists {
		s.cfg.Accounts[req.Platform] = append(s.cfg.Accounts[req.Platform], config.AccountConfig{
			Token:    req.Token,
			Username: username,
		})
	}

	if err := s.cfg.Save(); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"save config: %s"}`, err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":     true,
		"username":    username,
		"account_key": key,
	})
}

// HandleDisconnectPlatform removes a connected account.
// DELETE /api/platforms/disconnect
func (s *Server) HandleDisconnectPlatform(w http.ResponseWriter, r *http.Request) {
	var req DisconnectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"invalid request: %s"}`, err), http.StatusBadRequest)
		return
	}

	if req.Platform == "" || req.Username == "" {
		http.Error(w, `{"error":"platform and username required"}`, http.StatusBadRequest)
		return
	}

	key := req.Platform + ":" + req.Username

	// Remove from server state
	s.removeAccount(key)

	// Remove from config
	if accounts, ok := s.cfg.Accounts[req.Platform]; ok {
		filtered := accounts[:0]
		for _, acc := range accounts {
			if acc.Username != req.Username {
				filtered = append(filtered, acc)
			}
		}
		s.cfg.Accounts[req.Platform] = filtered
	}

	if err := s.cfg.Save(); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"save config: %s"}`, err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"success":true}`))
}

// HandleListRepos returns all repos in the pool.
// GET /api/repos
func (s *Server) HandleListRepos(w http.ResponseWriter, r *http.Request) {
	platform := r.URL.Query().Get("platform")

	repos, err := s.db.ListRepos(platform)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err), http.StatusInternalServerError)
		return
	}

	if repos == nil {
		repos = []types.RepoInfo{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(repos)
}
