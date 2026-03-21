package cmd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/zcrypt/zcrypt/auth"
	"github.com/zcrypt/zcrypt/types"
)

// HandleGetDecoyStatus returns whether the user has a decoy vault configured.
// GET /api/decoy
func (s *Server) HandleGetDecoyStatus(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	dv, err := s.db.GetDecoyVault(r.Context(), userID)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"configured": false,
			"enabled":    false,
			"file_count": 0,
		})
		return
	}

	files, _ := s.db.ListDecoyFiles(r.Context(), userID)
	fileCount := 0
	if files != nil {
		fileCount = len(files)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"configured": true,
		"enabled":    dv.Enabled,
		"file_count": fileCount,
		"created_at": dv.CreatedAt,
	})
}

// HandleSetupDecoy configures or updates the decoy vault password.
// POST /api/decoy/setup
func (s *Server) HandleSetupDecoy(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	var req types.DecoySetupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	if req.DecoyPassword == "" {
		http.Error(w, `{"error":"decoy_password is required"}`, http.StatusBadRequest)
		return
	}

	if len(req.DecoyPassword) < 6 {
		http.Error(w, `{"error":"decoy password must be at least 6 characters"}`, http.StatusBadRequest)
		return
	}

	// Make sure decoy password != real password
	user, err := s.db.GetUserByID(r.Context(), userID)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusInternalServerError)
		return
	}

	if auth.CheckPassword(req.DecoyPassword, user.PasswordHash) == nil {
		http.Error(w, `{"error":"decoy password must differ from your real password"}`, http.StatusBadRequest)
		return
	}

	hash, err := auth.HashPassword(req.DecoyPassword)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	dv := &types.DecoyVault{
		ID:                uuid.New().String(),
		UserID:            userID,
		DecoyPasswordHash: hash,
		Enabled:           enabled,
		CreatedAt:         time.Now(),
	}

	if err := s.db.UpsertDecoyVault(r.Context(), dv); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"setup decoy: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// HandleDeleteDecoy removes the decoy vault and all decoy files.
// DELETE /api/decoy
func (s *Server) HandleDeleteDecoy(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	if err := s.db.DeleteDecoyVault(r.Context(), userID); err != nil {
		http.Error(w, `{"error":"delete failed"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// HandleListDecoyFiles returns all decoy files.
// GET /api/decoy/files
func (s *Server) HandleListDecoyFiles(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	files, err := s.db.ListDecoyFiles(r.Context(), userID)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"list decoy files: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	if files == nil {
		files = []types.DecoyFile{}
	}

	writeJSON(w, http.StatusOK, files)
}

// HandleAddDecoyFile adds a fake file to the decoy vault.
// POST /api/decoy/files
func (s *Server) HandleAddDecoyFile(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	var req types.DecoyFileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	if req.Name == "" {
		http.Error(w, `{"error":"name is required"}`, http.StatusBadRequest)
		return
	}

	if req.Size < 0 {
		http.Error(w, `{"error":"size must be non-negative"}`, http.StatusBadRequest)
		return
	}

	file := &types.DecoyFile{
		ID:        uuid.New().String(),
		UserID:    userID,
		Name:      req.Name,
		Size:      req.Size,
		CreatedAt: time.Now(),
	}

	if err := s.db.InsertDecoyFile(r.Context(), file); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"add decoy file: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, file)
}

// HandleDeleteDecoyFile removes a specific decoy file.
// DELETE /api/decoy/files/{id}
func (s *Server) HandleDeleteDecoyFile(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	fileID := r.PathValue("id")

	if err := s.db.DeleteDecoyFile(r.Context(), fileID, userID); err != nil {
		http.Error(w, `{"error":"delete failed"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}
