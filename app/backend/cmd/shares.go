package cmd

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/zcrypt/zcrypt/auth"
	"golang.org/x/crypto/bcrypt"

	"github.com/zcrypt/zcrypt/types"
)

// ── Authenticated share management ──

// HandleCreateShare creates a new share link for a file.
// POST /api/shares
func (s *Server) HandleCreateShare(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	var req struct {
		FileID       string `json:"file_id"`
		WrappedCEK   string `json:"wrapped_cek,omitempty"` // file CEK wrapped under the share key
		Password     string `json:"password,omitempty"`
		ExpiresHours int    `json:"expires_in_hours,omitempty"`
		MaxDownloads int    `json:"max_downloads,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.FileID == "" {
		http.Error(w, `{"error":"file_id required"}`, http.StatusBadRequest)
		return
	}

	// Verify file belongs to user
	_, err := s.db.GetFileByID(ctx, userID, req.FileID)
	if err != nil {
		http.Error(w, `{"error":"file not found"}`, http.StatusNotFound)
		return
	}

	// Generate share token
	token, err := auth.GenerateRandomToken()
	if err != nil {
		http.Error(w, `{"error":"failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	share := &types.ShareLink{
		ID:           uuid.New().String(),
		FileID:       req.FileID,
		UserID:       userID,
		Token:        token,
		WrappedCEK:   req.WrappedCEK,
		MaxDownloads: req.MaxDownloads,
	}

	// Optional password
	if req.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			http.Error(w, `{"error":"failed to hash password"}`, http.StatusInternalServerError)
			return
		}
		share.PasswordHash = string(hash)
	}

	// Optional expiry
	if req.ExpiresHours > 0 {
		exp := time.Now().Add(time.Duration(req.ExpiresHours) * time.Hour)
		share.ExpiresAt = &exp
	}

	if err := s.db.CreateShare(ctx, share); err != nil {
		log.Printf("shares: create failed: %v", err)
		http.Error(w, `{"error":"failed to create share link"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":    share.ID,
		"token": share.Token,
	})
}

// HandleListShares lists all shares for the authenticated user.
// GET /api/shares?file_id=optional
func (s *Server) HandleListShares(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	fileID := r.URL.Query().Get("file_id")

	shares, err := s.db.ListSharesByUser(ctx, userID, fileID)
	if err != nil {
		log.Printf("shares: list failed: %v", err)
		http.Error(w, `{"error":"failed to list shares"}`, http.StatusInternalServerError)
		return
	}

	if shares == nil {
		shares = []types.ShareLink{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(shares)
}

// HandleRevokeShare revokes a share link.
// DELETE /api/shares/{id}
func (s *Server) HandleRevokeShare(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	shareID := r.PathValue("id")

	if shareID == "" {
		http.Error(w, `{"error":"share id required"}`, http.StatusBadRequest)
		return
	}

	if err := s.db.RevokeShare(ctx, userID, shareID); err != nil {
		http.Error(w, `{"error":"share not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"success":true}`))
}

// ── Public share access (no auth) ──

// validateShare checks if a share is valid for access.
func validateShare(share *types.ShareLink) (string, bool) {
	if share.Revoked || (share.ExpiresAt != nil && time.Now().After(*share.ExpiresAt)) ||
		(share.MaxDownloads > 0 && share.DownloadCount >= share.MaxDownloads) {
		return "this link is no longer available", false
	}
	return "", true
}

// validateSharePassword checks the optional share-level password.
func validateSharePassword(share *types.ShareLink, password string) bool {
	if share.PasswordHash == "" {
		return true // no password set
	}
	if password == "" {
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(share.PasswordHash), []byte(password)) == nil
}

// HandleGetShareInfo returns public info about a share link.
// GET /api/share/{token}
func (s *Server) HandleGetShareInfo(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	token := r.PathValue("token")

	if token == "" {
		http.Error(w, `{"error":"token required"}`, http.StatusBadRequest)
		return
	}

	share, err := s.db.GetShareByToken(ctx, token)
	if err != nil {
		http.Error(w, `{"error":"share not found"}`, http.StatusNotFound)
		return
	}

	reason, valid := validateShare(share)

	// Get file info
	file, err := s.db.GetFileByIDUnsafe(ctx, share.FileID)
	if err != nil {
		http.Error(w, `{"error":"file not found"}`, http.StatusNotFound)
		return
	}

	resp := map[string]interface{}{
		"valid":        valid,
		"has_password": share.HasPassword,
	}
	if !valid {
		resp["reason"] = reason
	}
	// Only reveal file metadata if no password is set — password-protected shares
	// must not leak filename/size until the password is provided via /meta endpoint.
	if !share.HasPassword {
		resp["file_name"] = file.OriginalName
		resp["file_size"] = SizeBucket(file.OriginalSize) // coarse band on a public endpoint
		resp["chunk_count"] = file.ChunkCount
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// HandleGetShareFileMeta returns full file metadata for a valid share.
// GET /api/share/{token}/meta
func (s *Server) HandleGetShareFileMeta(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	token := r.PathValue("token")

	if token == "" {
		http.Error(w, `{"error":"token required"}`, http.StatusBadRequest)
		return
	}

	share, err := s.db.GetShareByToken(ctx, token)
	if err != nil {
		http.Error(w, `{"error":"share not found"}`, http.StatusNotFound)
		return
	}

	if reason, valid := validateShare(share); !valid {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, reason), http.StatusForbidden)
		return
	}

	// Validate share password if set
	if !validateSharePassword(share, r.Header.Get("X-Share-Password")) {
		http.Error(w, `{"error":"password required"}`, http.StatusUnauthorized)
		return
	}

	file, err := s.db.GetFileByIDUnsafe(ctx, share.FileID)
	if err != nil {
		http.Error(w, `{"error":"file not found"}`, http.StatusNotFound)
		return
	}

	// Increment download count
	_ = s.db.IncrementShareDownloads(ctx, share.ID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":            file.ID,
		"original_name": file.OriginalName,
		// Public endpoint: coarsen the size to a band and DROP compressed_size /
		// encrypted_size (they'd let a link-holder reconstruct the exact size).
		// chunk_count stays — the recipient needs it to download.
		"original_size": SizeBucket(file.OriginalSize),
		"chunk_count":   file.ChunkCount,
		"sha256":        file.SHA256,
		"sha256_scheme": file.SHA256Scheme,
		"salt":          base64.StdEncoding.EncodeToString(file.Salt),
		// The CEK wrapped under the share key (from the share, NOT the file's
		// passphrase-wrapped CEK). The recipient unwraps this with the key in
		// the share URL fragment — no passphrase needed.
		"wrapped_cek": share.WrappedCEK,
		"status":      file.Status,
		"created_at":  CoarsenTimeUTC(file.CreatedAt),
	})
}

// HandleGetShareChunk downloads an encrypted chunk via share token.
// GET /api/share/{token}/chunks/{idx}
func (s *Server) HandleGetShareChunk(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	token := r.PathValue("token")
	chunkIndexStr := r.PathValue("idx")

	chunkIndex, err := strconv.Atoi(chunkIndexStr)
	if err != nil {
		http.Error(w, `{"error":"invalid chunk index"}`, http.StatusBadRequest)
		return
	}

	share, err := s.db.GetShareByToken(ctx, token)
	if err != nil {
		http.Error(w, `{"error":"share not found"}`, http.StatusNotFound)
		return
	}

	if reason, valid := validateShare(share); !valid {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, reason), http.StatusForbidden)
		return
	}

	if !validateSharePassword(share, r.Header.Get("X-Share-Password")) {
		http.Error(w, `{"error":"password required"}`, http.StatusUnauthorized)
		return
	}

	// Get file (without user scoping — share grants access)
	file, err := s.db.GetFileByIDUnsafe(ctx, share.FileID)
	if err != nil {
		http.Error(w, `{"error":"file not found"}`, http.StatusNotFound)
		return
	}

	if chunkIndex < 0 || chunkIndex >= file.ChunkCount {
		http.Error(w, `{"error":"chunk index out of range"}`, http.StatusBadRequest)
		return
	}

	// Get chunk reference (use file owner's user_id)
	chunk, err := s.db.GetChunkByIndex(ctx, share.FileID, chunkIndex, share.UserID)
	if err != nil {
		http.Error(w, `{"error":"chunk not found"}`, http.StatusNotFound)
		return
	}

	// Resolve adapter using the FILE OWNER's platform credentials
	adapter := s.resolveAdapterForUser(ctx, share.UserID, chunk.Platform, chunk.Account)
	if adapter == nil {
		http.Error(w, `{"error":"platform adapter not available"}`, http.StatusInternalServerError)
		return
	}

	data, err := adapter.Download(ctx, *chunk)
	if err != nil {
		log.Printf("shares: download chunk failed: %v", err)
		http.Error(w, `{"error":"failed to download chunk"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	w.Header().Set("X-Chunk-SHA256", chunk.SHA256)
	if chunk.Compressed {
		w.Header().Set("X-Chunk-Compressed", "true")
	}
	w.Write(data)
}
