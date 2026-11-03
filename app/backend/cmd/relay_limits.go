package cmd

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/zcrypt/zcrypt/config"
	"github.com/zcrypt/zcrypt/types"
)

const (
	defaultRelayMaxFileBytes    = int64(2) << 30
	defaultRelayMonthlyBytes    = int64(20) << 30
	defaultRelayAlertDailyBytes = int64(10) << 30
)

func relayMaxFileBytes() int64 {
	return config.EnvNonNegativeInt64("ZCRYPT_RELAY_MAX_FILE_BYTES", defaultRelayMaxFileBytes)
}

func relayMonthlyBytes() int64 {
	return config.EnvNonNegativeInt64("ZCRYPT_RELAY_MONTHLY_BYTES", defaultRelayMonthlyBytes)
}

func relayAlertDailyBytes() int64 {
	return config.EnvNonNegativeInt64("ZCRYPT_RELAY_ALERT_DAILY_BYTES", defaultRelayAlertDailyBytes)
}

func relayResetsAt(now time.Time) time.Time {
	y, m, _ := now.UTC().Date()
	return time.Date(y, m+1, 1, 0, 0, 0, 0, time.UTC)
}

func markHeavyRelay(u *types.AdminUser) {
	limit := relayAlertDailyBytes()
	u.HeavyRelay = limit > 0 && u.Relay24hBytes > limit
}

func (s *Server) recordRelay(ctx context.Context, userID string, up, down int64) {
	if userID == "" {
		return
	}
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	if err := s.db.AddRelayUsage(ctx, userID, up, down); err != nil {
		log.Printf("relay usage: %v", err)
	}
}

func (s *Server) relayUploadAllowed(w http.ResponseWriter, r *http.Request, userID string, size int64) bool {
	if IsAdmin(r) {
		return true
	}
	if limit := relayMaxFileBytes(); limit > 0 && size > limit {
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{
			"error":       "this file is too large to upload through the web",
			"code":        types.ErrCodeRelayFileTooLarge,
			"limit_bytes": limit,
		})
		return false
	}
	limit := relayMonthlyBytes()
	if limit == 0 {
		return true
	}
	used, err := s.db.RelayMonthBytes(r.Context(), userID)
	if err != nil {
		log.Printf("upload: relay usage lookup for user %s: %v", userID, err)
		return true
	}
	if used >= limit {
		writeJSON(w, http.StatusForbidden, map[string]any{
			"error":       "this month's web transfer allowance is used up",
			"code":        types.ErrCodeRelayAllowanceExceeded,
			"used_bytes":  used,
			"limit_bytes": limit,
			"resets_at":   relayResetsAt(time.Now()),
		})
		return false
	}
	return true
}

func (s *Server) relayQuota(ctx context.Context, userID string, admin bool, info *types.QuotaInfo) {
	used, err := s.db.RelayMonthBytes(ctx, userID)
	if err != nil {
		log.Printf("quota: relay usage for user %s: %v", userID, err)
	}
	info.RelayUsedBytes = used
	info.RelayResetsAt = relayResetsAt(time.Now())
	if !admin {
		info.RelayLimitBytes = relayMonthlyBytes()
		info.RelayMaxFileBytes = relayMaxFileBytes()
	}
}
