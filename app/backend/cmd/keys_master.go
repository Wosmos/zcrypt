package cmd

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
)

const masterKeyWritesSetting = "master_key_writes"

const (
	minWrappedMasterKeyBytes = 12 + 32 + 16
	maxWrappedMasterKeyBytes = 200
)

func (s *Server) masterKeyWritesEnabled(ctx context.Context) bool {
	v, err := s.db.GetSystemSetting(ctx, masterKeyWritesSetting)
	return err == nil && v == "true"
}

// HandleSetMasterKey stores the caller's wrapped account master key. It is
// set-once: an existing value is never overwritten.
// PUT /api/keys/master
func (s *Server) HandleSetMasterKey(w http.ResponseWriter, r *http.Request) {
	var req struct {
		WrappedMasterKey string `json:"wrapped_master_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.WrappedMasterKey == "" {
		writeError(w, http.StatusBadRequest, "wrapped_master_key is required")
		return
	}
	raw, err := base64.StdEncoding.DecodeString(req.WrappedMasterKey)
	if err != nil {
		writeError(w, http.StatusBadRequest, "wrapped_master_key must be base64")
		return
	}
	if len(raw) < minWrappedMasterKeyBytes || len(raw) > maxWrappedMasterKeyBytes {
		writeError(w, http.StatusBadRequest, "wrapped_master_key has an invalid length")
		return
	}

	found, stored, err := s.db.SetWrappedMasterKey(r.Context(), GetUserID(r), req.WrappedMasterKey)
	if err != nil {
		internalError(w, "SetMasterKey", err)
		return
	}
	switch {
	case stored:
		writeJSON(w, http.StatusOK, map[string]bool{"stored": true})
	case !found:
		writeError(w, http.StatusNotFound, "no key record; publish a keypair first")
	default:
		writeJSON(w, http.StatusConflict, map[string]any{"error": "master key already set", "stored": false})
	}
}

// HandleAdminGetMasterKeyWrites reports whether master-key writes are enabled.
// GET /api/admin/settings/master-key-writes
func (s *Server) HandleAdminGetMasterKeyWrites(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]bool{"enabled": s.masterKeyWritesEnabled(r.Context())})
}

// HandleAdminSetMasterKeyWrites toggles master-key writes at runtime.
// PUT /api/admin/settings/master-key-writes
func (s *Server) HandleAdminSetMasterKeyWrites(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Enabled *bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Enabled == nil {
		writeError(w, http.StatusBadRequest, "enabled (bool) is required")
		return
	}
	if err := s.db.SetSystemSetting(r.Context(), masterKeyWritesSetting, strconv.FormatBool(*req.Enabled)); err != nil {
		internalError(w, "AdminSetMasterKeyWrites", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"enabled": *req.Enabled})
}

// HandleGetUserAvatar serves a user's avatar image. Visible to the user and to
// anyone sharing a Space with them; every other case is a plain 404.
// GET /api/users/{id}/avatar
func (s *Server) HandleGetUserAvatar(w http.ResponseWriter, r *http.Request) {
	uri, err := s.db.GetAvatarForViewer(r.Context(), GetUserID(r), r.PathValue("id"))
	if err != nil {
		internalError(w, "GetUserAvatar", err)
		return
	}
	mime, data, ok := decodeAvatarURI(uri)
	if !ok {
		http.NotFound(w, r)
		return
	}
	etag := avatarETag(uri)

	h := w.Header()
	h.Set("Content-Type", mime)
	h.Set("Cache-Control", "private, max-age=3600")
	h.Set("ETag", etag)
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Content-Security-Policy", "default-src 'none'")
	if strings.Contains(r.Header.Get("If-None-Match"), etag) {
		w.WriteHeader(http.StatusNotModified)
		return
	}
	h.Set("Content-Length", strconv.Itoa(len(data)))
	_, _ = w.Write(data) //nolint:gosec // allowlisted image MIME, nosniff and default-src none
}

func avatarETag(uri string) string {
	sum := sha256.Sum256([]byte(uri))
	return `"` + hex.EncodeToString(sum[:])[:16] + `"`
}

func decodeAvatarURI(uri string) (mime string, data []byte, ok bool) {
	rest, found := strings.CutPrefix(uri, "data:")
	if !found {
		return "", nil, false
	}
	meta, payload, found := strings.Cut(rest, ",")
	if !found {
		return "", nil, false
	}
	mime, _, _ = strings.Cut(meta, ";")
	if _, allowed := avatarMIMEs[mime]; !allowed {
		return "", nil, false
	}
	data, err := base64.StdEncoding.DecodeString(payload)
	if err != nil {
		return "", nil, false
	}
	return mime, data, true
}
