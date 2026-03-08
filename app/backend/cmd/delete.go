package cmd

import (
	"fmt"
	"net/http"
)

// HandleDeleteFile deletes a file and its chunks from the index.
// DELETE /api/files/{id}
func (s *Server) HandleDeleteFile(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	fileID := r.PathValue("id")
	if fileID == "" {
		http.Error(w, `{"error":"file id required"}`, http.StatusBadRequest)
		return
	}

	if err := s.db.DeleteFile(ctx, userID, fileID); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"success":true}`))
}
