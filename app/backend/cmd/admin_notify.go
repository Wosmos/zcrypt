package cmd

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/zcrypt/zcrypt/auth"
	"github.com/zcrypt/zcrypt/types"
)

const (
	maxNoteRunes     = 500
	maxBulkUsers     = 500
	notifySendWindow = 2 * time.Minute
)

type notifyOpts struct {
	Notify *bool  `json:"notify"`
	Note   string `json:"note"`
}

func (o notifyOpts) enabled() bool { return o.Notify == nil || *o.Notify }

func (o notifyOpts) validate() error {
	if utf8.RuneCountInString(o.Note) > maxNoteRunes {
		return fmt.Errorf("note must be %d characters or fewer", maxNoteRunes)
	}
	return nil
}

type adminChange struct {
	kind  string
	plan  string
	quota *int64
	role  types.Role
}

func formatQuotaBytes(q *int64) string {
	switch {
	case q == nil:
		return "Default"
	case *q == 0:
		return "Unlimited"
	}
	v := float64(*q)
	units := []string{"B", "KB", "MB", "GB", "TB"}
	i := 0
	for v >= 1024 && i < len(units)-1 {
		v /= 1024
		i++
	}
	return strings.TrimSuffix(strconv.FormatFloat(v, 'f', 1, 64), ".0") + " " + units[i]
}

func roleLabel(r types.Role) string {
	if r == types.RoleAdmin {
		return "Administrator"
	}
	return "Member"
}

func (s *Server) planName(ctx context.Context, id string) string {
	for _, p := range s.loadPlanConfigs(ctx).Plans {
		if p.ID == id && p.Name != "" {
			return p.Name
		}
	}
	if id == "" {
		return "Free"
	}
	return strings.ToUpper(id[:1]) + id[1:]
}

func (s *Server) changeNotice(ctx context.Context, old *types.User, ch adminChange, note string) (subject string, n auth.ChangeNotice, changed bool) {
	n.Note = note
	switch ch.kind {
	case "plan":
		if old.Plan == ch.plan {
			return
		}
		subject, n.Heading = "Your zcrypt plan changed", "Your plan changed"
		n.Intro = "An administrator changed your plan."
		n.Lines = []auth.ChangeLine{{Label: "Plan", From: s.planName(ctx, old.Plan), To: s.planName(ctx, ch.plan)}}
	case "quota":
		if formatQuotaBytes(old.StorageQuota) == formatQuotaBytes(ch.quota) {
			return
		}
		subject, n.Heading = "Your zcrypt storage limit changed", "Your storage limit changed"
		n.Intro = "An administrator changed your storage limit."
		n.Lines = []auth.ChangeLine{{Label: "Storage limit", From: formatQuotaBytes(old.StorageQuota), To: formatQuotaBytes(ch.quota)}}
	case "role":
		if old.Role == ch.role {
			return
		}
		subject, n.Heading = "Your zcrypt account role changed", "Your account role changed"
		n.Intro = "An administrator changed your account role."
		if ch.role == types.RoleAdmin {
			n.Intro = "An administrator made you an administrator."
		}
		n.Lines = []auth.ChangeLine{{Label: "Account role", From: roleLabel(old.Role), To: roleLabel(ch.role)}}
	case "delete":
		subject, n.Heading = "Your zcrypt account was deleted", "Your account was deleted"
		n.Intro = "An administrator deleted your zcrypt account. Your files and account details have been removed and cannot be recovered."
	default:
		return
	}
	return subject, n, true
}

func (s *Server) buildChangeEmail(ctx context.Context, old *types.User, ch adminChange, opts notifyOpts, baseURL string) (auth.OutgoingEmail, bool) {
	if !opts.enabled() || old == nil || old.Email == "" {
		return auth.OutgoingEmail{}, false
	}
	subject, n, changed := s.changeNotice(ctx, old, ch, strings.TrimSpace(opts.Note))
	if !changed {
		return auth.OutgoingEmail{}, false
	}
	return auth.ChangeEmail(old.Email, subject, n, baseURL), true
}

func (s *Server) emailConfigured() *auth.EmailConfig {
	cfg := s.emailCfg()
	if cfg == nil || cfg.APIKey == "" {
		return nil
	}
	return cfg
}

func (s *Server) dispatchNotifications(msgs []auth.OutgoingEmail) {
	cfg := s.emailConfigured()
	if cfg == nil || len(msgs) == 0 {
		return
	}
	s.goBackground(func() {
		s.notifySem <- struct{}{}
		defer func() { <-s.notifySem }()
		ctx, cancel := context.WithTimeout(context.Background(), notifySendWindow)
		defer cancel()
		sent, failed, err := auth.SendBatch(ctx, cfg, msgs)
		if err != nil {
			log.Printf("admin notify: sent %d, failed %d: %s", sent, failed, logSafe(err.Error())) // #nosec G706 -- control chars stripped via logSafe
		}
	})
}

func (s *Server) notifyChange(ctx context.Context, old *types.User, ch adminChange, opts notifyOpts, baseURL string) bool {
	msg, ok := s.buildChangeEmail(ctx, old, ch, opts, baseURL)
	if !ok {
		return false
	}
	s.dispatchNotifications([]auth.OutgoingEmail{msg})
	return true
}

func (s *Server) validPlanID(ctx context.Context, id string) bool {
	if id == "free" || id == "plus" || id == "pro" {
		return true
	}
	for _, p := range s.loadPlanConfigs(ctx).Plans {
		if p.ID == id {
			return true
		}
	}
	return false
}

type bulkRequest struct {
	IDs      []string        `json:"ids"`
	Action   string          `json:"action"`
	Value    json.RawMessage `json:"value"`
	Password string          `json:"password"`
	Code     string          `json:"code"`
	notifyOpts
}

type bulkResult struct {
	ID    string `json:"id"`
	OK    bool   `json:"ok"`
	Error string `json:"error,omitempty"`
}

type bulkPlan struct {
	change   adminChange
	auditKey string
}

func validateBulk(req *bulkRequest, selfID string, planOK func(string) bool) (bulkPlan, error) {
	var bp bulkPlan
	if len(req.IDs) < 1 || len(req.IDs) > maxBulkUsers {
		return bp, fmt.Errorf("ids must contain between 1 and %d users", maxBulkUsers)
	}
	seen := make(map[string]bool, len(req.IDs))
	ids := make([]string, 0, len(req.IDs))
	for _, id := range req.IDs {
		u, err := uuid.Parse(id)
		if err != nil {
			return bp, fmt.Errorf("invalid user id %q", id)
		}
		canon := u.String()
		if !seen[canon] {
			seen[canon] = true
			ids = append(ids, canon)
		}
	}
	req.IDs = ids
	if err := req.validate(); err != nil {
		return bp, err
	}
	selfBan := false
	switch req.Action {
	case "set_plan":
		var plan string
		if err := json.Unmarshal(req.Value, &plan); err != nil || !planOK(plan) {
			return bp, errors.New("unknown plan")
		}
		bp = bulkPlan{change: adminChange{kind: "plan", plan: plan}, auditKey: "admin_plan_change"}
	case "set_quota":
		var q *int64
		if err := json.Unmarshal(req.Value, &q); err != nil || (q != nil && *q < 0) {
			return bp, errors.New("quota must be >= 0 or null")
		}
		bp = bulkPlan{change: adminChange{kind: "quota", quota: q}, auditKey: "admin_quota_change"}
	case "set_role":
		var raw string
		if err := json.Unmarshal(req.Value, &raw); err != nil {
			return bp, errors.New("role must be 'user' or 'admin'")
		}
		role, ok := types.ParseRole(raw)
		if !ok {
			return bp, errors.New("role must be 'user' or 'admin'")
		}
		bp = bulkPlan{change: adminChange{kind: "role", role: role}, auditKey: "admin_role_change"}
		selfBan = true
	case "delete":
		bp = bulkPlan{change: adminChange{kind: "delete"}, auditKey: "admin_user_delete"}
		selfBan = true
	default:
		return bp, errors.New("action must be set_plan, set_quota, set_role or delete")
	}
	if selfBan && seen[selfID] {
		return bp, errors.New("you cannot apply this action to your own account")
	}
	return bp, nil
}

// HandleAdminBulkUsers applies one action to many users.
// POST /api/admin/users/bulk
func (s *Server) HandleAdminBulkUsers(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	adminID := GetUserID(r)
	var req bulkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	bp, err := validateBulk(&req, adminID, func(p string) bool { return s.validPlanID(ctx, p) })
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.Action == "set_role" || req.Action == "delete" {
		denied := "admin_role_change_denied"
		if req.Action == "delete" {
			denied = "admin_user_delete_denied"
		}
		if !s.adminReauth(w, r, req.Password, req.Code, denied, map[string]interface{}{"bulk": len(req.IDs)}) {
			return
		}
	}

	users, err := s.db.GetUsersByIDs(ctx, req.IDs)
	if err != nil {
		internalError(w, "AdminBulkUsers: load users", err)
		return
	}
	results := make([]bulkResult, 0, len(req.IDs))
	var targets []string
	for _, id := range req.IDs {
		if users[id] == nil {
			results = append(results, bulkResult{ID: id, Error: "user not found"})
			continue
		}
		targets = append(targets, id)
	}

	applied := map[string]bool{}
	fail := func(id, msg string) { results = append(results, bulkResult{ID: id, Error: msg}) }
	succeed := func(id string) {
		applied[id] = true
		results = append(results, bulkResult{ID: id, OK: true})
	}
	if len(targets) > 0 {
		if req.Action == "delete" {
			for _, id := range targets {
				if derr := s.db.DeleteUser(ctx, id); derr != nil {
					log.Printf("admin bulk delete %s: %v", id, derr)
					fail(id, "delete failed")
					continue
				}
				s.invalidateUserCache(id)
				succeed(id)
			}
			s.signalDeletion()
		} else if uerr := s.bulkUpdate(ctx, req.Action, targets, bp.change); uerr != nil {
			log.Printf("admin bulk %s: %v", req.Action, uerr)
			for _, id := range targets {
				fail(id, "update failed")
			}
		} else {
			for _, id := range targets {
				if req.Action == "set_role" {
					if rerr := s.revokeSessions(ctx, id); rerr != nil {
						log.Printf("admin bulk role: revoke sessions %s: %v", id, rerr)
					}
				}
				succeed(id)
			}
		}
	}

	baseURL := s.baseURL(r)
	var msgs []auth.OutgoingEmail
	for _, id := range req.IDs {
		if !applied[id] {
			continue
		}
		msg, notified := s.buildChangeEmail(ctx, users[id], bp.change, req.notifyOpts, baseURL)
		if notified {
			msgs = append(msgs, msg)
		}
		s.audit(r, &adminID, bp.auditKey, changeAuditMeta(id, bp.change, notified, true))
	}
	s.dispatchNotifications(msgs)

	writeJSON(w, http.StatusOK, map[string]interface{}{"results": results})
}

func (s *Server) bulkUpdate(ctx context.Context, action string, ids []string, ch adminChange) error {
	switch action {
	case "set_plan":
		return s.db.BulkSetUserPlan(ctx, ids, ch.plan)
	case "set_quota":
		return s.db.BulkSetUserQuota(ctx, ids, ch.quota)
	default:
		return s.db.BulkSetUserRole(ctx, ids, ch.role)
	}
}

func changeAuditMeta(target string, ch adminChange, notified, bulk bool) map[string]interface{} {
	m := map[string]interface{}{"target_user": target, "notified": notified}
	if bulk {
		m["bulk"] = true
	}
	switch ch.kind {
	case "plan":
		m["plan"] = ch.plan
	case "quota":
		m["quota_bytes"] = ch.quota
	case "role":
		m["role"] = ch.role.String()
	}
	return m
}
