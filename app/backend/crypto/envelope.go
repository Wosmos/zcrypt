package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"

	"golang.org/x/crypto/hkdf"
)

// ParseMasterKey decodes a hex-encoded 32-byte master key.
func ParseMasterKey(hexKey string) ([]byte, error) {
	key, err := hex.DecodeString(hexKey)
	if err != nil {
		return nil, fmt.Errorf("decode master key: %w", err)
	}
	if len(key) != 32 {
		return nil, fmt.Errorf("master key must be 32 bytes, got %d", len(key))
	}
	return key, nil
}

// DeriveUserKEK derives a per-user Key Encryption Key from the master key
// using HKDF-SHA256 with info = "user_kek:" + userID.
func DeriveUserKEK(masterKey []byte, userID string) ([]byte, error) {
	info := []byte("user_kek:" + userID)
	reader := hkdf.New(sha256.New, masterKey, nil, info)
	kek := make([]byte, 32)
	if _, err := io.ReadFull(reader, kek); err != nil {
		return nil, fmt.Errorf("derive KEK: %w", err)
	}
	return kek, nil
}

// EncryptToken encrypts a plaintext token using AES-256-GCM with the given KEK.
// Returns (ciphertext, nonce, error).
func EncryptToken(kek []byte, plaintext string) ([]byte, []byte, error) {
	block, err := aes.NewCipher(kek)
	if err != nil {
		return nil, nil, fmt.Errorf("create cipher: %w", err)
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return nil, nil, fmt.Errorf("create GCM: %w", err)
	}
	nonce := make([]byte, aesGCM.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, nil, fmt.Errorf("generate nonce: %w", err)
	}
	ciphertext := aesGCM.Seal(nil, nonce, []byte(plaintext), nil)
	return ciphertext, nonce, nil
}

// DecryptToken decrypts a token using AES-256-GCM with the given KEK and nonce.
func DecryptToken(kek, ciphertext, nonce []byte) (string, error) {
	block, err := aes.NewCipher(kek)
	if err != nil {
		return "", fmt.Errorf("create cipher: %w", err)
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("create GCM: %w", err)
	}
	// GCM.Open PANICS on a wrong-length nonce — a corrupted or hand-mangled
	// stored value must surface as an error, not crash the handler.
	if len(nonce) != aesGCM.NonceSize() {
		return "", fmt.Errorf("decrypt token: invalid nonce length %d", len(nonce))
	}
	plaintext, err := aesGCM.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt token: %w", err)
	}
	return string(plaintext), nil
}
