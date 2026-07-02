package cmd

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/zcrypt/zcrypt/adapters"
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
	adapterFailures := s.adapterErrorsFor(userID)

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

	// Tokens whose adapter failed to build (e.g. the platform is unreachable
	// from this server) still count as connected — the token exists — but are
	// flagged unreachable with the recorded reason instead of silently showing
	// as disconnected.
	for key, info := range tokenMap {
		if _, ok := userAdapters[key]; ok {
			continue
		}
		reason, failed := adapterFailures[info.Platform]
		if !failed {
			continue
		}
		platformHasAccount[info.Platform] = true
		statuses = append(statuses, types.PlatformStatus{
			Platform:    info.Platform,
			Account:     info.Username,
			Connected:   true,
			Username:    info.Username,
			Unreachable: true,
			Error:       reason,
			TokenID:     info.ID,
			IsGlobal:    info.IsGlobal,
		})
	}

	// Add disconnected entries for platforms with no accounts
	for _, p := range []string{"github", "gitlab", "huggingface", "telegram"} {
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

	// zcrypt is free and open source: BYOB (Bring Your Own Backend) is
	// available to everyone, so connecting a personal platform token is
	// never gated by plan.

	switch req.Platform {
	case "github", "gitlab", "huggingface", "telegram":
		// supported
	default:
		http.Error(w, `{"error":"unsupported platform, use github, gitlab, huggingface, or telegram"}`, http.StatusBadRequest)
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

// TelegramProbeRequest is the JSON body for the guided Telegram connect flow.
type TelegramProbeRequest struct {
	BotToken string `json:"bot_token"`
}

// HandleTelegramProbe validates a Telegram bot token and reports the
// channels/groups the bot has been added to, so the guided connect flow can
// auto-fill the chat ID (the painful manual step) instead of making the user
// hunt for it. The token is never stored here — it's a transient lookup the UI
// polls after the user adds the bot to a chat via a deep link.
// POST /api/platforms/telegram/probe
func (s *Server) HandleTelegramProbe(w http.ResponseWriter, r *http.Request) {
	var req TelegramProbeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(req.BotToken) == "" {
		http.Error(w, `{"error":"bot token required"}`, http.StatusBadRequest)
		return
	}

	username, chats, hint, err := adapters.TelegramProbe(req.BotToken)
	// An empty username means getMe failed → the token itself is bad (don't log
	// the token). A non-empty username with an error means the token is valid but
	// chat detection hit a snag (e.g. the bot has a webhook set, which disables
	// getUpdates) — that's not fatal; the UI keeps the manual fallback.
	if username == "" {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{
			"error": "invalid bot token",
		})
		return
	}

	resp := map[string]interface{}{
		"bot_username": username,
		"chats":        chats,
	}
	if hint != "" {
		// A specific, actionable hint (e.g. "you only DM'd the bot").
		resp["detect_error"] = hint
	} else if err != nil {
		resp["detect_error"] = "Couldn't auto-detect a chat. If your bot uses a webhook, add the channel ID manually."
	}
	writeJSON(w, http.StatusOK, resp)
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
