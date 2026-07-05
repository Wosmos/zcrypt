package cmd

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"sort"
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
	// adapterCacheExpiry marks cache entries built with ≥1 failed adapter so the
	// failed tokens get retried after a short TTL instead of being negative-cached
	// until restart. Entries with zero failures never appear here (no expiry).
	adapterCacheExpiry map[string]time.Time
	// adapterErrors records why an adapter failed to build (userID → platform →
	// short token-free reason) so handlers can surface WHY instead of a generic 500.
	adapterErrors map[string]map[string]string

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
	// Transfer-join rate limiter: 5 join attempts per 10 min per IP (pairing-code brute-force guard)
	transferJoinLimiter *rateLimiter
	// Desktop-OAuth poll limiter: 30 polls per minute per IP
	desktopPollLimiter *rateLimiter

	// tokenVersions enforces JWT revocation by checking each access token's
	// version against the user's current token_version (bumped on password
	// reset and admin role change).
	tokenVersions *tokenVersionCache

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

	// deletionCh is signaled by delete handlers when chunk refs are queued into
	// pending_deletions. The deletion worker drains the queue immediately instead
	// of waiting up to its (now idle-backed-off) periodic poll.
	deletionCh chan struct{}

	// devMode disables all per-route rate limiting when DEV_MODE=true.
	devMode bool

	// pushLimiter throttles the sync worker's per-platform push volume to stay
	// under a platform's rate cap (e.g. GitHub's ~7GB/hour), so a large upload
	// can't blow the budget and get the whole account throttled/blocked.
	pushLimiter *pushLimiter
}

// defaultPushLimits caps bytes pushed per platform per hour. GitHub enforces a
// ~7GB/hour push rate; other platforms are unlimited here (absent = no cap).
func defaultPushLimits() map[string]int64 {
	const gb = int64(1) << 30
	return map[string]int64{
		"github": 7 * gb,
	}
}

type desktopOAuthResult struct {
	AccessToken  string    `json:"access_token"`
	RefreshToken string    `json:"refresh_token"`
	Error        string    `json:"error,omitempty"`
	CreatedAt    time.Time `json:"-"`
}

// NewServer creates a new API server.
func NewServer(db *index.DB, cfg *config.Config, progress *pipeline.ProgressEmitter, masterKey []byte) *Server {
	s := &Server{
		db:                  db,
		cfg:                 cfg,
		progress:            progress,
		masterKey:           masterKey,
		adapterCache:        make(map[string]map[string]adapters.PlatformAdapter),
		poolCache:           make(map[string]map[string]*reppool.Manager),
		adapterCacheExpiry:  make(map[string]time.Time),
		adapterErrors:       make(map[string]map[string]string),
		pushLimiter:         newPushLimiter(defaultPushLimits(), time.Hour),
		authLimiter:         newRateLimiter(5, 5*time.Minute),
		emailLimiter:        newRateLimiter(3, 15*time.Minute),
		userLimiter:         newRateLimiter(600, time.Minute),
		shareLimiter:        newRateLimiter(30, time.Minute),
		sendLimiter:         newRateLimiter(5, time.Hour),
		padLimiter:          newRateLimiter(10, time.Hour),
		transferJoinLimiter: newRateLimiter(5, 10*time.Minute),
		desktopPollLimiter:  newRateLimiter(30, time.Minute),
		globalAdapterCache:  make(map[string]adapters.PlatformAdapter),
		transferHub:         newTransferHub(),
		desktopSessions:     make(map[string]*desktopOAuthResult),
		syncCh:              make(chan struct{}, 1),
		deletionCh:          make(chan struct{}, 1),
		devMode:             os.Getenv("DEV_MODE") == "true",
	}
	// Back JWT revocation with a 30s-TTL cache over the user's token_version.
	// The TTL bounds how long a revoked-but-cached token can linger on paths
	// other than the ones that invalidate explicitly (reset / role change).
	s.tokenVersions = newTokenVersionCache(30*time.Second, func(ctx context.Context, userID string) (int, error) {
		u, err := s.db.GetUserByID(ctx, userID)
		if err != nil {
			return 0, err
		}
		return u.TokenVersion, nil
	})
	return s
}

// signalDeletion nudges the deletion worker to drain pending_deletions now instead
// of waiting for its periodic poll. Non-blocking: a full buffer means a drain is
// already pending, so dropping the extra signal is correct.
func (s *Server) signalDeletion() {
	select {
	case s.deletionCh <- struct{}{}:
	default:
	}
}

// adapterRetryTTL is how long an adapter map built with ≥1 creation failure is
// cached before the failed tokens are retried.
const adapterRetryTTL = 60 * time.Second

// getUserAdapters returns all adapters for a user (own tokens + global tokens).
// Results are cached per userID. A map built with ≥1 failed adapter (e.g. the
// platform is unreachable from this server) is still cached — the working
// adapters stay usable — but only for adapterRetryTTL, so failures aren't
// negative-cached until process restart.
func (s *Server) getUserAdapters(ctx context.Context, userID string) (map[string]adapters.PlatformAdapter, error) {
	s.adapterMu.RLock()
	if cached, ok := s.adapterCache[userID]; ok {
		expiry, hasExpiry := s.adapterCacheExpiry[userID]
		if !hasExpiry || time.Now().Before(expiry) {
			s.adapterMu.RUnlock()
			return cached, nil
		}
	}
	s.adapterMu.RUnlock()

	// Load tokens from DB (user's own + global)
	tokens, err := s.db.GetPlatformTokens(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("get platform tokens: %w", err)
	}

	userAdapters := make(map[string]adapters.PlatformAdapter)
	failures := make(map[string]string) // platform → short reason

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
			failures[tok.Platform] = shortAdapterError(err)
			continue
		}

		username := getAdapterUsername(adapter)
		key := tok.Platform + ":" + username
		userAdapters[key] = adapter
	}

	s.adapterMu.Lock()
	s.adapterCache[userID] = userAdapters
	if len(failures) > 0 {
		s.adapterCacheExpiry[userID] = time.Now().Add(adapterRetryTTL)
		s.adapterErrors[userID] = failures
	} else {
		delete(s.adapterCacheExpiry, userID)
		delete(s.adapterErrors, userID)
	}
	// Pools are derived from the adapter map — drop them so they rebuild from
	// this fresh map (a retried adapter that now works must get a pool too).
	delete(s.poolCache, userID)
	s.adapterMu.Unlock()

	return userAdapters, nil
}

// adapterError returns the recorded reason an adapter failed to build for
// user+platform, or "" if none is recorded.
func (s *Server) adapterError(userID, platform string) string {
	s.adapterMu.RLock()
	defer s.adapterMu.RUnlock()
	return s.adapterErrors[userID][platform]
}

// adapterErrorsFor returns a copy of the recorded adapter-construction
// failures for a user (platform → short reason), or nil if none.
func (s *Server) adapterErrorsFor(userID string) map[string]string {
	s.adapterMu.RLock()
	defer s.adapterMu.RUnlock()
	errs := s.adapterErrors[userID]
	if len(errs) == 0 {
		return nil
	}
	out := make(map[string]string, len(errs))
	for platform, reason := range errs {
		out[platform] = reason
	}
	return out
}

// shortAdapterError classifies an adapter-construction failure into a short,
// token-free reason safe to surface to clients. Never return err.Error()
// verbatim: transport errors embed the full request URL, which for Telegram
// contains the bot token.
func shortAdapterError(err error) string {
	var netErr net.Error
	msg := err.Error()
	switch {
	case strings.Contains(msg, "no such host"):
		return "unreachable: DNS lookup failed"
	case strings.Contains(msg, "connection refused"):
		return "unreachable: connection refused"
	case strings.Contains(msg, "TLS handshake timeout"):
		return "unreachable: TLS handshake timeout"
	case strings.Contains(msg, "connection reset"):
		return "unreachable: connection reset"
	case strings.Contains(msg, "context deadline exceeded"),
		errors.As(err, &netErr) && netErr.Timeout():
		return "unreachable: connection timed out"
	case strings.Contains(msg, "401"), strings.Contains(msg, "Unauthorized"):
		return "authentication failed (token may be revoked)"
	}
	return "connection failed"
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
				// HF free tier = 100 GB TOTAL private storage per ACCOUNT (not
				// per repo), so rotation adds no capacity. Keep the per-repo
				// threshold under the whole-account allowance. See config.go.
				threshold = 90 * 1024 * 1024 * 1024
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
	delete(s.adapterCacheExpiry, userID)
	delete(s.adapterErrors, userID)
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

	// Candidate keys are sorted so the choice is deterministic even among
	// multiple accounts on the same platform (map iteration order is random).
	keys := make([]string, 0, len(userAdapters))
	for key := range userAdapters {
		if _, ok := pools[key]; ok {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)

	if targetPlatform != "" {
		for _, key := range keys {
			if strings.HasPrefix(key, targetPlatform+":") {
				return key, userAdapters[key], pools[key], nil
			}
		}
		return "", nil, nil, fmt.Errorf("no %s account connected", targetPlatform)
	}

	// No explicit platform: pick by fixed preference order instead of random
	// map iteration. Telegram first — it is the primary storage backend
	// (effectively unlimited capacity); the git platforms are fallbacks.
	if key := preferredAdapterKey(keys); key != "" {
		return key, userAdapters[key], pools[key], nil
	}
	return "", nil, nil, fmt.Errorf("no platform connected")
}

// adapterPreferenceOrder is the product decision for "Auto" uploads: Telegram
// is the primary storage backend (no capacity ceiling), then github, gitlab,
// huggingface (HF last — its free tier is a 100 GB per-ACCOUNT cap).
var adapterPreferenceOrder = []string{"telegram", "github", "gitlab", "huggingface"}

// preferredAdapterKey picks the first key (from a pre-sorted "platform:account"
// list) whose platform appears earliest in adapterPreferenceOrder. Keys for
// unknown platforms are considered last, in sorted order. Returns "" when keys
// is empty.
func preferredAdapterKey(keys []string) string {
	for _, platform := range adapterPreferenceOrder {
		for _, key := range keys {
			if strings.HasPrefix(key, platform+":") {
				return key
			}
		}
	}
	// Unknown platform keys (future adapters): fall back to the first sorted key.
	if len(keys) > 0 {
		return keys[0]
	}
	return ""
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

// resolveGlobalAdapter returns the global adapter matching a specific
// platform:account key — the account a chunk was actually uploaded with. Picking
// a random global adapter on download/cleanup can land on a different account
// whose token can't see the chunk's private repo, causing intermittent
// "Repository not found" 404s. Falls back to any adapter for the same platform.
func (s *Server) resolveGlobalAdapter(ctx context.Context, platform, account string) (adapters.PlatformAdapter, error) {
	adaptersMap, err := s.getGlobalAdapters(ctx)
	if err != nil {
		return nil, err
	}
	if account != "" {
		if a, ok := adaptersMap[platform+":"+account]; ok {
			return a, nil
		}
	}
	for key, a := range adaptersMap {
		if strings.HasPrefix(key, platform+":") {
			return a, nil
		}
	}
	return nil, fmt.Errorf("no global adapter for %s:%s", platform, account)
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
		ip := s.clientIP(r)
		if !s.sendLimiter.allow(ip) {
			http.Error(w, `{"error":"too many send requests, try again later"}`, http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	}
}

func (s *Server) PadRateLimitMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip := s.clientIP(r)
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

// RegisterRoutes wires every HTTP route onto mux. Both main.go and the
// integration test harness call this, so tests exercise the exact production
// route table — there is no second, drifting copy to keep in sync.
func (s *Server) RegisterRoutes(mux *http.ServeMux) {
	// maxJSON wraps a handler with a 1MB request body limit for JSON endpoints.
	maxJSON := func(h http.HandlerFunc) http.HandlerFunc {
		return MaxBodyMiddleware(1<<20, h)
	}

	// Public auth routes
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

	// OAuth routes (public — redirect-based)
	mux.HandleFunc("GET /api/auth/oauth/config", s.HandleOAuthConfig)
	mux.HandleFunc("GET /api/auth/oauth/{provider}", s.HandleOAuthStart)
	mux.HandleFunc("GET /api/auth/oauth/{provider}/callback", s.HandleOAuthCallback)
	mux.HandleFunc("GET /api/auth/oauth/desktop-poll", s.HandleDesktopOAuthPoll)

	// Protected auth routes
	mux.HandleFunc("POST /api/auth/logout", maxJSON(s.AuthMiddleware(s.HandleLogout)))
	mux.HandleFunc("POST /api/auth/2fa/setup", maxJSON(s.AuthMiddleware(s.Handle2FASetup)))
	mux.HandleFunc("POST /api/auth/2fa/enable", maxJSON(s.AuthMiddleware(s.Handle2FAEnable)))
	mux.HandleFunc("POST /api/auth/2fa/disable", maxJSON(s.AuthMiddleware(s.Handle2FADisable)))
	mux.HandleFunc("GET /api/auth/me", s.AuthMiddleware(s.HandleGetMe))
	mux.HandleFunc("GET /api/auth/activity", s.AdminMiddleware(s.HandleUserActivity))
	mux.HandleFunc("GET /api/auth/linked-accounts", s.AuthMiddleware(s.HandleLinkedAccounts))
	mux.HandleFunc("DELETE /api/auth/linked-accounts/{provider}", s.AuthMiddleware(s.HandleUnlinkAccount))

	// Protected data routes (all require auth)
	mux.HandleFunc("GET /api/files", s.AuthMiddleware(s.HandleListFiles))
	mux.HandleFunc("DELETE /api/files/{id}", s.AuthMiddleware(s.HandleDeleteFile))
	mux.HandleFunc("POST /api/files/bulk-delete", maxJSON(s.AuthMiddleware(s.HandleBulkDeleteFiles)))
	mux.HandleFunc("GET /api/platforms/status", s.AuthMiddleware(s.HandlePlatformStatus))
	mux.HandleFunc("POST /api/platforms/connect", maxJSON(s.AuthMiddleware(s.HandleConnectPlatform)))
	mux.HandleFunc("POST /api/platforms/telegram/probe", maxJSON(s.AuthMiddleware(s.HandleTelegramProbe)))
	mux.HandleFunc("DELETE /api/platforms/disconnect", maxJSON(s.AuthMiddleware(s.HandleDisconnectPlatform)))
	mux.HandleFunc("PUT /api/platforms/tokens/{id}/scope", maxJSON(s.AuthMiddleware(s.HandleToggleTokenScope)))
	mux.HandleFunc("GET /api/repos", s.AuthMiddleware(s.HandleListRepos))
	mux.HandleFunc("GET /api/config", s.AuthMiddleware(s.HandleGetConfig))
	mux.HandleFunc("PUT /api/config", maxJSON(s.AdminMiddleware(s.HandleUpdateConfig)))
	mux.HandleFunc("GET /api/events", s.HandleSSE) // SSE auth via query param
	mux.HandleFunc("GET /api/quota", s.AuthMiddleware(s.HandleGetQuota))

	// Client-side encrypted upload (chunked)
	mux.HandleFunc("POST /api/upload/init", maxJSON(s.AuthMiddleware(s.HandleUploadInit)))
	mux.HandleFunc("PUT /api/upload/{sid}/chunk/{idx}", s.AuthMiddleware(s.HandleChunkUpload))
	mux.HandleFunc("POST /api/upload/{sid}/presign/{idx}", maxJSON(s.AuthMiddleware(s.HandlePresignChunk)))
	mux.HandleFunc("POST /api/upload/{sid}/confirm/{idx}", maxJSON(s.AuthMiddleware(s.HandleConfirmChunk)))
	mux.HandleFunc("POST /api/upload/{sid}/complete", maxJSON(s.AuthMiddleware(s.HandleUploadComplete)))
	mux.HandleFunc("DELETE /api/upload/{sid}", s.AuthMiddleware(s.HandleUploadCancel))
	mux.HandleFunc("GET /api/upload/{sid}/status", s.AuthMiddleware(s.HandleUploadStatus))
	mux.HandleFunc("GET /api/upload/incomplete", s.AuthMiddleware(s.HandleListIncompleteUploads))

	// Client-side decrypted download (chunked)
	mux.HandleFunc("GET /api/files/{id}/meta", s.AuthMiddleware(s.HandleGetFileMeta))
	mux.HandleFunc("GET /api/files/{id}/chunks/{idx}", s.AuthMiddleware(s.HandleGetChunk))

	// Share management (authenticated)
	mux.HandleFunc("POST /api/shares", maxJSON(s.AuthMiddleware(s.HandleCreateShare)))
	mux.HandleFunc("GET /api/shares", s.AuthMiddleware(s.HandleListShares))
	mux.HandleFunc("DELETE /api/shares/{id}", s.AuthMiddleware(s.HandleRevokeShare))

	// Public share access (no auth, rate-limited)
	mux.HandleFunc("GET /api/share/{token}", s.ShareRateLimitMiddleware(s.HandleGetShareInfo))
	mux.HandleFunc("GET /api/share/{token}/meta", s.ShareRateLimitMiddleware(s.HandleGetShareFileMeta))
	mux.HandleFunc("GET /api/share/{token}/chunks/{idx}", s.ShareRateLimitMiddleware(s.HandleGetShareChunk))

	// Folder shares — public link for a whole folder (management is authed;
	// access mirrors the single-file public share above)
	mux.HandleFunc("POST /api/folder-shares", maxJSON(s.AuthMiddleware(s.HandleCreateFolderShare)))
	mux.HandleFunc("GET /api/folder-shares", s.AuthMiddleware(s.HandleListFolderShares))
	mux.HandleFunc("DELETE /api/folder-shares/{id}", s.AuthMiddleware(s.HandleRevokeFolderShare))
	mux.HandleFunc("GET /api/folder-share/{token}", s.ShareRateLimitMiddleware(s.HandleGetFolderShareInfo))
	mux.HandleFunc("GET /api/folder-share/{token}/files/{fid}/meta", s.ShareRateLimitMiddleware(s.HandleGetFolderShareFileMeta))
	mux.HandleFunc("GET /api/folder-share/{token}/files/{fid}/chunks/{idx}", s.ShareRateLimitMiddleware(s.HandleGetFolderShareChunk))

	// Anonymous send (no auth, rate-limited by IP)
	mux.HandleFunc("POST /api/send/init", maxJSON(s.SendRateLimitMiddleware(s.HandleSendInit)))
	mux.HandleFunc("PUT /api/send/{sid}/chunk/{idx}", s.ShareRateLimitMiddleware(s.HandleSendChunkUpload))
	mux.HandleFunc("POST /api/send/{sid}/complete", maxJSON(s.ShareRateLimitMiddleware(s.HandleSendComplete)))
	mux.HandleFunc("GET /api/send/{token}", s.ShareRateLimitMiddleware(s.HandleGetSendInfo))
	mux.HandleFunc("GET /api/send/{token}/meta", s.ShareRateLimitMiddleware(s.HandleGetSendMeta))
	mux.HandleFunc("GET /api/send/{token}/chunks/{idx}", s.ShareRateLimitMiddleware(s.HandleGetSendChunk))

	// Encrypted pads (no auth, rate-limited by IP)
	mux.HandleFunc("POST /api/pad", maxJSON(s.PadRateLimitMiddleware(s.HandleCreatePad)))
	mux.HandleFunc("GET /api/pad/{token}", s.ShareRateLimitMiddleware(s.HandleGetPadInfo))
	mux.HandleFunc("GET /api/pad/{token}/content", s.ShareRateLimitMiddleware(s.HandleGetPadContent))

	// Clipboard sync (authenticated)
	mux.HandleFunc("POST /api/clipboard", maxJSON(s.AuthMiddleware(s.HandleClipboardPush)))
	mux.HandleFunc("GET /api/clipboard", s.AuthMiddleware(s.HandleClipboardList))
	mux.HandleFunc("GET /api/clipboard/{id}", s.AuthMiddleware(s.HandleClipboardGet))
	mux.HandleFunc("DELETE /api/clipboard/{id}", s.AuthMiddleware(s.HandleClipboardDelete))

	// Selective folder sync (authenticated)
	mux.HandleFunc("GET /api/sync/folders", s.AuthMiddleware(s.HandleListSyncFolders))
	mux.HandleFunc("POST /api/sync/folders", maxJSON(s.AuthMiddleware(s.HandleCreateSyncFolder)))
	mux.HandleFunc("PUT /api/sync/folders/{id}", maxJSON(s.AuthMiddleware(s.HandleUpdateSyncFolder)))
	mux.HandleFunc("PUT /api/sync/folders/{id}/stats", maxJSON(s.AuthMiddleware(s.HandleUpdateSyncFolderStats)))
	mux.HandleFunc("DELETE /api/sync/folders/{id}", s.AuthMiddleware(s.HandleDeleteSyncFolder))

	// Plausible deniability: decoy vault (authenticated)
	mux.HandleFunc("GET /api/decoy", s.AuthMiddleware(s.HandleGetDecoyStatus))
	mux.HandleFunc("POST /api/decoy/setup", maxJSON(s.AuthMiddleware(s.HandleSetupDecoy)))
	mux.HandleFunc("DELETE /api/decoy", s.AuthMiddleware(s.HandleDeleteDecoy))
	mux.HandleFunc("GET /api/decoy/files", s.AuthMiddleware(s.HandleListDecoyFiles))
	mux.HandleFunc("POST /api/decoy/files", maxJSON(s.AuthMiddleware(s.HandleAddDecoyFile)))
	mux.HandleFunc("DELETE /api/decoy/files/{id}", s.AuthMiddleware(s.HandleDeleteDecoyFile))

	// Dead man's switch (authenticated)
	mux.HandleFunc("GET /api/deadman", s.AuthMiddleware(s.HandleGetDeadManSwitch))
	mux.HandleFunc("POST /api/deadman", maxJSON(s.AuthMiddleware(s.HandleSetupDeadManSwitch)))
	mux.HandleFunc("POST /api/deadman/checkin", s.AuthMiddleware(s.HandleCheckinDeadManSwitch))
	mux.HandleFunc("DELETE /api/deadman", s.AuthMiddleware(s.HandleDeleteDeadManSwitch))

	// Expiring vaults (authenticated)
	mux.HandleFunc("GET /api/vaults", s.AuthMiddleware(s.HandleListExpiringVaults))
	mux.HandleFunc("POST /api/vaults", maxJSON(s.AuthMiddleware(s.HandleCreateExpiringVault)))
	mux.HandleFunc("GET /api/vaults/{id}", s.AuthMiddleware(s.HandleGetExpiringVault))
	mux.HandleFunc("DELETE /api/vaults/{id}", s.AuthMiddleware(s.HandleDeleteExpiringVault))

	// Secure notes (authenticated)
	mux.HandleFunc("GET /api/notes", s.AuthMiddleware(s.HandleListNotes))
	mux.HandleFunc("POST /api/notes", maxJSON(s.AuthMiddleware(s.HandleCreateNote)))
	mux.HandleFunc("GET /api/notes/{id}", s.AuthMiddleware(s.HandleGetNote))
	mux.HandleFunc("PUT /api/notes/{id}", maxJSON(s.AuthMiddleware(s.HandleUpdateNote)))
	mux.HandleFunc("DELETE /api/notes/{id}", s.AuthMiddleware(s.HandleDeleteNote))

	// Folders + trash (soft-delete) + file moves (authenticated)
	mux.HandleFunc("GET /api/folders", s.AuthMiddleware(s.HandleListFolders))
	mux.HandleFunc("GET /api/folders/tree", s.AuthMiddleware(s.HandleListFolderSubtree))
	mux.HandleFunc("POST /api/folders", maxJSON(s.AuthMiddleware(s.HandleCreateFolder)))
	mux.HandleFunc("PATCH /api/folders/{id}", maxJSON(s.AuthMiddleware(s.HandleRenameFolder)))
	mux.HandleFunc("PATCH /api/folders/{id}/move", maxJSON(s.AuthMiddleware(s.HandleMoveFolder)))
	mux.HandleFunc("POST /api/folders/{id}/password", maxJSON(s.AuthMiddleware(s.HandleSetFolderPassword)))
	mux.HandleFunc("DELETE /api/folders/{id}/password", s.AuthMiddleware(s.HandleRemoveFolderPassword))
	mux.HandleFunc("DELETE /api/folders/{id}", s.AuthMiddleware(s.HandleDeleteFolder))
	mux.HandleFunc("GET /api/files/trash", s.AuthMiddleware(s.HandleListTrash))
	mux.HandleFunc("PATCH /api/files/{id}/move", maxJSON(s.AuthMiddleware(s.HandleMoveFile)))
	mux.HandleFunc("PUT /api/files/{id}/rekey", maxJSON(s.AuthMiddleware(s.HandleRekeyFile)))
	mux.HandleFunc("POST /api/files/{id}/restore", maxJSON(s.AuthMiddleware(s.HandleRestoreFile)))
	mux.HandleFunc("DELETE /api/files/{id}/purge", s.AuthMiddleware(s.HandlePurgeFile))

	// File integrity monitor (authenticated)
	mux.HandleFunc("GET /api/integrity", s.AuthMiddleware(s.HandleListIntegritySnapshots))
	mux.HandleFunc("POST /api/integrity", maxJSON(s.AuthMiddleware(s.HandleCreateIntegritySnapshot)))
	mux.HandleFunc("POST /api/integrity/check", maxJSON(s.AuthMiddleware(s.HandleCheckIntegrity)))
	mux.HandleFunc("GET /api/integrity/changes", s.AuthMiddleware(s.HandleGetChangedFiles))

	// Vault snapshots / time travel (authenticated)
	mux.HandleFunc("GET /api/snapshots", s.AuthMiddleware(s.HandleListVaultSnapshots))
	mux.HandleFunc("POST /api/snapshots", maxJSON(s.AuthMiddleware(s.HandleCreateVaultSnapshot)))
	mux.HandleFunc("GET /api/snapshots/{id}", s.AuthMiddleware(s.HandleGetVaultSnapshot))
	mux.HandleFunc("DELETE /api/snapshots/{id}", s.AuthMiddleware(s.HandleDeleteVaultSnapshot))

	// Shared vaults (authenticated)
	mux.HandleFunc("GET /api/shared-vaults", s.AuthMiddleware(s.HandleListSharedVaults))
	mux.HandleFunc("POST /api/shared-vaults", maxJSON(s.AuthMiddleware(s.HandleCreateSharedVault)))
	mux.HandleFunc("GET /api/shared-vaults/{id}", s.AuthMiddleware(s.HandleGetSharedVault))
	mux.HandleFunc("DELETE /api/shared-vaults/{id}", s.AuthMiddleware(s.HandleDeleteSharedVault))
	mux.HandleFunc("POST /api/shared-vaults/{id}/members", maxJSON(s.AuthMiddleware(s.HandleAddSharedVaultMember)))
	mux.HandleFunc("DELETE /api/shared-vaults/{id}/members/{uid}", s.AuthMiddleware(s.HandleRemoveSharedVaultMember))
	mux.HandleFunc("POST /api/shared-vaults/{id}/files", maxJSON(s.AuthMiddleware(s.HandleAddSharedVaultFile)))
	mux.HandleFunc("DELETE /api/shared-vaults/{id}/files/{fid}", s.AuthMiddleware(s.HandleRemoveSharedVaultFile))
	mux.HandleFunc("POST /api/shared-vaults/{id}/rotate", maxJSON(s.AuthMiddleware(s.HandleRotateSharedVault)))

	// Offline pins (authenticated)
	mux.HandleFunc("GET /api/offline", s.AuthMiddleware(s.HandleListOfflinePins))
	mux.HandleFunc("POST /api/offline", maxJSON(s.AuthMiddleware(s.HandlePinOffline)))
	mux.HandleFunc("DELETE /api/offline/{fileId}", s.AuthMiddleware(s.HandleUnpinOffline))

	// Per-device UI preferences (color theme + light/dark mode)
	mux.HandleFunc("GET /api/preferences", s.AuthMiddleware(s.HandleGetPreferences))
	mux.HandleFunc("PUT /api/preferences", maxJSON(s.AuthMiddleware(s.HandleSavePreferences)))

	// Per-user X25519 keypairs (zero-knowledge sharing foundation)
	mux.HandleFunc("GET /api/keys/me", s.AuthMiddleware(s.HandleGetMyKey))
	mux.HandleFunc("POST /api/keys", maxJSON(s.AuthMiddleware(s.HandlePublishKey)))
	mux.HandleFunc("GET /api/keys/lookup", s.AuthMiddleware(s.HandleLookupUserKey))
	mux.HandleFunc("GET /api/keys/user/{id}", s.AuthMiddleware(s.HandleGetUserPublicKey))

	// Real-time device-to-device transfer (WebSocket)
	mux.HandleFunc("GET /api/transfer/ws", s.HandleTransferWS)

	// Public plan configs (for landing/pricing pages)
	mux.HandleFunc("GET /api/plans", s.HandleGetPlans)

	// Admin routes
	mux.HandleFunc("GET /api/admin/users", s.AdminMiddleware(s.HandleAdminListUsers))
	mux.HandleFunc("GET /api/admin/stats", s.AdminMiddleware(s.HandleAdminStats))
	mux.HandleFunc("PUT /api/admin/users/{id}/role", maxJSON(s.AdminMiddleware(s.HandleAdminSetRole)))
	mux.HandleFunc("DELETE /api/admin/users/{id}", s.AdminMiddleware(s.HandleAdminDeleteUser))
	mux.HandleFunc("GET /api/admin/tokens", s.AdminMiddleware(s.HandleAdminListTokens))
	mux.HandleFunc("POST /api/admin/tokens", maxJSON(s.AdminMiddleware(s.HandleAdminCreateToken)))
	mux.HandleFunc("DELETE /api/admin/tokens/{id}", s.AdminMiddleware(s.HandleAdminDeleteToken))
	mux.HandleFunc("PUT /api/admin/tokens/{id}/scope", maxJSON(s.AdminMiddleware(s.HandleAdminToggleTokenScope)))
	mux.HandleFunc("GET /api/admin/quota", s.AdminMiddleware(s.HandleAdminGetDefaultQuota))
	mux.HandleFunc("PUT /api/admin/quota", maxJSON(s.AdminMiddleware(s.HandleAdminSetDefaultQuota)))
	mux.HandleFunc("PUT /api/admin/users/{id}/quota", maxJSON(s.AdminMiddleware(s.HandleAdminSetUserQuota)))
	mux.HandleFunc("PUT /api/admin/users/{id}/plan", maxJSON(s.AdminMiddleware(s.HandleAdminSetPlan)))
	mux.HandleFunc("GET /api/admin/audit", s.AdminMiddleware(s.HandleAdminAuditLog))
	mux.HandleFunc("GET /api/admin/feedback", s.AdminMiddleware(s.HandleAdminListFeedback))
	mux.HandleFunc("GET /api/admin/plans", s.AdminMiddleware(s.HandleAdminGetPlans))
	mux.HandleFunc("PUT /api/admin/plans", maxJSON(s.AdminMiddleware(s.HandleAdminSetPlans)))
	mux.HandleFunc("GET /api/admin/users/{id}", s.AdminMiddleware(s.HandleAdminGetUser))

	// Feedback (authenticated)
	mux.HandleFunc("POST /api/feedback", maxJSON(s.AuthMiddleware(s.HandleSubmitFeedback)))
	mux.HandleFunc("GET /api/feedback/status", s.AuthMiddleware(s.HandleGetFeedbackStatus))

	// Health check (public)
	mux.HandleFunc("GET /api/health", s.HandleHealth)
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
