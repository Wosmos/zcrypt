package cmd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/zpush/zpush/adapters"
	"github.com/zpush/zpush/crypto"
	"github.com/zpush/zpush/reppool"
	"github.com/zpush/zpush/types"
)

// HandleAdminListUsers returns all users with file count and storage stats.
// GET /api/admin/users
func (s *Server) HandleAdminListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := s.db.ListUsers(r.Context())
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err), http.StatusInternalServerError)
		return
	}

	if users == nil {
		users = []types.AdminUser{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}

// HandleAdminStats returns system-wide aggregate statistics.
// GET /api/admin/stats
func (s *Server) HandleAdminStats(w http.ResponseWriter, r *http.Request) {
	stats, err := s.db.GetSystemStats(r.Context())
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats)
}

// HandleAdminSetRole updates a user's role.
// PUT /api/admin/users/{id}/role
func (s *Server) HandleAdminSetRole(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := r.PathValue("id")
	if userID == "" {
		http.Error(w, `{"error":"user id required"}`, http.StatusBadRequest)
		return
	}

	var req struct {
		Role string `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	role, ok := types.ParseRole(req.Role)
	if !ok {
		http.Error(w, `{"error":"role must be 'user' or 'admin'"}`, http.StatusBadRequest)
		return
	}

	if err := s.db.SetUserRole(ctx, userID, role); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// HandleAdminDeleteUser deletes a user and all associated data.
// DELETE /api/admin/users/{id}
func (s *Server) HandleAdminDeleteUser(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := r.PathValue("id")
	if userID == "" {
		http.Error(w, `{"error":"user id required"}`, http.StatusBadRequest)
		return
	}

	// Don't allow self-deletion
	if userID == GetUserID(r) {
		http.Error(w, `{"error":"cannot delete yourself"}`, http.StatusBadRequest)
		return
	}

	if err := s.db.DeleteUser(ctx, userID); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err), http.StatusInternalServerError)
		return
	}

	// Clean up any cached adapters for this user
	s.invalidateUserCache(userID)

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// HandleAdminListTokens returns metadata for all platform tokens (no encrypted data).
// GET /api/admin/tokens
func (s *Server) HandleAdminListTokens(w http.ResponseWriter, r *http.Request) {
	tokens, err := s.db.ListAllPlatformTokens(r.Context())
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err), http.StatusInternalServerError)
		return
	}

	if tokens == nil {
		tokens = []types.PlatformTokenInfo{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tokens)
}

// HandleAdminCreateToken creates a global token or assigns a token to any user.
// POST /api/admin/tokens
func (s *Server) HandleAdminCreateToken(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req struct {
		UserID   string `json:"user_id"`
		Platform string `json:"platform"`
		Token    string `json:"token"`
		IsGlobal bool   `json:"is_global"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	if req.Token == "" || req.Platform == "" {
		http.Error(w, `{"error":"platform and token required"}`, http.StatusBadRequest)
		return
	}

	switch req.Platform {
	case "github", "gitlab", "huggingface":
	default:
		http.Error(w, `{"error":"unsupported platform"}`, http.StatusBadRequest)
		return
	}

	// If no user_id specified, assign to the admin themselves
	ownerID := req.UserID
	if ownerID == "" {
		ownerID = GetUserID(r)
	}

	// Validate the token by creating an adapter
	adapter, err := createAdapter(req.Platform, req.Token)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"invalid token: %s"}`, err), http.StatusBadRequest)
		return
	}

	username := getAdapterUsername(adapter)

	// Encrypt with the owner's KEK
	kek, err := crypto.DeriveUserKEK(s.masterKey, ownerID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	encrypted, nonce, err := crypto.EncryptToken(kek, req.Token)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	if err := s.db.InsertPlatformToken(ctx, ownerID, req.Platform, username, encrypted, nonce, req.IsGlobal); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"store token: %s"}`, err), http.StatusInternalServerError)
		return
	}

	// Invalidate caches — if global, invalidate all cached users
	if req.IsGlobal {
		s.adapterMu.Lock()
		s.adapterCache = make(map[string]map[string]adapters.PlatformAdapter)
		s.poolCache = make(map[string]map[string]*reppool.Manager)
		s.adapterMu.Unlock()
	} else {
		s.invalidateUserCache(ownerID)
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"success":  true,
		"username": username,
	})
}

// HandleAdminDeleteToken deletes any platform token by ID.
// DELETE /api/admin/tokens/{id}
func (s *Server) HandleAdminDeleteToken(w http.ResponseWriter, r *http.Request) {
	tokenID := r.PathValue("id")
	if tokenID == "" {
		http.Error(w, `{"error":"token id required"}`, http.StatusBadRequest)
		return
	}

	if err := s.db.DeletePlatformToken(r.Context(), tokenID); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err), http.StatusInternalServerError)
		return
	}

	// Invalidate all caches (we don't know which user this affected)
	s.adapterMu.Lock()
	s.adapterCache = make(map[string]map[string]adapters.PlatformAdapter)
	s.poolCache = make(map[string]map[string]*reppool.Manager)
	s.adapterMu.Unlock()

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// HandleAdminGetDefaultQuota returns the system-wide default storage quota.
// GET /api/admin/quota
func (s *Server) HandleAdminGetDefaultQuota(w http.ResponseWriter, r *http.Request) {
	val, err := s.db.GetSystemSetting(r.Context(), "default_storage_quota_bytes")
	var quota int64
	if err == nil {
		quota, _ = strconv.ParseInt(val, 10, 64)
	}

	writeJSON(w, http.StatusOK, map[string]int64{"default_quota_bytes": quota})
}

// HandleAdminSetDefaultQuota updates the system-wide default storage quota.
// PUT /api/admin/quota
func (s *Server) HandleAdminSetDefaultQuota(w http.ResponseWriter, r *http.Request) {
	var req struct {
		DefaultQuotaBytes int64 `json:"default_quota_bytes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	if req.DefaultQuotaBytes < 0 {
		http.Error(w, `{"error":"quota must be >= 0"}`, http.StatusBadRequest)
		return
	}

	if err := s.db.SetSystemSetting(r.Context(), "default_storage_quota_bytes", strconv.FormatInt(req.DefaultQuotaBytes, 10)); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// HandleAdminSetUserQuota sets a per-user storage quota override.
// PUT /api/admin/users/{id}/quota
func (s *Server) HandleAdminSetUserQuota(w http.ResponseWriter, r *http.Request) {
	userID := r.PathValue("id")
	if userID == "" {
		http.Error(w, `{"error":"user id required"}`, http.StatusBadRequest)
		return
	}

	var req struct {
		QuotaBytes *int64 `json:"quota_bytes"` // null = reset to default, 0 = unlimited, >0 = limit
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	if req.QuotaBytes != nil && *req.QuotaBytes < 0 {
		http.Error(w, `{"error":"quota must be >= 0 or null"}`, http.StatusBadRequest)
		return
	}

	if err := s.db.SetUserQuota(r.Context(), userID, req.QuotaBytes); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// HandleGetQuota returns the authenticated user's storage quota info.
// GET /api/quota
func (s *Server) HandleGetQuota(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	used, err := s.db.GetUserStorageUsed(ctx, userID)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err), http.StatusInternalServerError)
		return
	}

	hasPersonal, _ := s.db.UserHasPersonalTokens(ctx, userID)
	quota := s.getEffectiveQuota(ctx, userID)

	info := types.QuotaInfo{
		UsedBytes:      used,
		QuotaBytes:     quota,
		HasPersonalKey: hasPersonal,
		IsUnlimited:    hasPersonal || quota == 0,
	}

	writeJSON(w, http.StatusOK, info)
}
