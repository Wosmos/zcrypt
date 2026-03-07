package chunks

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
)

// HashFile computes the SHA-256 hex digest of a file.
func HashFile(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read file: %w", err)
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:]), nil
}

// HashBytes computes the SHA-256 hex digest of a byte slice.
func HashBytes(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

// VerifyChunk checks that a chunk file matches the expected SHA-256 hash.
func VerifyChunk(path, expectedHash string) error {
	actual, err := HashFile(path)
	if err != nil {
		return err
	}
	if actual != expectedHash {
		return fmt.Errorf("chunk integrity failed: expected %s, got %s", expectedHash, actual)
	}
	return nil
}
