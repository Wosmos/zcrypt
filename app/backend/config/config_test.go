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

func TestValidateSMTPRequiresHost(t *testing.T) {
	cfg := DefaultConfig()
	cfg.JWTSecret = "this-is-a-sufficiently-long-jwt-secret-key"
	cfg.SMTP = &SMTPConfig{Port: 587, From: "a@b.com"}
	err := cfg.Validate()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "SMTP_HOST")
}

func TestValidateSMTPRequiresFrom(t *testing.T) {
	cfg := DefaultConfig()
	cfg.JWTSecret = "this-is-a-sufficiently-long-jwt-secret-key"
	cfg.SMTP = &SMTPConfig{Host: "smtp.test.com", Port: 587}
	err := cfg.Validate()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "SMTP_FROM")
}

func TestValidateSMTPRequiresValidPort(t *testing.T) {
	cfg := DefaultConfig()
	cfg.JWTSecret = "this-is-a-sufficiently-long-jwt-secret-key"
	cfg.SMTP = &SMTPConfig{Host: "smtp.test.com", From: "a@b.com", Port: 0}
	err := cfg.Validate()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "SMTP_PORT")
}

func TestValidateSMTPAcceptsValidConfig(t *testing.T) {
	cfg := DefaultConfig()
	cfg.JWTSecret = "this-is-a-sufficiently-long-jwt-secret-key"
	cfg.SMTP = &SMTPConfig{Host: "smtp.test.com", From: "a@b.com", Port: 587}
	assert.NoError(t, cfg.Validate())
}
