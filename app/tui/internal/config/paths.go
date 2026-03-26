package config

import (
	"os"
	"path/filepath"
	"runtime"
)

// ConfigDir returns the zcrypt config directory (~/.zcrypt/).
func ConfigDir() string {
	if dir := os.Getenv("ZCRYPT_CONFIG_DIR"); dir != "" {
		return dir
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".zcrypt")
}

// ConfigPath returns the default config file path.
func ConfigPath() string {
	return filepath.Join(ConfigDir(), "tui.json")
}

// CacheDir returns the cache directory for temporary data.
func CacheDir() string {
	return filepath.Join(ConfigDir(), "cache")
}

// DefaultDownloadDir returns the default download directory.
func DefaultDownloadDir() string {
	home, _ := os.UserHomeDir()
	switch runtime.GOOS {
	case "windows":
		if dl := filepath.Join(home, "Downloads"); dirExists(dl) {
			return dl
		}
	case "darwin":
		if dl := filepath.Join(home, "Downloads"); dirExists(dl) {
			return dl
		}
	default:
		if dl := filepath.Join(home, "Downloads"); dirExists(dl) {
			return dl
		}
	}
	return home
}

// EnsureDirs creates all necessary directories.
func EnsureDirs() error {
	dirs := []string{ConfigDir(), CacheDir()}
	for _, d := range dirs {
		if err := os.MkdirAll(d, 0700); err != nil {
			return err
		}
	}
	return nil
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}
