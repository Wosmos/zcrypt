package cmd

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/zcrypt/zcrypt/types"
)

const (
	recoveryBlobPrefix = "rk1:"
	// 12-byte IV + 16-byte tag + at least one plaintext byte.
	minRecoveryBlobBytes = 12 + 16 + 1
	// Room for a long UTF-8 passphrase.
	maxRecoveryBlobBytes = 2048
)

// validateRecoveryBlob checks the opaque recovery blob's envelope only; the
// server cannot and does not look inside it.
func validateRecoveryBlob(blob string) error {
	rest, ok := strings.CutPrefix(blob, recoveryBlobPrefix)
	if !ok {
		return errors.New("blob must start with rk1:")
	}
	raw, err := base64.StdEncoding.DecodeString(rest)
	if err != nil {
		return errors.New("blob must be base64 after the prefix")
	}
	if len(raw) < minRecoveryBlobBytes || len(raw) > maxRecoveryBlobBytes {
		return errors.New("blob has an invalid length")
	}
	return nil
}

// HandleGetRecoveryKit returns the caller's recovery blob. Rate-limited per
// user because it is the offline-guessing surface (256-bit keys make guessing
// infeasible regardless).
// GET /api/keys/recovery
func (s *Server) HandleGetRecoveryKit(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	if !s.devMode && !s.recoveryLimiter.allow(userID) {
		writeError(w, http.StatusTooManyRequests, "too many recovery attempts, try again later")
		return
	}
	kit, err := s.db.GetRecoveryKit(r.Context(), userID)
	if err != nil {
		internalError(w, "GetRecoveryKit", err)
		return
	}
	if kit == nil {
		writeError(w, http.StatusNotFound, "no recovery kit")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	writeJSON(w, http.StatusOK, kit)
}

// HandleSetRecoveryKit stores (or replaces) the caller's recovery blob.
// PUT /api/keys/recovery
func (s *Server) HandleSetRecoveryKit(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Blob string `json:"blob"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Blob == "" {
		writeError(w, http.StatusBadRequest, "blob is required")
		return
	}
	if err := validateRecoveryBlob(req.Blob); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	userID := GetUserID(r)
	kit, err := s.db.SetRecoveryKit(r.Context(), userID, req.Blob)
	if err != nil {
		internalError(w, "SetRecoveryKit", err)
		return
	}
	s.audit(r, &userID, types.AuditRecoveryKitSet, nil)
	writeJSON(w, http.StatusOK, map[string]any{"created_at": kit.CreatedAt})
}

// HandleDeleteRecoveryKit removes the caller's recovery blob.
// DELETE /api/keys/recovery
func (s *Server) HandleDeleteRecoveryKit(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	removed, err := s.db.DeleteRecoveryKit(r.Context(), userID)
	if err != nil {
		internalError(w, "DeleteRecoveryKit", err)
		return
	}
	if removed {
		s.audit(r, &userID, types.AuditRecoveryKitRemoved, nil)
	}
	writeJSON(w, http.StatusOK, map[string]bool{"removed": removed})
}
