package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
	"github.com/zpush/zpush/config"
	"github.com/zpush/zpush/pipeline"
)

const maxFileSize = 2 * 1024 * 1024 * 1024 // 2GB max file size

// activeUpload tracks a running upload's cancel function and prepared file.
type activeUpload struct {
	cancel   context.CancelFunc
	prepared *pipeline.PreparedFile
}

// HandlePush handles file upload via multipart form.
// POST /api/push
func (s *Server) HandlePush(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	targetPlatform := r.FormValue("platform")

	key, adapter, pool, err := s.selectAdapter(ctx, userID, targetPlatform)
	if err != nil {
		http.Error(w, `{"error":"no platform connected"}`, http.StatusBadRequest)
		return
	}

	if err := r.ParseMultipartForm(5 << 20); err != nil { // 5MB form metadata buffer
		http.Error(w, `{"error":"invalid form data"}`, http.StatusBadRequest)
		return
	}

	passphrase := r.FormValue("passphrase")
	if passphrase == "" {
		http.Error(w, `{"error":"passphrase required"}`, http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"file required: %s"}`, err), http.StatusBadRequest)
		return
	}
	defer file.Close()

	if header.Size > maxFileSize {
		http.Error(w, `{"error":"file too large, max 2GB"}`, http.StatusRequestEntityTooLarge)
		return
	}

	// Enforce storage quota for users relying on global tokens
	if !s.isQuotaExempt(ctx, userID) {
		quota := s.getEffectiveQuota(ctx, userID)
		if quota > 0 {
			used, err := s.db.GetUserStorageUsed(ctx, userID)
			if err != nil {
				http.Error(w, `{"error":"check quota failed"}`, http.StatusInternalServerError)
				return
			}
			if used+header.Size > quota {
				http.Error(w, `{"error":"storage quota exceeded"}`, http.StatusForbidden)
				return
			}
		}
	}

	tmpDir, err := config.TmpDir()
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"tmp dir: %s"}`, err), http.StatusInternalServerError)
		return
	}

	tmpPath := filepath.Join(tmpDir, uuid.New().String()+"_"+header.Filename)
	tmpFile, err := os.Create(tmpPath)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"create temp file: %s"}`, err), http.StatusInternalServerError)
		return
	}

	if _, err := io.Copy(tmpFile, file); err != nil {
		tmpFile.Close()
		os.Remove(tmpPath)
		http.Error(w, fmt.Sprintf(`{"error":"save file: %s"}`, err), http.StatusInternalServerError)
		return
	}
	tmpFile.Close()

	account := key[strings.Index(key, ":")+1:]
	fileID := uuid.New().String()

	engine := pipeline.NewPipelineEngine(s.db, adapter, pool, s.progress, userID, account)

	// Phase 1: Prepare (synchronous — local processing)
	// Acquire semaphore to limit concurrent heavy processing (compress+encrypt+chunk)
	select {
	case s.prepareSem <- struct{}{}:
	case <-ctx.Done():
		os.Remove(tmpPath)
		http.Error(w, `{"error":"request cancelled"}`, http.StatusRequestTimeout)
		return
	}
	prepared, err := engine.Prepare(ctx, tmpPath, header.Filename, passphrase, fileID)
	<-s.prepareSem // release immediately after prepare completes
	os.Remove(tmpPath)
	if err != nil {
		log.Printf("prepare error for user %s: %v", userID, err)
		http.Error(w, `{"error":"failed to process file"}`, http.StatusInternalServerError)
		return
	}

	// Phase 2: Upload (async — network, resumable)
	uploadCtx, cancel := context.WithCancel(context.Background())
	s.activeUploads.Store(fileID, &activeUpload{cancel: cancel, prepared: prepared})

	go func() {
		defer s.activeUploads.Delete(fileID)
		if err := engine.Upload(uploadCtx, prepared); err != nil {
			if uploadCtx.Err() == nil {
				log.Printf("upload error for %s: %v", fileID, err)
				s.progress.Emit(pipeline.ErrorEvent(fileID, err.Error()))
			}
		}
	}()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"file_id": fileID,
		"status":  "uploading",
		"file":    prepared.Meta,
	})
}

// HandlePauseUpload pauses an active upload.
// POST /api/upload/pause
func (s *Server) HandlePauseUpload(w http.ResponseWriter, r *http.Request) {
	var req struct {
		FileID string `json:"file_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	val, ok := s.activeUploads.Load(req.FileID)
	if !ok {
		http.Error(w, `{"error":"upload not active"}`, http.StatusNotFound)
		return
	}

	au := val.(*activeUpload)
	au.cancel()
	s.activeUploads.Delete(req.FileID)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"file_id": req.FileID,
	})
}

// HandleResumeUpload resumes a paused/interrupted upload.
// POST /api/upload/resume
func (s *Server) HandleResumeUpload(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	var req struct {
		FileID string `json:"file_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	if _, ok := s.activeUploads.Load(req.FileID); ok {
		http.Error(w, `{"error":"upload already active"}`, http.StatusConflict)
		return
	}

	fileMeta, err := s.db.GetFileByID(ctx, userID, req.FileID)
	if err != nil {
		http.Error(w, `{"error":"file not found"}`, http.StatusNotFound)
		return
	}
	if fileMeta.Status != "uploading" {
		http.Error(w, `{"error":"file not in uploading state"}`, http.StatusBadRequest)
		return
	}

	pendingChunks, err := s.db.GetPendingChunksForFile(ctx, req.FileID)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"get pending chunks: %s"}`, err), http.StatusInternalServerError)
		return
	}

	stagingBase, err := config.StagingDir()
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"staging dir: %s"}`, err), http.StatusInternalServerError)
		return
	}
	stagingDir := filepath.Join(stagingBase, req.FileID)
	if _, err := os.Stat(stagingDir); os.IsNotExist(err) {
		http.Error(w, `{"error":"staging data not found, cannot resume"}`, http.StatusGone)
		return
	}

	// Find adapter/pool from chunk metadata
	allChunks, _ := s.db.GetChunksForFile(ctx, req.FileID)
	if len(allChunks) == 0 {
		http.Error(w, `{"error":"no chunks found"}`, http.StatusInternalServerError)
		return
	}

	chunkPlatform := allChunks[0].Platform
	chunkAccount := allChunks[0].Account

	adapter := s.resolveAdapterForUser(ctx, userID, chunkPlatform, chunkAccount)
	if adapter == nil {
		http.Error(w, `{"error":"platform account not connected"}`, http.StatusBadRequest)
		return
	}

	pools, _ := s.getUserPools(ctx, userID)
	key := chunkPlatform + ":" + chunkAccount
	pool := pools[key]
	if pool == nil {
		http.Error(w, `{"error":"platform account not connected"}`, http.StatusBadRequest)
		return
	}

	repo, err := pool.GetOrCreateRepo(ctx)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"get repo: %s"}`, err), http.StatusInternalServerError)
		return
	}

	var chunkInfos []pipeline.ChunkInfo
	for i := 0; i < fileMeta.ChunkCount; i++ {
		chunkPath := filepath.Join(stagingDir, fmt.Sprintf("chunk_%03d", i))
		ci, err := os.Stat(chunkPath)
		if err != nil {
			continue
		}
		chunkInfos = append(chunkInfos, pipeline.ChunkInfo{
			Path:  chunkPath,
			Size:  ci.Size(),
			Index: i,
		})
	}

	prepared := &pipeline.PreparedFile{
		FileID:     req.FileID,
		Meta:       fileMeta,
		StagingDir: stagingDir,
		ChunkInfos: chunkInfos,
		RepoURL:    repo.URL,
		RepoID:     repo.ID,
		Account:    chunkAccount,
		Platform:   chunkPlatform,
	}

	uploadCtx, cancel := context.WithCancel(context.Background())
	s.activeUploads.Store(req.FileID, &activeUpload{cancel: cancel, prepared: prepared})

	engine := pipeline.NewPipelineEngine(s.db, adapter, pool, s.progress, userID, chunkAccount)

	go func() {
		defer s.activeUploads.Delete(req.FileID)
		if err := engine.Upload(uploadCtx, prepared); err != nil {
			if uploadCtx.Err() == nil {
				log.Printf("resume upload error for %s: %v", req.FileID, err)
				s.progress.Emit(pipeline.ErrorEvent(req.FileID, err.Error()))
			}
		}
	}()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":          true,
		"file_id":          req.FileID,
		"remaining_chunks": len(pendingChunks),
		"total_chunks":     fileMeta.ChunkCount,
	})
}

// HandleListIncompleteUploads returns files with status='uploading' for the current user.
// GET /api/uploads/incomplete
func (s *Server) HandleListIncompleteUploads(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	// ListFiles only returns complete, so query uploading files directly
	rows, err := s.db.Pool().Query(ctx,
		`SELECT id, original_name, original_size, chunk_count FROM files WHERE user_id = $1 AND status = 'uploading' ORDER BY created_at DESC`,
		userID,
	)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type incompleteInfo struct {
		FileID        string `json:"file_id"`
		OriginalName  string `json:"original_name"`
		OriginalSize  int64  `json:"original_size"`
		TotalChunks   int    `json:"total_chunks"`
		PendingChunks int    `json:"pending_chunks"`
		Active        bool   `json:"active"`
	}

	var result []incompleteInfo
	for rows.Next() {
		var info incompleteInfo
		if err := rows.Scan(&info.FileID, &info.OriginalName, &info.OriginalSize, &info.TotalChunks); err != nil {
			continue
		}
		pending, _ := s.db.GetPendingChunksForFile(ctx, info.FileID)
		_, active := s.activeUploads.Load(info.FileID)
		info.PendingChunks = len(pending)
		info.Active = active
		result = append(result, info)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}
