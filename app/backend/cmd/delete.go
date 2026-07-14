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

	// Cross-device sync: the row survives (trash), so this bumps its rev and
	// pushes a "deleted" event; offline devices pick it up via /api/changes.
	s.emitFileChange(ctx, userID, fileID, "deleted")

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

	// byos-direct deletion: the owner's device already removed the ciphertext
	// from the user's OWN storage (it holds the token), so the server only drops
	// the metadata — no pending_deletions queue, no deletion-worker load. This is
	// the delete counterpart to byos-direct upload: bytes never transit us.
	if r.URL.Query().Get("client_deleted") == "true" {
		if err := s.db.PurgeFileMetadata(ctx, userID, fileID); err != nil {
			log.Printf("files: metadata purge failed: %v", err)
			http.Error(w, `{"error":"failed to delete file"}`, http.StatusInternalServerError)
			return
		}
		s.emitFileChange(ctx, userID, fileID, "deleted")
		s.audit(r, &userID, "file_purge_client", map[string]interface{}{"file_id": fileID})
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true}`))
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

	s.emitFileChange(ctx, userID, fileID, "deleted")
	s.audit(r, &userID, "file_purge", map[string]interface{}{"file_id": fileID})

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"success":true}`))
}

// bulkFileIDs decodes and validates a bulk file-op request body (all three bulk
// handlers share it): requires 1..500 ids and drops malformed uuids up front —
// the set-based statements cast the whole slice to uuid[], so a single bad id
// would abort the entire batch; dropped ids simply count as failed. Writes the
// error response itself and returns ok=false when the request is invalid.
func bulkFileIDs(w http.ResponseWriter, r *http.Request) (total int, validIDs []string, ok bool) {
	var req struct {
		IDs []string `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return 0, nil, false
	}
	if len(req.IDs) == 0 {
		http.Error(w, `{"error":"ids required"}`, http.StatusBadRequest)
		return 0, nil, false
	}
	if len(req.IDs) > 500 {
		http.Error(w, `{"error":"max 500 files per batch"}`, http.StatusBadRequest)
		return 0, nil, false
	}
	validIDs = make([]string, 0, len(req.IDs))
	for _, id := range req.IDs {
		if _, perr := uuid.Parse(id); perr == nil {
			validIDs = append(validIDs, id)
		}
	}
	return len(req.IDs), validIDs, true
}

// respondBulkFileOp finishes a bulk file op: anything the statement didn't touch
// (invalid id, wrong state, or not owned) counts as failed; audits; and writes
// {<key>: done, "failed": failed}.
func (s *Server) respondBulkFileOp(w http.ResponseWriter, r *http.Request, userID, auditEvent, key string, done, total int) {
	failed := total - done
	if failed < 0 {
		failed = 0
	}
	s.audit(r, &userID, auditEvent, map[string]interface{}{
		key:      done,
		"failed": failed,
		"total":  total,
	})
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		key:      done,
		"failed": failed,
	})
}

// HandleBulkDeleteFiles soft-deletes multiple files in one statement (moves them to Trash).
// POST /api/files/bulk-delete
func (s *Server) HandleBulkDeleteFiles(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	total, validIDs, ok := bulkFileIDs(w, r)
	if !ok {
		return
	}

	// Soft-delete the set in a single statement (files move to Trash, recoverable).
	deleted, err := s.db.SoftDeleteFilesBatch(ctx, userID, validIDs)
	if err != nil {
		log.Printf("bulk-delete: failed: %v", err)
		http.Error(w, `{"error":"failed to delete files"}`, http.StatusInternalServerError)
		return
	}
	s.emitFileChanges(ctx, userID, validIDs, "deleted")
	s.respondBulkFileOp(w, r, userID, "bulk_file_delete", "deleted", deleted, total)
}

// HandleBulkPurgeFiles permanently deletes multiple files in a single transaction
// (empties them from Trash). This replaces the old client pattern of firing one
// DELETE /purge request per file in parallel, which — on a large multi-select —
// flooded the per-user rate limiter (429s) and hammered the DB with ~7 round-trips
// per file. Now it's one request and a fixed handful of set-based statements.
// POST /api/files/bulk-purge
func (s *Server) HandleBulkPurgeFiles(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	total, validIDs, ok := bulkFileIDs(w, r)
	if !ok {
		return
	}

	deleted, staged, err := s.db.DeleteFilesBatch(ctx, userID, validIDs)
	if err != nil {
		log.Printf("bulk-purge: failed: %v", err)
		http.Error(w, `{"error":"failed to delete files"}`, http.StatusInternalServerError)
		return
	}

	// Unsynced chunks never reached a platform — remove their staged .enc files.
	removeStagedChunkFiles(staged)

	// Synced chunk refs are now queued in pending_deletions — wake the deletion worker.
	s.signalDeletion()

	s.emitFileChanges(ctx, userID, validIDs, "deleted")
	s.respondBulkFileOp(w, r, userID, "bulk_file_purge", "deleted", deleted, total)
}

// HandleBulkRestoreFiles restores multiple files from Trash in a single statement.
// Replaces the client's per-file restore fan-out (one request each, in parallel).
// POST /api/files/bulk-restore
func (s *Server) HandleBulkRestoreFiles(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	total, validIDs, ok := bulkFileIDs(w, r)
	if !ok {
		return
	}

	restored, err := s.db.RestoreFilesBatch(ctx, userID, validIDs)
	if err != nil {
		log.Printf("bulk-restore: failed: %v", err)
		http.Error(w, `{"error":"failed to restore files"}`, http.StatusInternalServerError)
		return
	}
	// Restored files reappear on other devices — emit "added" (a fresh rev) so a
	// device that saw the "deleted" event brings them back.
	s.emitFileChanges(ctx, userID, validIDs, "added")
	s.respondBulkFileOp(w, r, userID, "bulk_file_restore", "restored", restored, total)
}
