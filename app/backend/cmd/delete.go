package cmd

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/google/uuid"
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

	// Chunk refs are now queued in pending_deletions — wake the deletion worker.
	s.signalDeletion()

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

	// Validate ids up front. The set-based delete casts the whole slice to uuid[], so a
	// single malformed id would abort the entire batch (rolling back every valid delete
	// with it). Drop invalid ids here — they simply count as failed — so one bad id can't
	// sink the rest, preserving the old per-file loop's graceful degradation.
	validIDs := make([]string, 0, len(req.IDs))
	for _, id := range req.IDs {
		if _, perr := uuid.Parse(id); perr == nil {
			validIDs = append(validIDs, id)
		}
	}

	// Set-based delete: one transaction, ~4 statements regardless of how many files
	// were selected (the old code ran a full ~7-query transaction per file, serially).
	deleted, err := s.db.DeleteFilesBatch(ctx, userID, validIDs)
	if err != nil {
		log.Printf("bulk-delete: failed: %v", err)
		http.Error(w, `{"error":"failed to delete files"}`, http.StatusInternalServerError)
		return
	}
	// Anything not deleted (invalid id, already gone, or not owned) counts as failed.
	failed := len(req.IDs) - deleted
	if failed < 0 {
		failed = 0
	}

	// Chunk refs are now queued in pending_deletions — wake the deletion worker.
	if deleted > 0 {
		s.signalDeletion()
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
