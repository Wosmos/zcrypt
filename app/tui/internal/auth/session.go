package auth

import (
	"sync"

	"github.com/zcrypt/zcrypt-tui/internal/config"
)

// Session manages authentication state and token lifecycle.
type Session struct {
	mu     sync.RWMutex
	config *config.Config
}

// NewSession creates a new auth session backed by config.
func NewSession(cfg *config.Config) *Session {
	return &Session{config: cfg}
}

// GetAccessToken returns the current access token (thread-safe).
func (s *Session) GetAccessToken() string {
	return s.config.GetAccessToken()
}

// GetRefreshToken returns the current refresh token (thread-safe).
func (s *Session) GetRefreshToken() string {
	return s.config.GetRefreshToken()
}

// SetTokens updates auth tokens in config.
func (s *Session) SetTokens(access, refresh, userID, username, email string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.config.SetTokens(access, refresh, userID, username, email)
	_ = s.config.Save()
}

// IsAuthenticated checks if the session has valid tokens.
func (s *Session) IsAuthenticated() bool {
	return s.config.IsAuthenticated()
}

// Clear removes all auth state.
func (s *Session) Clear() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.config.ClearTokens()
	_ = s.config.Save()
}

// Username returns the current username.
func (s *Session) Username() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.config.Username
}

// Email returns the current email.
func (s *Session) Email() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.config.Email
}
