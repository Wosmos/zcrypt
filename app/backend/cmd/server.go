package cmd

import (
	"context"
	"fmt"
	"log"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/zpush/zpush/adapters"
	"github.com/zpush/zpush/config"
	"github.com/zpush/zpush/crypto"
	"github.com/zpush/zpush/index"
	"github.com/zpush/zpush/pipeline"
	"github.com/zpush/zpush/reppool"
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

	// Auth-specific rate limiter: stricter limits for login/register (5 req per 5 min per IP)
	authLimiter *rateLimiter
	// Per-email rate limiter: 3 req per 15 min for login/magic-link/forgot-password
	emailLimiter *rateLimiter
	// Per-user rate limiter: 100 req per 1 min for authenticated API calls
	userLimiter *rateLimiter
}

// NewServer creates a new API server.
func NewServer(db *index.DB, cfg *config.Config, progress *pipeline.ProgressEmitter, masterKey []byte) *Server {
	return &Server{
		db:           db,
		cfg:          cfg,
		progress:     progress,
		masterKey:    masterKey,
		adapterCache: make(map[string]map[string]adapters.PlatformAdapter),
		poolCache:    make(map[string]map[string]*reppool.Manager),
		authLimiter:  newRateLimiter(5, 5*time.Minute),
		emailLimiter: newRateLimiter(3, 15*time.Minute),
		userLimiter:  newRateLimiter(100, time.Minute),
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

// isQuotaExempt returns true if the user has personal (non-global) platform tokens.
func (s *Server) isQuotaExempt(ctx context.Context, userID string) bool {
	has, err := s.db.UserHasPersonalTokens(ctx, userID)
	return err == nil && has
}

// getEffectiveQuota returns the effective storage quota in bytes for a user.
// Priority: per-user override > plan-based quota > system default > free plan default.
// Returns 0 if unlimited (only when admin explicitly sets quota to 0).
func (s *Server) getEffectiveQuota(ctx context.Context, userID string) int64 {
	user, err := s.db.GetUserByID(ctx, userID)
	if err != nil {
		return planStorageQuota["free"]
	}

	// 1. Per-user admin override (0 = unlimited, >0 = explicit limit)
	if user.StorageQuota != nil {
		return *user.StorageQuota
	}

	// 2. Plan-based quota
	plan := user.Plan
	if plan == "" {
		plan = "free"
	}
	if q, ok := planStorageQuota[plan]; ok {
		return q
	}

	// 3. System default
	val, err := s.db.GetSystemSetting(ctx, "default_storage_quota_bytes")
	if err == nil {
		q, _ := strconv.ParseInt(val, 10, 64)
		if q > 0 {
			return q
		}
	}

	// 4. Fallback to free plan
	return planStorageQuota["free"]
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
