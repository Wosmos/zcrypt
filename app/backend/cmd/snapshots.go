package cmd

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/zcrypt/zcrypt/types"
)

// HandleListVaultSnapshots returns all vault snapshots for the user.
// GET /api/snapshots
func (s *Server) HandleListVaultSnapshots(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	snaps, err := s.db.ListVaultSnapshots(ctx, userID)
	if err != nil {
		log.Printf("snapshots: list: %v", err)
		http.Error(w, `{"error":"failed to list snapshots"}`, http.StatusInternalServerError)
		return
	}

	if snaps == nil {
		snaps = []types.VaultSnapshot{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(snaps)
}

// HandleCreateVaultSnapshot captures the current vault state.
// POST /api/snapshots
func (s *Server) HandleCreateVaultSnapshot(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	var req types.VaultSnapshotRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	if req.Label == "" {
		req.Label = "Manual snapshot"
	}

	snap, err := s.db.CreateVaultSnapshot(ctx, userID, req.Label)
	if err != nil {
		log.Printf("snapshots: create: %v", err)
		http.Error(w, `{"error":"failed to create snapshot"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(snap)
}

// HandleGetVaultSnapshot returns a specific snapshot.
// GET /api/snapshots/{id}
func (s *Server) HandleGetVaultSnapshot(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	snapID := r.PathValue("id")

	snap, err := s.db.GetVaultSnapshot(ctx, userID, snapID)
	if err != nil {
		http.Error(w, `{"error":"snapshot not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(snap)
}

// HandleDeleteVaultSnapshot deletes a snapshot.
// DELETE /api/snapshots/{id}
func (s *Server) HandleDeleteVaultSnapshot(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	snapID := r.PathValue("id")

	if err := s.db.DeleteVaultSnapshot(ctx, userID, snapID); err != nil {
		log.Printf("snapshots: delete: %v", err)
		http.Error(w, `{"error":"failed to delete snapshot"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}
