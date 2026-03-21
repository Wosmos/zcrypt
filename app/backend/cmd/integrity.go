package cmd

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/zcrypt/zcrypt/types"
)

// HandleListIntegritySnapshots returns all integrity snapshots for the user.
// GET /api/integrity
func (s *Server) HandleListIntegritySnapshots(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	snaps, err := s.db.ListIntegritySnapshots(ctx, userID)
	if err != nil {
		log.Printf("integrity: list: %v", err)
		http.Error(w, `{"error":"failed to list snapshots"}`, http.StatusInternalServerError)
		return
	}

	if snaps == nil {
		snaps = []types.IntegritySnapshot{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(snaps)
}

// HandleCreateIntegritySnapshot takes a snapshot of a file's hash.
// POST /api/integrity
func (s *Server) HandleCreateIntegritySnapshot(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	var req struct {
		FileID string `json:"file_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.FileID == "" {
		http.Error(w, `{"error":"file_id is required"}`, http.StatusBadRequest)
		return
	}

	// Get file info to snapshot
	meta, err := s.db.GetFileByID(ctx, userID, req.FileID)
	if err != nil {
		http.Error(w, `{"error":"file not found"}`, http.StatusNotFound)
		return
	}

	snap, err := s.db.CreateIntegritySnapshot(ctx, userID, req.FileID, meta.OriginalName, meta.SHA256, meta.OriginalSize)
	if err != nil {
		log.Printf("integrity: create: %v", err)
		http.Error(w, `{"error":"failed to create snapshot"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(snap)
}

// HandleCheckIntegrity verifies a file against its latest snapshot.
// POST /api/integrity/check
func (s *Server) HandleCheckIntegrity(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	var req struct {
		FileID string `json:"file_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.FileID == "" {
		http.Error(w, `{"error":"file_id is required"}`, http.StatusBadRequest)
		return
	}

	// Get current file info
	meta, err := s.db.GetFileByID(ctx, userID, req.FileID)
	if err != nil {
		http.Error(w, `{"error":"file not found"}`, http.StatusNotFound)
		return
	}

	snap, err := s.db.CheckFileIntegrity(ctx, userID, req.FileID, meta.SHA256, meta.OriginalSize)
	if err != nil {
		log.Printf("integrity: check: %v", err)
		http.Error(w, `{"error":"failed to check integrity"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(snap)
}

// HandleGetChangedFiles returns files that have changed since last snapshot.
// GET /api/integrity/changes
func (s *Server) HandleGetChangedFiles(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	snaps, err := s.db.GetChangedFiles(ctx, userID)
	if err != nil {
		log.Printf("integrity: changes: %v", err)
		http.Error(w, `{"error":"failed to get changes"}`, http.StatusInternalServerError)
		return
	}

	if snaps == nil {
		snaps = []types.IntegritySnapshot{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(snaps)
}
