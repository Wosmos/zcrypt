package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
	"github.com/zpush/zpush/config"
	"github.com/zpush/zpush/pipeline"
)

// HandlePush handles file upload via multipart form.
// POST /api/push
// Form fields: passphrase, file (multipart)
func (s *Server) HandlePush(w http.ResponseWriter, r *http.Request) {
	if len(s.accountKeys) == 0 {
		http.Error(w, `{"error":"no platform connected"}`, http.StatusBadRequest)
		return
	}

	// Parse multipart form (max 500MB in memory, rest to disk)
	if err := r.ParseMultipartForm(500 << 20); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"parse form: %s"}`, err), http.StatusBadRequest)
		return
	}

	passphrase := r.FormValue("passphrase")
	if passphrase == "" {
		http.Error(w, `{"error":"passphrase required"}`, http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"file required: %s"}`, err), http.StatusBadRequest)
		return
	}
	defer file.Close()

	// Write uploaded file to temp location
	tmpDir, err := config.TmpDir()
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"tmp dir: %s"}`, err), http.StatusInternalServerError)
		return
	}

	tmpPath := filepath.Join(tmpDir, uuid.New().String()+"_"+header.Filename)
	tmpFile, err := os.Create(tmpPath)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"create temp file: %s"}`, err), http.StatusInternalServerError)
		return
	}

	if _, err := io.Copy(tmpFile, file); err != nil {
		tmpFile.Close()
		os.Remove(tmpPath)
		http.Error(w, fmt.Sprintf(`{"error":"save file: %s"}`, err), http.StatusInternalServerError)
		return
	}
	tmpFile.Close()
	defer os.Remove(tmpPath)

	// Round-robin select an account
	key := s.nextAccountKey()
	adapter := s.allAdapters[key]
	pool := s.allPools[key]
	if adapter == nil || pool == nil {
		http.Error(w, `{"error":"no platform connected"}`, http.StatusBadRequest)
		return
	}

	// Extract account (username) from compound key "platform:username"
	account := key[strings.Index(key, ":")+1:]

	// Create ephemeral pipeline engine for this upload
	engine := pipeline.NewPipelineEngine(s.db, adapter, pool, s.progress, account)

	// Run the pipeline with original filename
	meta, err := engine.Push(r.Context(), tmpPath, header.Filename, passphrase)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(meta)
}
