package cmd

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"

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
	if len(s.accountKeys) == 0 {
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
		// Try exact match first: platform:account
		if ref.Account != "" {
			if a, ok := s.allAdapters[ref.Platform+":"+ref.Account]; ok {
				return a
			}
		}
		// Fallback for legacy chunks (account=""): find any adapter for that platform
		for key, a := range s.allAdapters {
			if len(key) > len(ref.Platform) && key[:len(ref.Platform)+1] == ref.Platform+":" {
				return a
			}
		}
		return nil
	}

	engine := pipeline.NewPullEngine(s.db, s.progress, resolver)

	// Run the pipeline
	if err := engine.Pull(r.Context(), req.Filename, req.Passphrase, outDir); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err), http.StatusInternalServerError)
		return
	}

	// Serve the file
	outputPath := filepath.Join(outDir, req.Filename)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, req.Filename))
	http.ServeFile(w, r, outputPath)
}
