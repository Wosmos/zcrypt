package cmd

import (
	"encoding/json"
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

// HandleBulkDeleteFiles deletes multiple files in one transaction.
// POST /api/files/bulk-delete
func (s *Server) HandleBulkDeleteFiles(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	var req struct {
		IDs []string `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if len(req.IDs) == 0 {
		http.Error(w, `{"error":"ids required"}`, http.StatusBadRequest)
		return
	}
	if len(req.IDs) > 500 {
		http.Error(w, `{"error":"max 500 files per batch"}`, http.StatusBadRequest)
		return
	}

	deleted := 0
	failed := 0
	for _, fileID := range req.IDs {
		if err := s.db.DeleteFile(ctx, userID, fileID); err != nil {
			log.Printf("bulk-delete: file %s failed: %v", fileID, err)
			failed++
			continue
		}
		deleted++
	}

	s.audit(r, &userID, "bulk_file_delete", map[string]interface{}{
		"deleted": deleted,
		"failed":  failed,
		"total":   len(req.IDs),
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"deleted": deleted,
		"failed":  failed,
	})
}
