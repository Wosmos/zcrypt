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
