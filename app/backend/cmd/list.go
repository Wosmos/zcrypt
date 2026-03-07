package cmd

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/zpush/zpush/types"
)

// HandleListFiles returns all stored files.
// GET /api/files?filter=optional_search
func (s *Server) HandleListFiles(w http.ResponseWriter, r *http.Request) {
	filter := r.URL.Query().Get("filter")

	files, err := s.db.ListFiles(filter)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err), http.StatusInternalServerError)
		return
	}

	if files == nil {
		files = []types.FileMetadata{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(files)
}
