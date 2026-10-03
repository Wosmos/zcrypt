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

	"github.com/zcrypt/zcrypt/adapters"
	"github.com/zcrypt/zcrypt/config"
	"github.com/zcrypt/zcrypt/types"
)

// authorizeFileRead resolves a file for reading. It tries the OWNER path first
// (strict user-scoped query, unchanged behavior); ONLY on an owner miss does it
// fall back to space-member access. On the member path it returns the file
// OWNER's id: used to resolve chunks + the storage backend through the owner
// without ever weakening the owner-scoped queries, and the space-wrapped CEK
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

// writeChunkFetchError answers a failed platform download. A 404 alone is not
// proof of loss: GitHub and GitLab answer 404 for a private repo the token can
// no longer read. So a committed chunk is only marked damaged, with a 410 that
// stops client retries, once a listing of its repo succeeds, is non-empty, and
// lacks the path. An unconfirmed 404, or one for a chunk whose commit was never
// verified, stays a retryable 503. Anything else is a generic 500.
func (s *Server) writeChunkFetchError(ctx context.Context, w http.ResponseWriter, adapter adapters.PlatformAdapter, ownerID string, chunk *types.ChunkRef, err error, logPrefix string) {
	log.Printf("%s: chunk download failed: %v", logPrefix, err)
	if !errors.Is(err, adapters.ErrNotFound) {
		http.Error(w, `{"error":"failed to download chunk"}`, http.StatusInternalServerError)
		return
	}
	if !chunk.Committed {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"error":  "chunk is not available on storage yet",
			"reason": "chunk_pending",
		})
		return
	}
	if !confirmChunkMissing(ctx, adapter, chunk, logPrefix) {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"error":  "storage could not confirm this chunk; try again later",
			"reason": "chunk_unconfirmed",
		})
		return
	}
	if changed, merr := s.db.MarkFilesDamaged(ctx, []string{chunk.FileID}); merr != nil {
		log.Printf("%s: mark file %s damaged: %v", logPrefix, logSafe(chunk.FileID), merr) // #nosec G706 -- control chars stripped via logSafe
	} else if len(changed) > 0 {
		log.Printf("%s: file %s marked damaged: chunk %d missing on %s", logPrefix, logSafe(chunk.FileID), chunk.Index, logSafe(chunk.Platform)) // #nosec G706 -- control chars stripped via logSafe
		s.emitFileChange(ctx, ownerID, chunk.FileID, "updated")
	}
	writeJSON(w, http.StatusGone, map[string]string{
		"error":  "this file's data is missing from storage",
		"reason": "chunk_missing",
	})
}

// confirmChunkMissing lists the chunk's repo and reports true only when the
// listing works, holds at least one blob, and does not hold this chunk's path.
func confirmChunkMissing(ctx context.Context, adapter adapters.PlatformAdapter, chunk *types.ChunkRef, logPrefix string) bool {
	listed, err := adapter.ListChunks(ctx, chunk.Repo)
	if err != nil {
		log.Printf("%s: confirm missing chunk: list %s repo %s: %v", logPrefix, logSafe(chunk.Platform), logSafe(chunk.Repo), err) // #nosec G706 -- control chars stripped via logSafe
		return false
	}
	if len(listed) == 0 {
		return false
	}
	for _, b := range listed {
		if b.RemotePath == chunk.RemotePath {
			return false
		}
	}
	return true
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
		"encrypted_name":  file.EncryptedName,
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
	// account whose storage backend actually holds the chunks, for the owner it
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
		// Chunk not yet synced to git platform, serve from staging dir
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
		// Chunk synced: try the local ciphertext cache first. Chunks are
		// immutable (a re-upload mints a new chunk id), so a hit never goes
		// stale, and it serves even when the platform is unreachable.
		data = readCachedChunk(chunk.ChunkID, chunk.SHA256)

		if data == nil {
			// Cache miss: download from git platform using the OWNER's tokens
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

			if streamer, ok := adapter.(adapters.ChunkStreamer); ok {
				if serr := relayStreamedChunk(ctx, w, streamer, *chunk); serr != nil {
					s.writeChunkFetchError(ctx, w, adapter, ownerID, chunk, serr, "download")
				}
				return
			}

			data, err = adapter.Download(ctx, *chunk)
			if err != nil {
				s.writeChunkFetchError(ctx, w, adapter, ownerID, chunk, err, "download")
				return
			}

			// Write-through cache: best effort, ciphertext only (zero-knowledge safe).
			writeCachedChunk(chunk.ChunkID, chunk.SHA256, data)
		}
	}

	setChunkHeaders(w, *chunk)
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	w.Write(data)
}

// setChunkHeaders marks a raw encrypted chunk response. Chunks are immutable by
// design (a new upload gets a new file id) so clients may cache forever.
func setChunkHeaders(w http.ResponseWriter, chunk types.ChunkRef) {
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Cache-Control", "private, max-age=31536000, immutable")
	w.Header().Set("X-Chunk-SHA256", chunk.SHA256)
	if chunk.Compressed {
		w.Header().Set("X-Chunk-Compressed", "true")
	}
}

// countingWriter records whether any byte reached the client yet.
type countingWriter struct {
	w io.Writer
	n int64
}

func (c *countingWriter) Write(p []byte) (int, error) {
	n, err := c.w.Write(p)
	c.n += int64(n)
	return n, err
}

// relayStreamedChunk forwards a chunk to the client as its bytes arrive from
// the platform, instead of downloading the whole chunk before the first byte,
// and tees it into the ciphertext cache. The bytes are hashed on the way
// through and only cached when they match the stored sha. A failure before the
// first byte writes nothing and is returned, so the caller answers it like any
// other fetch failure (including confirming a lost chunk); after it, the
// response is aborted so a truncated chunk can never look complete (clients
// verify the sha anyway).
func relayStreamedChunk(ctx context.Context, w http.ResponseWriter, streamer adapters.ChunkStreamer, chunk types.ChunkRef) error {
	setChunkHeaders(w, chunk)
	hasher := sha256.New()
	cache := openChunkCacheWriter(chunk.ChunkID)
	out := &countingWriter{w: w}
	_, err := streamer.DownloadTo(ctx, chunk, io.MultiWriter(out, hasher, cache))
	if err == nil && chunk.SHA256 != "" && !strings.EqualFold(hex.EncodeToString(hasher.Sum(nil)), chunk.SHA256) {
		err = fmt.Errorf("sha mismatch for chunk %s", chunk.ChunkID)
	}
	if err == nil {
		if chunk.SHA256 != "" {
			cache.commit()
		} else {
			cache.discard()
		}
		return nil
	}
	cache.discard()
	log.Printf("download: chunk stream failed: %v", err)
	if out.n > 0 {
		panic(http.ErrAbortHandler)
	}
	for _, h := range []string{"Cache-Control", "X-Chunk-SHA256", "X-Chunk-Compressed"} {
		w.Header().Del(h)
	}
	return err
}
