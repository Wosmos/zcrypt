package crypto

import (
	"encoding/hex"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// helper: a valid 32-byte KEK derived deterministically.
func testKEK(t *testing.T) []byte {
	t.Helper()
	masterKey, err := hex.DecodeString("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	require.NoError(t, err)
	kek, err := DeriveUserKEK(masterKey, "user-extra")
	require.NoError(t, err)
	return kek
}

func TestEncryptTokenBadKeyLength(t *testing.T) {
	// AES requires a 16/24/32-byte key; a 10-byte key must fail at NewCipher.
	_, _, err := EncryptToken([]byte("short-key!"), "secret")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "create cipher")
}

func TestDecryptTokenBadKeyLength(t *testing.T) {
	_, err := DecryptToken([]byte("short-key!"), []byte("ciphertext"), make([]byte, 12))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "create cipher")
}

func TestDecryptTokenWrongKey(t *testing.T) {
	kek := testKEK(t)
	ct, nonce, err := EncryptToken(kek, "top-secret")
	require.NoError(t, err)

	// A different but valid-length key must fail authentication.
	wrong := make([]byte, len(kek))
	copy(wrong, kek)
	wrong[0] ^= 0xFF
	_, err = DecryptToken(wrong, ct, nonce)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "decrypt token")
}

func TestDecryptTokenTamperedCiphertext(t *testing.T) {
	kek := testKEK(t)
	ct, nonce, err := EncryptToken(kek, "top-secret")
	require.NoError(t, err)

	// Flip a bit in the ciphertext: GCM auth tag must reject it.
	ct[0] ^= 0x01
	_, err = DecryptToken(kek, ct, nonce)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "decrypt token")
}

func TestDecryptTokenTamperedNonce(t *testing.T) {
	kek := testKEK(t)
	ct, nonce, err := EncryptToken(kek, "top-secret")
	require.NoError(t, err)

	nonce[0] ^= 0x01
	_, err = DecryptToken(kek, ct, nonce)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "decrypt token")
}

func TestDecryptTokenTooShortCiphertext(t *testing.T) {
	kek := testKEK(t)
	// Ciphertext shorter than the GCM tag can never authenticate.
	_, err := DecryptToken(kek, []byte{0x00, 0x01}, make([]byte, 12))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "decrypt token")
}

func TestDecryptTokenEmptyCiphertext(t *testing.T) {
	kek := testKEK(t)
	_, err := DecryptToken(kek, nil, make([]byte, 12))
	require.Error(t, err)
}

func TestParseMasterKeyOddLengthHex(t *testing.T) {
	// Odd number of hex digits is invalid hex encoding.
	_, err := ParseMasterKey("abc")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "decode master key")
}

func TestParseMasterKeyWrongByteLength(t *testing.T) {
	// Valid hex but only 16 bytes (needs 32).
	_, err := ParseMasterKey("0123456789abcdef0123456789abcdef")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "32 bytes")
}

func TestEncryptTokenProducesFreshNonce(t *testing.T) {
	kek := testKEK(t)
	_, nonce1, err := EncryptToken(kek, "same-plaintext")
	require.NoError(t, err)
	_, nonce2, err := EncryptToken(kek, "same-plaintext")
	require.NoError(t, err)
	assert.NotEqual(t, nonce1, nonce2, "each encryption must use a fresh nonce")
	assert.Len(t, nonce1, 12)
}
