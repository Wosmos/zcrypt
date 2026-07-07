package auth

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
)

// BackupCodeCount is how many one-time recovery codes are minted when 2FA is
// enabled (or regenerated). Ten is the common default — enough to survive a lost
// authenticator without becoming a long-lived password list.
const BackupCodeCount = 10

// GenerateBackupCodes returns n random one-time 2FA recovery codes, each 8 bytes
// (64 bits) of entropy rendered as "xxxx-xxxx-xxxx-xxxx". The plaintext is shown
// to the user exactly once; only HashToken(NormalizeBackupCode(code)) is stored.
func GenerateBackupCodes(n int) ([]string, error) {
	codes := make([]string, 0, n)
	for i := 0; i < n; i++ {
		raw := make([]byte, 8)
		if _, err := rand.Read(raw); err != nil {
			return nil, fmt.Errorf("generate backup code: %w", err)
		}
		h := hex.EncodeToString(raw) // 16 hex chars
		codes = append(codes, fmt.Sprintf("%s-%s-%s-%s", h[0:4], h[4:8], h[8:12], h[12:16]))
	}
	return codes, nil
}

// NormalizeBackupCode canonicalizes user-entered codes for comparison: dashes and
// spaces are stripped and letters lowercased, so "ABCD-1234 ..." matches the
// stored hash regardless of how the user typed it.
func NormalizeBackupCode(code string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(code) {
		if r == '-' || r == ' ' {
			continue
		}
		b.WriteRune(r)
	}
	return b.String()
}
