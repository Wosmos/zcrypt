package cmd

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/zcrypt/zcrypt/index"
	"github.com/zcrypt/zcrypt/types"
)

// Page size for GET /api/files. A library larger than one page is walked with
// the X-Next-Cursor response header, so nothing is ever silently dropped.
const (
	defaultFileListLimit = 10000
	maxFileListLimit     = 10000
)

// NextCursorHeader carries the cursor for the next page of GET /api/files; it
// is absent on the last page.
const NextCursorHeader = "X-Next-Cursor"

func encodeFileCursor(f types.FileMetadata) string {
	raw := f.CreatedAt.UTC().Format(time.RFC3339Nano) + "|" + f.ID
	return base64.RawURLEncoding.EncodeToString([]byte(raw))
}

func decodeFileCursor(s string) (*index.FileCursor, error) {
	raw, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return nil, fmt.Errorf("decode cursor: %w", err)
	}
	ts, id, ok := strings.Cut(string(raw), "|")
	if !ok {
		return nil, fmt.Errorf("malformed cursor")
	}
	if _, err := uuid.Parse(id); err != nil {
		return nil, fmt.Errorf("parse cursor id: %w", err)
	}
	t, err := time.Parse(time.RFC3339Nano, ts)
	if err != nil {
		return nil, fmt.Errorf("parse cursor time: %w", err)
	}
	return &index.FileCursor{CreatedAt: t, ID: id}, nil
}

// HandleListFiles returns a page of the current user's files, newest first.
// In decoy mode, returns fake decoy files instead.
// GET /api/files?limit=N&cursor=<X-Next-Cursor of the previous page>
func (s *Server) HandleListFiles(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	// Decoy mode: return fake files
	if IsDecoy(r) {
		decoyFiles, err := s.db.ListDecoyFiles(ctx, userID)
		if err != nil {
			decoyFiles = []types.DecoyFile{}
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(decoyFileList(decoyFiles))
		return
	}

	limit := defaultFileListLimit
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	if limit > maxFileListLimit {
		limit = maxFileListLimit
	}

	var after *index.FileCursor
	if c := r.URL.Query().Get("cursor"); c != "" {
		cur, err := decodeFileCursor(c)
		if err != nil {
			http.Error(w, `{"error":"invalid cursor"}`, http.StatusBadRequest)
			return
		}
		after = cur
	}

	files, err := s.db.ListFiles(ctx, userID, after, limit+1)
	if err != nil {
		log.Printf("files: list failed: %v", err)
		http.Error(w, `{"error":"failed to list files"}`, http.StatusInternalServerError)
		return
	}
	if len(files) > limit {
		files = files[:limit]
		w.Header().Set(NextCursorHeader, encodeFileCursor(files[limit-1]))
	}

	if files == nil {
		files = []types.FileMetadata{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(files)
}

// decoyFileList presents decoy files in the same shape as real ones.
func decoyFileList(decoyFiles []types.DecoyFile) []types.FileMetadata {
	files := make([]types.FileMetadata, len(decoyFiles))
	for i, df := range decoyFiles {
		fm := types.FileMetadata{
			ID:           df.ID,
			OriginalSize: df.Size,
			CreatedAt:    df.CreatedAt,
			Status:       "complete",
		}
		// Sealed names (enc1:) travel exactly like a real file's encrypted_name,
		// so the client opens them with the session passphrase, which in a
		// decoy session IS the decoy password they were sealed under.
		if strings.HasPrefix(df.Name, sealedPrefix) {
			fm.EncryptedName = strings.TrimPrefix(df.Name, sealedPrefix)
		} else {
			fm.OriginalName = df.Name // legacy plaintext; the client re-seals it
		}
		files[i] = fm
	}
	return files
}
