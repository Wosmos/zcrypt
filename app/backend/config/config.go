package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

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

// Load reads the config from disk, or returns defaults if not found.
func Load() (*Config, error) {
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
