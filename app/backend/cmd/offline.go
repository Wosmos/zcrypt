package cmd

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/zcrypt/zcrypt/types"
)

// HandleListOfflinePins returns all offline pins for the user.
// GET /api/offline?device_id=xxx
func (s *Server) HandleListOfflinePins(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	deviceID := r.URL.Query().Get("device_id")

	pins, err := s.db.ListOfflinePins(ctx, userID, deviceID)
	if err != nil {
		log.Printf("offline: list: %v", err)
		http.Error(w, `{"error":"failed to list offline pins"}`, http.StatusInternalServerError)
		return
	}

	if pins == nil {
		pins = []types.OfflinePin{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(pins)
}

// HandlePinOffline pins a file for offline access.
// POST /api/offline
func (s *Server) HandlePinOffline(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	var req types.OfflinePinRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	if req.FileID == "" {
		http.Error(w, `{"error":"file_id is required"}`, http.StatusBadRequest)
		return
	}

	pin, err := s.db.PinFileOffline(ctx, userID, req.FileID, req.DeviceID)
	if err != nil {
		log.Printf("offline: pin: %v", err)
		http.Error(w, `{"error":"failed to pin file"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(pin)
}

// HandleUnpinOffline unpins a file from offline access.
// DELETE /api/offline/{fileId}?device_id=xxx
func (s *Server) HandleUnpinOffline(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)
	fileID := r.PathValue("fileId")
	deviceID := r.URL.Query().Get("device_id")

	if err := s.db.UnpinFileOffline(ctx, userID, fileID, deviceID); err != nil {
		log.Printf("offline: unpin: %v", err)
		http.Error(w, `{"error":"failed to unpin file"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]bool{"success": true})
}
