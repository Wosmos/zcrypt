package auth

import (
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- Password tests ---

func TestHashAndCheckPassword(t *testing.T) {
	hash, err := HashPassword("mysecretpassword")
	require.NoError(t, err)
	assert.NotEmpty(t, hash)
	assert.NotEqual(t, "mysecretpassword", hash)

	// Correct password
	assert.NoError(t, CheckPassword("mysecretpassword", hash))
	// Wrong password
	assert.Error(t, CheckPassword("wrongpassword", hash))
}

func TestHashPasswordUniqueSalts(t *testing.T) {
	h1, err := HashPassword("same")
	require.NoError(t, err)
	h2, err := HashPassword("same")
	require.NoError(t, err)
	assert.NotEqual(t, h1, h2, "bcrypt should produce different hashes for the same password")
}

// --- JWT tests ---

func TestGenerateAndValidateAccessToken(t *testing.T) {
	secret := "test-secret-that-is-at-least-32-chars-long"
	token, err := GenerateAccessToken(secret, "user-123", "user@test.com", "testuser", "user", 0)
	require.NoError(t, err)
	assert.NotEmpty(t, token)

	// Should have 3 parts
	parts := strings.Split(token, ".")
	assert.Len(t, parts, 3)

	// Validate
	claims, err := ValidateAccessToken(secret, token)
	require.NoError(t, err)
	assert.Equal(t, "user-123", claims.Sub)
	assert.Equal(t, "user@test.com", claims.Email)
	assert.Equal(t, "testuser", claims.Username)
	assert.Equal(t, "user", claims.Role)
}

func TestValidateTokenWrongSecret(t *testing.T) {
	token, err := GenerateAccessToken("correct-secret-that-is-long-enough", "user-1", "a@b.com", "u", "user", 0)
	require.NoError(t, err)

	_, err = ValidateAccessToken("wrong-secret-that-is-long-enough!", token)
	assert.ErrorIs(t, err, ErrTokenInvalid)
}

func TestValidateTokenExpired(t *testing.T) {
	secret := "test-secret-that-is-at-least-32-chars-long"
	// Manually create an expired token
	claims := Claims{
		Sub: "user-1",
		Exp: time.Now().Add(-1 * time.Hour).Unix(),
		Iat: time.Now().Add(-2 * time.Hour).Unix(),
	}
	token, err := signJWT(secret, claims)
	require.NoError(t, err)

	_, err = ValidateAccessToken(secret, token)
	assert.ErrorIs(t, err, ErrTokenExpired)
}

func TestValidateTokenMalformed(t *testing.T) {
	secret := "test-secret-that-is-at-least-32-chars-long"

	_, err := ValidateAccessToken(secret, "not-a-jwt")
	assert.ErrorIs(t, err, ErrTokenInvalid)

	_, err = ValidateAccessToken(secret, "a.b")
	assert.ErrorIs(t, err, ErrTokenInvalid)

	_, err = ValidateAccessToken(secret, "")
	assert.ErrorIs(t, err, ErrTokenInvalid)
}

func TestValidateTokenRejectsNoneAlgorithm(t *testing.T) {
	secret := "test-secret-that-is-at-least-32-chars-long"
	// Craft a token with alg:none
	header := b64Encode([]byte(`{"alg":"none","typ":"JWT"}`))
	payload := b64Encode([]byte(`{"sub":"admin","exp":9999999999}`))
	fakeToken := header + "." + payload + "."

	_, err := ValidateAccessToken(secret, fakeToken)
	assert.ErrorIs(t, err, ErrTokenInvalid)
}

func TestGenerateTempToken(t *testing.T) {
	secret := "test-secret-that-is-at-least-32-chars-long"
	token, err := GenerateTempToken(secret, "user-123")
	require.NoError(t, err)
	assert.NotEmpty(t, token)

	// A temp token is validated only via ValidateTempToken (the 2FA step).
	claims, err := ValidateTempToken(secret, token)
	require.NoError(t, err)
	assert.Equal(t, "user-123", claims.Sub)

	// It must NOT be accepted as a full access token (S1: 2FA bypass).
	_, err = ValidateAccessToken(secret, token)
	assert.ErrorIs(t, err, ErrWrongTokenType)
}

// --- Token utility tests ---

func TestGenerateRandomToken(t *testing.T) {
	t1, err := GenerateRandomToken()
	require.NoError(t, err)
	t2, err := GenerateRandomToken()
	require.NoError(t, err)

	assert.Len(t, t1, 64) // 32 bytes = 64 hex chars
	assert.NotEqual(t, t1, t2)
}

func TestHashToken(t *testing.T) {
	hash := HashToken("mytoken")
	assert.Len(t, hash, 64) // SHA-256 = 64 hex chars
	assert.Equal(t, hash, HashToken("mytoken"), "same input should produce same hash")
	assert.NotEqual(t, hash, HashToken("othertoken"))
}
