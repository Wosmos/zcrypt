package config

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDefaultConfig(t *testing.T) {
	cfg := DefaultConfig()
	assert.Equal(t, "github", cfg.DefaultPlatform)
	assert.Contains(t, cfg.Thresholds, "github")
	assert.Contains(t, cfg.Thresholds, "gitlab")
	assert.Contains(t, cfg.Thresholds, "huggingface")
	assert.Contains(t, cfg.Thresholds, "telegram")
}

func TestValidateRequiresJWTSecret(t *testing.T) {
	cfg := DefaultConfig()
	cfg.JWTSecret = ""
	assert.Error(t, cfg.Validate())
}

func TestValidateRejectsShortJWTSecret(t *testing.T) {
	cfg := DefaultConfig()
	cfg.JWTSecret = "short"
	err := cfg.Validate()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "at least 32")
}

func TestValidateAcceptsValidConfig(t *testing.T) {
	cfg := DefaultConfig()
	cfg.JWTSecret = "this-is-a-sufficiently-long-jwt-secret-key"
	assert.NoError(t, cfg.Validate())
}

func TestValidateEmailRequiresAPIKey(t *testing.T) {
	cfg := DefaultConfig()
	cfg.JWTSecret = "this-is-a-sufficiently-long-jwt-secret-key"
	cfg.Email = &EmailConfig{From: "a@b.com"}
	err := cfg.Validate()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "RESEND_API_KEY")
}

func TestValidateEmailRequiresFrom(t *testing.T) {
	cfg := DefaultConfig()
	cfg.JWTSecret = "this-is-a-sufficiently-long-jwt-secret-key"
	cfg.Email = &EmailConfig{APIKey: "re_test123"}
	err := cfg.Validate()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "RESEND_FROM")
}

func TestValidateEmailAcceptsValidConfig(t *testing.T) {
	cfg := DefaultConfig()
	cfg.JWTSecret = "this-is-a-sufficiently-long-jwt-secret-key"
	cfg.Email = &EmailConfig{APIKey: "re_test123", From: "a@b.com"}
	assert.NoError(t, cfg.Validate())
}
