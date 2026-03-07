package crypto

import (
	"crypto/rand"
	"crypto/sha256"

	"golang.org/x/crypto/pbkdf2"
)

const (
	SaltSize   = 32
	KeySize    = 32 // AES-256
	IVSize     = 12 // GCM nonce
	Iterations = 600_000
)

// DeriveKey derives a 256-bit key from a passphrase and salt using PBKDF2-SHA256.
func DeriveKey(passphrase string, salt []byte) []byte {
	return pbkdf2.Key([]byte(passphrase), salt, Iterations, KeySize, sha256.New)
}

// GenerateSalt returns a cryptographically random 32-byte salt.
func GenerateSalt() ([]byte, error) {
	salt := make([]byte, SaltSize)
	if _, err := rand.Read(salt); err != nil {
		return nil, err
	}
	return salt, nil
}

// GenerateIV returns a cryptographically random 12-byte IV/nonce.
func GenerateIV() ([]byte, error) {
	iv := make([]byte, IVSize)
	if _, err := rand.Read(iv); err != nil {
		return nil, err
	}
	return iv, nil
}
