package cmd

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/mail"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/zcrypt/zcrypt/index"
	"github.com/zcrypt/zcrypt/types"
)

const maxWrappedSpaceKeyLen = 4096

func validInviteEmail(email string) bool {
	if len(email) > 254 {
		return false
	}
	addr, err := mail.ParseAddress(email)
	return err == nil && addr.Address == email
}

// HandleAddSharedVaultMember invites an existing account to a Space. With a
// wrapped_space_key (sealed to the invitee's public key on the inviter's
// device) the member is active at once. Without one the membership is pending:
// it holds no grant and reads nothing until an owner/admin completes it
// (HandleCompleteSharedVaultMember). A client sends no key when the lookup said
// the invitee has none yet.
//
// Errors are {error, code}: forbidden, invalid_email, invalid_role, self_invite,
// not_found, already_member, already_invited.
// POST /api/shared-vaults/{id}/members {email, role, wrapped_space_key?}
func (s *Server) HandleAddSharedVaultMember(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	vaultID := r.PathValue("id")

	actor := s.spaceActorRank(ctx, vaultID, userID)
	if actor < spaceRoleAdmin {
		writeCodedError(w, http.StatusForbidden, "forbidden", "only the owner or an admin can invite")
		return
	}

	var req types.SharedVaultAddMemberRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeCodedError(w, http.StatusBadRequest, "invalid_request", "invalid request")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if !validInviteEmail(email) {
		writeCodedError(w, http.StatusBadRequest, "invalid_email", "enter a valid email")
		return
	}
	if req.Role == "" {
		req.Role = types.SpaceRoleViewer
	}
	if !validSpaceRole(req.Role) {
		writeCodedError(w, http.StatusBadRequest, "invalid_role", "invalid role")
		return
	}
	if actor < spaceRoleOwner && req.Role == types.SpaceRoleAdmin {
		writeCodedError(w, http.StatusForbidden, "forbidden", "only the owner can grant the admin role")
		return
	}
	if len(req.WrappedSpaceKey) > maxWrappedSpaceKeyLen {
		writeCodedError(w, http.StatusBadRequest, "invalid_request", "wrapped key is too long")
		return
	}

	me, err := s.db.GetUserByID(ctx, userID)
	if err != nil {
		internalError(w, "invite: load caller", err)
		return
	}
	if strings.EqualFold(me.Email, email) {
		writeCodedError(w, http.StatusBadRequest, "self_invite", "you can't invite yourself")
		return
	}
	target, err := s.db.GetUserByEmail(ctx, email)
	if errors.Is(err, pgx.ErrNoRows) {
		writeCodedError(w, http.StatusNotFound, "not_found", "no account with this email")
		return
	}
	if err != nil {
		internalError(w, "invite: find user", err)
		return
	}

	status, err := s.db.SharedVaultMemberStatus(ctx, vaultID, target.ID)
	if err != nil {
		internalError(w, "invite: member status", err)
		return
	}
	switch status {
	case "active":
		writeCodedError(w, http.StatusConflict, "already_member", "already a member")
		return
	case "pending":
		writeCodedError(w, http.StatusConflict, "already_invited", "already invited")
		return
	}

	pk, err := s.db.GetPublicKey(ctx, target.ID)
	if err != nil {
		internalError(w, "invite: invitee key", err)
		return
	}
	member, err := s.db.AddSharedVaultMember(ctx, vaultID, target.ID, userID, req.Role, req.WrappedSpaceKey)
	if errors.Is(err, index.ErrMemberExists) {
		writeCodedError(w, http.StatusConflict, "already_member", "already a member")
		return
	}
	if err != nil {
		internalError(w, "invite: add member", err)
		return
	}
	member.Email = email
	member.Username = target.Username

	switch {
	case member.Status == "active":
		s.notifyUser(target.ID, spaceEvent("inviteReceived", vaultID, map[string]string{"role": member.Role, "username": me.Username}))
		s.spaceMemberAdded(ctx, vaultID, target.ID, member.Role, userID)
	default:
		s.notifyUser(target.ID, userEvent{Type: "invitePending", Data: map[string]string{"username": me.Username}, URL: spaceURL})
		if pk != nil {
			s.spaceKeyNeeded(ctx, vaultID, target.ID)
		}
	}

	writeJSON(w, http.StatusCreated, member)
}

// HandleCompleteSharedVaultMember attaches the space key, sealed to the pending
// member's published public key on the caller's device, and activates them.
// Owner or admin only; the server stores the blob without opening it.
//
// Errors: forbidden, not_pending (no pending invite for that user), no_key
// (the invitee has not published a key), invalid_request.
// POST /api/shared-vaults/{id}/members/{uid}/key {wrapped_space_key}
func (s *Server) HandleCompleteSharedVaultMember(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	vaultID := r.PathValue("id")
	memberUID := r.PathValue("uid")

	if s.spaceActorRank(ctx, vaultID, userID) < spaceRoleAdmin {
		writeCodedError(w, http.StatusForbidden, "forbidden", "only the owner or an admin can complete an invite")
		return
	}

	var req struct {
		WrappedSpaceKey string `json:"wrapped_space_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.WrappedSpaceKey == "" || len(req.WrappedSpaceKey) > maxWrappedSpaceKeyLen {
		writeCodedError(w, http.StatusBadRequest, "invalid_request", "wrapped_space_key is required")
		return
	}
	if _, err := base64.StdEncoding.DecodeString(req.WrappedSpaceKey); err != nil {
		writeCodedError(w, http.StatusBadRequest, "invalid_request", "wrapped_space_key must be base64")
		return
	}

	status, err := s.db.SharedVaultMemberStatus(ctx, vaultID, memberUID)
	if err != nil {
		internalError(w, "complete invite: status", err)
		return
	}
	if status != "pending" {
		writeCodedError(w, http.StatusNotFound, "not_pending", "no pending invite for this user")
		return
	}
	pk, err := s.db.GetPublicKey(ctx, memberUID)
	if err != nil {
		internalError(w, "complete invite: key", err)
		return
	}
	if pk == nil {
		writeCodedError(w, http.StatusConflict, "no_key", "this account has not unlocked its vault yet")
		return
	}

	member, err := s.db.CompleteSharedVaultMember(ctx, vaultID, memberUID, req.WrappedSpaceKey)
	if err != nil {
		internalError(w, "complete invite", err)
		return
	}
	if member == nil {
		writeCodedError(w, http.StatusNotFound, "not_pending", "no pending invite for this user")
		return
	}

	s.notifyUser(memberUID, spaceEvent("inviteReceived", vaultID, map[string]string{"role": member.Role, "username": s.usernameOf(ctx, userID)}))
	s.spaceMemberAdded(ctx, vaultID, memberUID, member.Role, userID)

	writeJSON(w, http.StatusOK, member)
}

// spaceKeyNeeded tells a Space's owner and admins, over live events only, that
// a pending invitee can now receive the space key. Their client seals it and
// calls HandleCompleteSharedVaultMember; a client that was offline finds the
// pending member (status "pending") in the member list on load instead.
func (s *Server) spaceKeyNeeded(ctx context.Context, spaceID, memberID string) {
	_, admins, err := s.db.SharedVaultAudience(ctx, spaceID)
	if err != nil {
		log.Printf("space key needed: audience: %v", err)
		return
	}
	for _, id := range admins {
		s.signalUser(id, spaceEvent("spaceKeyNeeded", spaceID, map[string]string{"user_id": memberID}))
	}
}

// announcePendingKeys runs when a user publishes a key: every Space that was
// waiting on them gets a spaceKeyNeeded.
func (s *Server) announcePendingKeys(ctx context.Context, userID string) {
	spaces, err := s.db.PendingSpacesForUser(ctx, userID)
	if err != nil {
		log.Printf("space key needed: pending spaces: %v", err)
		return
	}
	for _, id := range spaces {
		s.spaceKeyNeeded(ctx, id, userID)
	}
}
