package config

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// EmailConfig holds settings for sending transactional emails via Brevo.
type EmailConfig struct {
	APIKey string `json:"api_key"`
	From   string `json:"from"`
	Name   string `json:"name,omitempty"`
}

// DefaultDir returns the zpush config directory (~/.zpush/).
func DefaultDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("get home dir: %w", err)
	}
	return filepath.Join(home, ".zpush"), nil
}

// EnsureDirs creates all required zpush directories.
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
	// Frontend URL for email links (verification, password reset)
	FrontendURL string `json:"frontend_url,omitempty"`
	// From environment only — never persisted to JSON
	DatabaseURL string `json:"-"`
	MasterKey   string `json:"-"`
}

// DefaultConfig returns the default configuration.
func DefaultConfig() *Config {
	return &Config{
		DefaultPlatform: "github",
		Thresholds: map[string]int64{
			"github":      850 * 1024 * 1024,   // 850MB
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
	if v := os.Getenv("ZPUSH_JWT_SECRET"); v != "" {
		c.JWTSecret = v
	}
	if v := os.Getenv("DATABASE_URL"); v != "" {
		c.DatabaseURL = v
	}
	if v := os.Getenv("MASTER_KEY"); v != "" {
		c.MasterKey = v
	}
	if v := os.Getenv("BREVO_API_KEY"); v != "" {
		if c.Email == nil {
			c.Email = &EmailConfig{}
		}
		c.Email.APIKey = v
	}
	if v := os.Getenv("BREVO_FROM"); v != "" {
		if c.Email == nil {
			c.Email = &EmailConfig{}
		}
		c.Email.From = v
	}
	if v := os.Getenv("BREVO_NAME"); v != "" {
		if c.Email == nil {
			c.Email = &EmailConfig{}
		}
		c.Email.Name = v
	}
	if v := os.Getenv("FRONTEND_URL"); v != "" {
		c.FrontendURL = v
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
			return fmt.Errorf("BREVO_API_KEY is required when email is configured")
		}
		if c.Email.From == "" {
			return fmt.Errorf("BREVO_FROM is required when email is configured")
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
