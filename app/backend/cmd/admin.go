package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/google/uuid"
	"github.com/zcrypt/zcrypt/adapters"
	"github.com/zcrypt/zcrypt/crypto"
	"github.com/zcrypt/zcrypt/reppool"
	"github.com/zcrypt/zcrypt/types"
)

// defaultPlanConfigs returns the plan configuration used as seed/fallback.
//
// zcrypt is free and open source: there are no paid tiers. There is a single
// "free" plan with no artificial limits. Users are bounded only by the real
// git-platform thresholds enforced in reppool. StorageBytes/MaxFileBytes/
// MaxConcurrentUploads of 0 are treated as "unlimited" everywhere, and
// AllowsBYOB is true so anyone can connect their own platform account.
func defaultPlanConfigs() *types.PlanConfigs {
	return &types.PlanConfigs{
		Plans: []types.PlanConfig{
			{
				ID: "free", Name: "Free", MonthlyPrice: 0, AnnualPrice: 0,
				Description:          "Free and open source. No limits beyond the storage platforms you connect.",
				StorageBytes:         0, // 0 = unlimited
				MaxFileBytes:         0, // 0 = unlimited
				MaxConcurrentUploads: 0, // 0 = unlimited
				StorageDisplay:       "Unlimited", MaxFileDisplay: "Unlimited", ConcurrentDisplay: "Unlimited",
				Features: []types.PlanFeature{
					{Text: "Zero-knowledge encryption", Included: true},
					{Text: "Multi-platform storage", Included: true},
					{Text: "Unlimited shares", Included: true},
					{Text: "CLI access", Included: true},
					{Text: "BYOB (Bring Your Own Backend)", Included: true},
				},
				SortOrder: 0, AllowsBYOB: true,
			},
		},
	}
}

// loadPlanConfigs reads plan configs from DB, falling back to hardcoded defaults.
func (s *Server) loadPlanConfigs(ctx context.Context) *types.PlanConfigs {
	s.planMu.RLock()
	if s.planCache != nil {
		defer s.planMu.RUnlock()
		return s.planCache
	}
	s.planMu.RUnlock()

	configs := defaultPlanConfigs()
	val, err := s.db.GetSystemSetting(ctx, "plan_configs")
	if err == nil && val != "" {
		var parsed types.PlanConfigs
		if json.Unmarshal([]byte(val), &parsed) == nil && len(parsed.Plans) > 0 {
			configs = &parsed
		}
	}

	s.planMu.Lock()
	s.planCache = configs
	s.planMu.Unlock()
	return configs
}

// invalidatePlanCache clears the cached plan configs so they are reloaded from DB.
func (s *Server) invalidatePlanCache() {
	s.planMu.Lock()
	s.planCache = nil
	s.planMu.Unlock()
}

// SeedPlanConfigs writes default plan configs to DB if not already set,
// and removes deprecated plans (e.g. "team") from existing configs.
func (s *Server) SeedPlanConfigs(ctx context.Context) {
	val, err := s.db.GetSystemSetting(ctx, "plan_configs")
	if err != nil {
		// No config yet — seed defaults
		data, _ := json.Marshal(defaultPlanConfigs())
		_ = s.db.SetSystemSetting(ctx, "plan_configs", string(data))
		return
	}

	// Migrate: remove deprecated "team" plan if present
	var existing types.PlanConfigs
	if json.Unmarshal([]byte(val), &existing) == nil {
		filtered := make([]types.PlanConfig, 0, len(existing.Plans))
		changed := false
		for _, p := range existing.Plans {
			if p.ID == "team" {
				changed = true
				continue
			}
			filtered = append(filtered, p)
		}
		if changed {
			existing.Plans = filtered
			data, _ := json.Marshal(&existing)
			_ = s.db.SetSystemSetting(ctx, "plan_configs", string(data))
			s.invalidatePlanCache()
		}
	}
}

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

	// Prevent admin from demoting themselves
	if userID == GetUserID(r) && role == types.RoleUser {
		http.Error(w, `{"error":"cannot demote yourself"}`, http.StatusBadRequest)
		return
	}

	if err := s.db.SetUserRole(ctx, userID, role); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err), http.StatusInternalServerError)
		return
	}

	// Invalidate all existing tokens for this user (role change is security-sensitive)
	_ = s.db.IncrementTokenVersion(ctx, userID)
	s.tokenVersions.invalidate(userID) // drop cache so the demotion takes effect immediately
	_ = s.db.DeleteRefreshTokensByUser(ctx, userID)

	adminID := GetUserID(r)
	s.audit(r, &adminID, "admin_role_change", map[string]interface{}{"target_user": userID, "role": req.Role})

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

	adminID := GetUserID(r)
	s.audit(r, &adminID, "admin_user_delete", map[string]interface{}{"target_user": userID})

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

// HandleAdminToggleTokenScope toggles a token between global and local.
// Admin can only toggle tokens they own — no one can change another user's token scope.
// PUT /api/admin/tokens/{id}/scope
func (s *Server) HandleAdminToggleTokenScope(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	adminID := GetUserID(r)
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

	// Ownership check — admin can only toggle their own tokens
	if err := s.db.SetUserPlatformTokenGlobal(ctx, tokenID, adminID, req.IsGlobal); err != nil {
		http.Error(w, `{"error":"token not found or not owned by you"}`, http.StatusForbidden)
		return
	}

	// Flush all caches since global scope affects all users
	s.adapterMu.Lock()
	s.adapterCache = make(map[string]map[string]adapters.PlatformAdapter)
	s.poolCache = make(map[string]map[string]*reppool.Manager)
	s.adapterMu.Unlock()

	s.audit(r, &adminID, "admin_token_scope_change", map[string]interface{}{"token_id": tokenID, "is_global": req.IsGlobal})

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
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

	// zcrypt is free and open source: storage is effectively unlimited and
	// users are bounded only by the real git-platform thresholds. We still
	// report the plan label (kept on the user record) for display purposes.
	plan := "free"
	if user, uErr := s.db.GetUserByID(ctx, userID); uErr == nil && user != nil {
		if user.Plan != "" {
			plan = user.Plan
		}
	}

	// Check if user can upload (has any adapters — personal or global/managed)
	userAdapters, _ := s.getUserAdapters(ctx, userID)
	canUpload := len(userAdapters) > 0

	info := types.QuotaInfo{
		UsedBytes:            used,
		QuotaBytes:           0, // 0 = unlimited
		HasPersonalKey:       hasPersonal,
		IsUnlimited:          true,
		Plan:                 plan,
		MaxConcurrentUploads: 0, // 0 = unlimited
		MaxFileSize:          0, // 0 = unlimited
		CanUpload:            canUpload,
		AllowsBYOB:           true,
	}

	writeJSON(w, http.StatusOK, info)
}

// HandleAdminSetPlan updates a user's plan.
// PUT /api/admin/users/{id}/plan
func (s *Server) HandleAdminSetPlan(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := r.PathValue("id")
	if userID == "" {
		http.Error(w, `{"error":"user id required"}`, http.StatusBadRequest)
		return
	}

	var req struct {
		Plan string `json:"plan"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	validPlans := map[string]bool{"free": true, "plus": true, "pro": true}
	if !validPlans[req.Plan] {
		http.Error(w, `{"error":"plan must be 'free', 'plus', or 'pro'"}`, http.StatusBadRequest)
		return
	}

	if err := s.db.SetUserPlan(ctx, userID, req.Plan); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err), http.StatusInternalServerError)
		return
	}

	adminID := GetUserID(r)
	s.audit(r, &adminID, "admin_plan_change", map[string]interface{}{"target_user": userID, "plan": req.Plan})

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// HandleAdminAuditLog returns paginated audit events.
// GET /api/admin/audit
func (s *Server) HandleAdminAuditLog(w http.ResponseWriter, r *http.Request) {
	limit := 50
	offset := 0
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}

	eventType := r.URL.Query().Get("event_type")
	userID := r.URL.Query().Get("user_id")

	events, total, err := s.db.ListAuditEvents(r.Context(), limit, offset, eventType, userID)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err), http.StatusInternalServerError)
		return
	}

	if events == nil {
		events = []types.AuditEvent{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"events": events,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

// HandleUserActivity returns the authenticated user's own recent auth events.
// GET /api/auth/activity
func (s *Server) HandleUserActivity(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	if userID == "" {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	events, err := s.db.ListUserAuditEvents(r.Context(), userID, 20)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err), http.StatusInternalServerError)
		return
	}

	if events == nil {
		events = []types.AuditEvent{}
	}

	writeJSON(w, http.StatusOK, events)
}

// HandleSubmitFeedback allows an authenticated user to submit feedback.
// POST /api/feedback
func (s *Server) HandleSubmitFeedback(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	var req struct {
		Rating  int    `json:"rating"`
		Message string `json:"message"`
		Context string `json:"context"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}
	if req.Rating < 1 || req.Rating > 5 {
		http.Error(w, `{"error":"rating must be 1-5"}`, http.StatusBadRequest)
		return
	}

	fb := &types.Feedback{
		ID:      uuid.NewString(),
		UserID:  userID,
		Rating:  req.Rating,
		Message: req.Message,
		Context: req.Context,
	}
	if err := s.db.InsertFeedback(ctx, fb); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err), http.StatusInternalServerError)
		return
	}

	s.audit(r, &userID, "user_feedback", map[string]interface{}{"rating": req.Rating})

	writeJSON(w, http.StatusCreated, map[string]bool{"success": true})
}

// HandleGetFeedbackStatus returns whether the current user has submitted feedback.
// GET /api/feedback/status
func (s *Server) HandleGetFeedbackStatus(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	submitted, _ := s.db.HasUserSubmittedFeedback(r.Context(), userID)
	writeJSON(w, http.StatusOK, map[string]bool{"submitted": submitted})
}

// HandleAdminListFeedback returns all feedback for admin.
// GET /api/admin/feedback
func (s *Server) HandleAdminListFeedback(w http.ResponseWriter, r *http.Request) {
	limit := 50
	offset := 0
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 100 {
			limit = n
		}
	}
	if v := r.URL.Query().Get("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}

	items, total, err := s.db.ListFeedback(r.Context(), limit, offset)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err), http.StatusInternalServerError)
		return
	}
	if items == nil {
		items = []types.FeedbackWithUser{}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"feedback": items,
		"total":    total,
		"limit":    limit,
		"offset":   offset,
	})
}

// HandleGetPlans returns plan configs for public consumption (landing page, pricing page).
// GET /api/plans
func (s *Server) HandleGetPlans(w http.ResponseWriter, r *http.Request) {
	configs := s.loadPlanConfigs(r.Context())
	writeJSON(w, http.StatusOK, configs)
}

// HandleAdminGetPlans returns plan configs for admin editing.
// GET /api/admin/plans
func (s *Server) HandleAdminGetPlans(w http.ResponseWriter, r *http.Request) {
	configs := s.loadPlanConfigs(r.Context())
	writeJSON(w, http.StatusOK, configs)
}

// HandleAdminSetPlans saves updated plan configs.
// PUT /api/admin/plans
func (s *Server) HandleAdminSetPlans(w http.ResponseWriter, r *http.Request) {
	var configs types.PlanConfigs
	if err := json.NewDecoder(r.Body).Decode(&configs); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	if len(configs.Plans) == 0 {
		http.Error(w, `{"error":"at least one plan is required"}`, http.StatusBadRequest)
		return
	}

	// Validate: must include a "free" plan
	hasFree := false
	ids := map[string]bool{}
	for _, p := range configs.Plans {
		if p.ID == "" {
			http.Error(w, `{"error":"all plans must have an id"}`, http.StatusBadRequest)
			return
		}
		if ids[p.ID] {
			http.Error(w, fmt.Sprintf(`{"error":"duplicate plan id: %s"}`, p.ID), http.StatusBadRequest)
			return
		}
		ids[p.ID] = true
		if p.ID == "free" {
			hasFree = true
		}
	}
	if !hasFree {
		http.Error(w, `{"error":"a 'free' plan is required"}`, http.StatusBadRequest)
		return
	}

	data, err := json.Marshal(configs)
	if err != nil {
		http.Error(w, `{"error":"failed to encode plans"}`, http.StatusInternalServerError)
		return
	}

	if err := s.db.SetSystemSetting(r.Context(), "plan_configs", string(data)); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err), http.StatusInternalServerError)
		return
	}

	s.invalidatePlanCache()

	adminID := GetUserID(r)
	s.audit(r, &adminID, "admin_plans_update", map[string]interface{}{"plan_count": len(configs.Plans)})

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// HandleAdminGetUser returns a single user's full profile with stats.
// GET /api/admin/users/{id}
func (s *Server) HandleAdminGetUser(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := r.PathValue("id")
	if userID == "" {
		http.Error(w, `{"error":"user id required"}`, http.StatusBadRequest)
		return
	}

	user, err := s.db.GetUserByID(ctx, userID)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	fileCount, _ := s.db.GetUserFileCount(ctx, userID)
	usedBytes, _ := s.db.GetUserStorageUsed(ctx, userID)
	quotaBytes := s.getEffectiveQuota(ctx, userID)

	// Get recent audit events for this user
	events, _ := s.db.ListUserAuditEvents(ctx, userID, 20)
	if events == nil {
		events = []types.AuditEvent{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"user":        user,
		"file_count":  fileCount,
		"used_bytes":  usedBytes,
		"quota_bytes": quotaBytes,
		"events":      events,
	})
}
