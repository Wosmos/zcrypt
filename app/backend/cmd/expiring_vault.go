package cmd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/zcrypt/zcrypt/types"
)

// HandleListExpiringVaults returns all expiring vaults for the user.
// GET /api/vaults/expiring
func (s *Server) HandleListExpiringVaults(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	vaults, err := s.db.ListExpiringVaults(r.Context(), userID)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"list: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	if vaults == nil {
		vaults = []types.ExpiringVault{}
	}

	writeJSON(w, http.StatusOK, vaults)
}

// HandleCreateExpiringVault creates a new expiring vault.
// POST /api/vaults/expiring
func (s *Server) HandleCreateExpiringVault(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	var req types.ExpiringVaultRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		http.Error(w, `{"error":"name is required"}`, http.StatusBadRequest)
		return
	}

	expiresAt, err := time.Parse(time.RFC3339, req.ExpiresAt)
	if err != nil {
		http.Error(w, `{"error":"invalid expires_at format (use ISO 8601)"}`, http.StatusBadRequest)
		return
	}

	if expiresAt.Before(time.Now().Add(time.Hour)) {
		http.Error(w, `{"error":"expiry must be at least 1 hour from now"}`, http.StatusBadRequest)
		return
	}

	vault := &types.ExpiringVault{
		ID:          uuid.New().String(),
		UserID:      userID,
		Name:        name,
		Description: strings.TrimSpace(req.Description),
		ExpiresAt:   expiresAt,
		FileIDs:     req.FileIDs,
		CreatedAt:   time.Now(),
	}

	if vault.FileIDs == nil {
		vault.FileIDs = []string{}
	}

	if err := s.db.CreateExpiringVault(r.Context(), vault); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"create: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, vault)
}

// HandleGetExpiringVault returns a specific expiring vault.
// GET /api/vaults/expiring/{id}
func (s *Server) HandleGetExpiringVault(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	vaultID := r.PathValue("id")

	vault, err := s.db.GetExpiringVault(r.Context(), vaultID, userID)
	if err != nil {
		http.Error(w, `{"error":"vault not found"}`, http.StatusNotFound)
		return
	}

	writeJSON(w, http.StatusOK, vault)
}

// HandleDeleteExpiringVault removes an expiring vault (does not delete files).
// DELETE /api/vaults/expiring/{id}
func (s *Server) HandleDeleteExpiringVault(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	vaultID := r.PathValue("id")

	if err := s.db.DeleteExpiringVault(r.Context(), vaultID, userID); err != nil {
		http.Error(w, `{"error":"delete failed"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}
