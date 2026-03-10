package cmd

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/zpush/zpush/adapters"
	"github.com/zpush/zpush/disguise"
	"github.com/zpush/zpush/pipeline"
	"github.com/zpush/zpush/types"
)

// Max encrypted chunk size: 10MB data + 12B IV + 16B tag + margin
const maxChunkSize = 11 * 1024 * 1024

// HandleUploadInit creates a new chunked upload session.
// POST /api/upload/init
func (s *Server) HandleUploadInit(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	var req types.UploadInitRequest
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

	// Decode salt
	salt, err := base64.StdEncoding.DecodeString(req.Salt)
	if err != nil || len(salt) != 32 {
		http.Error(w, `{"error":"salt must be 32 bytes base64-encoded"}`, http.StatusBadRequest)
		return
	}

	// Enforce storage quota
	if !s.isQuotaExempt(ctx, userID) {
		quota := s.getEffectiveQuota(ctx, userID)
		if quota > 0 {
			used, err := s.db.GetUserStorageUsed(ctx, userID)
			if err != nil {
				http.Error(w, `{"error":"check quota failed"}`, http.StatusInternalServerError)
				return
			}
			if used+req.OriginalSize > quota {
				http.Error(w, `{"error":"storage quota exceeded"}`, http.StatusForbidden)
				return
			}
		}
	}

	// Select adapter and get repo
	key, _, pool, err := s.selectAdapter(ctx, userID, req.Platform)
	if err != nil {
		http.Error(w, `{"error":"no platform connected"}`, http.StatusBadRequest)
		return
	}

	repo, err := pool.GetOrCreateRepo(ctx)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"get repo: %s"}`, err), http.StatusInternalServerError)
		return
	}

	// Extract platform and account from key
	parts := strings.SplitN(key, ":", 2)
	platform := parts[0]
	account := ""
	if len(parts) > 1 {
		account = parts[1]
	}

	// Create file record
	fileID := uuid.New().String()
	fileMeta := &types.FileMetadata{
		ID:           fileID,
		UserID:       userID,
		OriginalName: req.Filename,
		OriginalSize: req.OriginalSize,
		ChunkCount:   req.ChunkCount,
		SHA256:       req.SHA256,
		Salt:         salt,
		IV:           []byte{}, // not used for client-side encryption
		Status:       "uploading",
	}

	if err := s.db.InsertFile(ctx, userID, fileMeta); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"create file record: %s"}`, err), http.StatusInternalServerError)
		return
	}

	// Create upload session
	session := &types.UploadSession{
		UserID:       userID,
		FileID:       fileID,
		Filename:     req.Filename,
		OriginalSize: req.OriginalSize,
		Salt:         salt,
		SHA256:       req.SHA256,
		ChunkCount:   req.ChunkCount,
		Platform:     platform,
		Account:      account,
		RepoID:       repo.ID,
		RepoURL:      repo.URL,
	}

	sessionID, err := s.db.CreateUploadSession(ctx, session)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"create session: %s"}`, err), http.StatusInternalServerError)
		return
	}

	s.audit(r, &userID, "upload_init", map[string]interface{}{
		"file_id":    fileID,
		"session_id": sessionID,
		"filename":   req.Filename,
		"size":       req.OriginalSize,
		"chunks":     req.ChunkCount,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"session_id": sessionID,
		"file_id":    fileID,
		"repo_url":   repo.URL,
	})
}

// HandleChunkUpload receives a single pre-encrypted chunk and relays it to the platform.
// PUT /api/upload/{sid}/chunk/{idx}
func (s *Server) HandleChunkUpload(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

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

	// Validate session
	session, err := s.db.GetUploadSession(ctx, sessionID, userID)
	if err != nil {
		http.Error(w, `{"error":"upload session not found"}`, http.StatusNotFound)
		return
	}
	if session.Status != "active" {
		http.Error(w, `{"error":"upload session is not active"}`, http.StatusBadRequest)
		return
	}
	if chunkIndex < 0 || chunkIndex >= session.ChunkCount {
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
	existing, _ := s.db.GetChunkByIndex(ctx, session.FileID, chunkIndex)
	if existing != nil && existing.RemotePath != "" {
		// Already uploaded, return success
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"chunk_index": chunkIndex,
			"stored":      true,
			"duplicate":   true,
		})
		return
	}

	// Resolve adapter
	adapter := s.resolveAdapterForUser(ctx, userID, session.Platform, session.Account)
	if adapter == nil {
		http.Error(w, `{"error":"platform adapter not available"}`, http.StatusInternalServerError)
		return
	}

	// Generate disguised remote path
	remotePath, err := disguise.ChunkFilename()
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"generate filename: %s"}`, err), http.StatusInternalServerError)
		return
	}

	// Upload to platform
	chunkRef, err := adapter.Upload(ctx, session.RepoURL, types.Chunk{
		Ref: types.ChunkRef{
			FileID:     session.FileID,
			Index:      chunkIndex,
			Size:       int64(len(data)),
			SHA256:     actualHash,
			RemotePath: remotePath,
		},
		Data: data,
	})
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"upload to platform failed: %s"}`, err), http.StatusInternalServerError)
		return
	}

	// Store chunk reference in DB
	chunkID := uuid.New().String()
	dbChunk := &types.ChunkRef{
		ChunkID:    chunkID,
		FileID:     session.FileID,
		Index:      chunkIndex,
		Size:       int64(len(data)),
		SHA256:     actualHash,
		Platform:   session.Platform,
		Account:    session.Account,
		Repo:       session.RepoURL,
		RemotePath: chunkRef.RemotePath,
		Compressed: compressed,
	}

	if err := s.db.InsertClientChunk(ctx, userID, dbChunk); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"store chunk ref: %s"}`, err), http.StatusInternalServerError)
		return
	}

	// Increment session counter
	if err := s.db.IncrementSessionChunks(ctx, sessionID); err != nil {
		// Non-fatal — the chunk is already stored
		fmt.Printf("warn: increment session chunks: %v\n", err)
	}

	// Emit progress
	percent := int(float64(session.UploadedChunks+1) / float64(session.ChunkCount) * 100)
	s.progress.Emit(types.ProgressEvent{
		FileID:         session.FileID,
		Stage:          fmt.Sprintf("uploading chunk %d/%d", chunkIndex+1, session.ChunkCount),
		Percent:        percent,
		BytesProcessed: int64(len(data)),
		TotalBytes:     session.OriginalSize,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"chunk_index": chunkIndex,
		"stored":      true,
	})
}

// HandleUploadComplete finalizes a chunked upload.
// POST /api/upload/{sid}/complete
func (s *Server) HandleUploadComplete(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	sessionID := r.PathValue("sid")

	var req types.UploadCompleteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Validate session
	session, err := s.db.GetUploadSession(ctx, sessionID, userID)
	if err != nil {
		http.Error(w, `{"error":"upload session not found"}`, http.StatusNotFound)
		return
	}
	if session.Status != "active" {
		http.Error(w, `{"error":"upload session is not active"}`, http.StatusBadRequest)
		return
	}

	// Verify all chunks uploaded
	uploadedIndices, err := s.db.GetUploadedChunkIndices(ctx, session.FileID)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"check chunks: %s"}`, err), http.StatusInternalServerError)
		return
	}
	if len(uploadedIndices) != session.ChunkCount {
		http.Error(w, fmt.Sprintf(`{"error":"expected %d chunks, got %d"}`, session.ChunkCount, len(uploadedIndices)), http.StatusBadRequest)
		return
	}

	// Flush batch commits if adapter supports it (e.g., HuggingFace)
	adapter := s.resolveAdapterForUser(ctx, userID, session.Platform, session.Account)
	if bc, ok := adapter.(adapters.BatchCommitter); ok {
		if err := bc.FlushCommits(ctx, session.RepoURL); err != nil {
			http.Error(w, fmt.Sprintf(`{"error":"finalize platform upload: %s"}`, err), http.StatusInternalServerError)
			return
		}
	}

	// Update repo usage
	pools, _ := s.getUserPools(ctx, userID)
	key := session.Platform + ":" + session.Account
	if pool, ok := pools[key]; ok {
		if err := pool.UpdateUsage(session.RepoID, req.EncryptedSize); err != nil {
			fmt.Printf("warn: update repo usage: %v\n", err)
		}
	}

	// Update file sizes and status
	if err := s.db.UpdateFileSizes(ctx, session.FileID, req.CompressedSize, req.EncryptedSize); err != nil {
		fmt.Printf("warn: update file sizes: %v\n", err)
	}
	if err := s.db.UpdateFileStatus(ctx, session.FileID, "complete"); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"update file status: %s"}`, err), http.StatusInternalServerError)
		return
	}

	// Complete session
	if err := s.db.CompleteUploadSession(ctx, sessionID); err != nil {
		fmt.Printf("warn: complete session: %v\n", err)
	}

	// Emit completion event
	s.progress.Emit(types.ProgressEvent{
		FileID:  session.FileID,
		Stage:   "done",
		Percent: 100,
	})

	s.audit(r, &userID, "upload_complete", map[string]interface{}{
		"file_id":    session.FileID,
		"session_id": sessionID,
		"filename":   session.Filename,
		"chunks":     session.ChunkCount,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"file_id": session.FileID,
	})
}

// HandleUploadCancel cancels an active upload session.
// DELETE /api/upload/{sid}
func (s *Server) HandleUploadCancel(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	sessionID := r.PathValue("sid")

	session, err := s.db.GetUploadSession(ctx, sessionID, userID)
	if err != nil {
		http.Error(w, `{"error":"upload session not found"}`, http.StatusNotFound)
		return
	}
	if session.Status != "active" {
		http.Error(w, `{"error":"upload session is not active"}`, http.StatusBadRequest)
		return
	}

	// Cancel session
	if err := s.db.CancelUploadSession(ctx, sessionID); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"cancel session: %s"}`, err), http.StatusInternalServerError)
		return
	}

	// Delete file and queue chunks for remote deletion
	if err := s.db.DeleteFile(ctx, userID, session.FileID); err != nil {
		fmt.Printf("warn: delete file on cancel: %v\n", err)
	}

	// Emit error event so frontend knows
	s.progress.Emit(pipeline.ErrorEvent(session.FileID, "upload cancelled"))

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
	})
}

// HandleUploadStatus returns the status of an upload session including which chunks are uploaded.
// GET /api/upload/{sid}/status
func (s *Server) HandleUploadStatus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	sessionID := r.PathValue("sid")

	session, err := s.db.GetUploadSession(ctx, sessionID, userID)
	if err != nil {
		http.Error(w, `{"error":"upload session not found"}`, http.StatusNotFound)
		return
	}

	uploadedIndices, err := s.db.GetUploadedChunkIndices(ctx, session.FileID)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"get chunk status: %s"}`, err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"session_id":       session.ID,
		"file_id":          session.FileID,
		"status":           session.Status,
		"chunk_count":      session.ChunkCount,
		"uploaded_chunks":  uploadedIndices,
		"completed_count":  len(uploadedIndices),
	})
}
