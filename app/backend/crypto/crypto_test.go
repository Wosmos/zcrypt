package crypto

import (
	"bytes"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGenerateSalt(t *testing.T) {
	salt, err := GenerateSalt()
	require.NoError(t, err)
	assert.Len(t, salt, SaltSize)

	// Two salts should never be equal
	salt2, _ := GenerateSalt()
	assert.NotEqual(t, salt, salt2)
}

func TestGenerateIV(t *testing.T) {
	iv, err := GenerateIV()
	require.NoError(t, err)
	assert.Len(t, iv, IVSize)
}

func TestDeriveKey(t *testing.T) {
	salt, _ := GenerateSalt()
	key := DeriveKey("testpassphrase", salt)
	assert.Len(t, key, KeySize)

	// Same passphrase + salt = same key
	key2 := DeriveKey("testpassphrase", salt)
	assert.Equal(t, key, key2)

	// Different passphrase = different key
	key3 := DeriveKey("otherpassphrase", salt)
	assert.NotEqual(t, key, key3)

	// Different salt = different key
	salt2, _ := GenerateSalt()
	key4 := DeriveKey("testpassphrase", salt2)
	assert.NotEqual(t, key, key4)
}

func TestEncryptDecryptFile(t *testing.T) {
	dir := t.TempDir()
	srcPath := filepath.Join(dir, "plaintext.bin")
	encPath := filepath.Join(dir, "encrypted.bin")
	decPath := filepath.Join(dir, "decrypted.bin")

	// Create test file
	original := []byte("Hello, zpush encryption test! This is a test payload.")
	require.NoError(t, os.WriteFile(srcPath, original, 0600))

	// Encrypt
	salt, iv, err := EncryptFile(srcPath, encPath, "mypassphrase")
	require.NoError(t, err)
	assert.Len(t, salt, SaltSize)
	assert.Len(t, iv, IVSize)

	// Encrypted file should be different from original
	encrypted, err := os.ReadFile(encPath)
	require.NoError(t, err)
	assert.NotEqual(t, original, encrypted)
	assert.Greater(t, len(encrypted), len(original))

	// Decrypt
	err = DecryptFile(encPath, decPath, "mypassphrase")
	require.NoError(t, err)

	decrypted, err := os.ReadFile(decPath)
	require.NoError(t, err)
	assert.Equal(t, original, decrypted)
}

func TestDecryptWithWrongPassphrase(t *testing.T) {
	dir := t.TempDir()
	srcPath := filepath.Join(dir, "plaintext.bin")
	encPath := filepath.Join(dir, "encrypted.bin")
	decPath := filepath.Join(dir, "decrypted.bin")

	require.NoError(t, os.WriteFile(srcPath, []byte("secret data"), 0600))

	_, _, err := EncryptFile(srcPath, encPath, "correctpassphrase")
	require.NoError(t, err)

	err = DecryptFile(encPath, decPath, "wrongpassphrase")
	assert.Error(t, err)
}

func TestEncryptDecryptStream(t *testing.T) {
	original := []byte("Stream encryption test data with some content to verify.")
	reader := bytes.NewReader(original)
	var encrypted bytes.Buffer

	salt, iv, err := EncryptStream(reader, &encrypted, "streampass")
	require.NoError(t, err)
	assert.Len(t, salt, SaltSize)
	assert.Len(t, iv, IVSize)

	// Decrypt the stream output
	decrypted, err := DecryptBytes(encrypted.Bytes(), "streampass")
	require.NoError(t, err)
	assert.Equal(t, original, decrypted)
}

func TestEncryptDecryptEmptyFile(t *testing.T) {
	dir := t.TempDir()
	srcPath := filepath.Join(dir, "empty.bin")
	encPath := filepath.Join(dir, "encrypted.bin")
	decPath := filepath.Join(dir, "decrypted.bin")

	require.NoError(t, os.WriteFile(srcPath, []byte{}, 0600))

	_, _, err := EncryptFile(srcPath, encPath, "pass")
	require.NoError(t, err)

	err = DecryptFile(encPath, decPath, "pass")
	require.NoError(t, err)

	decrypted, _ := os.ReadFile(decPath)
	assert.Empty(t, decrypted)
}

func TestParseMasterKey(t *testing.T) {
	// Valid 32-byte hex key
	hexKey := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	key, err := ParseMasterKey(hexKey)
	require.NoError(t, err)
	assert.Len(t, key, 32)

	// Invalid hex
	_, err = ParseMasterKey("not-hex")
	assert.Error(t, err)

	// Wrong length
	_, err = ParseMasterKey("0123456789abcdef")
	assert.Error(t, err)
}

func TestDeriveUserKEK(t *testing.T) {
	masterKey, _ := hex.DecodeString("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")

	kek1, err := DeriveUserKEK(masterKey, "user-1")
	require.NoError(t, err)
	assert.Len(t, kek1, 32)

	// Same user = same KEK
	kek1b, _ := DeriveUserKEK(masterKey, "user-1")
	assert.Equal(t, kek1, kek1b)

	// Different user = different KEK
	kek2, _ := DeriveUserKEK(masterKey, "user-2")
	assert.NotEqual(t, kek1, kek2)
}

func TestEncryptDecryptToken(t *testing.T) {
	masterKey, _ := hex.DecodeString("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	kek, _ := DeriveUserKEK(masterKey, "user-1")

	token := "ghp_abc123secrettoken"
	ciphertext, nonce, err := EncryptToken(kek, token)
	require.NoError(t, err)
	assert.NotEmpty(t, ciphertext)
	assert.NotEmpty(t, nonce)

	// Decrypt
	plaintext, err := DecryptToken(kek, ciphertext, nonce)
	require.NoError(t, err)
	assert.Equal(t, token, plaintext)

	// Wrong KEK fails
	kek2, _ := DeriveUserKEK(masterKey, "user-2")
	_, err = DecryptToken(kek2, ciphertext, nonce)
	assert.Error(t, err)
}
