package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"fmt"
)

const (
	IVSize = 12 // AES-GCM nonce size
)

// EncryptChunk encrypts plaintext with AES-256-GCM.
// Returns wire format: [12B random IV || ciphertext || 16B GCM auth tag].
// This is byte-compatible with the browser's Web Crypto API AES-GCM output.
func EncryptChunk(key, plaintext []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("aes.NewCipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("cipher.NewGCM: %w", err)
	}

	iv := make([]byte, IVSize)
	if _, err := rand.Read(iv); err != nil {
		return nil, fmt.Errorf("rand.Read IV: %w", err)
	}

	// Seal appends ciphertext + 16-byte auth tag after the IV.
	// Result layout: [12B IV][ciphertext][16B tag] — matches Web Crypto exactly.
	ciphertext := gcm.Seal(iv, iv, plaintext, nil)
	return ciphertext, nil
}

// DecryptChunk decrypts data in wire format [12B IV || ciphertext || 16B tag].
func DecryptChunk(key, data []byte) ([]byte, error) {
	if len(data) < IVSize+16 {
		return nil, fmt.Errorf("ciphertext too short: %d bytes", len(data))
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("aes.NewCipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("cipher.NewGCM: %w", err)
	}

	iv := data[:IVSize]
	ciphertext := data[IVSize:]

	plaintext, err := gcm.Open(nil, iv, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("gcm.Open: %w", err)
	}

	return plaintext, nil
}
