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
	"golang.org/x/crypto/bcrypt"

	"github.com/zcrypt/zcrypt/auth"
	"github.com/zcrypt/zcrypt/index"
	"github.com/zcrypt/zcrypt/types"
)

// ── Authenticated folder-share management ──

// HandleCreateFolderShare creates a public link for a whole folder. The caller
// generates a random folder-share key client-side, re-wraps each contained
// file's CEK under it, and sends the opaque envelopes here. The key itself lives
// only in the URL fragment and never reaches the server.
// POST /api/folder-shares
func (s *Server) HandleCreateFolderShare(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	var req types.CreateFolderShareRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if len(req.Files) == 0 {
		http.Error(w, `{"error":"a folder link needs at least one file"}`, http.StatusBadRequest)
		return
	}

	// Verify EVERY file belongs to the caller and carries a wrapped CEK. You can
	// only share files you own and can decrypt.
	for _, f := range req.Files {
		if f.FileID == "" || f.WrappedCEK == "" {
			http.Error(w, `{"error":"each file needs a file_id and wrapped_cek"}`, http.StatusBadRequest)
			return
		}
		if !isSealedLinkName(f.EncName) {
			http.Error(w, `{"error":"file names must be sealed under the link key"}`, http.StatusBadRequest)
			return
		}
		if _, err := s.db.GetFileByID(ctx, userID, f.FileID); err != nil {
			http.Error(w, `{"error":"one of the files was not found"}`, http.StatusNotFound)
			return
		}
	}

	token, err := auth.GenerateRandomToken()
	if err != nil {
		http.Error(w, `{"error":"failed to generate token"}`, http.StatusInternalServerError)
		return
	}

	share := &types.FolderShare{
		ID:           uuid.New().String(),
		UserID:       userID,
		Name:         req.Name,
		Token:        token,
		MaxDownloads: req.MaxDownloads,
	}
	if req.FolderID != "" {
		share.FolderID = &req.FolderID
	}
	if req.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			http.Error(w, `{"error":"failed to hash password"}`, http.StatusInternalServerError)
			return
		}
		share.PasswordHash = string(hash)
	}
	if req.ExpiresHours > 0 {
		exp := time.Now().Add(time.Duration(req.ExpiresHours) * time.Hour)
		share.ExpiresAt = &exp
	}

	if err := s.db.CreateFolderShare(ctx, share, req.Files); err != nil {
		log.Printf("folder-shares: create failed: %v", err)
		http.Error(w, `{"error":"failed to create folder link"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"id": share.ID, "token": share.Token})
}

// HandleListFolderShares lists the caller's folder shares.
// GET /api/folder-shares?folder_id=optional
func (s *Server) HandleListFolderShares(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	folderID := r.URL.Query().Get("folder_id")

	shares, err := s.db.ListFolderSharesByUser(ctx, userID, folderID)
	if err != nil {
		log.Printf("folder-shares: list failed: %v", err)
		http.Error(w, `{"error":"failed to list folder links"}`, http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(shares)
}

// HandleRevokeFolderShare revokes a folder link.
// DELETE /api/folder-shares/{id}
func (s *Server) HandleRevokeFolderShare(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	shareID := r.PathValue("id")
	if shareID == "" {
		http.Error(w, `{"error":"share id required"}`, http.StatusBadRequest)
		return
	}
	if err := s.db.RevokeFolderShare(ctx, userID, shareID); err != nil {
		http.Error(w, `{"error":"folder link not found"}`, http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"success":true}`))
}

// ── Public folder-share access (no auth) ──

func validateFolderShare(s *types.FolderShare) (string, bool) {
	if s.Revoked || (s.ExpiresAt != nil && time.Now().After(*s.ExpiresAt)) ||
		(s.MaxDownloads > 0 && s.DownloadCount >= s.MaxDownloads) {
		return "this link is no longer available", false
	}
	return "", true
}

func validateFolderSharePassword(s *types.FolderShare, password string) bool {
	if s.PasswordHash == "" {
		return true
	}
	if password == "" {
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(s.PasswordHash), []byte(password)) == nil
}

// HandleGetFolderShareInfo returns public info + the file listing for a folder
// link. The file list (and per-file wrapped CEKs) is withheld until the password
// is supplied (via the /meta calls) when one is set.
// GET /api/folder-share/{token}
func (s *Server) HandleGetFolderShareInfo(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	token := r.PathValue("token")
	if token == "" {
		http.Error(w, `{"error":"token required"}`, http.StatusBadRequest)
		return
	}

	share, err := s.db.GetFolderShareByToken(ctx, token)
	if err != nil {
		http.Error(w, `{"error":"folder link not found"}`, http.StatusNotFound)
		return
	}
	reason, valid := validateFolderShare(share)

	resp := map[string]interface{}{
		"valid":        valid,
		"has_password": share.HasPassword,
		"name":         share.Name,
	}
	if !valid {
		resp["reason"] = reason
	} else if !share.HasPassword || validateFolderSharePassword(share, r.Header.Get("X-Share-Password")) {
		// No password (or the correct one was supplied): reveal the file listing.
		// Strip the wrapped CEK here (the public listing shows names/sizes; CEKs
		// come per-file from /meta).
		files, err := s.db.ListFolderShareFiles(ctx, share.ID)
		if err != nil {
			http.Error(w, `{"error":"failed to load folder"}`, http.StatusInternalServerError)
			return
		}
		for i := range files {
			files[i].WrappedCEK = ""
		}
		resp["files"] = files
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// authorizeFolderShareFile validates the token + optional password and confirms
// the file belongs to the share, returning the share, the file, the file's
// wrapped CEK and its link-sealed name. Writes the appropriate HTTP error and
// returns ok=false otherwise.
func (s *Server) authorizeFolderShareFile(w http.ResponseWriter, r *http.Request, token, fileID string, allowTicket bool) (*types.FolderShare, *types.FileMetadata, string, string, bool) {
	ctx := r.Context()
	share, err := s.db.GetFolderShareByToken(ctx, token)
	if err != nil {
		http.Error(w, `{"error":"folder link not found"}`, http.StatusNotFound)
		return nil, nil, "", "", false
	}
	if reason, valid := validateFolderShare(share); !valid &&
		(!allowTicket || !linkOpenForChunk(share.Revoked, share.ExpiresAt, true, s.shareTicketLive(r, share.ID, fileID))) {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, reason), http.StatusForbidden)
		return nil, nil, "", "", false
	}
	if !validateFolderSharePassword(share, r.Header.Get("X-Share-Password")) {
		http.Error(w, `{"error":"password required"}`, http.StatusUnauthorized)
		return nil, nil, "", "", false
	}
	wrapped, name, err := s.db.GetFolderShareFileWrap(ctx, share.ID, fileID)
	if err != nil {
		http.Error(w, `{"error":"file not in this folder link"}`, http.StatusNotFound)
		return nil, nil, "", "", false
	}
	file, err := s.db.GetFileByIDUnsafe(ctx, fileID)
	if err != nil {
		http.Error(w, `{"error":"file not found"}`, http.StatusNotFound)
		return nil, nil, "", "", false
	}
	return share, file, wrapped, name, true
}

// HandleGetFolderShareFileMeta returns one file's metadata + its folder-wrapped
// CEK for a valid folder link.
// GET /api/folder-share/{token}/files/{fid}/meta
func (s *Server) HandleGetFolderShareFileMeta(w http.ResponseWriter, r *http.Request) {
	token := r.PathValue("token")
	fileID := r.PathValue("fid")

	share, file, wrapped, name, ok := s.authorizeFolderShareFile(w, r, token, fileID, false)
	if !ok {
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":            file.ID,
		"original_name": name,
		// Public endpoint: coarsen size + drop the precision-leaking size fields.
		"original_size": SizeBucket(file.OriginalSize),
		"chunk_count":   file.ChunkCount,
		"sha256":        file.SHA256,
		"sha256_scheme": file.SHA256Scheme,
		"salt":          base64.StdEncoding.EncodeToString(file.Salt),
		"wrapped_cek":   wrapped,
		"status":        file.Status,
		"created_at":    CoarsenTimeUTC(file.CreatedAt),
		// Each file counts against the cap only when the client confirms it finished.
		"download_ticket": s.issueShareTicket(share.ID, fileID),
	})
}

// HandleCompleteFolderShareDownload counts one finished file download.
// POST /api/folder-share/{token}/files/{fid}/complete
func (s *Server) HandleCompleteFolderShareDownload(w http.ResponseWriter, r *http.Request) {
	share, err := s.db.GetFolderShareByToken(r.Context(), r.PathValue("token"))
	if err != nil {
		http.Error(w, `{"error":"folder link not found"}`, http.StatusNotFound)
		return
	}
	fileID := r.PathValue("fid")
	s.completeShareDownload(w, r, share.ID, fileID, func(nonce string) (index.DownloadCompletion, error) {
		return s.db.CompleteFolderShareDownload(r.Context(), share.ID, nonce)
	})
}

// HandleGetFolderShareChunk streams a single encrypted chunk for a file in a
// folder link, resolved through the file owner's storage backend.
// GET /api/folder-share/{token}/files/{fid}/chunks/{idx}
func (s *Server) HandleGetFolderShareChunk(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	token := r.PathValue("token")
	fileID := r.PathValue("fid")

	chunkIndex, err := strconv.Atoi(r.PathValue("idx"))
	if err != nil {
		http.Error(w, `{"error":"invalid chunk index"}`, http.StatusBadRequest)
		return
	}

	share, file, _, _, ok := s.authorizeFolderShareFile(w, r, token, fileID, true)
	if !ok {
		return
	}
	if chunkIndex < 0 || chunkIndex >= file.ChunkCount {
		http.Error(w, `{"error":"chunk index out of range"}`, http.StatusBadRequest)
		return
	}

	// Chunks are owner-scoped: resolve through the sharer's (owner's) storage.
	chunk, err := s.db.GetChunkByIndex(ctx, fileID, chunkIndex, share.UserID)
	if err != nil {
		http.Error(w, `{"error":"chunk not found"}`, http.StatusNotFound)
		return
	}
	commit := s.linkChunkCommit(r, share.ID, fileID, chunkIndex, file.ChunkCount, share.MaxDownloads > 0, func(nonce string) (index.DownloadCompletion, error) {
		return s.db.CompleteFolderShareDownload(ctx, share.ID, nonce)
	})
	s.serveLinkChunk(w, r, share.UserID, chunk, "folder-shares", commit)
}
