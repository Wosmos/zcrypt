package main

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"runtime"

	"github.com/zcrypt/zcrypt-sidecar/api"
	"github.com/zcrypt/zcrypt-sidecar/localdb"
	"github.com/zcrypt/zcrypt-sidecar/pipeline"
)

// Request is the JSON-RPC-style input from Tauri.
type Request struct {
	Method string          `json:"method"`
	Params json.RawMessage `json:"params"`
}

// Response is the JSON output to Tauri.
type Response struct {
	Method string      `json:"method"`
	Status string      `json:"status"` // "ok", "error", "progress"
	Data   interface{} `json:"data,omitempty"`
	Error  string      `json:"error,omitempty"`
}

// Global local database instance — opened once on startup.
var localDB *localdb.DB

func main() {
	// Open local SQLite database
	var err error
	localDB, err = localdb.Open()
	if err != nil {
		log.Fatalf("sidecar: open local db: %v", err)
	}
	defer localDB.Close()

	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 0, 1024*1024), 1024*1024)

	// Emit ready signal
	emit(Response{Method: "ready", Status: "ok", Data: map[string]interface{}{
		"version":  "0.2.0",
		"platform": runtime.GOOS,
		"arch":     runtime.GOARCH,
		"cpus":     runtime.NumCPU(),
		"local_db": true,
	}})

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var req Request
		if err := json.Unmarshal(line, &req); err != nil {
			emit(Response{Status: "error", Error: fmt.Sprintf("invalid request: %v", err)})
			continue
		}

		handleRequest(req)
	}
}

// activeSyncCancel cancels the current sync worker when config changes.
var activeSyncCancel context.CancelFunc

func handleRequest(req Request) {
	switch req.Method {
	case "status":
		emit(Response{Method: "status", Status: "ok", Data: map[string]interface{}{
			"ready": true,
			"cpus":  runtime.NumCPU(),
		}})

	case "upload":
		handleUpload(req.Params)

	case "local_upload":
		handleLocalUpload(req.Params)

	case "start_sync":
		handleStartSync(req.Params)

	case "sync_status":
		handleSyncStatus()

	case "download":
		handleDownload(req.Params)

	default:
		emit(Response{Method: req.Method, Status: "error", Error: fmt.Sprintf("unknown method: %s", req.Method)})
	}
}

// handleLocalUpload encrypts a file and stores it locally (no network).
func handleLocalUpload(params json.RawMessage) {
	var p UploadParams
	if err := json.Unmarshal(params, &p); err != nil {
		emit(Response{Method: "local_upload", Status: "error", Error: fmt.Sprintf("invalid params: %v", err)})
		return
	}

	if p.FilePath == "" || p.Passphrase == "" {
		emit(Response{Method: "local_upload", Status: "error", Error: "file_path and passphrase are required"})
		return
	}

	if _, err := os.Stat(p.FilePath); err != nil {
		emit(Response{Method: "local_upload", Status: "error", Error: fmt.Sprintf("file not found: %v", err)})
		return
	}

	profileName := p.Profile
	if profileName == "" {
		profileName = "normal"
	}
	profile := pipeline.GetProfile(profileName)

	engine := pipeline.NewLocalUploadEngine(localDB, profile)
	err := engine.Upload(context.Background(), p.FilePath, p.Passphrase, func(progress pipeline.UploadProgress) {
		emit(Response{
			Method: "local_upload",
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
		emit(Response{Method: "local_upload", Status: "error", Error: err.Error()})
		return
	}

	emit(Response{Method: "local_upload", Status: "ok"})
}

// handleStartSync starts the background sync worker with the given API config.
func handleStartSync(params json.RawMessage) {
	var p struct {
		BaseURL string `json:"base_url"`
		Token   string `json:"token"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		emit(Response{Method: "start_sync", Status: "error", Error: fmt.Sprintf("invalid params: %v", err)})
		return
	}

	if p.BaseURL == "" || p.Token == "" {
		emit(Response{Method: "start_sync", Status: "error", Error: "base_url and token are required"})
		return
	}

	// Cancel any existing sync worker
	if activeSyncCancel != nil {
		activeSyncCancel()
	}

	tokens := &tokenHolder{access: p.Token}
	client := api.NewClient(p.BaseURL, tokens)

	ctx, cancel := context.WithCancel(context.Background())
	activeSyncCancel = cancel

	log.Printf("sync: starting worker (base_url=%s)", p.BaseURL)

	worker := pipeline.NewSyncWorker(localDB, client)
	go worker.Run(ctx)

	emit(Response{Method: "start_sync", Status: "ok"})
}

// handleSyncStatus returns the current sync state.
func handleSyncStatus() {
	stats, err := localDB.GetSyncStats()
	if err != nil {
		emit(Response{Method: "sync_status", Status: "error", Error: err.Error()})
		return
	}
	emit(Response{Method: "sync_status", Status: "ok", Data: stats})
}

func emit(resp Response) {
	data, _ := json.Marshal(resp)
	fmt.Println(string(data))
}
