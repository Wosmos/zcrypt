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
// Phase 1 (Prepare) runs synchronously and returns {file_id, status}.
// Phase 2 (Upload) runs in a background goroutine.
func (s *Server) HandlePush(w http.ResponseWriter, r *http.Request) {
	if len(s.accountKeys) == 0 {
		http.Error(w, `{"error":"no platform connected"}`, http.StatusBadRequest)
		return
	}

	if err := r.ParseMultipartForm(32 << 20); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"parse form: %s"}`, err), http.StatusBadRequest)
		return
	}

	passphrase := r.FormValue("passphrase")
	if passphrase == "" {
		http.Error(w, `{"error":"passphrase required"}`, http.StatusBadRequest)
		return
	}

	targetPlatform := r.FormValue("platform")

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

	var key string
	if targetPlatform != "" {
		key = s.nextAccountKeyForPlatform(targetPlatform)
		if key == "" {
			os.Remove(tmpPath)
			http.Error(w, fmt.Sprintf(`{"error":"no %s account connected"}`, targetPlatform), http.StatusBadRequest)
			return
		}
	} else {
		key = s.nextAccountKey()
	}

	adapter := s.allAdapters[key]
	pool := s.allPools[key]
	if adapter == nil || pool == nil {
		os.Remove(tmpPath)
		http.Error(w, `{"error":"no platform connected"}`, http.StatusBadRequest)
		return
	}

	account := key[strings.Index(key, ":")+1:]
	fileID := uuid.New().String()

	engine := pipeline.NewPipelineEngine(s.db, adapter, pool, s.progress, account)

	// Phase 1: Prepare (synchronous — local processing)
	prepared, err := engine.Prepare(r.Context(), tmpPath, header.Filename, passphrase, fileID)
	os.Remove(tmpPath)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err), http.StatusInternalServerError)
		return
	}

	// Phase 2: Upload (async — network, resumable)
	ctx, cancel := context.WithCancel(context.Background())
	s.activeUploads.Store(fileID, &activeUpload{cancel: cancel, prepared: prepared})

	go func() {
		defer s.activeUploads.Delete(fileID)
		if err := engine.Upload(ctx, prepared); err != nil {
			if ctx.Err() == nil {
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

	fileMeta, err := s.db.GetFileByID(req.FileID)
	if err != nil {
		http.Error(w, `{"error":"file not found"}`, http.StatusNotFound)
		return
	}
	if fileMeta.Status != "uploading" {
		http.Error(w, `{"error":"file not in uploading state"}`, http.StatusBadRequest)
		return
	}

	pendingChunks, err := s.db.GetPendingChunksForFile(req.FileID)
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
	allChunks, _ := s.db.GetChunksForFile(req.FileID)
	if len(allChunks) == 0 {
		http.Error(w, `{"error":"no chunks found"}`, http.StatusInternalServerError)
		return
	}

	chunkPlatform := allChunks[0].Platform
	chunkAccount := allChunks[0].Account

	key := chunkPlatform + ":" + chunkAccount
	adapter := s.allAdapters[key]
	pool := s.allPools[key]
	if adapter == nil || pool == nil {
		http.Error(w, `{"error":"platform account not connected"}`, http.StatusBadRequest)
		return
	}

	repo, err := pool.GetOrCreateRepo(r.Context())
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

	ctx, cancel := context.WithCancel(context.Background())
	s.activeUploads.Store(req.FileID, &activeUpload{cancel: cancel, prepared: prepared})

	engine := pipeline.NewPipelineEngine(s.db, adapter, pool, s.progress, chunkAccount)

	go func() {
		defer s.activeUploads.Delete(req.FileID)
		if err := engine.Upload(ctx, prepared); err != nil {
			if ctx.Err() == nil {
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

// HandleListIncompleteUploads returns files with status='uploading'.
// GET /api/uploads/incomplete
func (s *Server) HandleListIncompleteUploads(w http.ResponseWriter, r *http.Request) {
	files, err := s.db.ListIncompleteFiles()
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err), http.StatusInternalServerError)
		return
	}

	type incompleteInfo struct {
		FileID        string `json:"file_id"`
		OriginalName  string `json:"original_name"`
		OriginalSize  int64  `json:"original_size"`
		TotalChunks   int    `json:"total_chunks"`
		PendingChunks int    `json:"pending_chunks"`
		Active        bool   `json:"active"`
	}

	var result []incompleteInfo
	for _, f := range files {
		pending, _ := s.db.GetPendingChunksForFile(f.ID)
		_, active := s.activeUploads.Load(f.ID)
		result = append(result, incompleteInfo{
			FileID:        f.ID,
			OriginalName:  f.OriginalName,
			OriginalSize:  f.OriginalSize,
			TotalChunks:   f.ChunkCount,
			PendingChunks: len(pending),
			Active:        active,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}
