package cmd

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/mail"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/zcrypt/zcrypt/types"
)

const (
	bugScreenshotMax = 2 << 20
	// bugReportMaxBody fits a 2 MiB screenshot as base64 (~2.8 MiB) plus text.
	bugReportMaxBody = 4 << 20

	bugDescriptionMax = 5000
	bugVersionMax     = 64
	bugPlatformMax    = 64
	bugRouteMax       = 512
	bugUserAgentMax   = 512
	bugEmailMax       = 254

	bugMinAnonElapsedMs = 3000
	bugAnonGlobalKey    = "anon-global"
)

var bugKinds = map[string]bool{"bug": true, "idea": true, "left": true, "other": true}

var errBadContactEmail = errors.New("invalid email")

// validContactEmail returns the trimmed address, or an error when it is not a
// bare RFC 5322 address.
func validContactEmail(v string) (string, error) {
	v = strings.TrimSpace(v)
	if v == "" {
		return "", nil
	}
	if len(v) > bugEmailMax || strings.ContainsAny(v, "\r\n\x00") {
		return "", errBadContactEmail
	}
	addr, err := mail.ParseAddress(v)
	if err != nil || addr.Address != v {
		return "", errBadContactEmail
	}
	return v, nil
}

var bugStatuses = map[string]bool{"open": true, "triaged": true, "fixed": true, "wontfix": true}

var errBadScreenshot = errors.New("invalid screenshot")

// decodeBugScreenshot accepts raw base64 or a data URL and returns the image
// bytes, enforcing the size cap and an allowed image type.
func decodeBugScreenshot(s string) ([]byte, error) {
	if s == "" {
		return nil, nil
	}
	if strings.HasPrefix(s, "data:") {
		i := strings.Index(s, ",")
		if i < 0 {
			return nil, errBadScreenshot
		}
		s = s[i+1:]
	}
	if base64.StdEncoding.DecodedLen(len(s)) > bugScreenshotMax+3 {
		return nil, errBadScreenshot
	}
	data, err := base64.StdEncoding.DecodeString(s)
	if err != nil || len(data) == 0 || len(data) > bugScreenshotMax {
		return nil, errBadScreenshot
	}
	switch http.DetectContentType(data) {
	case "image/png", "image/jpeg", "image/webp", "image/gif":
		return data, nil
	}
	return nil, errBadScreenshot
}

func boundedField(v string, limit int) (string, bool) {
	v = strings.TrimSpace(v)
	if strings.ContainsRune(v, 0) || utf8.RuneCountInString(v) > limit {
		return "", false
	}
	return v, true
}

// HandleSubmitBugReport stores a bug report or piece of feedback. Auth is
// optional; anonymous submissions are stricter (no screenshot, timing check,
// tighter limits).
// POST /api/feedback/bug
func (s *Server) HandleSubmitBugReport(w http.ResponseWriter, r *http.Request) {
	var userID *string
	if claims := GetUserClaims(r); claims != nil {
		userID = &claims.Sub
	}

	if !s.devMode {
		ip := s.clientIP(r)
		limited := !s.bugIPLimiter.allow(ip)
		if userID != nil {
			limited = limited || !s.bugUserLimiter.allow(*userID)
		} else {
			limited = limited || !s.bugAnonIPLimiter.allow(ip) || !s.bugAnonGlobalLimiter.allow(bugAnonGlobalKey)
		}
		if limited {
			http.Error(w, `{"error":"too many reports, try again later"}`, http.StatusTooManyRequests)
			return
		}
	}

	var req struct {
		Description  string `json:"description"`
		Screenshot   string `json:"screenshot"`
		AppVersion   string `json:"app_version"`
		Platform     string `json:"platform"`
		Route        string `json:"route"`
		UserAgent    string `json:"user_agent"`
		Kind         string `json:"kind"`
		ContactEmail string `json:"contact_email"`
		Website      string `json:"website"`
		ElapsedMs    int    `json:"elapsed_ms"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	kind := strings.TrimSpace(req.Kind)
	if kind == "" {
		kind = "bug"
	}
	if !bugKinds[kind] {
		http.Error(w, `{"error":"invalid kind"}`, http.StatusBadRequest)
		return
	}

	if req.Website != "" || (userID == nil && req.ElapsedMs < bugMinAnonElapsedMs) {
		reason := "honeypot"
		if req.Website == "" {
			reason = "too_fast"
		}
		s.audit(r, userID, "bug_report_dropped", map[string]interface{}{"reason": reason})
		writeJSON(w, http.StatusCreated, map[string]interface{}{"success": true})
		return
	}

	contact := ""
	if userID == nil {
		var err error
		if contact, err = validContactEmail(req.ContactEmail); err != nil {
			http.Error(w, `{"error":"invalid email"}`, http.StatusBadRequest)
			return
		}
		if req.Screenshot != "" {
			http.Error(w, `{"error":"sign in to attach a screenshot"}`, http.StatusBadRequest)
			return
		}
	}

	desc, ok := boundedField(req.Description, bugDescriptionMax)
	if !ok || desc == "" {
		http.Error(w, `{"error":"description is required (max 5000 characters)"}`, http.StatusBadRequest)
		return
	}
	version, ok1 := boundedField(req.AppVersion, bugVersionMax)
	platform, ok2 := boundedField(req.Platform, bugPlatformMax)
	route, ok3 := boundedField(req.Route, bugRouteMax)
	ua, ok4 := boundedField(req.UserAgent, bugUserAgentMax)
	if !ok1 || !ok2 || !ok3 || !ok4 {
		http.Error(w, `{"error":"a context field is too long"}`, http.StatusBadRequest)
		return
	}
	if ua == "" {
		ua, _ = boundedField(truncateRunes(r.UserAgent(), bugUserAgentMax), bugUserAgentMax)
	}

	shot, err := decodeBugScreenshot(req.Screenshot)
	if err != nil {
		http.Error(w, `{"error":"screenshot must be a PNG, JPEG, WebP or GIF image up to 2 MiB"}`, http.StatusBadRequest)
		return
	}

	report := &types.BugReport{
		ID:           uuid.NewString(),
		UserID:       userID,
		Description:  desc,
		AppVersion:   version,
		Platform:     platform,
		Route:        route,
		UserAgent:    ua,
		Kind:         kind,
		ContactEmail: contact,
	}
	if err := s.db.InsertBugReport(r.Context(), report, shot); err != nil {
		internalError(w, "insert bug report", err)
		return
	}

	s.audit(r, userID, "bug_report", map[string]interface{}{"id": report.ID, "has_screenshot": len(shot) > 0, "kind": kind})
	writeJSON(w, http.StatusCreated, map[string]interface{}{"success": true, "id": report.ID})
}

var bugReportSorts = map[string]string{"created_at": ""}

func truncateRunes(v string, limit int) string {
	if utf8.RuneCountInString(v) <= limit {
		return v
	}
	return string([]rune(v)[:limit])
}

// HandleAdminListBugReports lists bug reports, optionally filtered by status.
// GET /api/admin/bug-reports?status&limit&offset&q&order
func (s *Server) HandleAdminListBugReports(w http.ResponseWriter, r *http.Request) {
	adminListByStatus(w, r, "reports", bugStatuses, bugReportSorts, "created_at", s.db.ListBugReports)
}

// HandleAdminUpdateBugReport changes a report's status.
// PATCH /api/admin/bug-reports/{id}
func (s *Server) HandleAdminUpdateBugReport(w http.ResponseWriter, r *http.Request) {
	s.adminSetStatus(w, r, bugStatuses, "status must be open, triaged, fixed or wontfix", "report", "admin_bug_report_status", s.db.UpdateBugReportStatus)
}

// HandleAdminBugReportScreenshot serves a report's screenshot.
// GET /api/admin/bug-reports/{id}/screenshot
func (s *Server) HandleAdminBugReportScreenshot(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if _, err := uuid.Parse(id); err != nil {
		http.Error(w, `{"error":"invalid id"}`, http.StatusBadRequest)
		return
	}
	data, found, err := s.db.GetBugReportScreenshot(r.Context(), id)
	if err != nil {
		internalError(w, "get bug report screenshot", err)
		return
	}
	if !found || len(data) == 0 {
		http.Error(w, `{"error":"screenshot not found"}`, http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", http.DetectContentType(data))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Disposition", "inline")
	w.Header().Set("Cache-Control", "private, max-age=300")
	_, _ = w.Write(data) //nolint:gosec // validated image bytes, nosniff set
}
