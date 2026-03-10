package auth

import (
	"crypto/sha1"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// CheckPasswordBreach checks if a password has appeared in known data breaches
// using the HaveIBeenPwned k-anonymity API. Returns the number of times the
// password was found, or 0 if not breached. Fails open (returns 0 on error).
func CheckPasswordBreach(password string) (int, error) {
	// SHA-1 hash the password
	h := sha1.New()
	h.Write([]byte(password))
	hash := fmt.Sprintf("%X", h.Sum(nil))

	prefix := hash[:5]
	suffix := hash[5:]

	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("https://api.pwnedpasswords.com/range/" + prefix)
	if err != nil {
		return 0, nil // fail open
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return 0, nil // fail open
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return 0, nil // fail open
	}

	for _, line := range strings.Split(string(body), "\r\n") {
		parts := strings.SplitN(line, ":", 2)
		if len(parts) != 2 {
			continue
		}
		if strings.EqualFold(parts[0], suffix) {
			var count int
			fmt.Sscanf(parts[1], "%d", &count)
			return count, nil
		}
	}

	return 0, nil
}
