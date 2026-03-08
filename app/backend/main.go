package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/zpush/zpush/cmd"
	"github.com/zpush/zpush/config"
	"github.com/zpush/zpush/index"
	"github.com/zpush/zpush/pipeline"
)

func main() {
	// Ensure directories exist
	if err := config.EnsureDirs(); err != nil {
		log.Fatalf("init dirs: %v", err)
	}

	// Clean temp from any previous crash
	if err := config.CleanTmp(); err != nil {
		log.Fatalf("clean tmp: %v", err)
	}

	// Open database
	dbPath, err := config.DBPath()
	if err != nil {
		log.Fatalf("db path: %v", err)
	}

	db, err := index.Open(dbPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

	// Load config
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	// Create progress emitter
	progress := pipeline.NewProgressEmitter()

	// Create API server
	server := cmd.NewServer(db, cfg, progress)

	// Start background cleanup worker for deferred GitHub deletions
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	server.StartCleanupWorker(ctx)

	// Auto-resume any incomplete uploads from previous session
	server.AutoResumeUploads(ctx)

	// Graceful shutdown on SIGINT/SIGTERM
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		fmt.Println("\nshutting down...")
		cancel()
		db.Close()
		os.Exit(0)
	}()

	// Setup routes
	mux := http.NewServeMux()

	// Rate limit with SSE exemption, then CORS
	rateLimited := cmd.RateLimitMiddleware(50, time.Second, mux)
	handler := corsMiddleware(exemptSSE(rateLimited, mux))

	// API routes
	mux.HandleFunc("POST /api/push", server.HandlePush)
	mux.HandleFunc("POST /api/pull", server.HandlePull)
	mux.HandleFunc("GET /api/files", server.HandleListFiles)
	mux.HandleFunc("DELETE /api/files/{id}", server.HandleDeleteFile)
	mux.HandleFunc("GET /api/platforms/status", server.HandlePlatformStatus)
	mux.HandleFunc("POST /api/platforms/connect", server.HandleConnectPlatform)
	mux.HandleFunc("DELETE /api/platforms/disconnect", server.HandleDisconnectPlatform)
	mux.HandleFunc("GET /api/repos", server.HandleListRepos)
	mux.HandleFunc("GET /api/config", server.HandleGetConfig)
	mux.HandleFunc("PUT /api/config", server.HandleUpdateConfig)
	mux.HandleFunc("GET /api/events", server.HandleSSE)
	mux.HandleFunc("GET /api/health", server.HandleHealth)
	mux.HandleFunc("POST /api/upload/pause", server.HandlePauseUpload)
	mux.HandleFunc("POST /api/upload/resume", server.HandleResumeUpload)
	mux.HandleFunc("GET /api/uploads/incomplete", server.HandleListIncompleteUploads)

	port := os.Getenv("ZPUSH_PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Printf("zpush backend listening on :%s\n", port)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatalf("server: %v", err)
	}
}

// exemptSSE bypasses rate limiting for the SSE endpoint.
func exemptSSE(rateLimited http.Handler, direct http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/events") {
			direct.ServeHTTP(w, r)
			return
		}
		rateLimited.ServeHTTP(w, r)
	})
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		} else {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
