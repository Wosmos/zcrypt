package disguise

import (
	"crypto/rand"
	"encoding/hex"
)

// ChunkFilename generates a random 16-char hex filename with .bin extension.
func ChunkFilename() (string, error) {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b) + ".bin", nil
}

// ReadmeContent returns a generic developer project README.
func ReadmeContent(repoName string) string {
	return "# " + repoName + "\n\nInternal build artifacts and cache storage.\n\nThis repository is auto-managed. Do not edit files manually.\n"
}
