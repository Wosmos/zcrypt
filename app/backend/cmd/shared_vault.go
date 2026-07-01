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

	// Membership changes are owner-only: an admin must not be able to invite
	// arbitrary accounts or demote/remove the owner.
	owner, err := s.db.IsSharedVaultOwner(ctx, vaultID, userID)
	if err != nil || !owner {
		http.Error(w, `{"error":"only the vault owner can add members"}`, http.StatusForbidden)
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
	if req.Role != "viewer" && req.Role != "editor" && req.Role != "admin" {
		http.Error(w, `{"error":"invalid role"}`, http.StatusBadRequest)
		return
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

// HandleAddSharedVaultFile shares a file into a space. The caller must be an
// editor/admin member AND own the file (they hold the vault key needed to
// re-wrap the file CEK under the space key). The server stores only the opaque
// space-wrapped CEK it cannot open.
// POST /api/shared-vaults/{id}/files
func (s *Server) HandleAddSharedVaultFile(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	vaultID := r.PathValue("id")

	role, err := s.db.IsSharedVaultMember(ctx, vaultID, userID)
	if err != nil || (role != "admin" && role != "editor") {
		http.Error(w, `{"error":"only editors or admins can add files"}`, http.StatusForbidden)
		return
	}

	var req types.SharedVaultAddFileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}
	if req.FileID == "" || req.WrappedCEK == "" {
		http.Error(w, `{"error":"file_id and wrapped_cek are required"}`, http.StatusBadRequest)
		return
	}

	// The caller must own the file — you can only share files you can decrypt.
	file, err := s.db.GetFileByID(ctx, userID, req.FileID)
	if err != nil {
		http.Error(w, `{"error":"file not found"}`, http.StatusNotFound)
		return
	}

	// Enforce the optional per-space size cap. Usage excludes this file so a
	// re-add (key rotation) isn't counted twice.
	used, limit, err := s.db.SharedVaultUsage(ctx, vaultID, req.FileID)
	if err != nil {
		log.Printf("shared-vaults: usage: %v", err)
		http.Error(w, `{"error":"failed to check space usage"}`, http.StatusInternalServerError)
		return
	}
	if file.OriginalSize < 0 {
		http.Error(w, `{"error":"invalid file size"}`, http.StatusBadRequest)
		return
	}
	// Overflow-safe: compare remaining headroom rather than summing (used+size
	// could wrap). used may already exceed a lowered limit, hence the used>=limit
	// short-circuit.
	if limit > 0 && (used >= limit || limit-used < file.OriginalSize) {
		http.Error(w, `{"error":"space size limit exceeded"}`, http.StatusRequestEntityTooLarge)
		return
	}

	if err := s.db.AddSharedVaultFile(ctx, vaultID, req.FileID, userID, req.WrappedCEK); err != nil {
		log.Printf("shared-vaults: add file: %v", err)
		http.Error(w, `{"error":"failed to add file"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// HandleRemoveSharedVaultFile unshares a file from a space (editor/admin only).
// DELETE /api/shared-vaults/{id}/files/{fid}
func (s *Server) HandleRemoveSharedVaultFile(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	vaultID := r.PathValue("id")
	fileID := r.PathValue("fid")

	role, err := s.db.IsSharedVaultMember(ctx, vaultID, userID)
	if err != nil || (role != "admin" && role != "editor") {
		http.Error(w, `{"error":"only editors or admins can remove files"}`, http.StatusForbidden)
		return
	}

	if err := s.db.RemoveSharedVaultFile(ctx, vaultID, fileID); err != nil {
		log.Printf("shared-vaults: remove file: %v", err)
		http.Error(w, `{"error":"failed to remove file"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// HandleRemoveSharedVaultMember removes a member from a shared vault.
// DELETE /api/shared-vaults/{id}/members/{uid}
func (s *Server) HandleRemoveSharedVaultMember(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	vaultID := r.PathValue("id")
	memberUID := r.PathValue("uid")

	// Membership changes are owner-only.
	owner, err := s.db.IsSharedVaultOwner(ctx, vaultID, userID)
	if err != nil || !owner {
		http.Error(w, `{"error":"only the vault owner can remove members"}`, http.StatusForbidden)
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

// HandleRotateSharedVault re-keys a space after a membership change. The caller
// (admin) generates a new space key client-side, seals it to every remaining
// member, and re-wraps every shared file's CEK under it; this endpoint just
// stores the opaque results atomically. This is what makes member removal a
// true revocation: a removed member gets no new grant and the re-wrapped files
// render any copy of the old key useless.
// POST /api/shared-vaults/{id}/rotate
func (s *Server) HandleRotateSharedVault(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	vaultID := r.PathValue("id")

	// Owner-only: a re-key that supplies member grants could otherwise be used by
	// a non-owner admin to hand out garbage grants and lock members out.
	owner, err := s.db.IsSharedVaultOwner(ctx, vaultID, userID)
	if err != nil || !owner {
		http.Error(w, `{"error":"only the vault owner can rotate the space key"}`, http.StatusForbidden)
		return
	}

	var req types.SharedVaultRotateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	if err := s.db.RotateSharedVaultKeys(ctx, vaultID, req.Members, req.Files); err != nil {
		log.Printf("shared-vaults: rotate: %v", err)
		http.Error(w, `{"error":"failed to rotate space key"}`, http.StatusInternalServerError)
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
