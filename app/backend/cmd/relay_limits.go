package cmd

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/zcrypt/zcrypt/config"
	"github.com/zcrypt/zcrypt/index"
	"github.com/zcrypt/zcrypt/types"
)

const (
	defaultRelayMaxFileBytes    = int64(2) << 30
	defaultRelayMonthlyBytes    = int64(20) << 30
	defaultRelayDailyBytes      = int64(5) << 30
	defaultRelayAlertDailyBytes = int64(10) << 30
)

func relayMaxFileBytes() int64 {
	return config.EnvNonNegativeInt64("ZCRYPT_RELAY_MAX_FILE_BYTES", defaultRelayMaxFileBytes)
}

func relayMonthlyBytes() int64 {
	return config.EnvNonNegativeInt64("ZCRYPT_RELAY_MONTHLY_BYTES", defaultRelayMonthlyBytes)
}

func relayDailyBytes() int64 {
	return config.EnvNonNegativeInt64("ZCRYPT_RELAY_DAILY_BYTES", defaultRelayDailyBytes)
}

func relayLimits() index.RelayLimits {
	return index.RelayLimits{Day: relayDailyBytes(), Month: relayMonthlyBytes()}
}

func relayDayResetsAt(now time.Time) time.Time {
	y, m, d := now.UTC().Date()
	return time.Date(y, m, d+1, 0, 0, 0, 0, time.UTC)
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

// writeRelayRefusal answers a transfer that does not fit an allowance window.
// A public link recipient gets no usage figures: they are the owner's.
func writeRelayRefusal(w http.ResponseWriter, ex *index.ErrRelayWindowExceeded, public bool) {
	now := time.Now()
	body := map[string]any{"code": types.ErrCodeRelayAllowanceExceeded, "resets_at": relayResetsAt(now)}
	body["error"] = "this month's web transfer allowance is used up"
	if ex.Daily {
		body["code"] = types.ErrCodeRelayDailyExceeded
		body["error"] = "today's web transfer allowance is used up"
		body["resets_at"] = relayDayResetsAt(now)
	}
	if !public {
		body["used_bytes"] = ex.Used
		body["limit_bytes"] = ex.Limit
	}
	writeJSON(w, http.StatusForbidden, body)
}

func writeRelayFileTooLarge(w http.ResponseWriter, limit int64) {
	writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{
		"error":       "this file is too large to upload through the web",
		"code":        types.ErrCodeRelayFileTooLarge,
		"limit_bytes": limit,
		"used_bytes":  0,
		"resets_at":   relayResetsAt(time.Now()),
	})
}

// relayFits reports whether need more bytes fit user's windows. A lookup
// failure lets the transfer through: it only blocks an already-served read.
func (s *Server) relayFits(ctx context.Context, userID string, need int64) *index.ErrRelayWindowExceeded {
	limits := relayLimits()
	if limits.Day == 0 && limits.Month == 0 {
		return nil
	}
	t, err := s.db.RelayTotals(ctx, userID)
	if err != nil {
		log.Printf("relay: totals for user %s: %v", logSafe(userID), err) // #nosec G706 -- control chars stripped via logSafe
		return nil
	}
	return t.Check(limits, need)
}

// userIsAdmin reports whether the account is an admin, who is exempt from the
// allowance. Used for the owner behind a public link, where no session exists.
func (s *Server) userIsAdmin(ctx context.Context, userID string) bool {
	u, err := s.db.GetUserByID(ctx, userID)
	return err == nil && u != nil && u.Role == types.RoleAdmin
}

// relayDownloadAllowed refuses to serve a chunk of size bytes when it would
// overflow a window of the charged user. public hides the usage figures.
func (s *Server) relayDownloadAllowed(w http.ResponseWriter, r *http.Request, chargedID string, adminExempt, public bool, size int64) bool {
	if adminExempt || chargedID == "" {
		return true
	}
	if ex := s.relayFits(r.Context(), chargedID, size); ex != nil {
		writeRelayRefusal(w, ex, public)
		return false
	}
	return true
}

// relayUploadAllowed is the fast pre-check at upload init, before any file row
// exists. The authoritative, race-free check is CreateRelayUploadSession.
func (s *Server) relayUploadAllowed(w http.ResponseWriter, r *http.Request, userID string, size int64) bool {
	if IsAdmin(r) {
		return true
	}
	if limit := relayMaxFileBytes(); limit > 0 && size > limit {
		writeRelayFileTooLarge(w, limit)
		return false
	}
	if ex := s.relayFits(r.Context(), userID, size); ex != nil {
		writeRelayRefusal(w, ex, false)
		return false
	}
	return true
}

func (s *Server) relayQuota(ctx context.Context, userID string, admin bool, info *types.QuotaInfo) {
	t, err := s.db.RelayTotals(ctx, userID)
	if err != nil {
		log.Printf("quota: relay usage for user %s: %v", userID, err) //nolint:gosec // database id from the verified session
	}
	now := time.Now()
	info.RelayUsedBytes = t.Month
	info.RelayDayUsedBytes = t.Day
	info.RelayReservedBytes = t.Reserved
	info.RelayResetsAt = relayResetsAt(now)
	info.RelayDayResetsAt = relayDayResetsAt(now)
	if !admin {
		info.RelayLimitBytes = relayMonthlyBytes()
		info.RelayDayLimitBytes = relayDailyBytes()
		info.RelayMaxFileBytes = relayMaxFileBytes()
	}
}
