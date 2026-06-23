package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

// Claims represents the JWT payload.
type Claims struct {
	Sub          string `json:"sub"`
	Email        string `json:"email"`
	Username     string `json:"username"`
	Role         string `json:"role"`
	Typ          string `json:"typ,omitempty"`
	TokenVersion int    `json:"tv,omitempty"`
	Decoy        bool   `json:"decoy,omitempty"`
	Exp          int64  `json:"exp"`
	Iat          int64  `json:"iat"`
}

var (
	ErrTokenExpired   = errors.New("token expired")
	ErrTokenInvalid   = errors.New("invalid token")
	ErrWrongTokenType = errors.New("wrong token type")
)

const (
	AccessTokenDuration  = 15 * time.Minute
	RefreshTokenDuration = 7 * 24 * time.Hour
	TempTokenDuration    = 5 * time.Minute // for 2FA flow
)

// Token types distinguish a full access token from the short-lived token issued
// mid-login for the 2FA step. A temp token must never be accepted as an access
// token — otherwise an attacker who knows only the password could skip 2FA.
const (
	tokenTypeAccess = "access"
	tokenTypeTemp   = "2fa"
)

// b64Encode is base64url encoding without padding.
func b64Encode(data []byte) string {
	return base64.RawURLEncoding.EncodeToString(data)
}

func b64Decode(s string) ([]byte, error) {
	return base64.RawURLEncoding.DecodeString(s)
}

// GenerateAccessToken creates a signed HS256 JWT.
func GenerateAccessToken(secret, userID, email, username, role string, tokenVersion int) (string, error) {
	now := time.Now()
	claims := Claims{
		Sub:          userID,
		Email:        email,
		Username:     username,
		Role:         role,
		Typ:          tokenTypeAccess,
		TokenVersion: tokenVersion,
		Exp:          now.Add(AccessTokenDuration).Unix(),
		Iat:          now.Unix(),
	}
	return signJWT(secret, claims)
}

// GenerateDecoyAccessToken creates a JWT with the decoy flag set.
func GenerateDecoyAccessToken(secret, userID, email, username, role string, tokenVersion int) (string, error) {
	now := time.Now()
	claims := Claims{
		Sub:          userID,
		Email:        email,
		Username:     username,
		Role:         role,
		Typ:          tokenTypeAccess,
		TokenVersion: tokenVersion,
		Decoy:        true,
		Exp:          now.Add(AccessTokenDuration).Unix(),
		Iat:          now.Unix(),
	}
	return signJWT(secret, claims)
}

// GenerateTempToken creates a short-lived token for 2FA verification.
func GenerateTempToken(secret, userID string) (string, error) {
	now := time.Now()
	claims := Claims{
		Sub: userID,
		Typ: tokenTypeTemp,
		Exp: now.Add(TempTokenDuration).Unix(),
		Iat: now.Unix(),
	}
	return signJWT(secret, claims)
}

func signJWT(secret string, claims Claims) (string, error) {
	header := b64Encode([]byte(`{"alg":"HS256","typ":"JWT"}`))

	payload, err := json.Marshal(claims)
	if err != nil {
		return "", fmt.Errorf("marshal claims: %w", err)
	}
	encodedPayload := b64Encode(payload)

	signingInput := header + "." + encodedPayload
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(signingInput))
	signature := b64Encode(mac.Sum(nil))

	return signingInput + "." + signature, nil
}

// parseToken verifies a JWT's algorithm, signature, and expiry and returns its
// claims. It does NOT check the token type — callers must go through
// ValidateAccessToken or ValidateTempToken so a token minted for one purpose
// cannot be used for another.
func parseToken(secret, tokenStr string) (*Claims, error) {
	parts := strings.Split(tokenStr, ".")
	if len(parts) != 3 {
		return nil, ErrTokenInvalid
	}

	// Validate algorithm to prevent algorithm confusion attacks
	headerJSON, err := b64Decode(parts[0])
	if err != nil {
		return nil, ErrTokenInvalid
	}
	var header struct {
		Alg string `json:"alg"`
		Typ string `json:"typ"`
	}
	if err := json.Unmarshal(headerJSON, &header); err != nil {
		return nil, ErrTokenInvalid
	}
	if header.Alg != "HS256" {
		return nil, ErrTokenInvalid
	}

	signingInput := parts[0] + "." + parts[1]
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(signingInput))
	expectedSig := mac.Sum(nil)

	actualSig, err := b64Decode(parts[2])
	if err != nil {
		return nil, ErrTokenInvalid
	}

	if !hmac.Equal(expectedSig, actualSig) {
		return nil, ErrTokenInvalid
	}

	payloadJSON, err := b64Decode(parts[1])
	if err != nil {
		return nil, ErrTokenInvalid
	}

	var claims Claims
	if err := json.Unmarshal(payloadJSON, &claims); err != nil {
		return nil, ErrTokenInvalid
	}

	if time.Now().Unix() > claims.Exp {
		return nil, ErrTokenExpired
	}

	return &claims, nil
}

// ValidateAccessToken verifies a full access-token JWT and returns its claims.
// It rejects 2FA temp tokens, so the temp token issued mid-login cannot be used
// to reach authenticated endpoints without completing 2FA.
func ValidateAccessToken(secret, tokenStr string) (*Claims, error) {
	claims, err := parseToken(secret, tokenStr)
	if err != nil {
		return nil, err
	}
	// Accept access tokens. An empty type is treated as access for backward
	// compatibility with tokens issued before token typing was introduced.
	if claims.Typ != tokenTypeAccess && claims.Typ != "" {
		return nil, ErrWrongTokenType
	}
	return claims, nil
}

// ValidateTempToken verifies the short-lived token issued for the 2FA step. It
// accepts ONLY temp-type tokens, so a temp token can never act as an access
// token and a full access token cannot be replayed into the 2FA endpoint.
func ValidateTempToken(secret, tokenStr string) (*Claims, error) {
	claims, err := parseToken(secret, tokenStr)
	if err != nil {
		return nil, err
	}
	if claims.Typ != tokenTypeTemp {
		return nil, ErrWrongTokenType
	}
	return claims, nil
}

// GenerateRandomToken creates a cryptographically random hex token.
func GenerateRandomToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate random token: %w", err)
	}
	return hex.EncodeToString(b), nil
}

// HashToken produces a SHA-256 hex hash of a token for DB storage.
func HashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}
