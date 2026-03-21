package cmd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/zcrypt/zcrypt/types"
)

// HandleListSyncFolders returns all sync folder configs for the authenticated user.
// GET /api/sync/folders
func (s *Server) HandleListSyncFolders(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	folders, err := s.db.ListSyncFolders(r.Context(), userID)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"list sync folders: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	if folders == nil {
		folders = []types.SyncFolder{}
	}

	writeJSON(w, http.StatusOK, folders)
}

// HandleCreateSyncFolder registers a new folder for selective sync.
// POST /api/sync/folders
func (s *Server) HandleCreateSyncFolder(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	var req types.SyncFolderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	// Validate folder path
	path := strings.TrimSpace(req.FolderPath)
	if path == "" {
		http.Error(w, `{"error":"folder_path is required"}`, http.StatusBadRequest)
		return
	}

	// Clean and normalize the path
	path = filepath.ToSlash(filepath.Clean(path))

	label := strings.TrimSpace(req.Label)
	if label == "" {
		// Use the last path component as label
		label = filepath.Base(path)
	}

	deviceName := strings.TrimSpace(req.DeviceName)
	if deviceName == "" {
		deviceName = "default"
	}

	folder := &types.SyncFolder{
		ID:         uuid.New().String(),
		UserID:     userID,
		FolderPath: path,
		Label:      label,
		DeviceName: deviceName,
		Enabled:    true,
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}

	if err := s.db.CreateSyncFolder(r.Context(), folder); err != nil {
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique constraint") {
			http.Error(w, `{"error":"folder already registered for this device"}`, http.StatusConflict)
			return
		}
		http.Error(w, fmt.Sprintf(`{"error":"create sync folder: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, folder)
}

// HandleUpdateSyncFolder updates a sync folder's settings.
// PUT /api/sync/folders/{id}
func (s *Server) HandleUpdateSyncFolder(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	folderID := r.PathValue("id")

	var req types.SyncFolderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	// Get existing
	existing, err := s.db.GetSyncFolder(r.Context(), folderID, userID)
	if err != nil {
		http.Error(w, `{"error":"sync folder not found"}`, http.StatusNotFound)
		return
	}

	enabled := existing.Enabled
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	label := existing.Label
	if req.Label != "" {
		label = strings.TrimSpace(req.Label)
	}

	if err := s.db.UpdateSyncFolder(r.Context(), folderID, userID, enabled, label); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"update sync folder: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// HandleUpdateSyncFolderStats reports sync results from a TUI/desktop client.
// PUT /api/sync/folders/{id}/stats
func (s *Server) HandleUpdateSyncFolderStats(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	folderID := r.PathValue("id")

	var req struct {
		FileCount int   `json:"file_count"`
		TotalSize int64 `json:"total_size"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	if err := s.db.UpdateSyncFolderStats(r.Context(), folderID, userID, req.FileCount, req.TotalSize); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"update stats: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// HandleDeleteSyncFolder removes a sync folder config.
// DELETE /api/sync/folders/{id}
func (s *Server) HandleDeleteSyncFolder(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	folderID := r.PathValue("id")

	if err := s.db.DeleteSyncFolder(r.Context(), folderID, userID); err != nil {
		http.Error(w, `{"error":"delete failed"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}
