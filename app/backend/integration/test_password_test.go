//go:build integration

package integration_test

import (
	"crypto/rand"
	"encoding/hex"
)

// newTestPassword returns a fresh password that satisfies the signup policy.
func newTestPassword() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return "Tp-" + hex.EncodeToString(b) + "!Aa1"
}

// newTestPasswordOfLength pads a fresh policy-valid password to exactly n bytes.
func newTestPasswordOfLength(n int) string {
	p := newTestPassword()
	for len(p) < n {
		p += "x"
	}
	return p[:n]
}

// integrationJWTSecret signs and verifies tokens for the test server; generated per run.
var integrationJWTSecret = func() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}()
