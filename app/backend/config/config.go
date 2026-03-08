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

// SMTPConfig holds SMTP server settings for sending transactional emails.
type SMTPConfig struct {
	Host     string `json:"host"`
	Port     int    `json:"port"`
	Username string `json:"username"`
	Password string `json:"password"`
	From     string `json:"from"`
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

// AccountConfig holds credentials for a single platform account.
type AccountConfig struct {
	Token    string `json:"token"`
	Username string `json:"username"`
}

// Config holds the application configuration.
type Config struct {
	// Legacy single-token fields (migrated to Accounts on load)
	GithubToken      string           `json:"github_token,omitempty"`
	GitlabToken      string           `json:"gitlab_token,omitempty"`
	HuggingFaceToken string           `json:"huggingface_token,omitempty"`
	DefaultPlatform  string           `json:"default_platform"`
	Thresholds       map[string]int64 `json:"thresholds"`
	// Multi-account: platform name → list of accounts
	Accounts map[string][]AccountConfig `json:"accounts,omitempty"`
	// Auth
	JWTSecret string      `json:"jwt_secret,omitempty"`
	SMTP      *SMTPConfig `json:"smtp,omitempty"`
}

// DefaultConfig returns the default configuration.
func DefaultConfig() *Config {
	return &Config{
		DefaultPlatform: "github",
		Thresholds: map[string]int64{
			"github":      850 * 1024 * 1024,   // 850MB
			"gitlab":      9000 * 1024 * 1024,   // 9GB
			"huggingface": 280000 * 1024 * 1024, // 280GB
		},
		Accounts: make(map[string][]AccountConfig),
	}
}

// migrateTokens moves legacy single-token fields into the Accounts map.
func (c *Config) migrateTokens() {
	if c.Accounts == nil {
		c.Accounts = make(map[string][]AccountConfig)
	}

	migrate := func(platform, token string) {
		if token == "" {
			return
		}
		// Don't duplicate if already present
		for _, acc := range c.Accounts[platform] {
			if acc.Token == token {
				return
			}
		}
		c.Accounts[platform] = append(c.Accounts[platform], AccountConfig{Token: token})
	}

	migrate("github", c.GithubToken)
	migrate("gitlab", c.GitlabToken)
	migrate("huggingface", c.HuggingFaceToken)

	// Clear legacy fields
	c.GithubToken = ""
	c.GitlabToken = ""
	c.HuggingFaceToken = ""
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
	if v := os.Getenv("SMTP_HOST"); v != "" {
		if c.SMTP == nil {
			c.SMTP = &SMTPConfig{}
		}
		c.SMTP.Host = v
	}
	if v := os.Getenv("SMTP_PORT"); v != "" {
		if c.SMTP == nil {
			c.SMTP = &SMTPConfig{}
		}
		if port, err := strconv.Atoi(v); err == nil {
			c.SMTP.Port = port
		}
	}
	if v := os.Getenv("SMTP_USERNAME"); v != "" {
		if c.SMTP == nil {
			c.SMTP = &SMTPConfig{}
		}
		c.SMTP.Username = v
	}
	if v := os.Getenv("SMTP_PASSWORD"); v != "" {
		if c.SMTP == nil {
			c.SMTP = &SMTPConfig{}
		}
		c.SMTP.Password = v
	}
	if v := os.Getenv("SMTP_FROM"); v != "" {
		if c.SMTP == nil {
			c.SMTP = &SMTPConfig{}
		}
		c.SMTP.From = v
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
		return DefaultConfig(), nil
	}
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}

	cfg := DefaultConfig()
	if err := json.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}
	cfg.migrateTokens()

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

// DBPath returns the path to the SQLite database.
func DBPath() (string, error) {
	dir, err := DefaultDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "index.db"), nil
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
