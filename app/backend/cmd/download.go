package cmd

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"github.com/zcrypt/zcrypt/config"
	"github.com/zcrypt/zcrypt/types"
)

// authorizeFileRead resolves a file for reading. It tries the OWNER path first
// (strict user-scoped query, unchanged behavior); ONLY on an owner miss does it
// fall back to space-member access. On the member path it returns the file
// OWNER's id — used to resolve chunks + the storage backend through the owner
// without ever weakening the owner-scoped queries — and the space-wrapped CEK
// the member decrypts with. Returns ok=false if neither path authorizes, which
// callers surface as an indistinguishable 404.
func (s *Server) authorizeFileRead(ctx context.Context, userID, fileID string) (file *types.FileMetadata, ownerID, wrappedCEK string, ok bool) {
	if f, err := s.db.GetFileByID(ctx, userID, fileID); err == nil {
		return f, userID, f.WrappedCEK, true
	}
	grant, err := s.db.MemberSpaceFileGrant(ctx, userID, fileID)
	if err != nil {
		return nil, "", "", false
	}
	f, err := s.db.GetFileByIDUnsafe(ctx, fileID)
	if err != nil {
		return nil, "", "", false
	}
	return f, grant.OwnerID, grant.WrappedCEK, true
}

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

	file, _, wrappedCEK, ok := s.authorizeFileRead(ctx, userID, fileID)
	if !ok {
		http.Error(w, `{"error":"file not found"}`, http.StatusNotFound)
		return
	}

	// For a space member, wrappedCEK is the CEK re-wrapped under the space key
	// (unwrapped with the space key, not the owner's vault passphrase); for the
	// owner it's identical to file.WrappedCEK.
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":              file.ID,
		"original_name":   file.OriginalName,
		"original_size":   file.OriginalSize,
		"compressed_size": file.CompressedSize,
		"encrypted_size":  file.EncryptedSize,
		"chunk_count":     file.ChunkCount,
		"sha256":          file.SHA256,
		"sha256_scheme":   file.SHA256Scheme,
		"salt":            base64.StdEncoding.EncodeToString(file.Salt),
		"wrapped_cek":     wrappedCEK,
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

	// Authorize as owner first; fall back to space-member access. ownerID is the
	// account whose storage backend actually holds the chunks — for the owner it
	// equals userID, for a member it's the file owner.
	file, ownerID, _, ok := s.authorizeFileRead(ctx, userID, fileID)
	if !ok {
		http.Error(w, `{"error":"file not found"}`, http.StatusNotFound)
		return
	}

	if chunkIndex < 0 || chunkIndex >= file.ChunkCount {
		http.Error(w, `{"error":"chunk index out of range"}`, http.StatusBadRequest)
		return
	}

	// Get chunk reference scoped to the OWNER (chunks are owner-scoped; a member
	// reads the owner's chunks, never their own namespace).
	chunk, err := s.db.GetChunkByIndex(ctx, fileID, chunkIndex, ownerID)
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
		// Chunk synced — try the local ciphertext cache first. Chunks are
		// immutable (a re-upload mints a new chunk id), so a hit never goes
		// stale — and it serves even when the platform is unreachable.
		data = readCachedChunk(chunk.ChunkID)

		if data == nil {
			// Cache miss — download from git platform using the OWNER's tokens
			// (the member has no tokens on the owner's storage accounts).
			adapter := s.resolveAdapterForUser(ctx, ownerID, chunk.Platform, chunk.Account)
			if adapter == nil {
				// Surface the recorded reason (e.g. the platform is blocked from
				// this server) instead of a generic 500.
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

			data, err = adapter.Download(ctx, *chunk)
			if err != nil {
				log.Printf("download: chunk download failed: %v", err)
				http.Error(w, `{"error":"failed to download chunk"}`, http.StatusInternalServerError)
				return
			}

			// Write-through cache — best effort, ciphertext only (zero-knowledge safe).
			writeCachedChunk(chunk.ChunkID, data)
		}
	}

	// Set headers and stream raw encrypted bytes. Chunks are immutable by
	// design — a new upload gets a new file id — so clients may cache forever.
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	w.Header().Set("X-Chunk-SHA256", chunk.SHA256)
	if chunk.Compressed {
		w.Header().Set("X-Chunk-Compressed", "true")
	}
	w.Write(data)
}
