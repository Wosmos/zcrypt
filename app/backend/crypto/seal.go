package crypto

import (
	"encoding/base64"
	"fmt"
	"strings"
)

// sealPrefix versions the at-rest encrypted-string format so future format
// changes (v2, KMS-wrapped, ...) can coexist with old rows.
const sealPrefix = "enc:v1:"

// IsSealed reports whether a stored value is in the sealed (encrypted-at-rest)
// format, as opposed to a legacy plaintext row.
func IsSealed(stored string) bool {
	return strings.HasPrefix(stored, sealPrefix)
}

// SealSecret encrypts a small secret string (e.g. a TOTP secret) for at-rest
// storage in a TEXT column: "enc:v1:" + base64(nonce) + ":" + base64(ciphertext).
// AES-256-GCM authenticates the value, so tampering fails decryption.
func SealSecret(kek []byte, plaintext string) (string, error) {
	ciphertext, nonce, err := EncryptToken(kek, plaintext)
	if err != nil {
		return "", fmt.Errorf("seal secret: %w", err)
	}
	return sealPrefix +
		base64.StdEncoding.EncodeToString(nonce) + ":" +
		base64.StdEncoding.EncodeToString(ciphertext), nil
}

// OpenSecret reverses SealSecret. Values without the seal prefix are legacy
// plaintext rows (written before encryption-at-rest existed) and are returned
// unchanged; callers re-seal them opportunistically.
func OpenSecret(kek []byte, stored string) (string, error) {
	if !IsSealed(stored) {
		return stored, nil
	}
	parts := strings.SplitN(strings.TrimPrefix(stored, sealPrefix), ":", 2)
	if len(parts) != 2 {
		return "", fmt.Errorf("open secret: malformed sealed value")
	}
	// Strict decoding rejects non-canonical base64 (trailing-padding bit
	// tricks) instead of silently canonicalizing it — one stored value, one
	// accepted encoding.
	nonce, err := base64.StdEncoding.Strict().DecodeString(parts[0])
	if err != nil {
		return "", fmt.Errorf("open secret: decode nonce: %w", err)
	}
	ciphertext, err := base64.StdEncoding.Strict().DecodeString(parts[1])
	if err != nil {
		return "", fmt.Errorf("open secret: decode ciphertext: %w", err)
	}
	return DecryptToken(kek, ciphertext, nonce)
}
