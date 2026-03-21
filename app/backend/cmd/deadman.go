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

// HandleGetDeadManSwitch returns the user's dead man's switch config.
// GET /api/deadman
func (s *Server) HandleGetDeadManSwitch(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	dms, err := s.db.GetDeadManSwitch(r.Context(), userID)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"configured": false,
		})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"configured":    true,
		"contact_email": dms.ContactEmail,
		"contact_name":  dms.ContactName,
		"timeout_days":  dms.TimeoutDays,
		"message":       dms.Message,
		"include_files": dms.IncludeFiles,
		"enabled":       dms.Enabled,
		"last_checkin":  dms.LastCheckin,
		"triggered":     dms.Triggered,
		"triggered_at":  dms.TriggeredAt,
		"created_at":    dms.CreatedAt,
	})
}

// HandleSetupDeadManSwitch configures or updates the dead man's switch.
// POST /api/deadman/setup
func (s *Server) HandleSetupDeadManSwitch(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	var req types.DeadManSwitchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	email := strings.TrimSpace(req.ContactEmail)
	if email == "" || !strings.Contains(email, "@") {
		http.Error(w, `{"error":"valid contact_email is required"}`, http.StatusBadRequest)
		return
	}

	if req.TimeoutDays < 7 || req.TimeoutDays > 365 {
		http.Error(w, `{"error":"timeout_days must be 7-365"}`, http.StatusBadRequest)
		return
	}

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}

	dms := &types.DeadManSwitch{
		ID:           uuid.New().String(),
		UserID:       userID,
		ContactEmail: email,
		ContactName:  strings.TrimSpace(req.ContactName),
		TimeoutDays:  req.TimeoutDays,
		Message:      strings.TrimSpace(req.Message),
		IncludeFiles: req.IncludeFiles,
		Enabled:      enabled,
		LastCheckin:   time.Now(),
		CreatedAt:    time.Now(),
	}

	if err := s.db.UpsertDeadManSwitch(r.Context(), dms); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"setup: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// HandleCheckinDeadManSwitch resets the timer.
// POST /api/deadman/checkin
func (s *Server) HandleCheckinDeadManSwitch(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	if err := s.db.CheckinDeadManSwitch(r.Context(), userID); err != nil {
		http.Error(w, `{"error":"checkin failed"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// HandleDeleteDeadManSwitch removes the dead man's switch.
// DELETE /api/deadman
func (s *Server) HandleDeleteDeadManSwitch(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	if err := s.db.DeleteDeadManSwitch(r.Context(), userID); err != nil {
		http.Error(w, `{"error":"delete failed"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}
