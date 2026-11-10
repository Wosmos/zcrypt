package cmd

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"

	"github.com/google/uuid"
)

const (
	// maxThumbBytes bounds one sealed preview. Clients pad a ~300px WebP to a
	// size bucket before sealing; this leaves room for the largest bucket.
	maxThumbBytes = 64 << 10
	// minThumbBytes is the AES-GCM overhead (12-byte IV + 16-byte tag): anything
	// shorter can't be a sealed preview.
	minThumbBytes = 28
	maxThumbBatch = 200
)

// HandleSetFileThumb stores the sealed preview of one of the caller's files.
// PUT /api/files/{id}/thumb, body: the sealed bytes (application/octet-stream).
// The server never sees a key; it only keeps the bytes for the owner.
func (s *Server) HandleSetFileThumb(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxThumbBytes))
	if err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			writeError(w, http.StatusRequestEntityTooLarge, "preview too large")
			return
		}
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	if len(body) < minThumbBytes {
		writeError(w, http.StatusBadRequest, "invalid preview")
		return
	}
	found, err := s.db.SetFileThumb(r.Context(), GetUserID(r), r.PathValue("id"), body)
	if err != nil {
		log.Printf("files: set thumb: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to save preview")
		return
	}
	if !found {
		writeError(w, http.StatusNotFound, "file not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// HandleFileThumbs returns the sealed previews of up to maxThumbBatch of the
// caller's files. POST /api/files/thumbs, body {"ids": [...]}; response
// {"thumbs": {"<id>": "<base64>"}}, leaving out files with no preview yet.
func (s *Server) HandleFileThumbs(w http.ResponseWriter, r *http.Request) {
	var req struct {
		IDs []string `json:"ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	if len(req.IDs) == 0 || len(req.IDs) > maxThumbBatch {
		writeError(w, http.StatusBadRequest, "ids must hold 1 to 200 file ids")
		return
	}
	for _, id := range req.IDs {
		if uuid.Validate(id) != nil {
			writeError(w, http.StatusBadRequest, "invalid id")
			return
		}
	}
	thumbs, err := s.db.FileThumbs(r.Context(), GetUserID(r), req.IDs)
	if err != nil {
		log.Printf("files: thumbs: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to load previews")
		return
	}
	out := make(map[string]string, len(thumbs))
	for id, b := range thumbs {
		out[id] = base64.StdEncoding.EncodeToString(b)
	}
	writeJSON(w, http.StatusOK, map[string]any{"thumbs": out})
}
