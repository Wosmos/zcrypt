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
	TokenVersion int    `json:"tv,omitempty"`
	Exp          int64  `json:"exp"`
	Iat          int64  `json:"iat"`
}

var (
	ErrTokenExpired = errors.New("token expired")
	ErrTokenInvalid = errors.New("invalid token")
)

const (
	AccessTokenDuration  = 15 * time.Minute
	RefreshTokenDuration = 7 * 24 * time.Hour
	TempTokenDuration    = 5 * time.Minute // for 2FA flow
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
		TokenVersion: tokenVersion,
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

// ValidateAccessToken verifies a JWT and returns its claims.
func ValidateAccessToken(secret, tokenStr string) (*Claims, error) {
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
