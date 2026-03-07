package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"fmt"
	"os"
)

// DecryptFile decrypts an encrypted file (salt+iv+ciphertext) back to plaintext.
// Input format: [32B salt][12B IV][ciphertext+16B auth tag]
func DecryptFile(srcPath, dstPath, passphrase string) error {
	data, err := os.ReadFile(srcPath)
	if err != nil {
		return fmt.Errorf("read encrypted file: %w", err)
	}

	minSize := SaltSize + IVSize + 16 // salt + iv + minimum auth tag
	if len(data) < minSize {
		return fmt.Errorf("encrypted file too small: %d bytes", len(data))
	}

	salt := data[:SaltSize]
	iv := data[SaltSize : SaltSize+IVSize]
	ciphertext := data[SaltSize+IVSize:]

	key := DeriveKey(passphrase, salt)
	defer clearBytes(key)

	block, err := aes.NewCipher(key)
	if err != nil {
		return fmt.Errorf("create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return fmt.Errorf("create gcm: %w", err)
	}

	plaintext, err := gcm.Open(nil, iv, ciphertext, nil)
	if err != nil {
		return fmt.Errorf("decrypt failed (wrong passphrase?): %w", err)
	}

	if err := os.WriteFile(dstPath, plaintext, 0600); err != nil {
		return fmt.Errorf("write decrypted file: %w", err)
	}

	return nil
}

// DecryptBytes decrypts raw encrypted bytes (salt+iv+ciphertext) to plaintext.
func DecryptBytes(data []byte, passphrase string) ([]byte, error) {
	minSize := SaltSize + IVSize + 16
	if len(data) < minSize {
		return nil, fmt.Errorf("encrypted data too small: %d bytes", len(data))
	}

	salt := data[:SaltSize]
	iv := data[SaltSize : SaltSize+IVSize]
	ciphertext := data[SaltSize+IVSize:]

	key := DeriveKey(passphrase, salt)
	defer clearBytes(key)

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("create gcm: %w", err)
	}

	plaintext, err := gcm.Open(nil, iv, ciphertext, nil)
	if err != nil {
		return nil, fmt.Errorf("decrypt failed (wrong passphrase?): %w", err)
	}

	return plaintext, nil
}
