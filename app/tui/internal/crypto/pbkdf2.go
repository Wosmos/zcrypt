package crypto

import (
	"crypto/rand"
	"crypto/sha256"

	"golang.org/x/crypto/pbkdf2"
)

const (
	SaltSize   = 32
	KeySize    = 32
	Iterations = 600_000
)

// GenerateSalt creates a cryptographically random 32-byte salt.
func GenerateSalt() ([]byte, error) {
	salt := make([]byte, SaltSize)
	if _, err := rand.Read(salt); err != nil {
		return nil, err
	}
	return salt, nil
}

// DeriveKey derives a 256-bit key from passphrase and salt using PBKDF2-SHA256.
// Must match browser: PBKDF2(passphrase, salt, 600000, SHA-256) → 32 bytes.
func DeriveKey(passphrase string, salt []byte) []byte {
	return pbkdf2.Key([]byte(passphrase), salt, Iterations, KeySize, sha256.New)
}
