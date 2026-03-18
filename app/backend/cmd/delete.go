package cmd

import (
	"log"
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
		log.Printf("files: delete failed: %v", err)
		http.Error(w, `{"error":"failed to delete file"}`, http.StatusInternalServerError)
		return
	}

	s.audit(r, &userID, "file_delete", map[string]interface{}{"file_id": fileID})

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"success":true}`))
}
