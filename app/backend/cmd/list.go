package cmd

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/zcrypt/zcrypt/types"
)

// HandleListFiles returns all stored files for the current user.
// GET /api/files?filter=optional_search
func (s *Server) HandleListFiles(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	filter := r.URL.Query().Get("filter")

	files, err := s.db.ListFiles(ctx, userID, filter)
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
