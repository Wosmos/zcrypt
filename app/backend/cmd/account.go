package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/zcrypt/zcrypt/auth"
	"github.com/zcrypt/zcrypt/types"
)

// accountDeletionGrace is how long a self-serve deletion waits before the data
// is erased, so a mistaken or hijacked request can be undone by signing in. It
// stays well inside the 30 days the privacy policy promises.
const accountDeletionGrace = 7 * 24 * time.Hour

// purgeBatchSize caps how many accounts one cleanup pass erases.
const purgeBatchSize = 50

// HandleDeleteAccount schedules the caller's account for deletion after
// re-verifying them (password, plus a 2FA code when enabled), then signs every
// device out. A decoy session gets the same exchange without anything being
// scheduled (see fakeAccountDeletion).
// DELETE /api/auth/me
func (s *Server) HandleDeleteAccount(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if !s.devMode && !s.authLimiter.allow(s.clientIP(r)) {
		http.Error(w, `{"error":"too many attempts, please try again later"}`, http.StatusTooManyRequests)
		return
	}
	var body struct {
		Password string `json:"password"`
		Code     string `json:"code"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	if IsDecoy(r) {
		s.fakeAccountDeletion(w, r, body.Password, body.Code)
		return
	}
	userID := GetUserID(r)
	if err := s.reauthActingUser(ctx, r, body.Password, body.Code); err != nil {
		s.audit(r, &userID, "account_deletion_denied", map[string]interface{}{"reason": err.Error()})
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return
	}
	user, err := s.db.GetUserByID(ctx, userID)
	if err != nil {
		internalError(w, "load user", err)
		return
	}

	deleteAt := time.Now().Add(accountDeletionGrace).UTC().Truncate(time.Second)
	if err := s.db.ScheduleUserDeletion(ctx, userID, deleteAt); err != nil {
		internalError(w, "schedule deletion", err)
		return
	}
	if err := s.db.IncrementTokenVersion(ctx, userID); err != nil {
		log.Printf("account deletion: bump token version: %v", err)
	}
	s.tokenVersions.invalidate(userID)
	sessionIDs, err := s.db.DeleteRefreshTokensByUser(ctx, userID)
	if err != nil {
		log.Printf("account deletion: drop sessions: %v", err)
	}
	s.revokedSessions.add(sessionIDs...)
	clearRefreshCookie(w)

	cfg, baseURL, to := s.emailCfg(), s.baseURL(r), user.Email
	s.goBackground(func() {
		if err := auth.SendAccountDeletionEmail(cfg, to, deleteAt, baseURL); err != nil {
			log.Printf("send account deletion email: %v", err)
		}
	})
	s.audit(r, &userID, "account_deletion_requested", map[string]interface{}{"delete_at": deleteAt})

	writeJSON(w, http.StatusOK, map[string]interface{}{"deletion_scheduled_at": deleteAt})
}

// fakeAccountDeletion answers a deletion request from a decoy session the way
// a real one is answered, checking the decoy password and the 2FA code, but
// only signs the decoy session out. Nothing is scheduled, so the real account
// and its sessions are untouched.
func (s *Server) fakeAccountDeletion(w http.ResponseWriter, r *http.Request, password, code string) {
	ctx := r.Context()
	claims := GetUserClaims(r)
	user, err := s.db.GetUserByID(ctx, claims.Sub)
	if err != nil {
		internalError(w, "load user", err)
		return
	}
	vault, err := s.db.GetDecoyVault(ctx, claims.Sub)
	if err != nil || auth.CheckPassword(password, vault.DecoyPasswordHash) != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "password is incorrect"})
		return
	}
	if err := s.checkSecondFactor(ctx, user, code); err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
		return
	}
	if _, err := s.db.DeleteSession(ctx, claims.Sub, claims.SessionID); err != nil {
		log.Printf("decoy account deletion: drop session: %v", err)
	}
	s.revokedSessions.add(claims.SessionID)
	clearRefreshCookie(w)
	deleteAt := time.Now().Add(accountDeletionGrace).UTC().Truncate(time.Second)
	writeJSON(w, http.StatusOK, map[string]interface{}{"deletion_scheduled_at": deleteAt})
}

// HandleCancelAccountDeletion keeps an account that was scheduled for deletion.
// A decoy session never sees a scheduled deletion, so it is told none exists.
// POST /api/auth/me/deletion/cancel
func (s *Server) HandleCancelAccountDeletion(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	cancelled := false
	if !IsDecoy(r) {
		var err error
		if cancelled, err = s.db.CancelUserDeletion(r.Context(), userID); err != nil {
			internalError(w, "cancel deletion", err)
			return
		}
	}
	if !cancelled {
		http.Error(w, `{"error":"no deletion is scheduled"}`, http.StatusNotFound)
		return
	}
	s.audit(r, &userID, "account_deletion_cancelled", nil)
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// accountExport is everything zcrypt stores about an account, in the form the
// server holds it. File and folder names are client-sealed ciphertext: only the
// owner's passphrase opens them, so they are exported as-is.
type accountExport struct {
	Version         int                       `json:"version"`
	ExportedAt      time.Time                 `json:"exported_at"`
	Account         *types.User               `json:"account"`
	LinkedAccounts  []types.OAuthProvider     `json:"linked_accounts"`
	Platforms       []types.PlatformTokenInfo `json:"storage_connections"`
	Sessions        []types.Session           `json:"sessions"`
	Files           []types.FileMetadata      `json:"files"`
	TrashedFiles    []types.FileMetadata      `json:"trashed_files"`
	Folders         []types.Folder            `json:"folders"`
	Shares          []types.ShareLink         `json:"share_links"`
	FolderShares    []types.FolderShare       `json:"folder_share_links"`
	SecurityHistory []types.AuditEvent        `json:"security_history"`
}

// exportAuditLimit bounds the security history in an export.
const exportAuditLimit = 1000

// HandleExportAccount returns the caller's account data as a JSON download. A
// decoy session gets an export of what it can see (see buildDecoyExport).
// GET /api/auth/me/export
func (s *Server) HandleExportAccount(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	if !s.devMode && !s.analyticsLimiter.allow("export:"+userID) {
		http.Error(w, `{"error":"too many exports, please try again later"}`, http.StatusTooManyRequests)
		return
	}
	var out *accountExport
	var err error
	if IsDecoy(r) {
		out, err = s.buildDecoyExport(r)
	} else {
		out, err = s.buildAccountExport(ctx, userID)
	}
	if err != nil {
		internalError(w, "export account", err)
		return
	}
	if !IsDecoy(r) {
		s.audit(r, &userID, "account_export", nil)
	}
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="zcrypt-account-%s.json"`, out.ExportedAt.Format("2006-01-02")))
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) buildAccountExport(ctx context.Context, userID string) (*accountExport, error) {
	out := &accountExport{Version: 1, ExportedAt: time.Now().UTC()}
	var err error
	if out.Account, err = s.db.GetUserByID(ctx, userID); err != nil {
		return nil, err
	}
	if out.LinkedAccounts, err = s.db.GetOAuthProvidersByUser(ctx, userID); err != nil {
		return nil, err
	}
	if out.Platforms, err = s.db.ListOwnPlatformTokens(ctx, userID); err != nil {
		return nil, err
	}
	if out.Sessions, err = s.db.ListSessions(ctx, userID); err != nil {
		return nil, err
	}
	if out.Files, err = s.db.ListFiles(ctx, userID, nil, 0); err != nil {
		return nil, err
	}
	if out.TrashedFiles, err = s.db.ListTrashedFiles(ctx, userID); err != nil {
		return nil, err
	}
	if out.Folders, err = s.db.ListAllFolders(ctx, userID); err != nil {
		return nil, err
	}
	if out.Shares, err = s.db.ListSharesByUser(ctx, userID, ""); err != nil {
		return nil, err
	}
	if out.FolderShares, err = s.db.ListFolderSharesByUser(ctx, userID, ""); err != nil {
		return nil, err
	}
	if out.SecurityHistory, err = s.db.ListUserAuditEvents(ctx, userID, exportAuditLimit); err != nil {
		return nil, err
	}
	out.LinkedAccounts = nonNil(out.LinkedAccounts)
	out.Platforms = nonNil(out.Platforms)
	out.Files = nonNil(out.Files)
	out.TrashedFiles = nonNil(out.TrashedFiles)
	out.Shares = nonNil(out.Shares)
	out.FolderShares = nonNil(out.FolderShares)
	out.SecurityHistory = nonNil(out.SecurityHistory)
	return out, nil
}

// buildDecoyExport is the export a decoy session sees: the account without
// anything pending, the decoy session itself, and the decoy files.
func (s *Server) buildDecoyExport(r *http.Request) (*accountExport, error) {
	ctx := r.Context()
	userID := GetUserID(r)
	user, err := s.db.GetUserByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	sessions, err := s.visibleSessions(r)
	if err != nil {
		return nil, err
	}
	decoyFiles, err := s.db.ListDecoyFiles(ctx, userID)
	if err != nil {
		return nil, err
	}
	return &accountExport{
		Version:         1,
		ExportedAt:      time.Now().UTC(),
		Account:         decoyView(user),
		LinkedAccounts:  []types.OAuthProvider{},
		Platforms:       []types.PlatformTokenInfo{},
		Sessions:        sessions,
		Files:           decoyFileList(decoyFiles),
		TrashedFiles:    []types.FileMetadata{},
		Folders:         []types.Folder{},
		Shares:          []types.ShareLink{},
		FolderShares:    []types.FolderShare{},
		SecurityHistory: []types.AuditEvent{},
	}, nil
}

// nonNil makes an empty list encode as [] rather than null.
func nonNil[T any](s []T) []T {
	if s == nil {
		return []T{}
	}
	return s
}

// purgeScheduledDeletions erases accounts whose deletion grace period is over.
// DeleteUser queues their remote chunks, so the deletion worker is woken after.
func (s *Server) purgeScheduledDeletions(ctx context.Context) int {
	ids, err := s.db.UsersDueForDeletion(ctx, purgeBatchSize)
	if err != nil {
		log.Printf("cleanup: users due for deletion: %v", err)
		return 0
	}
	purged := 0
	for _, id := range ids {
		if err := s.db.DeleteUser(ctx, id); err != nil {
			log.Printf("cleanup: delete user %s: %v", id, err)
			continue
		}
		s.invalidateUserCache(id)
		purged++
	}
	if purged > 0 {
		s.signalDeletion()
		log.Printf("cleanup: erased %d accounts past their deletion date", purged)
	}
	return purged
}
