package cmd

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/zcrypt/zcrypt/types"
)

// HandleGetPreferences returns the per-device UI preference for the user.
// GET /api/preferences?device_id=xxx
func (s *Server) HandleGetPreferences(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	deviceID := strings.TrimSpace(r.URL.Query().Get("device_id"))

	pref, err := s.db.GetDevicePreference(ctx, userID, deviceID)
	if err != nil {
		log.Printf("preferences: get: %v", err)
		http.Error(w, `{"error":"failed to load preferences"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(pref)
}

// HandleSavePreferences upserts the per-device UI preference for the user.
// PUT /api/preferences  { device_id, color_theme, mode }
func (s *Server) HandleSavePreferences(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	var req types.DevicePreferenceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	req.DeviceID = strings.TrimSpace(req.DeviceID)
	if req.DeviceID == "" {
		http.Error(w, `{"error":"device_id is required"}`, http.StatusBadRequest)
		return
	}
	// Display-only values; coerce blanks to defaults rather than rejecting.
	if req.ColorTheme == "" {
		req.ColorTheme = "default"
	}
	if req.Mode == "" {
		req.Mode = "system"
	}

	pref, err := s.db.UpsertDevicePreference(ctx, userID, req.DeviceID, req.ColorTheme, req.Mode)
	if err != nil {
		log.Printf("preferences: save: %v", err)
		http.Error(w, `{"error":"failed to save preferences"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(pref)
}
