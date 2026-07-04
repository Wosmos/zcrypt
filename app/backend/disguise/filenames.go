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

// ShardedChunkFilename generates a random chunk path sharded into a 2-hex-char
// subdirectory, e.g. "ab/cdef1234567890.bin". With 256 shard dirs, a repo can
// hold ~2.5M chunks before any single folder nears HuggingFace's hard 10k
// entries-per-folder limit (which flat naming hit at ~10k chunks ≈ 40-160 GB
// depending on chunk size). Used for git platforms (github/gitlab/huggingface);
// Telegram keeps the flat ChunkFilename — a chat has no folders. Existing
// chunks are unaffected: remote_path is stored per chunk row.
func ShardedChunkFilename() (string, error) {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	name := hex.EncodeToString(b)
	return name[:2] + "/" + name[2:] + ".bin", nil
}

// ReadmeContent returns a generic developer project README.
func ReadmeContent(repoName string) string {
	return "# " + repoName + "\n\nInternal build artifacts and cache storage.\n\nThis repository is auto-managed. Do not edit files manually.\n"
}
