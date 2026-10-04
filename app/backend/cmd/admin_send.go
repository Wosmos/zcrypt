package cmd

import (
	"encoding/json"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"
)

const sendPlatformSetting = "send_platform"

var sendPlatformChoices = map[string]bool{
	"auto": true, "telegram": true, "huggingface": true, "github": true, "gitlab": true,
}

type sendStorageOption struct {
	Key      string `json:"key"`
	Platform string `json:"platform"`
	Account  string `json:"account"`
}

type sendStorageLocation struct {
	Platform  string `json:"platform"`
	Account   string `json:"account"`
	Repo      string `json:"repo"`
	Transfers int64  `json:"transfers"`
	Chunks    int64  `json:"chunks"`
	Bytes     int64  `json:"bytes"`
}

func splitAdapterKey(key string) (string, string) {
	platform, account, _ := strings.Cut(key, ":")
	return platform, account
}

// HandleAdminSendStorage reports where anonymous Sends are stored and what they hold.
// Metadata only: no names, tokens or keys.
// GET /api/admin/send/storage
func (s *Server) HandleAdminSendStorage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	setting := "auto"
	if v, err := s.db.GetSystemSetting(ctx, sendPlatformSetting); err == nil && sendPlatformChoices[v] {
		setting = v
	}

	options := []sendStorageOption{}
	if m, err := s.getGlobalAdapters(ctx); err != nil {
		log.Printf("admin: send storage adapters: %v", err)
	} else {
		keys := make([]string, 0, len(m))
		for k := range m {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			platform, account := splitAdapterKey(k)
			options = append(options, sendStorageOption{Key: k, Platform: platform, Account: account})
		}
	}

	active := map[string]string{"platform": "", "account": "", "repo": ""}
	if key, adapter, err := s.selectGlobalAdapter(ctx); err == nil {
		active["platform"], active["account"] = splitAdapterKey(key)
		if repo, rerr := s.db.GetSystemSetting(ctx, "send_repo_"+adapter.PlatformName()); rerr == nil {
			active["repo"] = repo
		}
	}

	usage, err := s.db.GetSendStorageUsage(ctx)
	if err != nil {
		internalError(w, "AdminSendStorage", err)
		return
	}
	var oldest interface{}
	if usage.OldestExpiresAt != nil {
		oldest = usage.OldestExpiresAt.UTC().Format(time.RFC3339)
	}
	locations := make([]sendStorageLocation, 0, len(usage.ByLocation))
	for _, l := range usage.ByLocation {
		locations = append(locations, sendStorageLocation{l.Platform, l.Account, l.Repo, l.Transfers, l.Chunks, l.Bytes})
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"platform_setting": setting,
		"options":          options,
		"active":           active,
		"usage": map[string]interface{}{
			"transfers":         usage.Transfers,
			"chunks":            usage.Chunks,
			"bytes":             usage.Bytes,
			"oldest_expires_at": oldest,
			"by_location":       locations,
		},
		"limits": map[string]int64{
			"max_file_bytes":   maxSendFileSize,
			"anon_daily_bytes": sendAnonDailyBytes,
			"user_daily_bytes": sendUserDailyBytes,
		},
	})
}

// HandleAdminSetSendPlatform chooses which platform stores new Sends.
// PUT /api/admin/send/platform
func (s *Server) HandleAdminSetSendPlatform(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req struct {
		Platform string `json:"platform"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	if !sendPlatformChoices[req.Platform] {
		writeError(w, http.StatusBadRequest, "platform must be auto, telegram, huggingface, github or gitlab")
		return
	}
	if req.Platform != "auto" {
		m, err := s.getGlobalAdapters(ctx)
		if err != nil {
			internalError(w, "AdminSetSendPlatform adapters", err)
			return
		}
		found := false
		for k := range m {
			if strings.HasPrefix(k, req.Platform+":") {
				found = true
				break
			}
		}
		if !found {
			writeError(w, http.StatusBadRequest, "no global adapter is connected for "+req.Platform)
			return
		}
	}
	if err := s.db.SetSystemSetting(ctx, sendPlatformSetting, req.Platform); err != nil {
		internalError(w, "AdminSetSendPlatform", err)
		return
	}
	adminID := GetUserID(r)
	s.audit(r, &adminID, "admin_send_platform_change", map[string]interface{}{"platform": req.Platform})
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// HandleAdminHealthDetails lists which users hold degraded or damaged files and
// stuck chunks. Ids and counts only, never names or keys.
// GET /api/admin/health/details
func (s *Server) HandleAdminHealthDetails(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	hc, err := s.db.CountHealth(ctx, maxSyncAttempts)
	if err != nil {
		internalError(w, "AdminHealthDetails counts", err)
		return
	}
	users, err := s.db.ListUserHealth(ctx, maxSyncAttempts, 50)
	if err != nil {
		internalError(w, "AdminHealthDetails users", err)
		return
	}
	files, err := s.db.ListProblemFiles(ctx, 20)
	if err != nil {
		internalError(w, "AdminHealthDetails files", err)
		return
	}

	userRows := make([]map[string]interface{}, 0, len(users))
	for _, u := range users {
		userRows = append(userRows, map[string]interface{}{
			"user_id":        u.UserID,
			"email":          u.Email,
			"username":       u.Username,
			"degraded_files": u.DegradedFiles,
			"damaged_files":  u.DamagedFiles,
			"stuck_chunks":   u.StuckChunks,
		})
	}
	sample := make([]map[string]string, 0, len(files))
	for _, f := range files {
		reason := "a chunk exhausted its sync retries and is not confirmed on any platform"
		if f.Health == "damaged" {
			reason = "a chunk is confirmed missing on the platform"
		}
		sample = append(sample, map[string]string{"id": f.ID, "user_id": f.UserID, "status": f.Health, "reason": reason})
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"users": userRows,
		"totals": map[string]int{
			"degraded_files": hc.DegradedFiles,
			"damaged_files":  hc.DamagedFiles,
			"stuck_chunks":   hc.StuckChunks,
		},
		"sample_files": sample,
	})
}
