package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const edgeSecret = "test-secret-that-is-at-least-32-chars-long"

// signParts signs an arbitrary header.payload string (already the raw segments)
// with the correct HS256 signature, so we can exercise parseToken branches that
// occur AFTER the signature check passes.
func signRaw(header, payload string) string {
	signingInput := header + "." + payload
	mac := hmac.New(sha256.New, []byte(edgeSecret))
	mac.Write([]byte(signingInput))
	return signingInput + "." + b64Encode(mac.Sum(nil))
}

func TestParseTokenBadHeaderBase64(t *testing.T) {
	// parts[0] is not valid base64url.
	tok := "!!!." + b64Encode([]byte(`{"sub":"x"}`)) + ".sig"
	_, err := ValidateAccessToken(edgeSecret, tok)
	assert.ErrorIs(t, err, ErrTokenInvalid)
}

func TestParseTokenHeaderNotJSON(t *testing.T) {
	// Valid base64 but not JSON in the header segment.
	tok := b64Encode([]byte("not-json")) + "." + b64Encode([]byte(`{"sub":"x"}`)) + ".sig"
	_, err := ValidateAccessToken(edgeSecret, tok)
	assert.ErrorIs(t, err, ErrTokenInvalid)
}

func TestParseTokenWrongAlgorithm(t *testing.T) {
	// alg other than HS256 must be rejected (algorithm-confusion guard).
	tok := b64Encode([]byte(`{"alg":"RS256","typ":"JWT"}`)) + "." + b64Encode([]byte(`{"sub":"x"}`)) + ".sig"
	_, err := ValidateAccessToken(edgeSecret, tok)
	assert.ErrorIs(t, err, ErrTokenInvalid)
}

func TestParseTokenBadSignatureBase64(t *testing.T) {
	header := b64Encode([]byte(`{"alg":"HS256","typ":"JWT"}`))
	payload := b64Encode([]byte(`{"sub":"x","exp":9999999999}`))
	tok := header + "." + payload + ".!!!" // signature not valid base64url
	_, err := ValidateAccessToken(edgeSecret, tok)
	assert.ErrorIs(t, err, ErrTokenInvalid)
}

func TestParseTokenBadPayloadBase64(t *testing.T) {
	// Header valid + correct signature over the (invalid-b64) payload segment,
	// so we pass signature verification and hit the payload-decode error branch.
	header := b64Encode([]byte(`{"alg":"HS256","typ":"JWT"}`))
	tok := signRaw(header, "!!!")
	_, err := ValidateAccessToken(edgeSecret, tok)
	assert.ErrorIs(t, err, ErrTokenInvalid)
}

func TestParseTokenPayloadNotJSON(t *testing.T) {
	header := b64Encode([]byte(`{"alg":"HS256","typ":"JWT"}`))
	payload := b64Encode([]byte("not-json"))
	tok := signRaw(header, payload)
	_, err := ValidateAccessToken(edgeSecret, tok)
	assert.ErrorIs(t, err, ErrTokenInvalid)
}

func TestValidateTempTokenMalformed(t *testing.T) {
	// The parseToken error path must propagate through ValidateTempToken too.
	_, err := ValidateTempToken(edgeSecret, "not-a-jwt")
	assert.ErrorIs(t, err, ErrTokenInvalid)
}

func TestB64RoundTrip(t *testing.T) {
	data := []byte("some binary \x00\x01\xff payload")
	out, err := b64Decode(b64Encode(data))
	require.NoError(t, err)
	assert.Equal(t, data, out)
}
