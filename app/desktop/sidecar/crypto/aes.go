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

// GenerateCEK creates a random 256-bit Content Encryption Key.
//
// Envelope encryption: chunks are encrypted with this random CEK, and the CEK
// is then wrapped with the passphrase-derived key. This decouples file content
// from the passphrase so a file can be shared by re-wrapping its CEK, without
// revealing the passphrase. Mirrors generateCEK() in the web client.
func GenerateCEK() ([]byte, error) {
	cek := make([]byte, KeySize)
	if _, err := rand.Read(cek); err != nil {
		return nil, fmt.Errorf("rand.Read CEK: %w", err)
	}
	return cek, nil
}

// WrapCEK encrypts (wraps) a CEK under a KEK, producing the same wire format as
// a chunk: [12B IV || ciphertext || 16B tag]. Byte-compatible with the web
// client's wrapKey(), so the backend and browser can interchange wrapped CEKs.
func WrapCEK(kek, cek []byte) ([]byte, error) {
	return EncryptChunk(kek, cek)
}

// UnwrapCEK decrypts a CEK that was wrapped under a KEK.
func UnwrapCEK(kek, wrapped []byte) ([]byte, error) {
	return DecryptChunk(kek, wrapped)
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
