package cmd

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
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
		http.Error(w, fmt.Sprintf(`{"error":"create share: %s"}`, err), http.StatusInternalServerError)
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
		http.Error(w, fmt.Sprintf(`{"error":"list shares: %s"}`, err), http.StatusInternalServerError)
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
	if share.Revoked {
		return "link has been revoked", false
	}
	if share.ExpiresAt != nil && time.Now().After(*share.ExpiresAt) {
		return "link has expired", false
	}
	if share.MaxDownloads > 0 && share.DownloadCount >= share.MaxDownloads {
		return "download limit reached", false
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

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"valid":        valid,
		"reason":       reason,
		"file_name":    file.OriginalName,
		"file_size":    file.OriginalSize,
		"chunk_count":  file.ChunkCount,
		"has_password": share.HasPassword,
	})
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
		"id":              file.ID,
		"original_name":   file.OriginalName,
		"original_size":   file.OriginalSize,
		"compressed_size": file.CompressedSize,
		"encrypted_size":  file.EncryptedSize,
		"chunk_count":     file.ChunkCount,
		"sha256":          file.SHA256,
		"salt":            base64.StdEncoding.EncodeToString(file.Salt),
		"status":          file.Status,
		"created_at":      file.CreatedAt,
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
		http.Error(w, fmt.Sprintf(`{"error":"download chunk: %s"}`, err), http.StatusInternalServerError)
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
