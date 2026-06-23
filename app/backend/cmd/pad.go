package cmd

import (
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/zcrypt/zcrypt/auth"
	"github.com/zcrypt/zcrypt/types"
)

const (
	maxPadPlaintext = 1 << 20                     // 1 MB
	maxPadBlob      = maxPadPlaintext + 28 + 1024 // 1 MB + IV + tag + base64 overhead margin
	padGCMOverhead  = 12 + 16                     // 12B IV + 16B tag
)

var validPadExpiry = map[int]bool{1: true, 24: true, 168: true}

func (s *Server) HandleCreatePad(w http.ResponseWriter, r *http.Request) {
	var req types.PadCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if req.ContentSize <= 0 || req.ContentSize > maxPadPlaintext {
		http.Error(w, `{"error":"content_size must be between 1 and 1048576 bytes"}`, http.StatusBadRequest)
		return
	}
	if !validPadExpiry[req.ExpiresHours] {
		http.Error(w, `{"error":"expires_hours must be 1, 24, or 168"}`, http.StatusBadRequest)
		return
	}

	blob, err := base64.StdEncoding.DecodeString(req.EncryptedBlob)
	if err != nil {
		http.Error(w, `{"error":"invalid base64 in encrypted_blob"}`, http.StatusBadRequest)
		return
	}
	if len(blob) < padGCMOverhead {
		http.Error(w, `{"error":"encrypted_blob too small"}`, http.StatusBadRequest)
		return
	}
	if len(blob) > maxPadBlob {
		http.Error(w, `{"error":"encrypted_blob too large"}`, http.StatusBadRequest)
		return
	}

	token, err := auth.GenerateRandomToken()
	if err != nil {
		log.Printf("pad: generate token: %v", err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	pad := &types.Pad{
		ID:            uuid.New().String(),
		Token:         token,
		EncryptedBlob: blob,
		ContentSize:   req.ContentSize,
		BurnAfterRead: req.BurnAfterRead,
		ExpiresAt:     time.Now().Add(time.Duration(req.ExpiresHours) * time.Hour),
		CreatorIP:     s.clientIP(r),
	}

	if err := s.db.CreatePad(r.Context(), pad); err != nil {
		log.Printf("pad: create: %v", err)
		http.Error(w, `{"error":"failed to create pad"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"token": pad.Token})
}

func (s *Server) HandleGetPadInfo(w http.ResponseWriter, r *http.Request) {
	token := r.PathValue("token")
	if token == "" {
		http.Error(w, `{"error":"missing token"}`, http.StatusBadRequest)
		return
	}

	pad, err := s.db.GetPadByToken(r.Context(), token)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"valid":  false,
			"reason": "Pad not found",
		})
		return
	}

	if reason := validatePad(pad); reason != "" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"valid":  false,
			"reason": reason,
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"valid":           true,
		"content_size":    pad.ContentSize,
		"burn_after_read": pad.BurnAfterRead,
		"expires_at":      pad.ExpiresAt,
	})
}

func (s *Server) HandleGetPadContent(w http.ResponseWriter, r *http.Request) {
	token := r.PathValue("token")
	if token == "" {
		http.Error(w, `{"error":"missing token"}`, http.StatusBadRequest)
		return
	}

	pad, err := s.db.GetPadByToken(r.Context(), token)
	if err != nil {
		http.Error(w, `{"error":"pad not found"}`, http.StatusNotFound)
		return
	}

	if reason := validatePad(pad); reason != "" {
		http.Error(w, `{"error":"`+reason+`"}`, http.StatusGone)
		return
	}

	// Increment view count
	if err := s.db.IncrementPadViews(r.Context(), pad.ID); err != nil {
		log.Printf("pad: increment views: %v", err)
	}

	// If burn-after-read, delete after serving
	if pad.BurnAfterRead {
		defer func() {
			if err := s.db.DeletePad(r.Context(), pad.ID); err != nil {
				log.Printf("pad: burn delete: %v", err)
			}
		}()
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Length", strconv.Itoa(len(pad.EncryptedBlob)))
	w.Header().Set("X-Content-Size", strconv.Itoa(pad.ContentSize))
	w.Write(pad.EncryptedBlob)
}

func validatePad(pad *types.Pad) string {
	if time.Now().After(pad.ExpiresAt) {
		return "This pad has expired"
	}
	if pad.BurnAfterRead && pad.ViewCount > 0 {
		return "This pad has already been viewed (burn after read)"
	}
	return ""
}
