package cmd

import (
	"encoding/json"
	"log"
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

	// Fetch token info to include token_id and is_global
	tokenInfos, _ := s.db.GetUserPlatformTokenInfo(ctx, userID)
	tokenMap := make(map[string]types.PlatformTokenInfo)
	for _, t := range tokenInfos {
		tokenMap[t.Platform+":"+t.Username] = t
	}

	// Track which platforms have at least one connected account
	platformHasAccount := map[string]bool{}

	for key, adapter := range userAdapters {
		parts := strings.SplitN(key, ":", 2)
		platform := parts[0]
		username := getAdapterUsername(adapter)

		platformHasAccount[platform] = true
		status := types.PlatformStatus{
			Platform:  platform,
			Account:   username,
			Connected: true,
			Username:  username,
		}
		if info, ok := tokenMap[platform+":"+username]; ok {
			status.TokenID = info.ID
			status.IsGlobal = info.IsGlobal
		}
		statuses = append(statuses, status)
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

// HandleToggleTokenScope toggles the is_global flag on a token owned by the current user.
// PUT /api/platforms/tokens/{id}/scope
func (s *Server) HandleToggleTokenScope(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	tokenID := r.PathValue("id")
	if tokenID == "" {
		http.Error(w, `{"error":"token id required"}`, http.StatusBadRequest)
		return
	}

	var req struct {
		IsGlobal bool `json:"is_global"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	if err := s.db.SetUserPlatformTokenGlobal(ctx, tokenID, userID, req.IsGlobal); err != nil {
		http.Error(w, `{"error":"token not found"}`, http.StatusNotFound)
		return
	}

	// Invalidate adapter cache
	s.invalidateUserCache(userID)

	s.audit(r, &userID, "token_scope_change", map[string]interface{}{"token_id": tokenID, "is_global": req.IsGlobal})

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// HandleConnectPlatform connects a new platform account with the given token.
// POST /api/platforms/connect
func (s *Server) HandleConnectPlatform(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	var req ConnectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	if req.Token == "" {
		http.Error(w, `{"error":"token required"}`, http.StatusBadRequest)
		return
	}

	// Enforce BYOB plan restriction — only plans with AllowsBYOB can connect personal tokens
	if !s.userPlanAllowsBYOB(ctx, userID) {
		http.Error(w, `{"error":"your plan does not include Bring Your Own Backend — upgrade to Pro"}`, http.StatusForbidden)
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
		log.Printf("platform: connect failed for %s: %v", req.Platform, err)
		http.Error(w, `{"error":"invalid token or connection failed"}`, http.StatusBadRequest)
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
		log.Printf("platform: store token failed: %v", err)
		http.Error(w, `{"error":"failed to store token"}`, http.StatusInternalServerError)
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
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	if req.Platform == "" || req.Username == "" {
		http.Error(w, `{"error":"platform and username required"}`, http.StatusBadRequest)
		return
	}

	// Delete token from DB
	if err := s.db.DeletePlatformTokenByUser(ctx, userID, req.Platform, req.Username); err != nil {
		log.Printf("platform: disconnect failed: %v", err)
		http.Error(w, `{"error":"disconnect failed"}`, http.StatusInternalServerError)
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
		log.Printf("repos: list failed: %v", err)
		http.Error(w, `{"error":"failed to list repos"}`, http.StatusInternalServerError)
		return
	}

	if repos == nil {
		repos = []types.RepoInfo{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(repos)
}
