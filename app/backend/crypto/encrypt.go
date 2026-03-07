package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"fmt"
	"io"
	"os"
)

// EncryptFile encrypts src file to dst file using AES-256-GCM.
// Output format: [32B salt][12B IV][ciphertext+16B auth tag]
// The passphrase is used only for key derivation and not retained.
func EncryptFile(srcPath, dstPath, passphrase string) (salt []byte, iv []byte, err error) {
	salt, err = GenerateSalt()
	if err != nil {
		return nil, nil, fmt.Errorf("generate salt: %w", err)
	}

	iv, err = GenerateIV()
	if err != nil {
		return nil, nil, fmt.Errorf("generate iv: %w", err)
	}

	key := DeriveKey(passphrase, salt)
	defer clearBytes(key)

	plaintext, err := os.ReadFile(srcPath)
	if err != nil {
		return nil, nil, fmt.Errorf("read source: %w", err)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, nil, fmt.Errorf("create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, nil, fmt.Errorf("create gcm: %w", err)
	}

	ciphertext := gcm.Seal(nil, iv, plaintext, nil)

	out, err := os.Create(dstPath)
	if err != nil {
		return nil, nil, fmt.Errorf("create output: %w", err)
	}
	defer out.Close()

	if _, err := out.Write(salt); err != nil {
		return nil, nil, fmt.Errorf("write salt: %w", err)
	}
	if _, err := out.Write(iv); err != nil {
		return nil, nil, fmt.Errorf("write iv: %w", err)
	}
	if _, err := out.Write(ciphertext); err != nil {
		return nil, nil, fmt.Errorf("write ciphertext: %w", err)
	}

	return salt, iv, nil
}

// EncryptStream encrypts data from reader to writer using AES-256-GCM.
// For large files, reads all into memory. For truly large files, a streaming
// approach with chunked encryption would be needed.
func EncryptStream(r io.Reader, w io.Writer, passphrase string) (salt []byte, iv []byte, err error) {
	salt, err = GenerateSalt()
	if err != nil {
		return nil, nil, fmt.Errorf("generate salt: %w", err)
	}

	iv, err = GenerateIV()
	if err != nil {
		return nil, nil, fmt.Errorf("generate iv: %w", err)
	}

	key := DeriveKey(passphrase, salt)
	defer clearBytes(key)

	plaintext, err := io.ReadAll(r)
	if err != nil {
		return nil, nil, fmt.Errorf("read input: %w", err)
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, nil, fmt.Errorf("create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, nil, fmt.Errorf("create gcm: %w", err)
	}

	ciphertext := gcm.Seal(nil, iv, plaintext, nil)

	if _, err := w.Write(salt); err != nil {
		return nil, nil, fmt.Errorf("write salt: %w", err)
	}
	if _, err := w.Write(iv); err != nil {
		return nil, nil, fmt.Errorf("write iv: %w", err)
	}
	if _, err := w.Write(ciphertext); err != nil {
		return nil, nil, fmt.Errorf("write ciphertext: %w", err)
	}

	return salt, iv, nil
}

// clearBytes zeroes out a byte slice.
func clearBytes(b []byte) {
	for i := range b {
		b[i] = 0
	}
}
