package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"math"
	"net/url"
	"time"
)

const (
	totpPeriod = 30
	totpDigits = 6
	issuerName = "zcrypt"
)

// GenerateTOTPSecret creates a new random 20-byte base32-encoded secret.
func GenerateTOTPSecret() (string, error) {
	secret := make([]byte, 20)
	if _, err := rand.Read(secret); err != nil {
		return "", fmt.Errorf("generate totp secret: %w", err)
	}
	return base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(secret), nil
}

// GenerateTOTPURI creates an otpauth:// URI for QR code scanning.
func GenerateTOTPURI(secret, email string) string {
	u := url.URL{
		Scheme: "otpauth",
		Host:   "totp",
		Path:   fmt.Sprintf("/%s:%s", issuerName, email),
	}
	q := u.Query()
	q.Set("secret", secret)
	q.Set("issuer", issuerName)
	q.Set("algorithm", "SHA1")
	q.Set("digits", "6")
	q.Set("period", "30")
	u.RawQuery = q.Encode()
	return u.String()
}

// ValidateTOTPCode checks a TOTP code against the secret, allowing +/-1 time window.
func ValidateTOTPCode(secret, code string) bool {
	now := time.Now().Unix()
	counter := now / totpPeriod

	for offset := int64(-1); offset <= 1; offset++ {
		expected := generateCode(secret, counter+offset)
		if expected == code {
			return true
		}
	}
	return false
}

func generateCode(secret string, counter int64) string {
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secret)
	if err != nil {
		return ""
	}

	buf := make([]byte, 8)
	binary.BigEndian.PutUint64(buf, uint64(counter))

	mac := hmac.New(sha1.New, key)
	mac.Write(buf)
	hash := mac.Sum(nil)

	offset := hash[len(hash)-1] & 0x0F
	truncated := binary.BigEndian.Uint32(hash[offset:offset+4]) & 0x7FFFFFFF

	code := truncated % uint32(math.Pow10(totpDigits))
	return fmt.Sprintf("%06d", code)
}
