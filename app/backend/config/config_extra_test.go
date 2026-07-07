package config

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// clearAllEnv unsets every env var applyEnvOverrides/Load consults so a test
// starts from a clean slate regardless of the host environment.
func clearAllEnv(t *testing.T) {
	t.Helper()
	for _, k := range []string{
		"ZCRYPT_JWT_SECRET", "zcrypt_JWT_SECRET", "DATABASE_URL", "MASTER_KEY",
		"RESEND_API_KEY", "RESEND_FROM", "FRONTEND_URL", "BACKEND_URL",
		"ZCRYPT_TRUSTED_PROXY_COUNT", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
		"GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET",
	} {
		t.Setenv(k, "")
	}
}

func TestDefaultDir(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	dir, err := DefaultDir()
	require.NoError(t, err)
	assert.Equal(t, filepath.Join(home, ".zcrypt"), dir)
}

func TestEnsureDirs(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	require.NoError(t, EnsureDirs())

	base := filepath.Join(home, ".zcrypt")
	for _, sub := range []string{"", "tmp", "staging"} {
		info, err := os.Stat(filepath.Join(base, sub))
		require.NoError(t, err, "dir %q should exist", sub)
		assert.True(t, info.IsDir())
	}
}

func TestTmpStagingChunkCacheDirs(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	base := filepath.Join(home, ".zcrypt")

	tmp, err := TmpDir()
	require.NoError(t, err)
	assert.Equal(t, filepath.Join(base, "tmp"), tmp)
	// TmpDir does not create the directory itself.

	staging, err := StagingDir()
	require.NoError(t, err)
	assert.Equal(t, filepath.Join(base, "staging"), staging)
	info, err := os.Stat(staging)
	require.NoError(t, err)
	assert.True(t, info.IsDir(), "StagingDir should create the directory")

	cache, err := ChunkCacheDir()
	require.NoError(t, err)
	assert.Equal(t, filepath.Join(base, "chunk-cache"), cache)
	info, err = os.Stat(cache)
	require.NoError(t, err)
	assert.True(t, info.IsDir(), "ChunkCacheDir should create the directory")
}

func TestCleanTmp(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	require.NoError(t, EnsureDirs())
	tmp, err := TmpDir()
	require.NoError(t, err)

	// Drop a file in tmp, then CleanTmp must wipe it but leave the dir.
	marker := filepath.Join(tmp, "leftover.tmp")
	require.NoError(t, os.WriteFile(marker, []byte("x"), 0600))

	require.NoError(t, CleanTmp())

	_, err = os.Stat(marker)
	assert.True(t, os.IsNotExist(err), "leftover file should be gone")
	info, err := os.Stat(tmp)
	require.NoError(t, err)
	assert.True(t, info.IsDir(), "tmp dir should be recreated empty")
}

// With HOME unset, os.UserHomeDir errors, so DefaultDir and every helper that
// depends on it must surface that error rather than panic.
func TestDirHelpersPropagateHomeError(t *testing.T) {
	t.Setenv("HOME", "")

	_, err := DefaultDir()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "get home dir")

	require.Error(t, EnsureDirs())

	_, err = TmpDir()
	require.Error(t, err)

	_, err = StagingDir()
	require.Error(t, err)

	_, err = ChunkCacheDir()
	require.Error(t, err)

	require.Error(t, CleanTmp())

	require.Error(t, (&Config{}).Save())
}

func TestLoadPropagatesHomeError(t *testing.T) {
	clearAllEnv(t)
	t.Setenv("HOME", "")
	t.Chdir(t.TempDir())

	_, err := Load()
	require.Error(t, err)
}

// When ~/.zcrypt exists as a regular file, MkdirAll/WriteFile against it (or
// its would-be children) must fail, exercising the mkdir/write error branches.
func TestDirHelpersFailWhenZcryptIsAFile(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	require.NoError(t, os.WriteFile(filepath.Join(home, ".zcrypt"), []byte("x"), 0600))

	require.Error(t, EnsureDirs())

	_, err := StagingDir()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "staging")

	_, err = ChunkCacheDir()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "chunk cache")

	require.Error(t, CleanTmp())

	cfg := DefaultConfig()
	cfg.JWTSecret = "long-enough-secret-for-save-attempt-1234567"
	require.Error(t, cfg.Save())
}

func TestApplyEnvOverridesAllFields(t *testing.T) {
	clearAllEnv(t)
	t.Setenv("ZCRYPT_JWT_SECRET", "jwt-from-env")
	t.Setenv("DATABASE_URL", "postgres://example")
	t.Setenv("MASTER_KEY", "deadbeef")
	t.Setenv("RESEND_API_KEY", "re_key")
	t.Setenv("RESEND_FROM", "noreply@zcrypt.io")
	t.Setenv("FRONTEND_URL", "https://front")
	t.Setenv("BACKEND_URL", "https://back")
	t.Setenv("ZCRYPT_TRUSTED_PROXY_COUNT", "2")
	t.Setenv("GOOGLE_CLIENT_ID", "g-id")
	t.Setenv("GOOGLE_CLIENT_SECRET", "g-secret")
	t.Setenv("GITHUB_CLIENT_ID", "gh-id")
	t.Setenv("GITHUB_CLIENT_SECRET", "gh-secret")

	cfg := DefaultConfig()
	cfg.applyEnvOverrides()

	assert.Equal(t, "jwt-from-env", cfg.JWTSecret)
	assert.Equal(t, "postgres://example", cfg.DatabaseURL)
	assert.Equal(t, "deadbeef", cfg.MasterKey)
	require.NotNil(t, cfg.Email)
	assert.Equal(t, "re_key", cfg.Email.APIKey)
	assert.Equal(t, "noreply@zcrypt.io", cfg.Email.From)
	assert.Equal(t, "https://front", cfg.FrontendURL)
	assert.Equal(t, "https://back", cfg.BackendURL)
	assert.Equal(t, 2, cfg.TrustedProxyCount)
	require.NotNil(t, cfg.OAuth)
	require.NotNil(t, cfg.OAuth.Google)
	assert.Equal(t, "g-id", cfg.OAuth.Google.ClientID)
	assert.Equal(t, "g-secret", cfg.OAuth.Google.ClientSecret)
	require.NotNil(t, cfg.OAuth.GitHub)
	assert.Equal(t, "gh-id", cfg.OAuth.GitHub.ClientID)
	assert.Equal(t, "gh-secret", cfg.OAuth.GitHub.ClientSecret)
}

func TestApplyEnvOverridesJWTBackwardCompat(t *testing.T) {
	clearAllEnv(t)
	// New var empty, legacy lowercase var set -> legacy is used.
	t.Setenv("zcrypt_JWT_SECRET", "legacy-secret")

	cfg := DefaultConfig()
	cfg.applyEnvOverrides()
	assert.Equal(t, "legacy-secret", cfg.JWTSecret)
}

func TestApplyEnvOverridesInvalidProxyCount(t *testing.T) {
	clearAllEnv(t)

	// Non-numeric: ignored.
	t.Setenv("ZCRYPT_TRUSTED_PROXY_COUNT", "not-a-number")
	cfg := DefaultConfig()
	cfg.applyEnvOverrides()
	assert.Equal(t, 0, cfg.TrustedProxyCount)

	// Negative: rejected (n >= 0 guard).
	t.Setenv("ZCRYPT_TRUSTED_PROXY_COUNT", "-3")
	cfg = DefaultConfig()
	cfg.applyEnvOverrides()
	assert.Equal(t, 0, cfg.TrustedProxyCount)
}

func TestApplyEnvOverridesGitHubOnlyOAuth(t *testing.T) {
	clearAllEnv(t)
	// Only GitHub set -> exercises the OAuth==nil branch inside the GitHub block.
	t.Setenv("GITHUB_CLIENT_ID", "gh-id")
	t.Setenv("GITHUB_CLIENT_SECRET", "gh-secret")

	cfg := DefaultConfig()
	cfg.applyEnvOverrides()
	require.NotNil(t, cfg.OAuth)
	require.NotNil(t, cfg.OAuth.GitHub)
	assert.Nil(t, cfg.OAuth.Google)
}

func TestApplyEnvOverridesOAuthMissingSecretIgnored(t *testing.T) {
	clearAllEnv(t)
	// ID without secret -> provider not configured.
	t.Setenv("GOOGLE_CLIENT_ID", "g-id")
	t.Setenv("GITHUB_CLIENT_ID", "gh-id")

	cfg := DefaultConfig()
	cfg.applyEnvOverrides()
	assert.Nil(t, cfg.OAuth)
}

func TestApplyEnvOverridesEmailFromOnly(t *testing.T) {
	clearAllEnv(t)
	// Only RESEND_FROM set -> exercises Email==nil branch in the From block.
	t.Setenv("RESEND_FROM", "solo@zcrypt.io")

	cfg := DefaultConfig()
	cfg.applyEnvOverrides()
	require.NotNil(t, cfg.Email)
	assert.Equal(t, "solo@zcrypt.io", cfg.Email.From)
	assert.Empty(t, cfg.Email.APIKey)
}

func TestLoadDotEnv(t *testing.T) {
	clearAllEnv(t)
	dir := t.TempDir()
	envPath := filepath.Join(dir, ".env")
	content := "" +
		"# a comment line\n" +
		"\n" +
		"DATABASE_URL=postgres://loaded\n" +
		"QUOTED_DOUBLE=\"double value\"\n" +
		"QUOTED_SINGLE='single value'\n" +
		"  SPACED_KEY = spaced value  \n" +
		"NOEQUALS_LINE\n"
	require.NoError(t, os.WriteFile(envPath, []byte(content), 0600))

	// Pre-set one var; loadDotEnv must NOT override existing values.
	t.Setenv("DATABASE_URL", "postgres://preexisting")

	loadDotEnv(envPath)

	assert.Equal(t, "postgres://preexisting", os.Getenv("DATABASE_URL"), "existing var must not be overridden")
	assert.Equal(t, "double value", os.Getenv("QUOTED_DOUBLE"))
	assert.Equal(t, "single value", os.Getenv("QUOTED_SINGLE"))
	assert.Equal(t, "spaced value", os.Getenv("SPACED_KEY"))
	assert.Empty(t, os.Getenv("NOEQUALS_LINE"))
}

func TestLoadDotEnvMissingFileIsNoop(t *testing.T) {
	// Non-existent path must return silently without panicking.
	loadDotEnv(filepath.Join(t.TempDir(), "does-not-exist.env"))
}

func TestLoadNoConfigFileReturnsDefaults(t *testing.T) {
	clearAllEnv(t)
	home := t.TempDir()
	t.Setenv("HOME", home)
	require.NoError(t, EnsureDirs())
	// Isolate cwd so Load's ".env" lookup finds nothing.
	t.Chdir(t.TempDir())

	t.Setenv("DATABASE_URL", "postgres://from-load")

	cfg, err := Load()
	require.NoError(t, err)
	assert.Equal(t, "github", cfg.DefaultPlatform)
	assert.Equal(t, "postgres://from-load", cfg.DatabaseURL)
	// No config file existed -> no JWT auto-generation in this branch.
	assert.Empty(t, cfg.JWTSecret)
}

func TestLoadExistingConfigFile(t *testing.T) {
	clearAllEnv(t)
	home := t.TempDir()
	t.Setenv("HOME", home)
	require.NoError(t, EnsureDirs())
	t.Chdir(t.TempDir())

	path := filepath.Join(home, ".zcrypt", "config.json")
	on := &Config{
		DefaultPlatform: "gitlab",
		JWTSecret:       "a-persisted-secret-that-is-long-enough-1234",
		FrontendURL:     "https://saved",
	}
	data, err := json.MarshalIndent(on, "", "  ")
	require.NoError(t, err)
	require.NoError(t, os.WriteFile(path, data, 0600))

	// Env overrides file value.
	t.Setenv("FRONTEND_URL", "https://overridden")

	cfg, err := Load()
	require.NoError(t, err)
	assert.Equal(t, "gitlab", cfg.DefaultPlatform)
	assert.Equal(t, "a-persisted-secret-that-is-long-enough-1234", cfg.JWTSecret)
	assert.Equal(t, "https://overridden", cfg.FrontendURL)
}

func TestLoadGeneratesAndPersistsJWTSecret(t *testing.T) {
	clearAllEnv(t)
	home := t.TempDir()
	t.Setenv("HOME", home)
	require.NoError(t, EnsureDirs())
	t.Chdir(t.TempDir())

	path := filepath.Join(home, ".zcrypt", "config.json")
	// Config file with no JWT secret -> Load must generate and Save one.
	require.NoError(t, os.WriteFile(path, []byte(`{"default_platform":"github"}`), 0600))

	cfg, err := Load()
	require.NoError(t, err)
	assert.NotEmpty(t, cfg.JWTSecret)
	assert.GreaterOrEqual(t, len(cfg.JWTSecret), 32)

	// It must have been persisted to disk.
	reloaded, err := os.ReadFile(path)
	require.NoError(t, err)
	var onDisk Config
	require.NoError(t, json.Unmarshal(reloaded, &onDisk))
	assert.Equal(t, cfg.JWTSecret, onDisk.JWTSecret)
}

func TestLoadReadError(t *testing.T) {
	clearAllEnv(t)
	home := t.TempDir()
	t.Setenv("HOME", home)
	require.NoError(t, EnsureDirs())
	t.Chdir(t.TempDir())

	// config.json as a directory -> ReadFile fails with a non-IsNotExist error.
	require.NoError(t, os.Mkdir(filepath.Join(home, ".zcrypt", "config.json"), 0700))

	_, err := Load()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "read config")
}

func TestLoadInvalidJSON(t *testing.T) {
	clearAllEnv(t)
	home := t.TempDir()
	t.Setenv("HOME", home)
	require.NoError(t, EnsureDirs())
	t.Chdir(t.TempDir())

	path := filepath.Join(home, ".zcrypt", "config.json")
	require.NoError(t, os.WriteFile(path, []byte("{not valid json"), 0600))

	_, err := Load()
	require.Error(t, err)
	assert.Contains(t, err.Error(), "parse config")
}

func TestSaveAndRoundTrip(t *testing.T) {
	clearAllEnv(t)
	home := t.TempDir()
	t.Setenv("HOME", home)
	require.NoError(t, EnsureDirs())

	cfg := DefaultConfig()
	cfg.JWTSecret = "round-trip-secret-that-is-long-enough-xxxx"
	cfg.DefaultPlatform = "huggingface"
	require.NoError(t, cfg.Save())

	path := filepath.Join(home, ".zcrypt", "config.json")
	data, err := os.ReadFile(path)
	require.NoError(t, err)

	var onDisk Config
	require.NoError(t, json.Unmarshal(data, &onDisk))
	assert.Equal(t, "huggingface", onDisk.DefaultPlatform)
	assert.Equal(t, cfg.JWTSecret, onDisk.JWTSecret)
}
