package cmd

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/google/uuid"
)

// HandleDeleteFile soft-deletes a file (moves it to Trash) so it stays recoverable.
// The chunks remain in storage until the file is purged or trash is emptied.
// DELETE /api/files/{id}
func (s *Server) HandleDeleteFile(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	fileID := r.PathValue("id")
	if fileID == "" {
		http.Error(w, `{"error":"file id required"}`, http.StatusBadRequest)
		return
	}

	if err := s.db.SoftDeleteFile(ctx, userID, fileID); err != nil {
		log.Printf("files: soft-delete failed: %v", err)
		http.Error(w, `{"error":"failed to delete file"}`, http.StatusInternalServerError)
		return
	}

	s.audit(r, &userID, "file_delete", map[string]interface{}{"file_id": fileID})

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"success":true}`))
}

// HandlePurgeFile permanently deletes a file and queues its chunks for removal from
// storage platforms. This is the original hard-delete path; it is irreversible.
// DELETE /api/files/{id}/purge
func (s *Server) HandlePurgeFile(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	fileID := r.PathValue("id")
	if fileID == "" {
		http.Error(w, `{"error":"file id required"}`, http.StatusBadRequest)
		return
	}

	staged, err := s.db.DeleteFile(ctx, userID, fileID)
	if err != nil {
		log.Printf("files: purge failed: %v", err)
		http.Error(w, `{"error":"failed to delete file"}`, http.StatusInternalServerError)
		return
	}

	// Unsynced chunks never reached a platform — remove their staged .enc files.
	removeStagedChunkFiles(staged)

	// Synced chunk refs are now queued in pending_deletions — wake the deletion worker.
	s.signalDeletion()

	s.audit(r, &userID, "file_purge", map[string]interface{}{"file_id": fileID})

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"success":true}`))
}

// HandleBulkDeleteFiles soft-deletes multiple files in one statement (moves them to Trash).
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

	// Validate ids up front. The set-based update casts the whole slice to uuid[], so a
	// single malformed id would abort the entire batch. Drop invalid ids here — they
	// simply count as failed — so one bad id can't sink the rest.
	validIDs := make([]string, 0, len(req.IDs))
	for _, id := range req.IDs {
		if _, perr := uuid.Parse(id); perr == nil {
			validIDs = append(validIDs, id)
		}
	}

	// Soft-delete the set in a single statement (files move to Trash, recoverable).
	deleted, err := s.db.SoftDeleteFilesBatch(ctx, userID, validIDs)
	if err != nil {
		log.Printf("bulk-delete: failed: %v", err)
		http.Error(w, `{"error":"failed to delete files"}`, http.StatusInternalServerError)
		return
	}
	// Anything not deleted (invalid id, already trashed, or not owned) counts as failed.
	failed := len(req.IDs) - deleted
	if failed < 0 {
		failed = 0
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
