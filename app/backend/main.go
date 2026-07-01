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

	// `migrate` subcommand: apply the schema (the "db push" equivalent) and exit.
	// Migrations also run automatically on normal startup via index.Open below; this
	// lets you push schema changes without booting the full server. Idempotent.
	if len(os.Args) > 1 && os.Args[1] == "migrate" {
		mdb, err := index.Open(cfg.DatabaseURL)
		if err != nil {
			log.Fatalf("migrate: %v", err)
		}
		mdb.Close()
		slog.Info("migrate: schema applied successfully")
		return
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

	// Seed default plan configs if not already in DB
	server.SeedPlanConfigs(context.Background())

	// Log the effective OAuth config so the exact redirect URIs to register are visible in logs
	server.LogOAuthConfig()

	// Start background cleanup worker for deferred deletions
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	server.StartCleanupWorker(ctx)
	server.StartSyncWorker(ctx)

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

	// Rate limit with SSE exemption, then CORS, then request logging.
	// DEV_MODE=true disables all rate limiting so load tests can run freely.
	var rateLimited http.Handler
	if os.Getenv("DEV_MODE") == "true" {
		log.Println("⚠️  DEV_MODE=true — rate limiting disabled")
		rateLimited = mux
	} else {
		rateLimited = cmd.RateLimitMiddleware(200, time.Second, cfg.TrustedProxyCount, mux)
	}
	handler := requestLogger(corsMiddleware(exemptLongLived(rateLimited, mux)))

	// Register every API route. This is the single source of truth for the
	// route table, shared with the integration test harness (see
	// Server.RegisterRoutes) so tests hit the exact routes that ship.
	server.RegisterRoutes(mux)

	port := os.Getenv("ZCRYPT_PORT")
	if port == "" {
		port = os.Getenv("zcrypt_PORT") // backward compat
	}
	if port == "" {
		port = os.Getenv("PORT") // Railway / cloud providers
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

// exemptLongLived bypasses rate limiting for SSE and WebSocket endpoints.
func exemptLongLived(rateLimited http.Handler, direct http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/events") || strings.HasPrefix(r.URL.Path, "/api/transfer/ws") {
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
		// Skip logging SSE, health checks, and WebSocket endpoints (statusWriter hides http.Hijacker)
		if strings.HasPrefix(r.URL.Path, "/api/events") || r.URL.Path == "/api/health" || r.URL.Path == "/api/transfer/ws" {
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
	// Desktop (Tauri) app webview origins are fixed and first-party. Without
	// these the desktop app's fetches are blocked by CORS ("Load failed" on
	// login, OAuth poll never completes). macOS/Linux use the tauri:// scheme;
	// Windows (WebView2) uses http(s)://tauri.localhost.
	for _, o := range []string{
		"tauri://localhost",
		"http://tauri.localhost",
		"https://tauri.localhost",
	} {
		allowedOrigins[o] = true
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && allowedOrigins[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Chunk-SHA256, X-Chunk-Compressed, X-Share-Password")
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
