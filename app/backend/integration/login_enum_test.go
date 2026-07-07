//go:build integration

package integration_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Login must not reveal whether an email has an account — neither in the
// response body nor by responding measurably faster for unknown emails.
func TestLoginNoAccountEnumeration(t *testing.T) {
	ts := setupTestServer(t)
	const email = "enum-known@example.com"
	const password = "SecurePass@123!"
	ts.registerAndLogin(email, password)

	timedLogin := func(email, password string) ([]byte, time.Duration) {
		start := time.Now()
		resp := ts.POST("/api/auth/login", map[string]string{
			"email":    email,
			"password": password,
		}, "")
		elapsed := time.Since(start)
		body := requireStatus(t, resp, http.StatusUnauthorized)
		return body, elapsed
	}

	knownBody, knownTime := timedLogin(email, "WrongPassword@123!")
	unknownBody, unknownTime := timedLogin("enum-ghost@example.com", "WrongPassword@123!")

	t.Run("identical error bodies", func(t *testing.T) {
		assert.Equal(t, string(knownBody), string(unknownBody),
			"unknown-email and wrong-password responses must be indistinguishable")
	})

	t.Run("unknown email burns a full bcrypt comparison", func(t *testing.T) {
		// A cost-12 bcrypt compare takes ~200ms+; without the dummy comparison
		// the unknown-email path returned in single-digit milliseconds. A
		// generous floor keeps this robust across machines while still
		// catching a regression by an order of magnitude.
		require.Greater(t, unknownTime, 100*time.Millisecond,
			"unknown-email login returned too fast (%v) — timing oracle is back (known-email took %v)",
			unknownTime, knownTime)
	})
}
