package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"runtime"
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

func main() {
	scanner := bufio.NewScanner(os.Stdin)
	// Allow large JSON lines (up to 1MB)
	scanner.Buffer(make([]byte, 0, 1024*1024), 1024*1024)

	// Emit ready signal
	emit(Response{Method: "ready", Status: "ok", Data: map[string]interface{}{
		"version":   "0.1.0",
		"platform":  runtime.GOOS,
		"arch":      runtime.GOARCH,
		"cpus":      runtime.NumCPU(),
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

func handleRequest(req Request) {
	switch req.Method {
	case "status":
		emit(Response{Method: "status", Status: "ok", Data: map[string]interface{}{
			"ready": true,
			"cpus":  runtime.NumCPU(),
		}})

	case "upload":
		handleUpload(req.Params)

	case "download":
		handleDownload(req.Params)

	default:
		emit(Response{Method: req.Method, Status: "error", Error: fmt.Sprintf("unknown method: %s", req.Method)})
	}
}

func emit(resp Response) {
	data, _ := json.Marshal(resp)
	fmt.Println(string(data))
}
