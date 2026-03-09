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
	"github.com/zpush/zpush/crypto"
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

	// Load config
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	// Validate required env vars
	if cfg.DatabaseURL == "" {
		log.Fatal("DATABASE_URL is required (set via environment or .env file)")
	}
	if cfg.MasterKey == "" {
		log.Fatal("MASTER_KEY is required (set via environment or .env file, 64-char hex = 32 bytes)")
	}

	// Parse master key
	masterKey, err := crypto.ParseMasterKey(cfg.MasterKey)
	if err != nil {
		log.Fatalf("parse master key: %v", err)
	}

	// Open database (PostgreSQL via pgxpool)
	db, err := index.Open(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

	// Create progress emitter
	progress := pipeline.NewProgressEmitter()

	// Create API server
	server := cmd.NewServer(db, cfg, progress, masterKey)

	// Start background cleanup worker for deferred deletions
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

	// Public auth routes
	mux.HandleFunc("POST /api/auth/register", server.HandleRegister)
	mux.HandleFunc("POST /api/auth/login", server.HandleLogin)
	mux.HandleFunc("POST /api/auth/refresh", server.HandleRefreshToken)
	mux.HandleFunc("POST /api/auth/forgot-password", server.HandleForgotPassword)
	mux.HandleFunc("POST /api/auth/reset-password", server.HandleResetPassword)
	mux.HandleFunc("POST /api/auth/verify-email", server.HandleVerifyEmail)
	mux.HandleFunc("POST /api/auth/resend-verification", server.HandleResendVerification)
	mux.HandleFunc("POST /api/auth/2fa/verify", server.Handle2FAVerify)

	// Protected auth routes
	mux.HandleFunc("POST /api/auth/logout", server.AuthMiddleware(server.HandleLogout))
	mux.HandleFunc("POST /api/auth/2fa/setup", server.AuthMiddleware(server.Handle2FASetup))
	mux.HandleFunc("POST /api/auth/2fa/enable", server.AuthMiddleware(server.Handle2FAEnable))
	mux.HandleFunc("POST /api/auth/2fa/disable", server.AuthMiddleware(server.Handle2FADisable))
	mux.HandleFunc("GET /api/auth/me", server.AuthMiddleware(server.HandleGetMe))

	// Protected data routes (all require auth)
	mux.HandleFunc("POST /api/push", server.AuthMiddleware(server.HandlePush))
	mux.HandleFunc("POST /api/pull", server.AuthMiddleware(server.HandlePull))
	mux.HandleFunc("GET /api/files", server.AuthMiddleware(server.HandleListFiles))
	mux.HandleFunc("DELETE /api/files/{id}", server.AuthMiddleware(server.HandleDeleteFile))
	mux.HandleFunc("GET /api/platforms/status", server.AuthMiddleware(server.HandlePlatformStatus))
	mux.HandleFunc("POST /api/platforms/connect", server.AuthMiddleware(server.HandleConnectPlatform))
	mux.HandleFunc("DELETE /api/platforms/disconnect", server.AuthMiddleware(server.HandleDisconnectPlatform))
	mux.HandleFunc("GET /api/repos", server.AuthMiddleware(server.HandleListRepos))
	mux.HandleFunc("GET /api/config", server.AuthMiddleware(server.HandleGetConfig))
	mux.HandleFunc("PUT /api/config", server.AdminMiddleware(server.HandleUpdateConfig))
	mux.HandleFunc("GET /api/events", server.HandleSSE) // SSE auth via query param
	mux.HandleFunc("POST /api/upload/pause", server.AuthMiddleware(server.HandlePauseUpload))
	mux.HandleFunc("POST /api/upload/resume", server.AuthMiddleware(server.HandleResumeUpload))
	mux.HandleFunc("GET /api/uploads/incomplete", server.AuthMiddleware(server.HandleListIncompleteUploads))
	mux.HandleFunc("GET /api/quota", server.AuthMiddleware(server.HandleGetQuota))

	// Admin routes
	mux.HandleFunc("GET /api/admin/users", server.AdminMiddleware(server.HandleAdminListUsers))
	mux.HandleFunc("GET /api/admin/stats", server.AdminMiddleware(server.HandleAdminStats))
	mux.HandleFunc("PUT /api/admin/users/{id}/role", server.AdminMiddleware(server.HandleAdminSetRole))
	mux.HandleFunc("DELETE /api/admin/users/{id}", server.AdminMiddleware(server.HandleAdminDeleteUser))
	mux.HandleFunc("GET /api/admin/tokens", server.AdminMiddleware(server.HandleAdminListTokens))
	mux.HandleFunc("POST /api/admin/tokens", server.AdminMiddleware(server.HandleAdminCreateToken))
	mux.HandleFunc("DELETE /api/admin/tokens/{id}", server.AdminMiddleware(server.HandleAdminDeleteToken))
	mux.HandleFunc("GET /api/admin/quota", server.AdminMiddleware(server.HandleAdminGetDefaultQuota))
	mux.HandleFunc("PUT /api/admin/quota", server.AdminMiddleware(server.HandleAdminSetDefaultQuota))
	mux.HandleFunc("PUT /api/admin/users/{id}/quota", server.AdminMiddleware(server.HandleAdminSetUserQuota))
	mux.HandleFunc("PUT /api/admin/users/{id}/plan", server.AdminMiddleware(server.HandleAdminSetPlan))

	// Health check (public)
	mux.HandleFunc("GET /api/health", server.HandleHealth)

	port := os.Getenv("ZPUSH_PORT")
	if port == "" {
		port = "8080"
	}

	fmt.Printf("zstash backend listening on :%s\n", port)
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
