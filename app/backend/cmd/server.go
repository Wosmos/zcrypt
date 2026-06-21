package cmd

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/zcrypt/zcrypt/adapters"
	"github.com/zcrypt/zcrypt/config"
	"github.com/zcrypt/zcrypt/crypto"
	"github.com/zcrypt/zcrypt/index"
	"github.com/zcrypt/zcrypt/pipeline"
	"github.com/zcrypt/zcrypt/reppool"
	"github.com/zcrypt/zcrypt/types"
)

// Server holds shared state for all HTTP handlers.
type Server struct {
	db        *index.DB
	cfg       *config.Config
	progress  *pipeline.ProgressEmitter
	masterKey []byte

	// Per-user adapter cache: userID → (platform:username → adapter)
	adapterMu    sync.RWMutex
	adapterCache map[string]map[string]adapters.PlatformAdapter
	poolCache    map[string]map[string]*reppool.Manager

	// Cached plan configurations
	planMu    sync.RWMutex
	planCache *types.PlanConfigs

	// Auth-specific rate limiter: stricter limits for login/register (5 req per 5 min per IP)
	authLimiter *rateLimiter
	// Per-email rate limiter: 3 req per 15 min for login/magic-link/forgot-password
	emailLimiter *rateLimiter
	// Per-user rate limiter: 100 req per 1 min for authenticated API calls
	userLimiter *rateLimiter
	// Share endpoint rate limiter: 30 req per 1 min per IP (prevents brute-force)
	shareLimiter *rateLimiter
	// Send init rate limiter: 5 inits per hour per IP (anonymous upload)
	sendLimiter *rateLimiter
	// Pad create rate limiter: 10 creates per hour per IP
	padLimiter *rateLimiter

	// Global adapter cache for anonymous sends (uses global platform tokens)
	globalAdapterMu    sync.RWMutex
	globalAdapterCache map[string]adapters.PlatformAdapter

	// WebSocket transfer hub for real-time device-to-device transfer
	transferHub *transferHub

	// Desktop OAuth: temporary token store for poll-based auth flow
	desktopSessionsMu sync.Mutex
	desktopSessions   map[string]*desktopOAuthResult

	// syncCh is signaled by upload handlers when a new chunk is staged.
	// The sync worker wakes immediately instead of waiting for the next poll.
	syncCh chan struct{}

	// devMode disables all per-route rate limiting when DEV_MODE=true.
	devMode bool
}

type desktopOAuthResult struct {
	AccessToken  string    `json:"access_token"`
	RefreshToken string    `json:"refresh_token"`
	Error        string    `json:"error,omitempty"`
	CreatedAt    time.Time `json:"-"`
}

// NewServer creates a new API server.
func NewServer(db *index.DB, cfg *config.Config, progress *pipeline.ProgressEmitter, masterKey []byte) *Server {
	return &Server{
		db:                 db,
		cfg:                cfg,
		progress:           progress,
		masterKey:          masterKey,
		adapterCache:       make(map[string]map[string]adapters.PlatformAdapter),
		poolCache:          make(map[string]map[string]*reppool.Manager),
		authLimiter:        newRateLimiter(5, 5*time.Minute),
		emailLimiter:       newRateLimiter(3, 15*time.Minute),
		userLimiter:        newRateLimiter(600, time.Minute),
		shareLimiter:       newRateLimiter(30, time.Minute),
		sendLimiter:        newRateLimiter(5, time.Hour),
		padLimiter:         newRateLimiter(10, time.Hour),
		globalAdapterCache: make(map[string]adapters.PlatformAdapter),
		transferHub:        newTransferHub(),
		desktopSessions:    make(map[string]*desktopOAuthResult),
		syncCh:             make(chan struct{}, 1),
		devMode:            os.Getenv("DEV_MODE") == "true",
	}
}

// getUserAdapters returns all adapters for a user (own tokens + global tokens).
// Results are cached per userID.
func (s *Server) getUserAdapters(ctx context.Context, userID string) (map[string]adapters.PlatformAdapter, error) {
	s.adapterMu.RLock()
	if cached, ok := s.adapterCache[userID]; ok {
		s.adapterMu.RUnlock()
		return cached, nil
	}
	s.adapterMu.RUnlock()

	// Load tokens from DB (user's own + global)
	tokens, err := s.db.GetPlatformTokens(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("get platform tokens: %w", err)
	}

	userAdapters := make(map[string]adapters.PlatformAdapter)

	for _, tok := range tokens {
		// Derive KEK for the token owner (not the current user, since global tokens belong to their creator)
		kek, err := crypto.DeriveUserKEK(s.masterKey, tok.UserID)
		if err != nil {
			log.Printf("warn: derive KEK for token %s: %v", tok.ID, err)
			continue
		}

		plaintext, err := crypto.DecryptToken(kek, tok.TokenEncrypted, tok.TokenNonce)
		if err != nil {
			log.Printf("warn: decrypt token %s: %v", tok.ID, err)
			continue
		}

		adapter, err := createAdapter(tok.Platform, plaintext)
		if err != nil {
			log.Printf("warn: create adapter for %s/%s: %v", tok.Platform, tok.Username, err)
			continue
		}

		username := getAdapterUsername(adapter)
		key := tok.Platform + ":" + username
		userAdapters[key] = adapter
	}

	s.adapterMu.Lock()
	s.adapterCache[userID] = userAdapters
	s.adapterMu.Unlock()

	return userAdapters, nil
}

// getUserPools returns repo pool managers for a user's adapters.
func (s *Server) getUserPools(ctx context.Context, userID string) (map[string]*reppool.Manager, error) {
	s.adapterMu.RLock()
	if cached, ok := s.poolCache[userID]; ok {
		s.adapterMu.RUnlock()
		return cached, nil
	}
	s.adapterMu.RUnlock()

	userAdapters, err := s.getUserAdapters(ctx, userID)
	if err != nil {
		return nil, err
	}

	pools := make(map[string]*reppool.Manager)
	for key, adapter := range userAdapters {
		parts := strings.SplitN(key, ":", 2)
		platform := parts[0]
		account := parts[1]

		threshold := s.cfg.Thresholds[platform]
		if threshold == 0 {
			switch platform {
			case "github":
				threshold = 850 * 1024 * 1024
			case "gitlab":
				threshold = 9000 * 1024 * 1024
			case "huggingface":
				threshold = 280000 * 1024 * 1024
			case "telegram":
				threshold = 50000 * 1024 * 1024
			}
		}

		pools[key] = reppool.NewManager(s.db, adapter, userID, account, threshold)
	}

	s.adapterMu.Lock()
	s.poolCache[userID] = pools
	s.adapterMu.Unlock()

	return pools, nil
}

// invalidateUserCache clears the adapter/pool cache for a user (on connect/disconnect).
func (s *Server) invalidateUserCache(userID string) {
	s.adapterMu.Lock()
	delete(s.adapterCache, userID)
	delete(s.poolCache, userID)
	s.adapterMu.Unlock()
}

// selectAdapter picks an adapter for a user, optionally filtering by platform.
func (s *Server) selectAdapter(ctx context.Context, userID, targetPlatform string) (string, adapters.PlatformAdapter, *reppool.Manager, error) {
	userAdapters, err := s.getUserAdapters(ctx, userID)
	if err != nil {
		return "", nil, nil, err
	}
	pools, err := s.getUserPools(ctx, userID)
	if err != nil {
		return "", nil, nil, err
	}

	if len(userAdapters) == 0 {
		return "", nil, nil, fmt.Errorf("no platform connected")
	}

	// Find a matching adapter
	for key, adapter := range userAdapters {
		if targetPlatform != "" && !strings.HasPrefix(key, targetPlatform+":") {
			continue
		}
		if pool, ok := pools[key]; ok {
			return key, adapter, pool, nil
		}
	}

	if targetPlatform != "" {
		return "", nil, nil, fmt.Errorf("no %s account connected", targetPlatform)
	}
	return "", nil, nil, fmt.Errorf("no platform connected")
}

// resolveAdapterForUser finds the right adapter for a platform:account key.
func (s *Server) resolveAdapterForUser(ctx context.Context, userID, platform, account string) adapters.PlatformAdapter {
	userAdapters, err := s.getUserAdapters(ctx, userID)
	if err != nil {
		return nil
	}

	// Try exact match
	if account != "" {
		if a, ok := userAdapters[platform+":"+account]; ok {
			return a
		}
	}
	// Fallback: any adapter for that platform
	for key, a := range userAdapters {
		if strings.HasPrefix(key, platform+":") {
			return a
		}
	}
	return nil
}

// getEffectiveQuota returns the effective storage quota in bytes for a user.
//
// zcrypt is free and open source: storage is effectively unlimited (0 = no
// limit). An admin may still set an explicit per-user override for display,
// which is honored here, but nothing in the upload path consults this value
// anymore — uploads are bounded only by the real git-platform thresholds.
func (s *Server) getEffectiveQuota(ctx context.Context, userID string) int64 {
	user, err := s.db.GetUserByID(ctx, userID)
	if err != nil {
		return 0 // unlimited
	}

	// Honor an explicit per-user admin override if one is set (0 = unlimited).
	if user.StorageQuota != nil {
		return *user.StorageQuota
	}

	return 0 // unlimited
}

// getGlobalAdapters returns adapters created from global platform tokens (for anonymous send).
func (s *Server) getGlobalAdapters(ctx context.Context) (map[string]adapters.PlatformAdapter, error) {
	s.globalAdapterMu.RLock()
	if len(s.globalAdapterCache) > 0 {
		cached := s.globalAdapterCache
		s.globalAdapterMu.RUnlock()
		return cached, nil
	}
	s.globalAdapterMu.RUnlock()

	tokens, err := s.db.GetGlobalPlatformTokens(ctx)
	if err != nil {
		return nil, fmt.Errorf("get global platform tokens: %w", err)
	}

	result := make(map[string]adapters.PlatformAdapter)
	for _, tok := range tokens {
		kek, err := crypto.DeriveUserKEK(s.masterKey, tok.UserID)
		if err != nil {
			log.Printf("warn: derive KEK for global token %s: %v", tok.ID, err)
			continue
		}
		plaintext, err := crypto.DecryptToken(kek, tok.TokenEncrypted, tok.TokenNonce)
		if err != nil {
			log.Printf("warn: decrypt global token %s: %v", tok.ID, err)
			continue
		}
		adapter, err := createAdapter(tok.Platform, plaintext)
		if err != nil {
			log.Printf("warn: create global adapter for %s/%s: %v", tok.Platform, tok.Username, err)
			continue
		}
		username := getAdapterUsername(adapter)
		key := tok.Platform + ":" + username
		result[key] = adapter
	}

	s.globalAdapterMu.Lock()
	s.globalAdapterCache = result
	s.globalAdapterMu.Unlock()

	return result, nil
}

// selectGlobalAdapter picks a global adapter for anonymous send operations.
func (s *Server) selectGlobalAdapter(ctx context.Context) (string, adapters.PlatformAdapter, error) {
	adaptersMap, err := s.getGlobalAdapters(ctx)
	if err != nil {
		return "", nil, err
	}
	if len(adaptersMap) == 0 {
		return "", nil, fmt.Errorf("no global platform tokens configured")
	}
	// Pick the first available adapter
	for key, adapter := range adaptersMap {
		return key, adapter, nil
	}
	return "", nil, fmt.Errorf("no global platform available")
}

// invalidateGlobalAdapterCache clears the global adapter cache.
func (s *Server) invalidateGlobalAdapterCache() {
	s.globalAdapterMu.Lock()
	s.globalAdapterCache = make(map[string]adapters.PlatformAdapter)
	s.globalAdapterMu.Unlock()
}

// SendRateLimitMiddleware applies IP-based rate limiting for anonymous send endpoints.
func (s *Server) SendRateLimitMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip := extractIP(r)
		if !s.sendLimiter.allow(ip) {
			http.Error(w, `{"error":"too many send requests, try again later"}`, http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	}
}

func (s *Server) PadRateLimitMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip := extractIP(r)
		if !s.padLimiter.allow(ip) {
			http.Error(w, `{"error":"too many pad requests, try again later"}`, http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	}
}

// createAdapter creates a PlatformAdapter for a given platform and token.
func createAdapter(platform, token string) (adapters.PlatformAdapter, error) {
	switch platform {
	case "github":
		return adapters.NewGithubAdapter(token)
	case "gitlab":
		return adapters.NewGitlabAdapter(token)
	case "huggingface":
		return adapters.NewHuggingFaceAdapter(token)
	case "telegram":
		return adapters.NewTelegramAdapter(token)
	default:
		return nil, fmt.Errorf("unsupported platform: %s", platform)
	}
}

// RegisterRoutes wires all HTTP routes onto mux.
// Extracted here so integration tests can call it directly without importing main.
func (s *Server) RegisterRoutes(mux *http.ServeMux) {
	maxJSON := func(h http.HandlerFunc) http.HandlerFunc {
		return MaxBodyMiddleware(1<<20, h)
	}

	// Public auth
	mux.HandleFunc("POST /api/auth/register", maxJSON(s.HandleRegister))
	mux.HandleFunc("POST /api/auth/login", maxJSON(s.HandleLogin))
	mux.HandleFunc("POST /api/auth/refresh", maxJSON(s.HandleRefreshToken))
	mux.HandleFunc("POST /api/auth/forgot-password", maxJSON(s.HandleForgotPassword))
	mux.HandleFunc("POST /api/auth/reset-password", maxJSON(s.HandleResetPassword))
	mux.HandleFunc("POST /api/auth/verify-email", maxJSON(s.HandleVerifyEmail))
	mux.HandleFunc("POST /api/auth/resend-verification", maxJSON(s.HandleResendVerification))
	mux.HandleFunc("POST /api/auth/2fa/verify", maxJSON(s.Handle2FAVerify))
	mux.HandleFunc("POST /api/auth/magic-link", maxJSON(s.HandleMagicLinkRequest))
	mux.HandleFunc("POST /api/auth/magic-link/verify", maxJSON(s.HandleMagicLinkVerify))

	// OAuth
	mux.HandleFunc("GET /api/auth/oauth/{provider}", s.HandleOAuthStart)
	mux.HandleFunc("GET /api/auth/oauth/{provider}/callback", s.HandleOAuthCallback)
	mux.HandleFunc("GET /api/auth/oauth/desktop-poll", s.HandleDesktopOAuthPoll)

	// Protected auth
	mux.HandleFunc("POST /api/auth/logout", maxJSON(s.AuthMiddleware(s.HandleLogout)))
	mux.HandleFunc("POST /api/auth/2fa/setup", maxJSON(s.AuthMiddleware(s.Handle2FASetup)))
	mux.HandleFunc("POST /api/auth/2fa/enable", maxJSON(s.AuthMiddleware(s.Handle2FAEnable)))
	mux.HandleFunc("POST /api/auth/2fa/disable", maxJSON(s.AuthMiddleware(s.Handle2FADisable)))
	mux.HandleFunc("GET /api/auth/me", s.AuthMiddleware(s.HandleGetMe))
	mux.HandleFunc("GET /api/auth/activity", s.AdminMiddleware(s.HandleUserActivity))
	mux.HandleFunc("GET /api/auth/linked-accounts", s.AuthMiddleware(s.HandleLinkedAccounts))
	mux.HandleFunc("DELETE /api/auth/linked-accounts/{provider}", s.AuthMiddleware(s.HandleUnlinkAccount))

	// Files
	mux.HandleFunc("GET /api/files", s.AuthMiddleware(s.HandleListFiles))
	mux.HandleFunc("DELETE /api/files/{id}", s.AuthMiddleware(s.HandleDeleteFile))
	mux.HandleFunc("POST /api/files/bulk-delete", maxJSON(s.AuthMiddleware(s.HandleBulkDeleteFiles)))
	mux.HandleFunc("GET /api/files/{id}/meta", s.AuthMiddleware(s.HandleGetFileMeta))
	mux.HandleFunc("GET /api/files/{id}/chunks/{idx}", s.AuthMiddleware(s.HandleGetChunk))

	// Platforms
	mux.HandleFunc("GET /api/platforms/status", s.AuthMiddleware(s.HandlePlatformStatus))
	mux.HandleFunc("POST /api/platforms/connect", maxJSON(s.AuthMiddleware(s.HandleConnectPlatform)))
	mux.HandleFunc("DELETE /api/platforms/disconnect", maxJSON(s.AuthMiddleware(s.HandleDisconnectPlatform)))
	mux.HandleFunc("PUT /api/platforms/tokens/{id}/scope", maxJSON(s.AuthMiddleware(s.HandleToggleTokenScope)))
	mux.HandleFunc("GET /api/repos", s.AuthMiddleware(s.HandleListRepos))

	// Config / quota / events
	mux.HandleFunc("GET /api/config", s.AuthMiddleware(s.HandleGetConfig))
	mux.HandleFunc("PUT /api/config", maxJSON(s.AdminMiddleware(s.HandleUpdateConfig)))
	mux.HandleFunc("GET /api/events", s.HandleSSE)
	mux.HandleFunc("GET /api/quota", s.AuthMiddleware(s.HandleGetQuota))

	// Upload
	mux.HandleFunc("POST /api/upload/init", maxJSON(s.AuthMiddleware(s.HandleUploadInit)))
	mux.HandleFunc("PUT /api/upload/{sid}/chunk/{idx}", s.AuthMiddleware(s.HandleChunkUpload))
	mux.HandleFunc("POST /api/upload/{sid}/presign/{idx}", maxJSON(s.AuthMiddleware(s.HandlePresignChunk)))
	mux.HandleFunc("POST /api/upload/{sid}/confirm/{idx}", maxJSON(s.AuthMiddleware(s.HandleConfirmChunk)))
	mux.HandleFunc("POST /api/upload/{sid}/complete", maxJSON(s.AuthMiddleware(s.HandleUploadComplete)))
	mux.HandleFunc("DELETE /api/upload/{sid}", s.AuthMiddleware(s.HandleUploadCancel))
	mux.HandleFunc("GET /api/upload/{sid}/status", s.AuthMiddleware(s.HandleUploadStatus))

	// Shares
	mux.HandleFunc("POST /api/shares", maxJSON(s.AuthMiddleware(s.HandleCreateShare)))
	mux.HandleFunc("GET /api/shares", s.AuthMiddleware(s.HandleListShares))
	mux.HandleFunc("DELETE /api/shares/{id}", s.AuthMiddleware(s.HandleRevokeShare))
	mux.HandleFunc("GET /api/share/{token}", s.ShareRateLimitMiddleware(s.HandleGetShareInfo))
	mux.HandleFunc("GET /api/share/{token}/meta", s.ShareRateLimitMiddleware(s.HandleGetShareFileMeta))
	mux.HandleFunc("GET /api/share/{token}/chunks/{idx}", s.ShareRateLimitMiddleware(s.HandleGetShareChunk))

	// Admin
	mux.HandleFunc("GET /api/admin/users", s.AdminMiddleware(s.HandleAdminListUsers))
	mux.HandleFunc("GET /api/admin/users/{id}", s.AdminMiddleware(s.HandleAdminGetUser))
	mux.HandleFunc("DELETE /api/admin/users/{id}", s.AdminMiddleware(s.HandleAdminDeleteUser))

	// Misc
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})
}

// getAdapterUsername extracts the username from any adapter type.
func getAdapterUsername(adapter adapters.PlatformAdapter) string {
	switch a := adapter.(type) {
	case *adapters.GithubAdapter:
		return a.GetUsername()
	case *adapters.GitlabAdapter:
		return a.GetUsername()
	case *adapters.HuggingFaceAdapter:
		return a.GetUsername()
	case *adapters.TelegramAdapter:
		return a.GetUsername()
	}
	return "unknown"
}
