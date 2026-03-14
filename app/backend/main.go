package main

import (
	"context"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/zcrypt/zcrypt/cmd"
	"github.com/zcrypt/zcrypt/config"
	"github.com/zcrypt/zcrypt/crypto"
	"github.com/zcrypt/zcrypt/index"
	"github.com/zcrypt/zcrypt/pipeline"
)

func main() {
	// Setup structured JSON logger
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

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

	// Validate required config
	if cfg.DatabaseURL == "" {
		log.Fatal("DATABASE_URL is required (set via environment or .env file)")
	}
	if cfg.MasterKey == "" {
		log.Fatal("MASTER_KEY is required (set via environment or .env file, 64-char hex = 32 bytes)")
	}
	if err := cfg.Validate(); err != nil {
		log.Fatalf("config validation: %v", err)
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

	// Graceful shutdown on SIGINT/SIGTERM
	var srv *http.Server // set after routes are configured
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		slog.Info("shutting down gracefully", "deadline", "30s")
		cancel() // cancel background workers

		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer shutdownCancel()

		if srv != nil {
			if err := srv.Shutdown(shutdownCtx); err != nil {
				log.Printf("shutdown error: %v", err)
			}
		}
		db.Close()
	}()

	// Setup routes
	mux := http.NewServeMux()

	// Rate limit with SSE exemption, then CORS, then request logging
	rateLimited := cmd.RateLimitMiddleware(50, time.Second, mux)
	handler := requestLogger(corsMiddleware(exemptSSE(rateLimited, mux)))

	// Public auth routes
	mux.HandleFunc("POST /api/auth/register", server.HandleRegister)
	mux.HandleFunc("POST /api/auth/login", server.HandleLogin)
	mux.HandleFunc("POST /api/auth/refresh", server.HandleRefreshToken)
	mux.HandleFunc("POST /api/auth/forgot-password", server.HandleForgotPassword)
	mux.HandleFunc("POST /api/auth/reset-password", server.HandleResetPassword)
	mux.HandleFunc("POST /api/auth/verify-email", server.HandleVerifyEmail)
	mux.HandleFunc("POST /api/auth/resend-verification", server.HandleResendVerification)
	mux.HandleFunc("POST /api/auth/2fa/verify", server.Handle2FAVerify)
	mux.HandleFunc("POST /api/auth/magic-link", server.HandleMagicLinkRequest)
	mux.HandleFunc("POST /api/auth/magic-link/verify", server.HandleMagicLinkVerify)

	// OAuth routes (public — redirect-based)
	mux.HandleFunc("GET /api/auth/oauth/{provider}", server.HandleOAuthStart)
	mux.HandleFunc("GET /api/auth/oauth/{provider}/callback", server.HandleOAuthCallback)

	// Protected auth routes
	mux.HandleFunc("POST /api/auth/logout", server.AuthMiddleware(server.HandleLogout))
	mux.HandleFunc("POST /api/auth/2fa/setup", server.AuthMiddleware(server.Handle2FASetup))
	mux.HandleFunc("POST /api/auth/2fa/enable", server.AuthMiddleware(server.Handle2FAEnable))
	mux.HandleFunc("POST /api/auth/2fa/disable", server.AuthMiddleware(server.Handle2FADisable))
	mux.HandleFunc("GET /api/auth/me", server.AuthMiddleware(server.HandleGetMe))
	mux.HandleFunc("GET /api/auth/activity", server.AdminMiddleware(server.HandleUserActivity))
	mux.HandleFunc("GET /api/auth/linked-accounts", server.AuthMiddleware(server.HandleLinkedAccounts))
	mux.HandleFunc("DELETE /api/auth/linked-accounts/{provider}", server.AuthMiddleware(server.HandleUnlinkAccount))

	// Protected data routes (all require auth)
	mux.HandleFunc("GET /api/files", server.AuthMiddleware(server.HandleListFiles))
	mux.HandleFunc("DELETE /api/files/{id}", server.AuthMiddleware(server.HandleDeleteFile))
	mux.HandleFunc("GET /api/platforms/status", server.AuthMiddleware(server.HandlePlatformStatus))
	mux.HandleFunc("POST /api/platforms/connect", server.AuthMiddleware(server.HandleConnectPlatform))
	mux.HandleFunc("DELETE /api/platforms/disconnect", server.AuthMiddleware(server.HandleDisconnectPlatform))
	mux.HandleFunc("GET /api/repos", server.AuthMiddleware(server.HandleListRepos))
	mux.HandleFunc("GET /api/config", server.AuthMiddleware(server.HandleGetConfig))
	mux.HandleFunc("PUT /api/config", server.AdminMiddleware(server.HandleUpdateConfig))
	mux.HandleFunc("GET /api/events", server.HandleSSE) // SSE auth via query param
	mux.HandleFunc("GET /api/quota", server.AuthMiddleware(server.HandleGetQuota))

	// Client-side encrypted upload (chunked)
	mux.HandleFunc("POST /api/upload/init", server.AuthMiddleware(server.HandleUploadInit))
	mux.HandleFunc("PUT /api/upload/{sid}/chunk/{idx}", server.AuthMiddleware(server.HandleChunkUpload))
	mux.HandleFunc("POST /api/upload/{sid}/presign/{idx}", server.AuthMiddleware(server.HandlePresignChunk))
	mux.HandleFunc("POST /api/upload/{sid}/confirm/{idx}", server.AuthMiddleware(server.HandleConfirmChunk))
	mux.HandleFunc("POST /api/upload/{sid}/complete", server.AuthMiddleware(server.HandleUploadComplete))
	mux.HandleFunc("DELETE /api/upload/{sid}", server.AuthMiddleware(server.HandleUploadCancel))
	mux.HandleFunc("GET /api/upload/{sid}/status", server.AuthMiddleware(server.HandleUploadStatus))

	// Client-side decrypted download (chunked)
	mux.HandleFunc("GET /api/files/{id}/meta", server.AuthMiddleware(server.HandleGetFileMeta))
	mux.HandleFunc("GET /api/files/{id}/chunks/{idx}", server.AuthMiddleware(server.HandleGetChunk))

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
	mux.HandleFunc("GET /api/admin/audit", server.AdminMiddleware(server.HandleAdminAuditLog))
	mux.HandleFunc("GET /api/admin/feedback", server.AdminMiddleware(server.HandleAdminListFeedback))

	// Feedback (authenticated)
	mux.HandleFunc("POST /api/feedback", server.AuthMiddleware(server.HandleSubmitFeedback))
	mux.HandleFunc("GET /api/feedback/status", server.AuthMiddleware(server.HandleGetFeedbackStatus))

	// Health check (public)
	mux.HandleFunc("GET /api/health", server.HandleHealth)

	port := os.Getenv("ZCRYPT_PORT")
	if port == "" {
		port = os.Getenv("zcrypt_PORT") // backward compat
	}
	if port == "" {
		port = "8080"
	}

	srv = &http.Server{
		Addr:         ":" + port,
		Handler:      handler,
		ReadTimeout:  5 * time.Minute,
		WriteTimeout: 10 * time.Minute,
		IdleTimeout:  120 * time.Second,
	}

	slog.Info("server starting", "port", port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
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

// statusWriter wraps http.ResponseWriter to capture the status code.
type statusWriter struct {
	http.ResponseWriter
	code int
}

func (sw *statusWriter) WriteHeader(code int) {
	sw.code = code
	sw.ResponseWriter.WriteHeader(code)
}

func requestLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip logging SSE and health checks
		if strings.HasPrefix(r.URL.Path, "/api/events") || r.URL.Path == "/api/health" {
			next.ServeHTTP(w, r)
			return
		}

		start := time.Now()
		sw := &statusWriter{ResponseWriter: w, code: http.StatusOK}
		next.ServeHTTP(sw, r)

		slog.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", sw.code,
			"duration_ms", time.Since(start).Milliseconds(),
			"ip", r.RemoteAddr,
		)
	})
}

func corsMiddleware(next http.Handler) http.Handler {
	// Build allowed origins from ALLOWED_ORIGINS env var (comma-separated) or FRONTEND_URL fallback
	allowedOrigins := map[string]bool{}
	if origins := os.Getenv("ALLOWED_ORIGINS"); origins != "" {
		for _, o := range strings.Split(origins, ",") {
			allowedOrigins[strings.TrimSpace(o)] = true
		}
	}
	if frontend := os.Getenv("FRONTEND_URL"); frontend != "" {
		allowedOrigins[strings.TrimRight(frontend, "/")] = true
	}
	// Fallback for local development
	if len(allowedOrigins) == 0 {
		allowedOrigins["http://localhost:3000"] = true
		allowedOrigins["http://localhost:8080"] = true
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && allowedOrigins[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Chunk-SHA256, X-Chunk-Compressed")
		w.Header().Set("Access-Control-Expose-Headers", "X-Chunk-SHA256, X-Chunk-Compressed")

		// Security headers
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
