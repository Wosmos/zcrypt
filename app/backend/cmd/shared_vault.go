package cmd

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/zcrypt/zcrypt/index"
	"github.com/zcrypt/zcrypt/types"
)

// Space roles, weakest to strongest. The owner is an admin member who also owns
// the space, so they alone can delete it, grant admin and act on other admins.
//
//	viewer  read and download
//	editor  viewer + add and remove files
//	admin   editor + invite/remove viewers and editors, change their roles,
//	        rename and re-limit the space, rotate its key
//	owner   admin + grant admin, act on admins, delete the space
const (
	spaceRoleNone = iota
	spaceRoleViewer
	spaceRoleEditor
	spaceRoleAdmin
	spaceRoleOwner
)

func spaceRank(role string) int {
	switch role {
	case "viewer":
		return spaceRoleViewer
	case "editor":
		return spaceRoleEditor
	case "admin":
		return spaceRoleAdmin
	case "owner":
		return spaceRoleOwner
	}
	return spaceRoleNone
}

// spaceActorRank resolves the caller's effective rank in a space (none when
// they are not a member, which includes a just-removed member).
func (s *Server) spaceActorRank(ctx context.Context, vaultID, userID string) int {
	role, err := s.db.IsSharedVaultMember(ctx, vaultID, userID)
	if err != nil {
		return spaceRoleNone
	}
	if owner, err := s.db.IsSharedVaultOwner(ctx, vaultID, userID); err == nil && owner {
		return spaceRoleOwner
	}
	return spaceRank(role)
}

func validSpaceRole(role string) bool {
	return role == "viewer" || role == "editor" || role == "admin"
}

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

	name, ok := boundedField(req.Name, 120)
	if !ok || name == "" {
		http.Error(w, `{"error":"name is required and must be under 120 characters"}`, http.StatusBadRequest)
		return
	}
	req.Name = name

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

	actor := s.spaceActorRank(ctx, vaultID, userID)
	if actor < spaceRoleAdmin {
		http.Error(w, `{"error":"only the owner or an admin can add members"}`, http.StatusForbidden)
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
	if !validSpaceRole(req.Role) {
		http.Error(w, `{"error":"invalid role"}`, http.StatusBadRequest)
		return
	}
	if actor < spaceRoleOwner {
		if req.Role == "admin" {
			http.Error(w, `{"error":"only the owner can grant the admin role"}`, http.StatusForbidden)
			return
		}
		existing, err := s.db.SharedVaultMemberRoleByEmail(ctx, vaultID, req.Email)
		if err != nil {
			http.Error(w, `{"error":"failed to add member"}`, http.StatusInternalServerError)
			return
		}
		if existing == "admin" {
			http.Error(w, `{"error":"only the owner can change an admin"}`, http.StatusForbidden)
			return
		}
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

	need, err := s.db.SharedVaultNeedsRotation(ctx, vaultID)
	if err != nil {
		internalError(w, "check rotation", err)
		return
	}
	if need {
		http.Error(w, `{"error":"space key must be rotated before adding files"}`, http.StatusConflict)
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

	// The caller must own the file. You can only share files you can decrypt.
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

	if err := s.db.AddSharedVaultFile(ctx, vaultID, req.FileID, userID, req.WrappedCEK, req.WrappedName); err != nil {
		log.Printf("shared-vaults: add file: %v", err)
		http.Error(w, `{"error":"failed to add file"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
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
	_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// HandleRemoveSharedVaultMember removes a member from a shared vault.
// DELETE /api/shared-vaults/{id}/members/{uid}
func (s *Server) HandleRemoveSharedVaultMember(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	vaultID := r.PathValue("id")
	memberUID := r.PathValue("uid")

	actor := s.spaceActorRank(ctx, vaultID, userID)
	if actor == spaceRoleNone {
		http.Error(w, `{"error":"vault not found or access denied"}`, http.StatusNotFound)
		return
	}
	if memberUID != userID {
		if actor < spaceRoleAdmin {
			http.Error(w, `{"error":"only the owner or an admin can remove members"}`, http.StatusForbidden)
			return
		}
		if actor < spaceRoleOwner && s.spaceActorRank(ctx, vaultID, memberUID) >= spaceRoleAdmin {
			http.Error(w, `{"error":"only the owner can remove an admin"}`, http.StatusForbidden)
			return
		}
	}

	removed, err := s.db.RemoveSharedVaultMember(ctx, vaultID, memberUID)
	if err != nil {
		log.Printf("shared-vaults: remove member: %v", err)
		http.Error(w, `{"error":"failed to remove member"}`, http.StatusInternalServerError)
		return
	}
	if !removed {
		http.Error(w, `{"error":"member not found or cannot be removed"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// HandleRotateSharedVault re-keys a space after a membership change. The caller
// (owner) generates a new space key client-side, seals it to every remaining
// member, and re-wraps every shared file's CEK under it; this endpoint just
// stores the opaque results atomically. This is what makes member removal a
// true revocation: a removed member gets no new grant and the re-wrapped files
// render any copy of the old key useless.
// POST /api/shared-vaults/{id}/rotate
func (s *Server) HandleRotateSharedVault(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	vaultID := r.PathValue("id")

	if s.spaceActorRank(ctx, vaultID, userID) < spaceRoleOwner {
		http.Error(w, `{"error":"only the vault owner can rotate the space key"}`, http.StatusForbidden)
		return
	}

	var req types.SharedVaultRotateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	if err := s.db.RotateSharedVaultKeys(ctx, vaultID, req.Members, req.Files); err != nil {
		if errors.Is(err, index.ErrRotationIncomplete) {
			http.Error(w, `{"error":"rotation must cover every member and file"}`, http.StatusConflict)
			return
		}
		log.Printf("shared-vaults: rotate: %v", err)
		http.Error(w, `{"error":"failed to rotate space key"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// HandleDeleteSharedVault deletes a shared vault (owner only).
// DELETE /api/shared-vaults/{id}
func (s *Server) HandleDeleteSharedVault(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	vaultID := r.PathValue("id")

	if s.spaceActorRank(ctx, vaultID, userID) < spaceRoleOwner {
		http.Error(w, `{"error":"only the vault owner can delete the space"}`, http.StatusForbidden)
		return
	}

	if err := s.db.DeleteSharedVault(ctx, userID, vaultID); err != nil {
		log.Printf("shared-vaults: delete: %v", err)
		http.Error(w, `{"error":"failed to delete vault"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// HandleUpdateSharedVault renames / re-limits a space (owner or admin).
// PATCH /api/shared-vaults/{id}
func (s *Server) HandleUpdateSharedVault(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	vaultID := r.PathValue("id")

	if s.spaceActorRank(ctx, vaultID, userID) < spaceRoleAdmin {
		http.Error(w, `{"error":"only the owner or an admin can edit the space"}`, http.StatusForbidden)
		return
	}

	var req types.SharedVaultUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}
	if req.Name != nil {
		n, ok := boundedField(*req.Name, 120)
		if !ok || n == "" {
			http.Error(w, `{"error":"name is required"}`, http.StatusBadRequest)
			return
		}
		req.Name = &n
	}
	if req.Description != nil {
		d, ok := boundedField(*req.Description, 1000)
		if !ok {
			http.Error(w, `{"error":"description is too long"}`, http.StatusBadRequest)
			return
		}
		req.Description = &d
	}
	if req.SizeLimitBytes != nil && *req.SizeLimitBytes < 0 {
		http.Error(w, `{"error":"invalid size limit"}`, http.StatusBadRequest)
		return
	}

	if err := s.db.UpdateSharedVault(ctx, vaultID, req); err != nil {
		log.Printf("shared-vaults: update: %v", err)
		http.Error(w, `{"error":"failed to update space"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
}

// HandleUpdateSharedVaultMemberRole changes a member's role. Admins can move
// viewers and editors between viewer and editor; only the owner can grant admin
// or change an admin.
// PATCH /api/shared-vaults/{id}/members/{uid}
func (s *Server) HandleUpdateSharedVaultMemberRole(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	vaultID := r.PathValue("id")
	memberUID := r.PathValue("uid")

	actor := s.spaceActorRank(ctx, vaultID, userID)
	if actor < spaceRoleAdmin {
		http.Error(w, `{"error":"only the owner or an admin can change roles"}`, http.StatusForbidden)
		return
	}

	var req types.SharedVaultRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || !validSpaceRole(req.Role) {
		http.Error(w, `{"error":"invalid role"}`, http.StatusBadRequest)
		return
	}
	if actor < spaceRoleOwner {
		if req.Role == "admin" {
			http.Error(w, `{"error":"only the owner can grant the admin role"}`, http.StatusForbidden)
			return
		}
		if s.spaceActorRank(ctx, vaultID, memberUID) >= spaceRoleAdmin {
			http.Error(w, `{"error":"only the owner can change an admin"}`, http.StatusForbidden)
			return
		}
	}

	changed, err := s.db.UpdateSharedVaultMemberRole(ctx, vaultID, memberUID, req.Role)
	if err != nil {
		log.Printf("shared-vaults: update role: %v", err)
		http.Error(w, `{"error":"failed to change role"}`, http.StatusInternalServerError)
		return
	}
	if !changed {
		http.Error(w, `{"error":"member not found or cannot be changed"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"success": true})
}
