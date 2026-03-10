package cmd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/google/uuid"
	"github.com/zpush/zpush/adapters"
	"github.com/zpush/zpush/config"
	"github.com/zpush/zpush/pipeline"
	"github.com/zpush/zpush/types"
)

// PullRequest is the JSON body for pull requests.
type PullRequest struct {
	Filename   string `json:"filename"`
	Passphrase string `json:"passphrase"`
}

// HandlePull handles file download requests.
// POST /api/pull
func (s *Server) HandlePull(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	userAdapters, err := s.getUserAdapters(ctx, userID)
	if err != nil || len(userAdapters) == 0 {
		http.Error(w, `{"error":"no platform connected"}`, http.StatusBadRequest)
		return
	}

	var req PullRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"invalid request: %s"}`, err), http.StatusBadRequest)
		return
	}

	if req.Filename == "" || req.Passphrase == "" {
		http.Error(w, `{"error":"filename and passphrase required"}`, http.StatusBadRequest)
		return
	}

	// Validate filename: reject path traversal and dangerous characters
	if strings.Contains(req.Filename, "..") || strings.Contains(req.Filename, "/") ||
		strings.Contains(req.Filename, "\\") || strings.ContainsAny(req.Filename, "\x00") ||
		len(req.Filename) > 255 {
		http.Error(w, `{"error":"invalid filename"}`, http.StatusBadRequest)
		return
	}

	// Create temp output directory
	tmpDir, err := config.TmpDir()
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"tmp dir: %s"}`, err), http.StatusInternalServerError)
		return
	}

	outDir := filepath.Join(tmpDir, "download_"+uuid.New().String())
	if err := os.MkdirAll(outDir, 0700); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"create output dir: %s"}`, err), http.StatusInternalServerError)
		return
	}
	defer os.RemoveAll(outDir)

	// Create a pull engine with per-chunk adapter resolution
	resolver := func(ref types.ChunkRef) adapters.PlatformAdapter {
		return s.resolveAdapterForUser(ctx, userID, ref.Platform, ref.Account)
	}

	engine := pipeline.NewPullEngine(s.db, s.progress, userID, resolver)

	// Run the pipeline
	if err := engine.Pull(ctx, req.Filename, req.Passphrase, outDir); err != nil {
		// Check for passphrase error specifically (user-facing)
		errMsg := "download failed"
		if strings.Contains(err.Error(), "decrypt") || strings.Contains(err.Error(), "passphrase") {
			errMsg = "decryption failed — wrong passphrase?"
		}
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, errMsg), http.StatusInternalServerError)
		return
	}

	s.audit(r, &userID, "file_download", map[string]interface{}{"filename": req.Filename})

	// Serve the file
	outputPath := filepath.Join(outDir, req.Filename)
	// Sanitize filename for Content-Disposition header (escape quotes)
	safeName := strings.ReplaceAll(req.Filename, `"`, `\"`)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, safeName))
	http.ServeFile(w, r, outputPath)
}
