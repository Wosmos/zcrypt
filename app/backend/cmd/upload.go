package cmd

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"github.com/google/uuid"
	"github.com/zcrypt/zcrypt/adapters"
	"github.com/zcrypt/zcrypt/config"
	"github.com/zcrypt/zcrypt/reppool"
	"github.com/zcrypt/zcrypt/disguise"
	"github.com/zcrypt/zcrypt/index"
	"github.com/zcrypt/zcrypt/pipeline"
	"github.com/zcrypt/zcrypt/types"
)

// Max encrypted chunk size: 16MB data (ultra tier) + 12B IV + 16B tag + margin
const maxChunkSize = 17 * 1024 * 1024

// chunkUploadSem limits concurrent chunk uploads being processed server-wide.
// Each chunk can use ~35MB (raw data + base64 for GitHub API), so 10 concurrent = ~350MB.
// Suitable for containers with 1-4GB RAM. For direct upload platforms (HuggingFace),
// the data never passes through the server so this only applies to relay uploads (GitHub).
var chunkUploadSem = make(chan struct{}, 10)

// repoUploadSems limits concurrent relay uploads per repository.
// GitHub's Contents API creates one commit per file — concurrent commits to the same repo
// cause 409 SHA conflicts. Limiting to 2 concurrent uploads per repo drastically reduces
// contention while keeping throughput reasonable.
var repoUploadSems sync.Map // map[string]chan struct{}

const perRepoMaxConcurrent = 2

func acquireRepoSlot(ctx context.Context, repoURL string) (release func(), err error) {
	val, _ := repoUploadSems.LoadOrStore(repoURL, make(chan struct{}, perRepoMaxConcurrent))
	sem := val.(chan struct{})
	select {
	case sem <- struct{}{}:
		return func() { <-sem }, nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

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

	// Run independent DB lookups in parallel to cut round trips
	type initData struct {
		plan           string
		activeSessions int
		effectiveQuota int64
		adapterKey     string
		pool           *reppool.Manager
		adapterErr     error
	}

	var d initData
	var wg sync.WaitGroup

	// Group 1: user + plan (needed for size/concurrent checks)
	wg.Add(1)
	go func() {
		defer wg.Done()
		d.plan = "free"
		if user, uErr := s.db.GetUserByID(ctx, userID); uErr == nil && user != nil && user.Plan != "" {
			d.plan = user.Plan
		}
	}()

	// Group 2: active session count
	wg.Add(1)
	go func() {
		defer wg.Done()
		d.activeSessions, _ = s.db.CountActiveUploadSessions(ctx, userID)
	}()

	// Group 3: select adapter + repo pool
	wg.Add(1)
	go func() {
		defer wg.Done()
		var adapterPool *reppool.Manager
		key, _, adapterPool, err := s.selectAdapter(ctx, userID, req.Platform)
		if err != nil {
			d.adapterErr = err
			return
		}
		d.adapterKey = key
		d.pool = adapterPool
		_ = err // silence
		_ = key
	}()

	wg.Wait()

	// Enforce max file size per plan
	maxFileSize := s.getPlanMaxFileSize(ctx, d.plan)
	if req.OriginalSize > maxFileSize {
		http.Error(w, `{"error":"file exceeds your plan's size limit"}`, http.StatusForbidden)
		return
	}

	// Enforce concurrent upload session limit per plan
	maxConcurrent := s.getPlanMaxConcurrent(ctx, d.plan)
	if d.activeSessions >= maxConcurrent {
		http.Error(w, `{"error":"too many concurrent uploads"}`, http.StatusTooManyRequests)
		return
	}

	// Determine effective quota (0 = unlimited)
	var effectiveQuota int64
	if !s.isQuotaExempt(ctx, userID) {
		effectiveQuota = s.getEffectiveQuota(ctx, userID)
	}

	// Check adapter selection result
	key := d.adapterKey
	pool := d.pool
	if d.adapterErr != nil {
		hasPersonal, _ := s.db.UserHasPersonalTokens(ctx, userID)
		if hasPersonal {
			log.Printf("upload: platform not available for user %s: %v", userID, d.adapterErr)
			http.Error(w, `{"error":"storage platform not available"}`, http.StatusBadRequest)
		} else {
			http.Error(w, `{"error":"storage not available yet — managed storage is being configured"}`, http.StatusServiceUnavailable)
		}
		return
	}

	repo, err := pool.GetOrCreateRepo(ctx)
	if err != nil {
		log.Printf("upload: get repo failed: %v", err)
		http.Error(w, `{"error":"storage not available"}`, http.StatusInternalServerError)
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

	if err := s.db.InsertFileWithQuotaCheck(ctx, userID, fileMeta, effectiveQuota); err != nil {
		if errors.Is(err, index.ErrQuotaExceeded) {
			http.Error(w, `{"error":"storage quota exceeded"}`, http.StatusForbidden)
			return
		}
		log.Printf("upload: create file record failed for user %s: %v", userID, err)
		http.Error(w, `{"error":"create file record failed"}`, http.StatusInternalServerError)
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
		log.Printf("upload: create session failed: %v", err)
		http.Error(w, `{"error":"failed to start upload"}`, http.StatusInternalServerError)
		return
	}

	// Check if adapter supports direct upload (presigned URLs)
	adapter := s.resolveAdapterForUser(ctx, userID, platform, account)
	_, directUpload := adapter.(adapters.DirectUploader)

	s.audit(r, &userID, "upload_init", map[string]interface{}{
		"file_id":    fileID,
		"session_id": sessionID,
		"filename":   req.Filename,
		"size":       req.OriginalSize,
		"chunks":     req.ChunkCount,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"session_id":    sessionID,
		"file_id":       fileID,
		"repo_url":      repo.URL,
		"platform":      platform,
		"direct_upload": directUpload,
	})
}

// HandleChunkUpload receives a single pre-encrypted chunk, stages it to disk, and returns immediately.
// The actual upload to the git platform happens asynchronously via the background sync worker.
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

	// Acquire semaphore slot — limits server-wide concurrent chunk processing to prevent OOM
	select {
	case chunkUploadSem <- struct{}{}:
		defer func() { <-chunkUploadSem }()
	case <-ctx.Done():
		http.Error(w, `{"error":"request cancelled"}`, http.StatusServiceUnavailable)
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

	// Idempotency: check if chunk already received
	existing, _ := s.db.GetChunkByID(ctx, session.FileID+"-"+strconv.Itoa(chunkIndex))
	if existing != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"chunk_index": chunkIndex,
			"stored":      true,
			"duplicate":   true,
		})
		return
	}
	// Also check by file_id + index (the original idempotency check)
	existingByIdx, _ := s.db.GetChunkByIndex(ctx, session.FileID, chunkIndex)
	if existingByIdx != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"chunk_index": chunkIndex,
			"stored":      true,
			"duplicate":   true,
		})
		return
	}

	// Write chunk data to staging dir (survives server restarts)
	chunkID := uuid.New().String()
	stagingDir, err := config.StagingDir()
	if err != nil {
		log.Printf("upload: staging dir failed: %v", err)
		http.Error(w, `{"error":"upload failed"}`, http.StatusInternalServerError)
		return
	}
	stagingPath := filepath.Join(stagingDir, chunkID+".enc")
	if err := os.WriteFile(stagingPath, data, 0600); err != nil {
		log.Printf("upload: write staging file failed: %v", err)
		http.Error(w, `{"error":"upload failed"}`, http.StatusInternalServerError)
		return
	}

	// Insert chunk reference with empty remote_path (pending sync)
	dbChunk := &types.ChunkRef{
		ChunkID:    chunkID,
		FileID:     session.FileID,
		Index:      chunkIndex,
		Size:       int64(len(data)),
		SHA256:     actualHash,
		Platform:   session.Platform,
		Account:    session.Account,
		Repo:       session.RepoURL,
		RemotePath: "", // pending — will be set by background sync worker
		Compressed: compressed,
	}

	if err := s.db.InsertClientChunk(ctx, userID, dbChunk); err != nil {
		os.Remove(stagingPath) // clean up staging file
		log.Printf("upload: store chunk ref failed: %v", err)
		http.Error(w, `{"error":"failed to store chunk"}`, http.StatusInternalServerError)
		return
	}

	// Wake sync worker immediately — non-blocking, channel is buffered(1)
	select {
	case s.syncCh <- struct{}{}:
	default:
	}

	// Increment session counter
	if err := s.db.IncrementSessionChunks(ctx, sessionID); err != nil {
		fmt.Printf("warn: increment session chunks: %v\n", err)
	}

	// Emit progress
	percent := int(float64(session.UploadedChunks+1) / float64(session.ChunkCount) * 100)
	s.progress.Emit(types.ProgressEvent{
		FileID:         session.FileID,
		UserID:         userID,
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

	// Verify all chunks received (includes pending-sync chunks)
	uploadedIndices, err := s.db.GetReceivedChunkIndices(ctx, session.FileID)
	if err != nil {
		log.Printf("upload: check chunks failed: %v", err)
		http.Error(w, `{"error":"failed to verify chunks"}`, http.StatusInternalServerError)
		return
	}
	if len(uploadedIndices) != session.ChunkCount {
		http.Error(w, `{"error":"not all chunks have been uploaded"}`, http.StatusBadRequest)
		return
	}

	// Mark file as complete and return immediately.
	// Size verification, FlushCommits, and bookkeeping run in the background.
	if err := s.db.UpdateFileStatus(ctx, session.FileID, "complete"); err != nil {
		log.Printf("upload: update file status failed: %v", err)
		http.Error(w, `{"error":"failed to complete upload"}`, http.StatusInternalServerError)
		return
	}
	if err := s.db.CompleteUploadSession(ctx, sessionID); err != nil {
		fmt.Printf("warn: complete session: %v\n", err)
	}

	// Emit completion event
	s.progress.Emit(types.ProgressEvent{
		FileID:  session.FileID,
		UserID:  userID,
		Stage:   "done",
		Percent: 100,
	})

	// Return success to client immediately
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"file_id": session.FileID,
	})

	// Background: FlushCommits, size verification, repo usage, audit
	go func() {
		bgCtx := context.Background()

		// Flush batch commits (HuggingFace)
		adapter := s.resolveAdapterForUser(bgCtx, userID, session.Platform, session.Account)
		if bc, ok := adapter.(adapters.BatchCommitter); ok {
			if err := bc.FlushCommits(bgCtx, session.RepoURL); err != nil {
				log.Printf("upload: background FlushCommits failed: %v", err)
			}
		}

		// Verify and update sizes
		actualEncrypted, err := s.db.GetTotalReceivedChunkSize(bgCtx, session.FileID)
		if err == nil {
			s.db.UpdateFileOriginalSizeVerified(bgCtx, session.FileID, actualEncrypted)
		}
		s.db.UpdateFileSizes(bgCtx, session.FileID, req.CompressedSize, req.EncryptedSize)

		// Update repo usage
		pools, _ := s.getUserPools(bgCtx, userID)
		key := session.Platform + ":" + session.Account
		if pool, ok := pools[key]; ok {
			pool.UpdateUsage(session.RepoID, req.EncryptedSize)
		}

		s.audit(r, &userID, "upload_complete", map[string]interface{}{
			"file_id":    session.FileID,
			"session_id": sessionID,
			"filename":   session.Filename,
			"chunks":     session.ChunkCount,
		})
	}()
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
		log.Printf("upload: cancel session failed: %v", err)
		http.Error(w, `{"error":"failed to cancel upload"}`, http.StatusInternalServerError)
		return
	}

	// Delete file and queue chunks for remote deletion
	if err := s.db.DeleteFile(ctx, userID, session.FileID); err != nil {
		fmt.Printf("warn: delete file on cancel: %v\n", err)
	}

	// Emit error event so frontend knows
	cancelEvent := pipeline.ErrorEvent(session.FileID, "upload cancelled")
	cancelEvent.UserID = userID
	s.progress.Emit(cancelEvent)

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
		log.Printf("upload: get chunk status failed: %v", err)
		http.Error(w, `{"error":"failed to get upload status"}`, http.StatusInternalServerError)
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

// HandlePresignChunk returns a presigned URL for direct client upload to the platform.
// This bypasses the server relay — data goes directly from client to platform storage.
// POST /api/upload/{sid}/presign/{idx}
func (s *Server) HandlePresignChunk(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	sessionID := r.PathValue("sid")
	chunkIndexStr := r.PathValue("idx")
	chunkIndex, err := strconv.Atoi(chunkIndexStr)
	if err != nil {
		http.Error(w, `{"error":"invalid chunk index"}`, http.StatusBadRequest)
		return
	}

	var req struct {
		SHA256 string `json:"sha256"`
		Size   int64  `json:"size"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.SHA256 == "" || req.Size <= 0 {
		http.Error(w, `{"error":"sha256 and size are required"}`, http.StatusBadRequest)
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
	if chunkIndex < 0 || chunkIndex >= session.ChunkCount {
		http.Error(w, `{"error":"chunk index out of range"}`, http.StatusBadRequest)
		return
	}

	// Resolve adapter and check DirectUploader support
	adapter := s.resolveAdapterForUser(ctx, userID, session.Platform, session.Account)
	if adapter == nil {
		http.Error(w, `{"error":"platform adapter not available"}`, http.StatusInternalServerError)
		return
	}
	du, ok := adapter.(adapters.DirectUploader)
	if !ok {
		http.Error(w, `{"error":"platform does not support direct upload"}`, http.StatusBadRequest)
		return
	}

	// Generate disguised remote path
	remotePath, err := disguise.ChunkFilename()
	if err != nil {
		log.Printf("upload: generate filename failed: %v", err)
		http.Error(w, `{"error":"upload failed"}`, http.StatusInternalServerError)
		return
	}

	// Get presigned URL from platform
	uploadURL, uploadHeaders, err := du.GetUploadURL(ctx, session.RepoURL, req.SHA256, req.Size)
	if err != nil {
		log.Printf("upload: get upload url failed: %v", err)
		http.Error(w, `{"error":"failed to get upload URL"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"upload_url":     uploadURL,
		"upload_headers": uploadHeaders,
		"remote_path":    remotePath,
		"already_exists": uploadURL == "",
	})
}

// HandleConfirmChunk confirms a directly-uploaded chunk and stores its reference.
// Called after the client has uploaded data directly to the platform via presigned URL.
// POST /api/upload/{sid}/confirm/{idx}
func (s *Server) HandleConfirmChunk(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	sessionID := r.PathValue("sid")
	chunkIndexStr := r.PathValue("idx")
	chunkIndex, err := strconv.Atoi(chunkIndexStr)
	if err != nil {
		http.Error(w, `{"error":"invalid chunk index"}`, http.StatusBadRequest)
		return
	}

	var req struct {
		SHA256     string `json:"sha256"`
		Size       int64  `json:"size"`
		RemotePath string `json:"remote_path"`
		Compressed bool   `json:"compressed"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.SHA256 == "" || req.Size <= 0 || req.RemotePath == "" {
		http.Error(w, `{"error":"sha256, size, and remote_path are required"}`, http.StatusBadRequest)
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
	if chunkIndex < 0 || chunkIndex >= session.ChunkCount {
		http.Error(w, `{"error":"chunk index out of range"}`, http.StatusBadRequest)
		return
	}

	// Idempotency: check if chunk already stored
	existing, _ := s.db.GetChunkByIndex(ctx, session.FileID, chunkIndex)
	if existing != nil && existing.RemotePath != "" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"chunk_index": chunkIndex,
			"stored":      true,
			"duplicate":   true,
		})
		return
	}

	// Register with adapter for batch commit (e.g., HuggingFace pendingCommits)
	adapter := s.resolveAdapterForUser(ctx, userID, session.Platform, session.Account)
	if du, ok := adapter.(adapters.DirectUploader); ok {
		du.RegisterUpload(req.RemotePath, req.SHA256, req.Size)
	}

	// Store chunk reference in DB
	chunkID := uuid.New().String()
	dbChunk := &types.ChunkRef{
		ChunkID:    chunkID,
		FileID:     session.FileID,
		Index:      chunkIndex,
		Size:       req.Size,
		SHA256:     req.SHA256,
		Platform:   session.Platform,
		Account:    session.Account,
		Repo:       session.RepoURL,
		RemotePath: req.RemotePath,
		Compressed: req.Compressed,
	}

	if err := s.db.InsertClientChunk(ctx, userID, dbChunk); err != nil {
		log.Printf("upload: store chunk ref failed: %v", err)
		http.Error(w, `{"error":"failed to store chunk"}`, http.StatusInternalServerError)
		return
	}

	// Increment session counter
	if err := s.db.IncrementSessionChunks(ctx, sessionID); err != nil {
		fmt.Printf("warn: increment session chunks: %v\n", err)
	}

	// Emit progress
	percent := int(float64(session.UploadedChunks+1) / float64(session.ChunkCount) * 100)
	s.progress.Emit(types.ProgressEvent{
		FileID:         session.FileID,
		UserID:         userID,
		Stage:          fmt.Sprintf("uploading chunk %d/%d", chunkIndex+1, session.ChunkCount),
		Percent:        percent,
		BytesProcessed: req.Size,
		TotalBytes:     session.OriginalSize,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"chunk_index": chunkIndex,
		"stored":      true,
	})
}
