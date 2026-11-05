package cmd

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/zcrypt/zcrypt/index"
	"github.com/zcrypt/zcrypt/pipeline"
	"github.com/zcrypt/zcrypt/types"
)

// HandleGetPreferences returns the look this device should show: the account
// theme when the device follows it, else the device's own.
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

const (
	maxColorThemeLen  = 64
	maxCustomThemeLen = 4096
	maxDeviceIDLen    = 128
)

var themeModes = map[string]bool{"light": true, "dark": true, "system": true}

// HandleSavePreferences stores this device's look and whether it follows the
// account-wide theme. When the account theme changes, the user's other devices
// are told over the event stream so they repaint straight away.
// PUT /api/preferences  { device_id, color_theme, mode, custom_theme?, sync?, join? }
func (s *Server) HandleSavePreferences(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	var req types.DevicePreferenceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	req.DeviceID = strings.TrimSpace(req.DeviceID)
	if req.DeviceID == "" || req.DeviceID == index.AccountPreferenceDevice || len(req.DeviceID) > maxDeviceIDLen {
		http.Error(w, `{"error":"a valid device_id is required"}`, http.StatusBadRequest)
		return
	}
	if req.ColorTheme == "" {
		req.ColorTheme = "default"
	}
	if len(req.ColorTheme) > maxColorThemeLen {
		http.Error(w, `{"error":"color_theme is too long"}`, http.StatusBadRequest)
		return
	}
	if !themeModes[req.Mode] {
		req.Mode = "system"
	}
	if req.CustomTheme != nil && *req.CustomTheme != "" {
		if len(*req.CustomTheme) > maxCustomThemeLen || !json.Valid([]byte(*req.CustomTheme)) {
			http.Error(w, `{"error":"custom_theme must be a small JSON value"}`, http.StatusBadRequest)
			return
		}
	}
	sync := req.Sync == nil || *req.Sync

	values := index.ThemeValues{ColorTheme: req.ColorTheme, Mode: req.Mode, CustomTheme: req.CustomTheme}
	pref, accountChanged, err := s.db.SaveDevicePreference(ctx, userID, req.DeviceID, values, sync, req.Join)
	if err != nil {
		log.Printf("preferences: save: %v", err)
		http.Error(w, `{"error":"failed to save preferences"}`, http.StatusInternalServerError)
		return
	}
	if accountChanged {
		s.progress.EmitToUser(userID, pipeline.SSEEvent{
			Type: "preferences",
			Payload: map[string]any{
				"device_id":    req.DeviceID,
				"color_theme":  pref.ColorTheme,
				"mode":         pref.Mode,
				"custom_theme": pref.CustomTheme,
			},
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(pref)
}
