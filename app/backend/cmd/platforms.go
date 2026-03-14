package cmd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/zcrypt/zcrypt/crypto"
	"github.com/zcrypt/zcrypt/types"
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

// HandlePlatformStatus returns the connection status of all platforms for the current user.
// GET /api/platforms/status
func (s *Server) HandlePlatformStatus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	var statuses []types.PlatformStatus

	userAdapters, _ := s.getUserAdapters(ctx, userID)

	// Track which platforms have at least one connected account
	platformHasAccount := map[string]bool{}

	for key, adapter := range userAdapters {
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
	ctx := r.Context()
	userID := GetUserID(r)

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

	// Create adapter to validate token and get username
	adapter, err := createAdapter(req.Platform, req.Token)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"connect failed: %s"}`, err), http.StatusBadRequest)
		return
	}

	username := getAdapterUsername(adapter)

	// Encrypt token with user's KEK
	kek, err := crypto.DeriveUserKEK(s.masterKey, userID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	encrypted, nonce, err := crypto.EncryptToken(kek, req.Token)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// Store encrypted token in DB
	if err := s.db.InsertPlatformToken(ctx, userID, req.Platform, username, encrypted, nonce, false); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"store token: %s"}`, err), http.StatusInternalServerError)
		return
	}

	// Invalidate adapter cache so it reloads from DB
	s.invalidateUserCache(userID)

	s.audit(r, &userID, "platform_connect", map[string]interface{}{"platform": req.Platform, "username": username})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":  true,
		"username": username,
	})
}

// HandleDisconnectPlatform removes a connected account.
// DELETE /api/platforms/disconnect
func (s *Server) HandleDisconnectPlatform(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	var req DisconnectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"invalid request: %s"}`, err), http.StatusBadRequest)
		return
	}

	if req.Platform == "" || req.Username == "" {
		http.Error(w, `{"error":"platform and username required"}`, http.StatusBadRequest)
		return
	}

	// Delete token from DB
	if err := s.db.DeletePlatformTokenByUser(ctx, userID, req.Platform, req.Username); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"disconnect failed: %s"}`, err), http.StatusInternalServerError)
		return
	}

	// Invalidate adapter cache
	s.invalidateUserCache(userID)

	s.audit(r, &userID, "platform_disconnect", map[string]interface{}{"platform": req.Platform, "username": req.Username})

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"success":true}`))
}

// HandleListRepos returns all repos for the current user.
// GET /api/repos
func (s *Server) HandleListRepos(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	platform := r.URL.Query().Get("platform")

	repos, err := s.db.ListRepos(ctx, userID, platform)
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
