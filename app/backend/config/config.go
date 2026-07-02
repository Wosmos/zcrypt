package config

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// EmailConfig holds settings for sending transactional emails via Resend.
type EmailConfig struct {
	APIKey string `json:"api_key"`
	From   string `json:"from"`
}

// OAuthProviderConfig holds client credentials for a single OAuth provider.
type OAuthProviderConfig struct {
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
}

// OAuthConfig holds OAuth provider configurations.
type OAuthConfig struct {
	Google *OAuthProviderConfig `json:"google,omitempty"`
	GitHub *OAuthProviderConfig `json:"github,omitempty"`
}

// DefaultDir returns the zcrypt config directory (~/.zcrypt/).
func DefaultDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("get home dir: %w", err)
	}
	return filepath.Join(home, ".zcrypt"), nil
}

// EnsureDirs creates all required zcrypt directories.
func EnsureDirs() error {
	dir, err := DefaultDir()
	if err != nil {
		return err
	}

	for _, sub := range []string{"", "tmp", "staging"} {
		p := filepath.Join(dir, sub)
		if err := os.MkdirAll(p, 0700); err != nil {
			return fmt.Errorf("create %s: %w", p, err)
		}
	}
	return nil
}

// Config holds the application configuration.
type Config struct {
	DefaultPlatform string           `json:"default_platform"`
	Thresholds      map[string]int64 `json:"thresholds"`
	// Auth
	JWTSecret string       `json:"jwt_secret,omitempty"`
	Email     *EmailConfig `json:"email,omitempty"`
	OAuth     *OAuthConfig `json:"oauth,omitempty"`
	// Frontend URL for email links (verification, password reset)
	FrontendURL string `json:"frontend_url,omitempty"`
	// Backend URL for OAuth callback URIs (must match what's registered with providers)
	BackendURL string `json:"backend_url,omitempty"`
	// TrustedProxyCount is the number of reverse-proxy hops in front of the app
	// that are trusted to set X-Forwarded-For. The real client IP is read that
	// many hops in from the right of the chain. 0 (default) ignores forwarding
	// headers entirely and uses the direct peer, so clients cannot spoof their
	// IP to bypass rate limits. Set to 1 behind a single proxy (e.g. Railway).
	TrustedProxyCount int `json:"trusted_proxy_count,omitempty"`
	// From environment only — never persisted to JSON
	DatabaseURL string `json:"-"`
	MasterKey   string `json:"-"`
}

// DefaultConfig returns the default configuration.
func DefaultConfig() *Config {
	return &Config{
		DefaultPlatform: "github",
		Thresholds: map[string]int64{
			"github":      850 * 1024 * 1024,    // 850MB
			"gitlab":      9000 * 1024 * 1024,   // 9GB
			"huggingface": 280000 * 1024 * 1024, // 280GB
			"telegram":    50000 * 1024 * 1024,  // 50GB (virtual — Telegram has no hard repo limit)
		},
	}
}

// configPath returns the path to config.json.
func configPath() (string, error) {
	dir, err := DefaultDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "config.json"), nil
}

// loadDotEnv reads a .env file and sets environment variables (does not override existing).
func loadDotEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, val, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		val = strings.TrimSpace(val)
		// Strip surrounding quotes
		if len(val) >= 2 && ((val[0] == '"' && val[len(val)-1] == '"') || (val[0] == '\'' && val[len(val)-1] == '\'')) {
			val = val[1 : len(val)-1]
		}
		if os.Getenv(key) == "" {
			os.Setenv(key, val)
		}
	}
}

// applyEnvOverrides overrides config fields from environment variables.
func (c *Config) applyEnvOverrides() {
	if v := os.Getenv("ZCRYPT_JWT_SECRET"); v != "" {
		c.JWTSecret = v
	} else if v := os.Getenv("zcrypt_JWT_SECRET"); v != "" {
		c.JWTSecret = v // backward compat
	}
	if v := os.Getenv("DATABASE_URL"); v != "" {
		c.DatabaseURL = v
	}
	if v := os.Getenv("MASTER_KEY"); v != "" {
		c.MasterKey = v
	}
	if v := os.Getenv("RESEND_API_KEY"); v != "" {
		if c.Email == nil {
			c.Email = &EmailConfig{}
		}
		c.Email.APIKey = v
	}
	if v := os.Getenv("RESEND_FROM"); v != "" {
		if c.Email == nil {
			c.Email = &EmailConfig{}
		}
		c.Email.From = v
	}
	if v := os.Getenv("FRONTEND_URL"); v != "" {
		c.FrontendURL = v
	}
	if v := os.Getenv("BACKEND_URL"); v != "" {
		c.BackendURL = v
	}
	if v := os.Getenv("ZCRYPT_TRUSTED_PROXY_COUNT"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			c.TrustedProxyCount = n
		}
	}
	// OAuth providers
	if id := os.Getenv("GOOGLE_CLIENT_ID"); id != "" {
		if sec := os.Getenv("GOOGLE_CLIENT_SECRET"); sec != "" {
			if c.OAuth == nil {
				c.OAuth = &OAuthConfig{}
			}
			c.OAuth.Google = &OAuthProviderConfig{ClientID: id, ClientSecret: sec}
		}
	}
	if id := os.Getenv("GITHUB_CLIENT_ID"); id != "" {
		if sec := os.Getenv("GITHUB_CLIENT_SECRET"); sec != "" {
			if c.OAuth == nil {
				c.OAuth = &OAuthConfig{}
			}
			c.OAuth.GitHub = &OAuthProviderConfig{ClientID: id, ClientSecret: sec}
		}
	}
}

// Load reads the config from disk, or returns defaults if not found.
// It also loads .env from the working directory and applies env var overrides.
func Load() (*Config, error) {
	// Load .env file if present (won't override existing env vars)
	loadDotEnv(".env")

	path, err := configPath()
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		cfg := DefaultConfig()
		cfg.applyEnvOverrides()
		return cfg, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}

	cfg := DefaultConfig()
	if err := json.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}

	// Environment variables override config file values
	cfg.applyEnvOverrides()

	// Auto-generate JWT secret on first load
	if cfg.JWTSecret == "" {
		secret := make([]byte, 32)
		if _, err := rand.Read(secret); err != nil {
			return nil, fmt.Errorf("generate jwt secret: %w", err)
		}
		cfg.JWTSecret = hex.EncodeToString(secret)
		if err := cfg.Save(); err != nil {
			return nil, fmt.Errorf("save jwt secret: %w", err)
		}
	}

	return cfg, nil
}

// Validate checks that required configuration fields are set.
func (c *Config) Validate() error {
	if c.JWTSecret == "" {
		return fmt.Errorf("JWT secret is required")
	}
	if len(c.JWTSecret) < 32 {
		return fmt.Errorf("JWT secret must be at least 32 characters")
	}
	if c.Email != nil {
		if c.Email.APIKey == "" {
			return fmt.Errorf("RESEND_API_KEY is required when email is configured")
		}
		if c.Email.From == "" {
			return fmt.Errorf("RESEND_FROM is required when email is configured")
		}
	}
	return nil
}

// Save writes the config to disk.
func (c *Config) Save() error {
	path, err := configPath()
	if err != nil {
		return err
	}

	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}

	if err := os.WriteFile(path, data, 0600); err != nil {
		return fmt.Errorf("write config: %w", err)
	}
	return nil
}

// TmpDir returns the temp directory for pipeline operations.
func TmpDir() (string, error) {
	dir, err := DefaultDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "tmp"), nil
}

// StagingDir returns the staging directory for resumable uploads.
// Chunks persist here until fully uploaded, surviving server restarts.
func StagingDir() (string, error) {
	dir, err := DefaultDir()
	if err != nil {
		return "", err
	}
	p := filepath.Join(dir, "staging")
	if err := os.MkdirAll(p, 0700); err != nil {
		return "", fmt.Errorf("create staging dir: %w", err)
	}
	return p, nil
}

// ChunkCacheDir returns the directory for the server-side ciphertext chunk
// cache. Chunks are immutable, so cached entries never go stale; the download
// handler sweeps oldest files to keep the directory under budget.
func ChunkCacheDir() (string, error) {
	dir, err := DefaultDir()
	if err != nil {
		return "", err
	}
	p := filepath.Join(dir, "chunk-cache")
	if err := os.MkdirAll(p, 0700); err != nil {
		return "", fmt.Errorf("create chunk cache dir: %w", err)
	}
	return p, nil
}

// CleanTmp wipes the entire temp directory (crash recovery).
func CleanTmp() error {
	tmp, err := TmpDir()
	if err != nil {
		return err
	}
	if err := os.RemoveAll(tmp); err != nil {
		return fmt.Errorf("clean tmp: %w", err)
	}
	return os.MkdirAll(tmp, 0700)
}
