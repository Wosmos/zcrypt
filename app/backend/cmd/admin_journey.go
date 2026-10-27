package cmd

import (
	"errors"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/zcrypt/zcrypt/index"
	"github.com/zcrypt/zcrypt/types"
)

const (
	reportActivityDays     = 30
	riskFailedSigninsWarn  = 3
	riskFailedSigninsHigh  = 5
	riskCountriesThreshold = 3
	dormantAfter           = 90 * 24 * time.Hour
)

// RiskFlag is one reason an admin may want to look closer at an account.
type RiskFlag struct {
	Code     string `json:"code"`
	Severity string `json:"severity"`
	Value    int    `json:"value,omitempty"`
}

// adminTargetUser loads the {id} user for a per-user admin endpoint, writing
// a 404 or 500 itself when it cannot.
func (s *Server) adminTargetUser(w http.ResponseWriter, r *http.Request) (*types.AdminUser, bool) {
	u, err := s.db.GetAdminUser(r.Context(), r.PathValue("id"))
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "user not found")
		return nil, false
	}
	if err != nil {
		internalError(w, "admin target user", err)
		return nil, false
	}
	u.LastDevice = deviceLabel(u.LastUserAgent)
	return u, true
}

// parseFamilies reads a comma-separated kinds filter; empty means every family.
func parseFamilies(v string) ([]string, error) {
	if strings.TrimSpace(v) == "" {
		return index.JourneyFamilyNames, nil
	}
	var out []string
	for _, k := range strings.Split(v, ",") {
		k = strings.TrimSpace(k)
		if !slices.Contains(index.JourneyFamilyNames, k) {
			return nil, errors.New("unknown kind: " + k)
		}
		if !slices.Contains(out, k) {
			out = append(out, k)
		}
	}
	return out, nil
}

// HandleAdminUserJourney returns one page of a user's journey: their audit
// events, admin actions taken on them, daily upload totals, shares and Spaces.
// GET /api/admin/users/{id}/journey?limit&offset&kinds=auth,security
func (s *Server) HandleAdminUserJourney(w http.ResponseWriter, r *http.Request) {
	page, err := parseListPage(r, nil, "")
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	families, err := parseFamilies(r.URL.Query().Get("kinds"))
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	u, ok := s.adminTargetUser(w, r)
	if !ok {
		return
	}
	events, total, counts, err := s.db.UserJourney(r.Context(), u.ID, families, page.Limit, page.Offset)
	if err != nil {
		internalError(w, "AdminUserJourney", err)
		return
	}
	for i := range events {
		events[i].Device = deviceLabel(events[i].UserAgent)
	}
	body := pageBody("events", events, total, page)
	body["families"] = counts
	writeJSON(w, http.StatusOK, body)
}

// riskFlags turns a user and their report numbers into the flags the admin
// report shows, most severe first.
func riskFlags(u *types.AdminUser, st *index.UserReportStats, now time.Time) []RiskFlag {
	flags := []RiskFlag{}
	if !u.TOTPEnabled {
		sev := "low"
		if u.Role == types.RoleAdmin {
			sev = "high"
		}
		flags = append(flags, RiskFlag{Code: "no_2fa", Severity: sev})
	}
	if !u.EmailVerified {
		flags = append(flags, RiskFlag{Code: "unverified_email", Severity: "medium"})
	}
	switch n := st.FailedSignins7d; {
	case n >= riskFailedSigninsHigh:
		flags = append(flags, RiskFlag{Code: "failed_signins", Severity: "high", Value: n})
	case n >= riskFailedSigninsWarn:
		flags = append(flags, RiskFlag{Code: "failed_signins", Severity: "medium", Value: n})
	}
	if n := len(st.Countries7d); n >= riskCountriesThreshold {
		flags = append(flags, RiskFlag{Code: "many_countries", Severity: "high", Value: n})
	}
	if u.DeletionScheduledAt != nil {
		flags = append(flags, RiskFlag{Code: "deletion_pending", Severity: "medium"})
	}
	last := u.LastSeenAt
	if st.LastActiveAt != nil && (last == nil || st.LastActiveAt.After(*last)) {
		last = st.LastActiveAt
	}
	if last == nil || now.Sub(*last) > dormantAfter {
		flags = append(flags, RiskFlag{Code: "dormant", Severity: "low"})
	}
	rank := map[string]int{"high": 0, "medium": 1, "low": 2}
	slices.SortStableFunc(flags, func(a, b RiskFlag) int { return rank[a.Severity] - rank[b.Severity] })
	return flags
}

// HandleAdminUserReport returns a user's account report: age, activity,
// storage over time, files by type, platforms, live sessions and risk flags.
// GET /api/admin/users/{id}/report
func (s *Server) HandleAdminUserReport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	u, ok := s.adminTargetUser(w, r)
	if !ok {
		return
	}
	stats, err := s.db.UserReport(ctx, u.ID, reportActivityDays)
	if err != nil {
		internalError(w, "AdminUserReport", err)
		return
	}
	growth, err := s.db.GetStorageGrowth(ctx, u.ID)
	if err != nil {
		internalError(w, "AdminUserReport: growth", err)
		return
	}
	sessions, err := s.db.ListAdminSessions(ctx, u.ID)
	if err != nil {
		internalError(w, "AdminUserReport: sessions", err)
		return
	}
	for i := range sessions {
		sessions[i].Device = deviceLabel(sessions[i].UserAgent)
	}
	used, err := s.db.GetUserStorageUsed(ctx, u.ID)
	if err != nil {
		internalError(w, "AdminUserReport: storage used", err)
		return
	}
	now := time.Now()
	writeJSON(w, http.StatusOK, map[string]any{
		"user":             u,
		"used_bytes":       used,
		"quota_bytes":      s.getEffectiveQuota(ctx, u.ID),
		"account_age_days": int(now.Sub(u.CreatedAt).Hours() / 24),
		"stats":            stats,
		"storage_growth":   growth,
		"sessions":         sessions,
		"risk_flags":       riskFlags(u, stats, now),
		"generated_at":     now.UTC(),
	})
}

// HandleAdminRevokeUserSession signs one of a user's devices out.
// DELETE /api/admin/users/{id}/sessions/{sid}
func (s *Server) HandleAdminRevokeUserSession(w http.ResponseWriter, r *http.Request) {
	userID, sessionID := r.PathValue("id"), r.PathValue("sid")
	found, err := s.db.DeleteSession(r.Context(), userID, sessionID)
	if err != nil {
		internalError(w, "AdminRevokeUserSession", err)
		return
	}
	if !found {
		writeError(w, http.StatusNotFound, "session not found")
		return
	}
	s.revokeSessionIDs(userID, sessionID)
	adminID := GetUserID(r)
	s.audit(r, &adminID, "admin_session_revoke", map[string]interface{}{"target_user": userID, "session_id": sessionID})
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// HandleAdminOverview is the data behind the admin home page.
// GET /api/admin/overview?days=30
func (s *Server) HandleAdminOverview(w http.ResponseWriter, r *http.Request) {
	days := 30
	if v := r.URL.Query().Get("days"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 7 || n > 365 {
			writeError(w, http.StatusBadRequest, "days must be between 7 and 365")
			return
		}
		days = n
	}
	o, err := s.db.GetAdminOverview(r.Context(), days)
	if err != nil {
		internalError(w, "AdminOverview", err)
		return
	}
	writeJSON(w, http.StatusOK, o)
}
