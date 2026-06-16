package cmd

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/zcrypt/zcrypt/adapters"
	"github.com/zcrypt/zcrypt/auth"
	"github.com/zcrypt/zcrypt/disguise"
	"github.com/zcrypt/zcrypt/types"
)

// maxSendFileSize is the maximum file size for anonymous sends (50 MB).
const maxSendFileSize = 50 * 1024 * 1024

// HandleSendInit creates a new anonymous send transfer.
// POST /api/send/init
func (s *Server) HandleSendInit(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req types.SendInitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.Filename == "" || req.OriginalSize <= 0 || req.SHA256 == "" || req.Salt == "" || req.ChunkCount <= 0 {
		http.Error(w, `{"error":"filename, original_size, sha256, salt, and chunk_count are required"}`, http.StatusBadRequest)
		return
	}

	// Validate filename
	if strings.Contains(req.Filename, "..") || strings.Contains(req.Filename, "/") ||
		strings.Contains(req.Filename, "\\") || len(req.Filename) > 255 {
		http.Error(w, `{"error":"invalid filename"}`, http.StatusBadRequest)
		return
	}

	// Enforce size limit for anonymous sends
	if req.OriginalSize > maxSendFileSize {
		http.Error(w, `{"error":"file too large, maximum 50 MB for anonymous sends"}`, http.StatusBadRequest)
		return
	}

	// Decode salt
	salt, err := base64.StdEncoding.DecodeString(req.Salt)
	if err != nil || len(salt) != 32 {
		http.Error(w, `{"error":"salt must be 32 bytes base64-encoded"}`, http.StatusBadRequest)
		return
	}

	// Select global adapter for anonymous upload
	adapterKey, _, err := s.selectGlobalAdapter(ctx)
	if err != nil {
		log.Printf("send: no global adapter: %v", err)
		http.Error(w, `{"error":"send service not available — no global storage configured"}`, http.StatusServiceUnavailable)
		return
	}

	parts := strings.SplitN(adapterKey, ":", 2)
	platform := parts[0]
	account := ""
	if len(parts) > 1 {
		account = parts[1]
	}

	// Generate token
	token, err := auth.GenerateRandomToken()
	if err != nil {
		log.Printf("send: generate token: %v", err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// Determine expiry
	expiresHours := 24
	if req.ExpiresHours > 0 && req.ExpiresHours <= 24 {
		expiresHours = req.ExpiresHours
	}

	transferID := uuid.New().String()
	transfer := &types.SendTransfer{
		ID:            transferID,
		Token:         token,
		OriginalName:  req.Filename,
		OriginalSize:  req.OriginalSize,
		ChunkCount:    req.ChunkCount,
		SHA256:        req.SHA256,
		Salt:          salt,
		Status:        "uploading",
		BurnAfterRead: req.BurnAfterRead,
		ExpiresAt:     time.Now().Add(time.Duration(expiresHours) * time.Hour),
		SenderIP:      extractIP(r),
	}

	if err := s.db.CreateSendTransfer(ctx, transfer); err != nil {
		log.Printf("send: create transfer: %v", err)
		http.Error(w, `{"error":"failed to create transfer"}`, http.StatusInternalServerError)
		return
	}

	s.audit(r, nil, "send_init", map[string]interface{}{
		"transfer_id": transferID,
		"filename":    req.Filename,
		"size":        req.OriginalSize,
		"platform":    platform,
		"account":     account,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"session_id": transferID,
		"token":      token,
		"platform":   platform,
	})
}

// HandleSendChunkUpload receives an encrypted chunk for an anonymous send.
// PUT /api/send/{sid}/chunk/{idx}
func (s *Server) HandleSendChunkUpload(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	sessionID := r.PathValue("sid")
	chunkIndexStr := r.PathValue("idx")
	chunkIndex, err := strconv.Atoi(chunkIndexStr)
	if err != nil {
		http.Error(w, `{"error":"invalid chunk index"}`, http.StatusBadRequest)
		return
	}

	expectedHash := r.Header.Get("X-Chunk-SHA256")
	if expectedHash == "" {
		http.Error(w, `{"error":"X-Chunk-SHA256 header required"}`, http.StatusBadRequest)
		return
	}

	compressed := r.Header.Get("X-Chunk-Compressed") == "true"

	// Acquire server-wide semaphore
	select {
	case chunkUploadSem <- struct{}{}:
		defer func() { <-chunkUploadSem }()
	case <-ctx.Done():
		http.Error(w, `{"error":"request cancelled"}`, http.StatusServiceUnavailable)
		return
	}

	// Validate transfer
	transfer, err := s.db.GetSendTransferByID(ctx, sessionID)
	if err != nil {
		http.Error(w, `{"error":"send session not found"}`, http.StatusNotFound)
		return
	}
	if transfer.Status != "uploading" {
		http.Error(w, `{"error":"send session is not active"}`, http.StatusBadRequest)
		return
	}
	if chunkIndex < 0 || chunkIndex >= transfer.ChunkCount {
		http.Error(w, `{"error":"chunk index out of range"}`, http.StatusBadRequest)
		return
	}

	// Read chunk body
	data, err := io.ReadAll(io.LimitReader(r.Body, int64(maxChunkSize)))
	if err != nil {
		http.Error(w, `{"error":"failed to read chunk data"}`, http.StatusBadRequest)
		return
	}

	if len(data) < 28 { // minimum: 12B IV + 16B tag
		http.Error(w, `{"error":"chunk too small"}`, http.StatusBadRequest)
		return
	}

	// Verify SHA-256
	hash := sha256.Sum256(data)
	actualHash := hex.EncodeToString(hash[:])
	if actualHash != expectedHash {
		http.Error(w, `{"error":"chunk hash mismatch"}`, http.StatusBadRequest)
		return
	}

	// Idempotency: check if chunk already uploaded
	existing, _ := s.db.GetSendChunkByIndex(ctx, transfer.ID, chunkIndex)
	if existing != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"chunk_index": chunkIndex,
			"stored":      true,
			"duplicate":   true,
		})
		return
	}

	// Get global adapter
	adapterKey, adapter, err := s.selectGlobalAdapter(ctx)
	if err != nil {
		log.Printf("send: no global adapter for chunk upload: %v", err)
		http.Error(w, `{"error":"storage not available"}`, http.StatusInternalServerError)
		return
	}

	// Get or create send repo
	repoURL, err := s.getSendRepo(ctx, adapter)
	if err != nil {
		log.Printf("send: get send repo: %v", err)
		http.Error(w, `{"error":"storage not available"}`, http.StatusInternalServerError)
		return
	}

	// Generate disguised remote path
	remotePath, err := disguise.ChunkFilename()
	if err != nil {
		log.Printf("send: generate filename: %v", err)
		http.Error(w, `{"error":"upload failed"}`, http.StatusInternalServerError)
		return
	}

	// Acquire per-repo slot
	releaseRepo, err := acquireRepoSlot(ctx, repoURL)
	if err != nil {
		http.Error(w, `{"error":"request cancelled"}`, http.StatusServiceUnavailable)
		return
	}
	defer releaseRepo()

	// Upload to platform
	chunkRef, err := adapter.Upload(ctx, repoURL, types.Chunk{
		Ref: types.ChunkRef{
			FileID:     transfer.ID,
			Index:      chunkIndex,
			Size:       int64(len(data)),
			SHA256:     actualHash,
			RemotePath: remotePath,
		},
		Data: data,
	})
	if err != nil {
		log.Printf("send: platform upload failed: %v", err)
		http.Error(w, `{"error":"upload to storage failed"}`, http.StatusInternalServerError)
		return
	}

	// Extract platform info from the adapter key resolved above (reuse it —
	// re-selecting here could pick a different adapter or swallow an error,
	// storing a chunk row with an empty platform/account that can't be downloaded).
	parts := strings.SplitN(adapterKey, ":", 2)
	platform := parts[0]
	adapterAccount := ""
	if len(parts) > 1 {
		adapterAccount = parts[1]
	}

	// Store chunk reference
	sendChunk := &types.SendChunk{
		TransferID: transfer.ID,
		Index:      chunkIndex,
		Size:       int64(len(data)),
		SHA256:     actualHash,
		Platform:   platform,
		Account:    adapterAccount,
		Repo:       repoURL,
		RemotePath: chunkRef.RemotePath,
		Compressed: compressed,
	}

	if err := s.db.InsertSendChunk(ctx, sendChunk); err != nil {
		log.Printf("send: store chunk ref: %v", err)
		http.Error(w, `{"error":"failed to store chunk"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"chunk_index": chunkIndex,
		"stored":      true,
	})
}

// HandleSendComplete finalizes an anonymous send transfer.
// POST /api/send/{sid}/complete
func (s *Server) HandleSendComplete(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	sessionID := r.PathValue("sid")

	// Validate transfer
	transfer, err := s.db.GetSendTransferByID(ctx, sessionID)
	if err != nil {
		http.Error(w, `{"error":"send session not found"}`, http.StatusNotFound)
		return
	}
	if transfer.Status != "uploading" {
		http.Error(w, `{"error":"send session is not active"}`, http.StatusBadRequest)
		return
	}

	// Verify all chunks uploaded
	chunkCount, err := s.db.CountSendChunks(ctx, transfer.ID)
	if err != nil {
		log.Printf("send: count chunks: %v", err)
		http.Error(w, `{"error":"failed to verify chunks"}`, http.StatusInternalServerError)
		return
	}
	if chunkCount < transfer.ChunkCount {
		http.Error(w, fmt.Sprintf(`{"error":"missing chunks: %d/%d uploaded"}`, chunkCount, transfer.ChunkCount), http.StatusBadRequest)
		return
	}

	// Get total encrypted size
	totalSize, _ := s.db.GetTotalSendChunkSize(ctx, transfer.ID)

	// Update transfer status
	if err := s.db.UpdateSendTransferSize(ctx, transfer.ID, totalSize); err != nil {
		log.Printf("send: update size: %v", err)
	}
	if err := s.db.UpdateSendTransferStatus(ctx, transfer.ID, "complete"); err != nil {
		log.Printf("send: update status: %v", err)
		http.Error(w, `{"error":"failed to finalize transfer"}`, http.StatusInternalServerError)
		return
	}

	s.audit(r, nil, "send_complete", map[string]interface{}{
		"transfer_id": transfer.ID,
		"filename":    transfer.OriginalName,
		"size":        transfer.OriginalSize,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"token": transfer.Token,
	})
}

// HandleGetSendInfo returns public info about a send transfer.
// GET /api/send/{token}
func (s *Server) HandleGetSendInfo(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	token := r.PathValue("token")

	transfer, err := s.db.GetSendTransferByToken(ctx, token)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"valid":  false,
			"reason": "transfer not found",
		})
		return
	}

	reason, valid := validateSendTransfer(transfer)
	if !valid {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"valid":  false,
			"reason": reason,
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"valid":           true,
		"file_name":       transfer.OriginalName,
		"file_size":       transfer.OriginalSize,
		"burn_after_read": transfer.BurnAfterRead,
		"expires_at":      transfer.ExpiresAt,
	})
}

// HandleGetSendMeta returns file metadata needed for decryption.
// GET /api/send/{token}/meta
func (s *Server) HandleGetSendMeta(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	token := r.PathValue("token")

	transfer, err := s.db.GetSendTransferByToken(ctx, token)
	if err != nil {
		http.Error(w, `{"error":"transfer not found"}`, http.StatusNotFound)
		return
	}

	reason, valid := validateSendTransfer(transfer)
	if !valid {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, reason), http.StatusGone)
		return
	}

	// Increment download counter
	if err := s.db.IncrementSendDownloads(ctx, transfer.ID); err != nil {
		log.Printf("send: increment downloads: %v", err)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"salt":          base64.StdEncoding.EncodeToString(transfer.Salt),
		"sha256":        transfer.SHA256,
		"chunk_count":   transfer.ChunkCount,
		"original_size": transfer.OriginalSize,
	})
}

// HandleGetSendChunk downloads an encrypted chunk from a send transfer.
// GET /api/send/{token}/chunks/{idx}
func (s *Server) HandleGetSendChunk(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	token := r.PathValue("token")
	chunkIndexStr := r.PathValue("idx")
	chunkIndex, err := strconv.Atoi(chunkIndexStr)
	if err != nil {
		http.Error(w, `{"error":"invalid chunk index"}`, http.StatusBadRequest)
		return
	}

	transfer, err := s.db.GetSendTransferByToken(ctx, token)
	if err != nil {
		http.Error(w, `{"error":"transfer not found"}`, http.StatusNotFound)
		return
	}

	reason, valid := validateSendTransfer(transfer)
	if !valid {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, reason), http.StatusGone)
		return
	}

	chunk, err := s.db.GetSendChunkByIndex(ctx, transfer.ID, chunkIndex)
	if err != nil {
		http.Error(w, `{"error":"chunk not found"}`, http.StatusNotFound)
		return
	}

	// Get global adapter to download
	_, adapter, err := s.selectGlobalAdapter(ctx)
	if err != nil {
		log.Printf("send: no global adapter for chunk download: %v", err)
		http.Error(w, `{"error":"storage not available"}`, http.StatusInternalServerError)
		return
	}

	ref := types.ChunkRef{
		Platform:   chunk.Platform,
		Account:    chunk.Account,
		Repo:       chunk.Repo,
		RemotePath: chunk.RemotePath,
	}

	data, err := adapter.Download(ctx, ref)
	if err != nil {
		log.Printf("send: download chunk %d: %v", chunkIndex, err)
		http.Error(w, `{"error":"failed to download chunk"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("X-Chunk-SHA256", chunk.SHA256)
	if chunk.Compressed {
		w.Header().Set("X-Chunk-Compressed", "true")
	}
	w.Write(data)
}

// validateSendTransfer checks if a send transfer is still valid.
func validateSendTransfer(t *types.SendTransfer) (string, bool) {
	if t.Status != "complete" {
		return "transfer is not ready", false
	}
	if time.Now().After(t.ExpiresAt) {
		return "this link has expired", false
	}
	if t.BurnAfterRead && t.DownloadCount > 0 {
		return "this was a one-time link and has already been accessed", false
	}
	if t.MaxDownloads > 0 && t.DownloadCount >= t.MaxDownloads {
		return "download limit reached", false
	}
	return "", true
}

// getSendRepo returns the repo URL for anonymous sends, creating it if needed.
func (s *Server) getSendRepo(ctx context.Context, adapter adapters.PlatformAdapter) (string, error) {
	// Check if we have a stored send repo
	key := "send_repo_" + adapter.PlatformName()
	repoURL, err := s.db.GetSystemSetting(ctx, key)
	if err == nil && repoURL != "" {
		return repoURL, nil
	}

	// Create a new repo for sends
	repoName := disguise.RepoName(1)
	fullName, err := adapter.CreateRepo(ctx, repoName)
	if err != nil {
		return "", fmt.Errorf("create send repo: %w", err)
	}

	// Store for reuse
	if err := s.db.SetSystemSetting(ctx, key, fullName); err != nil {
		log.Printf("send: store send repo URL: %v", err)
	}

	return fullName, nil
}
