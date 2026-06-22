package cmd

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

	"github.com/zcrypt/zcrypt/types"
)

// File-list result bound. The frontend loads the full library to do search/sort/
// type-filter/pagination entirely client-side, so this is a defensive safety cap
// against a pathologically large account dumping an unbounded result set — not a
// product-facing page size. It is high enough that no realistic account is affected;
// genuine pagination (with server-side sort) would be a separate, larger change.
const (
	defaultFileListLimit = 10000
	maxFileListLimit     = 10000
)

// HandleListFiles returns all stored files for the current user.
// In decoy mode, returns fake decoy files instead.
// GET /api/files?filter=optional_search
func (s *Server) HandleListFiles(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	// Decoy mode: return fake files
	if IsDecoy(r) {
		decoyFiles, err := s.db.ListDecoyFiles(ctx, userID)
		if err != nil {
			decoyFiles = []types.DecoyFile{}
		}
		// Convert to same shape as real files
		fakeFiles := make([]types.FileMetadata, len(decoyFiles))
		for i, df := range decoyFiles {
			fakeFiles[i] = types.FileMetadata{
				ID:           df.ID,
				OriginalName: df.Name,
				OriginalSize: df.Size,
				CreatedAt:    df.CreatedAt,
				Status:       "complete",
			}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(fakeFiles)
		return
	}

	filter := r.URL.Query().Get("filter")

	limit := defaultFileListLimit
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	if limit > maxFileListLimit {
		limit = maxFileListLimit
	}

	files, err := s.db.ListFiles(ctx, userID, filter, limit)
	if err != nil {
		log.Printf("files: list failed: %v", err)
		http.Error(w, `{"error":"failed to list files"}`, http.StatusInternalServerError)
		return
	}

	if files == nil {
		files = []types.FileMetadata{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(files)
}
