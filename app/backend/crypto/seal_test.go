package crypto

import (
	"encoding/base64"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func userKEK(t *testing.T, userID string) []byte {
	t.Helper()
	master := make([]byte, 32)
	master[31] = 1
	kek, err := DeriveUserKEK(master, userID)
	require.NoError(t, err)
	return kek
}

func TestSealOpenRoundTrip(t *testing.T) {
	kek := userKEK(t, "user-1")

	for _, secret := range []string{
		"JBSWY3DPEHPK3PXP",                 // typical base32 TOTP secret
		"",                                 // empty survives the round trip
		"with:colons:and spaces\nnewlines", // format must not care about content
	} {
		sealed, err := SealSecret(kek, secret)
		require.NoError(t, err)
		assert.True(t, IsSealed(sealed))
		if secret != "" {
			assert.NotContains(t, sealed, secret, "sealed value must not embed the plaintext")
		}

		opened, err := OpenSecret(kek, sealed)
		require.NoError(t, err)
		assert.Equal(t, secret, opened)
	}
}

func TestSealProducesUniqueCiphertexts(t *testing.T) {
	kek := userKEK(t, "user-1")
	s1, err := SealSecret(kek, "same-secret")
	require.NoError(t, err)
	s2, err := SealSecret(kek, "same-secret")
	require.NoError(t, err)
	assert.NotEqual(t, s1, s2, "random nonce must make identical plaintexts seal differently")
}

func TestOpenSecretLegacyPlaintextPassthrough(t *testing.T) {
	kek := userKEK(t, "user-1")

	// Rows written before encryption-at-rest are raw base32 — returned as-is.
	opened, err := OpenSecret(kek, "JBSWY3DPEHPK3PXP")
	require.NoError(t, err)
	assert.Equal(t, "JBSWY3DPEHPK3PXP", opened)
	assert.False(t, IsSealed("JBSWY3DPEHPK3PXP"))
}

func TestOpenSecretWrongKEKFails(t *testing.T) {
	sealed, err := SealSecret(userKEK(t, "user-1"), "JBSWY3DPEHPK3PXP")
	require.NoError(t, err)

	_, err = OpenSecret(userKEK(t, "user-2"), sealed)
	assert.Error(t, err, "another user's KEK must not open the secret")
}

func TestOpenSecretTamperDetected(t *testing.T) {
	kek := userKEK(t, "user-1")
	sealed, err := SealSecret(kek, "JBSWY3DPEHPK3PXP")
	require.NoError(t, err)

	// Flip one bit of a REAL ciphertext byte (decode → mutate → re-encode).
	// Mutating the base64 text directly can hit padding bits a lenient decoder
	// ignores, yielding identical bytes — and a decryption that succeeds.
	parts := strings.SplitN(strings.TrimPrefix(sealed, "enc:v1:"), ":", 2)
	require.Len(t, parts, 2)
	ct, err := base64.StdEncoding.DecodeString(parts[1])
	require.NoError(t, err)
	ct[0] ^= 0x01
	tampered := "enc:v1:" + parts[0] + ":" + base64.StdEncoding.EncodeToString(ct)
	require.NotEqual(t, sealed, tampered)

	_, err = OpenSecret(kek, tampered)
	assert.Error(t, err, "GCM must reject a flipped ciphertext bit")
}

func TestOpenSecretMalformed(t *testing.T) {
	kek := userKEK(t, "user-1")
	shortNonce := "enc:v1:" + base64.StdEncoding.EncodeToString([]byte("short")) + ":" +
		base64.StdEncoding.EncodeToString([]byte("some-ciphertext-bytes"))
	for _, stored := range []string{
		"enc:v1:",                 // no nonce/ciphertext separator
		"enc:v1:only-one-part",    // missing ciphertext
		"enc:v1:!!!:also-not-b64", // undecodable base64
		shortNonce,                // wrong-length nonce must error, not panic
	} {
		_, err := OpenSecret(kek, stored)
		assert.Error(t, err, "stored %q", stored)
	}
}
