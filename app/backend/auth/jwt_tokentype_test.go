package auth

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const tokenTestSecret = "test-secret-that-is-at-least-32-chars-long"

// TestTempTokenRejectedAsAccessToken is the S1 regression: the short-lived 2FA
// temp token must NOT validate as an access token. Otherwise an attacker who
// knows only the password can skip 2FA by using the temp token from the login
// response directly against authenticated endpoints.
func TestTempTokenRejectedAsAccessToken(t *testing.T) {
	temp, err := GenerateTempToken(tokenTestSecret, "user-1")
	require.NoError(t, err)

	_, err = ValidateAccessToken(tokenTestSecret, temp)
	assert.ErrorIs(t, err, ErrWrongTokenType, "temp token must not be accepted as an access token")
}

// TestValidateTempTokenAcceptsOnlyTempTokens ensures the 2FA endpoint accepts a
// genuine temp token but rejects a full access token replayed into it.
func TestValidateTempTokenAcceptsOnlyTempTokens(t *testing.T) {
	temp, err := GenerateTempToken(tokenTestSecret, "user-1")
	require.NoError(t, err)
	claims, err := ValidateTempToken(tokenTestSecret, temp)
	require.NoError(t, err)
	assert.Equal(t, "user-1", claims.Sub)

	access, err := GenerateAccessToken(tokenTestSecret, "user-1", "u@test.com", "user", "user", 0)
	require.NoError(t, err)
	_, err = ValidateTempToken(tokenTestSecret, access)
	assert.ErrorIs(t, err, ErrWrongTokenType, "access token must not be accepted at the 2FA endpoint")
}

// TestAccessTokenStillValidates guards the normal access-token path against
// regressions from the token-type gate.
func TestAccessTokenStillValidates(t *testing.T) {
	access, err := GenerateAccessToken(tokenTestSecret, "user-1", "u@test.com", "user", "user", 3)
	require.NoError(t, err)
	claims, err := ValidateAccessToken(tokenTestSecret, access)
	require.NoError(t, err)
	assert.Equal(t, "user-1", claims.Sub)
	assert.Equal(t, 3, claims.TokenVersion)
}

// TestDecoyTokenValidatesAsAccess ensures decoy-vault tokens remain usable as
// access tokens (they carry the access type).
func TestDecoyTokenValidatesAsAccess(t *testing.T) {
	decoy, err := GenerateDecoyAccessToken(tokenTestSecret, "user-1", "u@test.com", "user", "user", 0)
	require.NoError(t, err)
	claims, err := ValidateAccessToken(tokenTestSecret, decoy)
	require.NoError(t, err)
	assert.True(t, claims.Decoy)
}

// TestLegacyUntypedTokenAcceptedAsAccess verifies backward compatibility: tokens
// minted before token typing existed (no "typ" claim) still validate as access
// tokens, so deploying the fix does not force-log-out existing sessions.
func TestLegacyUntypedTokenAcceptedAsAccess(t *testing.T) {
	legacy, err := signJWT(tokenTestSecret, Claims{
		Sub: "user-1",
		Exp: time.Now().Add(AccessTokenDuration).Unix(),
		Iat: time.Now().Unix(),
	})
	require.NoError(t, err)
	claims, err := ValidateAccessToken(tokenTestSecret, legacy)
	require.NoError(t, err)
	assert.Equal(t, "user-1", claims.Sub)
	assert.Empty(t, claims.Typ)
}
