package config

import (
	"encoding/json"
	"os"
	"sync"
)

// Config holds persistent TUI configuration.
type Config struct {
	mu           sync.RWMutex `json:"-"`
	path         string       `json:"-"`
	ServerURL    string       `json:"server_url"`
	Profile      string       `json:"profile"`
	AccessToken  string       `json:"access_token,omitempty"`
	RefreshToken string       `json:"refresh_token,omitempty"`
	UserID       string       `json:"user_id,omitempty"`
	Username     string       `json:"username,omitempty"`
	Email        string       `json:"email,omitempty"`
	DownloadDir  string       `json:"download_dir,omitempty"`
}

// Load reads config from disk. Returns defaults if file doesn't exist.
func Load(path string) (*Config, error) {
	cfg := &Config{
		path:      path,
		ServerURL: "http://localhost:8080",
		Profile:   "normal",
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return cfg, nil
		}
		return nil, err
	}

	if err := json.Unmarshal(data, cfg); err != nil {
		return nil, err
	}
	cfg.path = path
	return cfg, nil
}

// Save writes config to disk.
func (c *Config) Save() error {
	c.mu.RLock()
	defer c.mu.RUnlock()

	if err := EnsureDirs(); err != nil {
		return err
	}

	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(c.path, data, 0600)
}

// SetTokens updates auth tokens and persists.
func (c *Config) SetTokens(access, refresh, userID, username, email string) {
	c.mu.Lock()
	c.AccessToken = access
	c.RefreshToken = refresh
	c.UserID = userID
	c.Username = username
	c.Email = email
	c.mu.Unlock()
}

// ClearTokens removes auth tokens and persists.
func (c *Config) ClearTokens() {
	c.mu.Lock()
	c.AccessToken = ""
	c.RefreshToken = ""
	c.UserID = ""
	c.Username = ""
	c.Email = ""
	c.mu.Unlock()
}

// IsAuthenticated checks if tokens are present.
func (c *Config) IsAuthenticated() bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.AccessToken != "" && c.RefreshToken != ""
}

// GetAccessToken returns the current access token (thread-safe).
func (c *Config) GetAccessToken() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.AccessToken
}

// GetRefreshToken returns the current refresh token (thread-safe).
func (c *Config) GetRefreshToken() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.RefreshToken
}
