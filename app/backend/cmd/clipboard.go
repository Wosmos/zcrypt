package cmd

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/zcrypt/zcrypt/pipeline"
	"github.com/zcrypt/zcrypt/types"
)

// HandleClipboardPush stores an encrypted clipboard item and notifies the user's other devices.
// POST /api/clipboard
func (s *Server) HandleClipboardPush(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	var req types.ClipboardPushRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}

	// Validate content type
	switch req.ContentType {
	case "text", "image", "link":
	default:
		http.Error(w, `{"error":"content_type must be text, image, or link"}`, http.StatusBadRequest)
		return
	}

	// Validate content size (max 512 KB encrypted)
	if req.ContentSize < 1 || req.ContentSize > 512*1024 {
		http.Error(w, `{"error":"content_size must be 1 to 524288"}`, http.StatusBadRequest)
		return
	}

	// Decode encrypted blob
	blob, err := base64.StdEncoding.DecodeString(req.EncryptedBlob)
	if err != nil {
		http.Error(w, `{"error":"invalid base64 in encrypted_blob"}`, http.StatusBadRequest)
		return
	}

	// Sanity: blob should be at least IV(12) + tag(16) = 28 bytes
	if len(blob) < 28 {
		http.Error(w, `{"error":"encrypted_blob too small"}`, http.StatusBadRequest)
		return
	}

	item := &types.ClipboardItem{
		ID:            uuid.New().String(),
		UserID:        userID,
		ContentType:   req.ContentType,
		EncryptedBlob: blob,
		ContentSize:   req.ContentSize,
		CreatedAt:     time.Now(),
	}

	if err := s.db.InsertClipboardItem(r.Context(), item); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"save clipboard: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	// Prune old items (keep last 30)
	_ = s.db.PruneUserClipboard(r.Context(), userID, 30)

	// Broadcast to user's other SSE connections
	s.progress.EmitToUser(userID, pipeline.SSEEvent{
		Type: "clipboard",
		Payload: map[string]interface{}{
			"id":           item.ID,
			"content_type": item.ContentType,
			"content_size": item.ContentSize,
			"created_at":   item.CreatedAt,
		},
	})

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"id":         item.ID,
		"created_at": item.CreatedAt,
	})
}

// HandleClipboardList returns recent clipboard items for the authenticated user.
// GET /api/clipboard
func (s *Server) HandleClipboardList(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)

	items, err := s.db.ListClipboardItems(r.Context(), userID, 30)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"list clipboard: %s"}`, err.Error()), http.StatusInternalServerError)
		return
	}

	if items == nil {
		items = []types.ClipboardItem{}
	}

	writeJSON(w, http.StatusOK, items)
}

// HandleClipboardGet fetches a single clipboard item's encrypted content.
// GET /api/clipboard/{id}
func (s *Server) HandleClipboardGet(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	itemID := r.PathValue("id")

	item, err := s.db.GetClipboardItem(r.Context(), itemID, userID)
	if err != nil {
		http.Error(w, `{"error":"clipboard item not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("X-Content-Type", item.ContentType)
	w.WriteHeader(http.StatusOK)
	w.Write(item.EncryptedBlob)
}

// HandleClipboardDelete removes a clipboard item.
// DELETE /api/clipboard/{id}
func (s *Server) HandleClipboardDelete(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	itemID := r.PathValue("id")

	if err := s.db.DeleteClipboardItem(r.Context(), itemID, userID); err != nil {
		http.Error(w, `{"error":"delete failed"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}
