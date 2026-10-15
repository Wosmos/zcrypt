package cmd

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/zcrypt/zcrypt/auth"
	"github.com/zcrypt/zcrypt/types"
)

const (
	maxEmailSubject   = 150
	maxEmailBody      = 20000
	maxEmailIDs       = 1000
	campaignSendLimit = 30 * time.Minute
	campaignListLimit = 50
)

type sendEmailRequest struct {
	Subject  string   `json:"subject"`
	Body     string   `json:"body"`
	Audience string   `json:"audience"`
	IDs      []string `json:"ids"`
	DryRun   bool     `json:"dry_run"`
	Test     bool     `json:"test"`
}

type emailAudience struct {
	kind   string
	planID string
	ids    []string
}

func validateEmailRequest(req *sendEmailRequest, planOK func(string) bool) (emailAudience, error) {
	var a emailAudience
	req.Subject = strings.TrimSpace(req.Subject)
	if n := utf8.RuneCountInString(req.Subject); n < 1 || n > maxEmailSubject {
		return a, fmt.Errorf("subject must be 1 to %d characters", maxEmailSubject)
	}
	if strings.ContainsAny(req.Subject, "\r\n") {
		return a, errors.New("subject must be a single line")
	}
	if n := utf8.RuneCountInString(strings.TrimSpace(req.Body)); n < 1 || utf8.RuneCountInString(req.Body) > maxEmailBody {
		return a, fmt.Errorf("body must be 1 to %d characters", maxEmailBody)
	}
	switch {
	case req.Audience == "all":
		a.kind = "all"
	case strings.HasPrefix(req.Audience, "plan:"):
		a.kind, a.planID = "plan", strings.TrimPrefix(req.Audience, "plan:")
		if !planOK(a.planID) {
			return a, errors.New("unknown plan")
		}
	case req.Audience == "ids":
		if len(req.IDs) < 1 || len(req.IDs) > maxEmailIDs {
			return a, fmt.Errorf("ids must contain between 1 and %d users", maxEmailIDs)
		}
		for _, id := range req.IDs {
			u, err := uuid.Parse(id)
			if err != nil {
				return a, fmt.Errorf("invalid user id %q", id)
			}
			a.ids = append(a.ids, u.String())
		}
		a.kind = "ids"
	default:
		return a, errors.New("audience must be all, plan:<id> or ids")
	}
	return a, nil
}

func (s *Server) unsubscribeURL(r *http.Request, userID string) string {
	return s.backendBaseURL(r) + "/api/email/unsubscribe?token=" + url.QueryEscape(auth.UnsubscribeToken(s.cfg.JWTSecret, userID))
}

func (s *Server) announcement(r *http.Request, rec types.EmailRecipient, subject, body, baseURL string) auth.OutgoingEmail {
	return auth.AnnouncementEmail(rec.Email, subject, body, s.unsubscribeURL(r, rec.ID), baseURL)
}

// HandleAdminSendEmail sends an announcement, a test, or counts recipients.
// POST /api/admin/emails
func (s *Server) HandleAdminSendEmail(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	adminID := GetUserID(r)
	var req sendEmailRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	aud, err := validateEmailRequest(&req, func(p string) bool { return s.validPlanID(ctx, p) })
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	baseURL := s.baseURL(r)

	if req.Test {
		s.sendTestEmail(w, r, adminID, req, baseURL)
		return
	}

	recipients, err := s.db.ListEmailRecipients(ctx, aud.kind, aud.planID, aud.ids)
	if err != nil {
		internalError(w, "AdminSendEmail: recipients", err)
		return
	}
	if req.DryRun {
		writeJSON(w, http.StatusOK, map[string]int{"recipient_count": len(recipients)})
		return
	}
	if len(recipients) == 0 {
		writeError(w, http.StatusBadRequest, "no recipients match this audience")
		return
	}
	cfg := s.emailConfigured()
	if cfg == nil {
		writeError(w, http.StatusServiceUnavailable, "email is not configured on this server")
		return
	}

	camp, err := s.db.CreateEmailCampaign(ctx, req.Subject, req.Body, req.Audience, len(recipients), adminID)
	if err != nil {
		internalError(w, "AdminSendEmail: create campaign", err)
		return
	}
	msgs := make([]auth.OutgoingEmail, len(recipients))
	for i, rec := range recipients {
		msgs[i] = s.announcement(r, rec, req.Subject, req.Body, baseURL)
	}
	s.audit(r, &adminID, "admin_email_campaign", map[string]interface{}{
		"campaign_id": camp.ID, "audience": req.Audience, "recipients": len(recipients),
	})
	s.goBackground(func() { s.runCampaign(cfg, camp.ID, msgs) })

	writeJSON(w, http.StatusAccepted, map[string]interface{}{"id": camp.ID, "recipient_count": len(recipients)})
}

func (s *Server) runCampaign(cfg *auth.EmailConfig, id string, msgs []auth.OutgoingEmail) {
	ctx, cancel := context.WithTimeout(context.Background(), campaignSendLimit)
	defer cancel()
	sent, failed := 0, 0
	for i := 0; i < len(msgs); i += 100 {
		end := min(i+100, len(msgs))
		ok, bad, err := auth.SendBatch(ctx, cfg, msgs[i:end])
		sent += ok
		failed += bad
		if err != nil {
			log.Printf("admin email campaign %s: %v", logSafe(id), err) // #nosec G706 -- control chars stripped via logSafe
		}
		if uerr := s.db.UpdateEmailCampaign(context.Background(), id, sent, failed, false); uerr != nil {
			log.Printf("admin email campaign %s: progress: %v", logSafe(id), uerr) // #nosec G706 -- control chars stripped via logSafe
		}
		if ctx.Err() != nil {
			failed += len(msgs) - end
			break
		}
		if end < len(msgs) {
			select {
			case <-ctx.Done():
			case <-time.After(batchPause(cfg)):
			}
		}
	}
	if err := s.db.UpdateEmailCampaign(context.Background(), id, sent, failed, true); err != nil {
		log.Printf("admin email campaign %s: finish: %v", logSafe(id), err) // #nosec G706 -- control chars stripped via logSafe
	}
}

func batchPause(cfg *auth.EmailConfig) time.Duration {
	if cfg.BatchInterval > 0 {
		return cfg.BatchInterval
	}
	return 600 * time.Millisecond
}

func (s *Server) sendTestEmail(w http.ResponseWriter, r *http.Request, adminID string, req sendEmailRequest, baseURL string) {
	ctx := r.Context()
	cfg := s.emailConfigured()
	if cfg == nil {
		writeError(w, http.StatusServiceUnavailable, "email is not configured on this server")
		return
	}
	admin, err := s.db.GetUserByID(ctx, adminID)
	if err != nil {
		internalError(w, "AdminSendEmail: load admin", err)
		return
	}
	msg := s.announcement(r, types.EmailRecipient{ID: admin.ID, Email: admin.Email}, "[Test] "+req.Subject, req.Body, baseURL)
	sent, _, err := auth.SendBatch(ctx, cfg, []auth.OutgoingEmail{msg})
	if err != nil || sent != 1 {
		log.Printf("admin email test: %v", err)
		writeError(w, http.StatusBadGateway, "the email provider rejected the test email")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"sent": 1, "to": admin.Email})
}

// HandleAdminListEmails returns recent campaigns.
// GET /api/admin/emails
func (s *Server) HandleAdminListEmails(w http.ResponseWriter, r *http.Request) {
	list, err := s.db.ListEmailCampaigns(r.Context(), campaignListLimit)
	if err != nil {
		internalError(w, "AdminListEmails", err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// HandleAdminGetEmail returns one campaign.
// GET /api/admin/emails/{id}
func (s *Server) HandleAdminGetEmail(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(r.PathValue("id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid campaign id")
		return
	}
	camp, err := s.db.GetEmailCampaign(r.Context(), id.String())
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "campaign not found")
		return
	}
	if err != nil {
		internalError(w, "AdminGetEmail", err)
		return
	}
	writeJSON(w, http.StatusOK, camp)
}

const unsubscribePage = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>zcrypt</title></head><body style="margin:0;background:#f8fafb;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a2e"><div style="max-width:420px;margin:15vh auto;padding:32px;background:#fff;border:1px solid #e5e7eb;border-radius:16px;text-align:center"><h1 style="font-size:20px;margin:0 0 12px">%s</h1><p style="margin:0;font-size:15px;line-height:1.6;color:#6b7280">%s</p></div></body></html>`

func writeUnsubscribePage(w http.ResponseWriter, status int, title, msg string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_, _ = fmt.Fprintf(w, unsubscribePage, html.EscapeString(title), html.EscapeString(msg))
}

// HandleEmailUnsubscribe opts a user out of announcements from a signed link.
// GET|POST /api/email/unsubscribe?token=...
func (s *Server) HandleEmailUnsubscribe(w http.ResponseWriter, r *http.Request) {
	if !s.authLimiter.allow(s.clientIP(r)) {
		writeUnsubscribePage(w, http.StatusTooManyRequests, "Too many requests", "Please try again in a few minutes.")
		return
	}
	userID, ok := auth.VerifyUnsubscribeToken(s.cfg.JWTSecret, r.URL.Query().Get("token"))
	if !ok {
		writeUnsubscribePage(w, http.StatusBadRequest, "Link not valid", "This unsubscribe link is invalid or incomplete.")
		return
	}
	if err := s.db.SetEmailOptOut(r.Context(), userID, true); err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			log.Printf("email unsubscribe: %v", err)
			writeUnsubscribePage(w, http.StatusInternalServerError, "Something went wrong", "We could not update your preference. Please try again.")
			return
		}
	}
	writeUnsubscribePage(w, http.StatusOK, "You are unsubscribed", "You will no longer receive announcements from zcrypt. You can turn them back on any time in your account settings.")
}

// HandleGetEmailPrefs returns the caller's announcement preference.
// GET /api/email/preferences
func (s *Server) HandleGetEmailPrefs(w http.ResponseWriter, r *http.Request) {
	optOut, err := s.db.GetEmailOptOut(r.Context(), GetUserID(r))
	if err != nil {
		internalError(w, "GetEmailPrefs", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"email_opt_out": optOut})
}

// HandleSetEmailPrefs updates the caller's announcement preference.
// PUT /api/email/preferences
func (s *Server) HandleSetEmailPrefs(w http.ResponseWriter, r *http.Request) {
	var req struct {
		EmailOptOut *bool `json:"email_opt_out"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.EmailOptOut == nil {
		writeError(w, http.StatusBadRequest, "email_opt_out is required")
		return
	}
	if err := s.db.SetEmailOptOut(r.Context(), GetUserID(r), *req.EmailOptOut); err != nil {
		internalError(w, "SetEmailPrefs", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"email_opt_out": *req.EmailOptOut})
}
