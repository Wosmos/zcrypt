package cmd

import (
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/zcrypt/zcrypt/auth"
	"github.com/zcrypt/zcrypt/config"
	"github.com/zcrypt/zcrypt/index"
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
		Name         string `json:"name,omitempty"`        // file name sealed (enc1:) under the share key
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
	if !isSealedLinkName(req.Name) {
		http.Error(w, `{"error":"name must be sealed under the link key"}`, http.StatusBadRequest)
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
		EncName:      req.Name,
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
	// Only reveal file metadata if no password is set, password-protected shares
	// must not leak filename/size until the password is provided via /meta endpoint.
	if !share.HasPassword {
		resp["file_name"] = shareFileName(share, file)
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
		writeError(w, http.StatusForbidden, reason)
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

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":            file.ID,
		"original_name": shareFileName(share, file),
		// Public endpoint: coarsen the size to a band and DROP compressed_size /
		// encrypted_size (they'd let a link-holder reconstruct the exact size).
		// chunk_count stays: the recipient needs it to download.
		"original_size": SizeBucket(file.OriginalSize),
		"chunk_count":   file.ChunkCount,
		"sha256":        file.SHA256,
		"sha256_scheme": file.SHA256Scheme,
		"salt":          base64.StdEncoding.EncodeToString(file.Salt),
		// The CEK wrapped under the share key (from the share, NOT the file's
		// passphrase-wrapped CEK). The recipient unwraps this with the key in
		// the share URL fragment, no passphrase needed.
		"wrapped_cek": share.WrappedCEK,
		"status":      file.Status,
		"created_at":  CoarsenTimeUTC(file.CreatedAt),
		// The download counts only when the client confirms completion with this.
		"download_ticket": s.issueShareTicket(share.ID, ""),
	})
}

// HandleCompleteShareDownload counts one finished download of a file link.
// POST /api/share/{token}/complete
func (s *Server) HandleCompleteShareDownload(w http.ResponseWriter, r *http.Request) {
	share, err := s.db.GetShareByToken(r.Context(), r.PathValue("token"))
	if err != nil {
		http.Error(w, `{"error":"share not found"}`, http.StatusNotFound)
		return
	}
	s.completeShareDownload(w, r, share.ID, "", func(nonce string) (index.DownloadCompletion, error) {
		return s.db.CompleteShareDownload(r.Context(), share.ID, nonce)
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

	if reason, valid := validateShare(share); !valid &&
		!linkOpenForChunk(share.Revoked, share.ExpiresAt, true, s.shareTicketLive(r, share.ID, "")) {
		writeError(w, http.StatusForbidden, reason)
		return
	}

	if !validateSharePassword(share, r.Header.Get("X-Share-Password")) {
		http.Error(w, `{"error":"password required"}`, http.StatusUnauthorized)
		return
	}

	// Get file (without user scoping, share grants access)
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

	commit := s.linkChunkCommit(r, share.ID, "", chunkIndex, file.ChunkCount, share.MaxDownloads > 0, func(nonce string) (index.DownloadCompletion, error) {
		return s.db.CompleteShareDownload(ctx, share.ID, nonce)
	})
	s.serveLinkChunk(w, r, share.UserID, chunk, "shares", commit)
}

// isSealedLinkName accepts an empty name (older clients) or one sealed with the
// enc1: prefix, so a plaintext file name can never be stored on a public link.
func isSealedLinkName(name string) bool {
	return name == "" || (strings.HasPrefix(name, "enc1:") && len(name) <= maxSealedLinkName)
}

const maxSealedLinkName = 4096

// shareFileName is the name a recipient opens: the link-sealed name, falling back
// to the file's legacy plaintext name for links created before names were sealed.
func shareFileName(share *types.ShareLink, file *types.FileMetadata) string {
	if share.EncName != "" {
		return share.EncName
	}
	return file.OriginalName
}

// serveLinkChunk streams a chunk's ciphertext for a public link, resolved the
// same way the owner download does: staging while the chunk is unsynced, then
// the local ciphertext cache, then the OWNER's storage adapter (write-through).
func (s *Server) serveLinkChunk(w http.ResponseWriter, r *http.Request, ownerID string, chunk *types.ChunkRef, logPrefix string, commit func() (bool, error)) {
	var data []byte
	if chunk.RemotePath == "" {
		stagingDir, err := config.StagingDir()
		if err != nil {
			http.Error(w, `{"error":"staging not available"}`, http.StatusInternalServerError)
			return
		}
		name := filepath.Base(chunk.ChunkID) + ".enc"
		data, err = os.ReadFile(filepath.Clean(filepath.Join(stagingDir, name)))
		if err != nil {
			log.Printf("%s: read staging file failed: %v", logPrefix, err)
			http.Error(w, `{"error":"chunk data not available yet"}`, http.StatusInternalServerError)
			return
		}
	} else if data = readCachedChunk(chunk.ChunkID); data == nil {
		adapter := s.resolveAdapterForUser(r.Context(), ownerID, chunk.Platform, chunk.Account)
		if adapter == nil {
			if reason := s.adapterError(ownerID, chunk.Platform); reason != "" {
				writeJSON(w, http.StatusBadGateway, map[string]string{
					"error":    chunk.Platform + " is unreachable from the server",
					"platform": chunk.Platform,
					"reason":   "adapter_unavailable",
				})
				return
			}
			http.Error(w, `{"error":"platform adapter not available"}`, http.StatusInternalServerError)
			return
		}
		var err error
		data, err = adapter.Download(r.Context(), *chunk)
		if err != nil {
			log.Printf("%s: download chunk failed: %v", logPrefix, err)
			http.Error(w, `{"error":"failed to download chunk"}`, http.StatusInternalServerError)
			return
		}
		writeCachedChunk(chunk.ChunkID, data)
	}

	if commit != nil {
		ok, err := commit()
		if err != nil {
			log.Printf("%s: record download failed: %v", logPrefix, err)
			http.Error(w, `{"error":"failed to record download"}`, http.StatusInternalServerError)
			return
		}
		if !ok {
			http.Error(w, `{"error":"download limit reached"}`, http.StatusForbidden)
			return
		}
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	w.Header().Set("X-Chunk-SHA256", chunk.SHA256)
	if chunk.Compressed {
		w.Header().Set("X-Chunk-Compressed", "true")
	}
	w.Write(data)
}
