package cmd

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/zcrypt/zcrypt/types"
)

// HandleListSharedVaults returns all shared vaults the user is a member of.
// GET /api/shared-vaults
func (s *Server) HandleListSharedVaults(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	vaults, err := s.db.ListSharedVaults(ctx, userID)
	if err != nil {
		log.Printf("shared-vaults: list: %v", err)
		http.Error(w, `{"error":"failed to list shared vaults"}`, http.StatusInternalServerError)
		return
	}

	if vaults == nil {
		vaults = []types.SharedVault{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(vaults)
}

// HandleCreateSharedVault creates a new shared vault.
// POST /api/shared-vaults
func (s *Server) HandleCreateSharedVault(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	var req types.SharedVaultRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	if req.Name == "" {
		http.Error(w, `{"error":"name is required"}`, http.StatusBadRequest)
		return
	}

	vault, err := s.db.CreateSharedVault(ctx, userID, req)
	if err != nil {
		log.Printf("shared-vaults: create: %v", err)
		http.Error(w, `{"error":"failed to create shared vault"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(vault)
}

// HandleGetSharedVault returns a shared vault with members.
// GET /api/shared-vaults/{id}
func (s *Server) HandleGetSharedVault(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	vaultID := r.PathValue("id")

	detail, err := s.db.GetSharedVault(ctx, userID, vaultID)
	if err != nil {
		http.Error(w, `{"error":"vault not found or access denied"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(detail)
}

// HandleAddSharedVaultMember adds a member to a shared vault.
// POST /api/shared-vaults/{id}/members
func (s *Server) HandleAddSharedVaultMember(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	vaultID := r.PathValue("id")

	// Check that user is admin of this vault
	role, err := s.db.IsSharedVaultMember(ctx, vaultID, userID)
	if err != nil || role != "admin" {
		http.Error(w, `{"error":"only vault admins can add members"}`, http.StatusForbidden)
		return
	}

	var req types.SharedVaultAddMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	if req.Email == "" {
		http.Error(w, `{"error":"email is required"}`, http.StatusBadRequest)
		return
	}
	if req.Role == "" {
		req.Role = "viewer"
	}

	member, err := s.db.AddSharedVaultMember(ctx, vaultID, req.Email, req.Role, req.WrappedSpaceKey)
	if err != nil {
		log.Printf("shared-vaults: add member: %v", err)
		http.Error(w, `{"error":"failed to add member (user may not exist)"}`, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(member)
}

// HandleRemoveSharedVaultMember removes a member from a shared vault.
// DELETE /api/shared-vaults/{id}/members/{uid}
func (s *Server) HandleRemoveSharedVaultMember(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	vaultID := r.PathValue("id")
	memberUID := r.PathValue("uid")

	// Check that user is admin of this vault
	role, err := s.db.IsSharedVaultMember(ctx, vaultID, userID)
	if err != nil || role != "admin" {
		http.Error(w, `{"error":"only vault admins can remove members"}`, http.StatusForbidden)
		return
	}

	if err := s.db.RemoveSharedVaultMember(ctx, vaultID, memberUID); err != nil {
		log.Printf("shared-vaults: remove member: %v", err)
		http.Error(w, `{"error":"failed to remove member"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// HandleDeleteSharedVault deletes a shared vault (owner only).
// DELETE /api/shared-vaults/{id}
func (s *Server) HandleDeleteSharedVault(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	vaultID := r.PathValue("id")

	if err := s.db.DeleteSharedVault(ctx, userID, vaultID); err != nil {
		log.Printf("shared-vaults: delete: %v", err)
		http.Error(w, `{"error":"failed to delete vault"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}
