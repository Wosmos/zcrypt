package cmd

import (
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"github.com/zcrypt/zcrypt/config"
)

// HandleGetFileMeta returns file metadata needed for client-side decryption.
// GET /api/files/{id}
func (s *Server) HandleGetFileMeta(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	fileID := r.PathValue("id")
	if fileID == "" {
		http.Error(w, `{"error":"file id required"}`, http.StatusBadRequest)
		return
	}

	file, err := s.db.GetFileByID(ctx, userID, fileID)
	if err != nil {
		http.Error(w, `{"error":"file not found"}`, http.StatusNotFound)
		return
	}

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

// HandleGetChunk downloads a single encrypted chunk and streams it to the client.
// GET /api/files/{id}/chunks/{idx}
func (s *Server) HandleGetChunk(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	fileID := r.PathValue("id")
	chunkIndexStr := r.PathValue("idx")
	chunkIndex, err := strconv.Atoi(chunkIndexStr)
	if err != nil {
		http.Error(w, `{"error":"invalid chunk index"}`, http.StatusBadRequest)
		return
	}

	// Verify file belongs to user
	file, err := s.db.GetFileByID(ctx, userID, fileID)
	if err != nil {
		http.Error(w, `{"error":"file not found"}`, http.StatusNotFound)
		return
	}

	if chunkIndex < 0 || chunkIndex >= file.ChunkCount {
		http.Error(w, `{"error":"chunk index out of range"}`, http.StatusBadRequest)
		return
	}

	// Get chunk reference (user_id for defense-in-depth isolation)
	chunk, err := s.db.GetChunkByIndex(ctx, fileID, chunkIndex, userID)
	if err != nil {
		http.Error(w, `{"error":"chunk not found"}`, http.StatusNotFound)
		return
	}

	var data []byte

	if chunk.RemotePath == "" {
		// Chunk not yet synced to git platform — serve from staging dir
		stagingDir, err := config.StagingDir()
		if err != nil {
			http.Error(w, `{"error":"staging not available"}`, http.StatusInternalServerError)
			return
		}
		data, err = os.ReadFile(filepath.Join(stagingDir, chunk.ChunkID+".enc"))
		if err != nil {
			log.Printf("download: read staging file failed: %v", err)
			http.Error(w, `{"error":"chunk data not available yet"}`, http.StatusInternalServerError)
			return
		}
	} else {
		// Chunk synced — download from git platform
		adapter := s.resolveAdapterForUser(ctx, userID, chunk.Platform, chunk.Account)
		if adapter == nil {
			http.Error(w, `{"error":"platform adapter not available"}`, http.StatusInternalServerError)
			return
		}

		data, err = adapter.Download(ctx, *chunk)
		if err != nil {
			log.Printf("download: chunk download failed: %v", err)
			http.Error(w, `{"error":"failed to download chunk"}`, http.StatusInternalServerError)
			return
		}
	}

	// Set headers and stream raw encrypted bytes
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	w.Header().Set("X-Chunk-SHA256", chunk.SHA256)
	if chunk.Compressed {
		w.Header().Set("X-Chunk-Compressed", "true")
	}
	w.Write(data)
}
