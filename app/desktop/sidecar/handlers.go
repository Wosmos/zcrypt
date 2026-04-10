package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"github.com/zcrypt/zcrypt-sidecar/api"
	"github.com/zcrypt/zcrypt-sidecar/pipeline"
)

// UploadParams is the input for the upload command.
type UploadParams struct {
	FilePath   string `json:"file_path"`
	Passphrase string `json:"passphrase"`
	BaseURL    string `json:"base_url"`
	Token      string `json:"token"`
	Profile    string `json:"profile"`
	Platform   string `json:"platform"`
}

// DownloadParams is the input for the download command.
type DownloadParams struct {
	FileID     string `json:"file_id"`
	Passphrase string `json:"passphrase"`
	SavePath   string `json:"save_path"`
	BaseURL    string `json:"base_url"`
	Token      string `json:"token"`
	Profile    string `json:"profile"`
}

// tokenHolder implements api.TokenProvider for the sidecar.
type tokenHolder struct {
	access  string
	refresh string
}

func (t *tokenHolder) GetAccessToken() string                                      { return t.access }
func (t *tokenHolder) GetRefreshToken() string                                     { return t.refresh }
func (t *tokenHolder) SetTokens(access, refresh, userID, username, email string) {
	t.access = access
	t.refresh = refresh
}

func handleUpload(params json.RawMessage) {
	var p UploadParams
	if err := json.Unmarshal(params, &p); err != nil {
		emit(Response{Method: "upload", Status: "error", Error: fmt.Sprintf("invalid params: %v", err)})
		return
	}

	if p.FilePath == "" || p.Passphrase == "" {
		emit(Response{Method: "upload", Status: "error", Error: "file_path and passphrase are required"})
		return
	}

	// Verify file exists
	if _, err := os.Stat(p.FilePath); err != nil {
		emit(Response{Method: "upload", Status: "error", Error: fmt.Sprintf("file not found: %v", err)})
		return
	}

	// Create API client
	tokens := &tokenHolder{access: p.Token}
	client := api.NewClient(p.BaseURL, tokens)

	// Get profile (default to normal — ludicrous pegs all cores and eats GBs of RAM)
	profileName := p.Profile
	if profileName == "" {
		profileName = "normal"
	}
	profile := pipeline.GetProfile(profileName)

	// Run upload engine
	engine := pipeline.NewUploadEngine(client, profile)
	err := engine.Upload(context.Background(), p.FilePath, p.Passphrase, func(progress pipeline.UploadProgress) {
		emit(Response{
			Method: "upload",
			Status: "progress",
			Data: map[string]interface{}{
				"file_id":      progress.FileID,
				"file_name":    progress.FileName,
				"stage":        progress.Stage,
				"chunks_done":  progress.ChunksDone,
				"chunks_total": progress.ChunksTotal,
				"bytes_done":   progress.BytesDone,
				"bytes_total":  progress.BytesTotal,
				"speed":        progress.Speed,
			},
		})
	})

	if err != nil {
		emit(Response{Method: "upload", Status: "error", Error: err.Error()})
		return
	}

	emit(Response{Method: "upload", Status: "ok"})
}

func handleDownload(params json.RawMessage) {
	var p DownloadParams
	if err := json.Unmarshal(params, &p); err != nil {
		emit(Response{Method: "download", Status: "error", Error: fmt.Sprintf("invalid params: %v", err)})
		return
	}

	if p.FileID == "" || p.Passphrase == "" || p.SavePath == "" {
		emit(Response{Method: "download", Status: "error", Error: "file_id, passphrase, and save_path are required"})
		return
	}

	// Create API client
	tokens := &tokenHolder{access: p.Token}
	client := api.NewClient(p.BaseURL, tokens)

	// Get profile
	profileName := p.Profile
	if profileName == "" {
		profileName = "normal"
	}
	profile := pipeline.GetProfile(profileName)

	// Run download engine
	engine := pipeline.NewDownloadEngine(client, profile)
	err := engine.Download(context.Background(), p.FileID, p.Passphrase, p.SavePath, func(progress pipeline.DownloadProgress) {
		emit(Response{
			Method: "download",
			Status: "progress",
			Data: map[string]interface{}{
				"file_id":      progress.FileID,
				"file_name":    progress.FileName,
				"stage":        progress.Stage,
				"chunks_done":  progress.ChunksDone,
				"chunks_total": progress.ChunksTotal,
				"bytes_done":   progress.BytesDone,
				"bytes_total":  progress.BytesTotal,
				"speed":        progress.Speed,
			},
		})
	})

	if err != nil {
		emit(Response{Method: "download", Status: "error", Error: err.Error()})
		return
	}

	emit(Response{Method: "download", Status: "ok"})
}
