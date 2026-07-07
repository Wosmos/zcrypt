package auth

import (
	"encoding/base32"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGenerateTOTPSecret(t *testing.T) {
	s1, err := GenerateTOTPSecret()
	require.NoError(t, err)
	assert.NotEmpty(t, s1)

	// 20 raw bytes, base32 no-padding => 32 chars.
	assert.Len(t, s1, 32)

	// It must decode as valid base32 (no padding).
	raw, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(s1)
	require.NoError(t, err)
	assert.Len(t, raw, 20)

	// Two secrets must differ.
	s2, err := GenerateTOTPSecret()
	require.NoError(t, err)
	assert.NotEqual(t, s1, s2)
}

func TestGenerateTOTPURI(t *testing.T) {
	uri := GenerateTOTPURI("JBSWY3DPEHPK3PXP", "user@test.com")
	assert.True(t, strings.HasPrefix(uri, "otpauth://totp/"))
	assert.Contains(t, uri, "zcrypt")
	assert.Contains(t, uri, "zcrypt:user@test.com") // issuer:account label in path
	assert.Contains(t, uri, "secret=JBSWY3DPEHPK3PXP")
	assert.Contains(t, uri, "issuer=zcrypt")
	assert.Contains(t, uri, "algorithm=SHA1")
	assert.Contains(t, uri, "digits=6")
	assert.Contains(t, uri, "period=30")
}

func TestValidateTOTPCodeValid(t *testing.T) {
	secret, err := GenerateTOTPSecret()
	require.NoError(t, err)

	// Compute the code for the current window using the same routine the
	// server uses, then confirm it validates.
	counter := time.Now().Unix() / totpPeriod
	code := generateCode(secret, counter)
	require.Len(t, code, totpDigits)

	assert.True(t, ValidateTOTPCode(secret, code), "current-window code must validate")
}

// runInWindow retries fn until it executes entirely within one TOTP time step
// and returns that stable counter plus fn's result. Without this, asserts like
// "counter+2 must be rejected" race the wall clock: if the 30s boundary is
// crossed between computing the counter and validating, the accepted window
// shifts and the assert flips — a once-in-a-blue-moon CI flake.
func runInWindow(t *testing.T, fn func(counter int64) bool) (int64, bool) {
	t.Helper()
	for i := 0; i < 20; i++ {
		before := time.Now().Unix() / totpPeriod
		res := fn(before)
		if time.Now().Unix()/totpPeriod == before {
			return before, res
		}
	}
	t.Fatal("could not complete within a single TOTP window in 20 attempts")
	return 0, false
}

func TestValidateTOTPCodeWindowTolerance(t *testing.T) {
	secret, err := GenerateTOTPSecret()
	require.NoError(t, err)

	// Codes from the immediately preceding and following windows are accepted.
	_, ok := runInWindow(t, func(c int64) bool {
		return ValidateTOTPCode(secret, generateCode(secret, c-1))
	})
	assert.True(t, ok, "previous window must validate")
	_, ok = runInWindow(t, func(c int64) bool {
		return ValidateTOTPCode(secret, generateCode(secret, c+1))
	})
	assert.True(t, ok, "next window must validate")

	// A window two steps away must NOT validate.
	_, ok = runInWindow(t, func(c int64) bool {
		return ValidateTOTPCode(secret, generateCode(secret, c+2))
	})
	assert.False(t, ok, "far window must be rejected")
}

func TestValidateTOTPCodeInvalid(t *testing.T) {
	secret, err := GenerateTOTPSecret()
	require.NoError(t, err)

	// A hardcoded "000000" can coincidentally BE the current code for a random
	// secret (1-in-10^6 flake); derive a code guaranteed wrong for all windows.
	_, ok := runInWindow(t, func(c int64) bool {
		return ValidateTOTPCode(secret, wrongCode(t, secret, c))
	})
	assert.False(t, ok)
	assert.False(t, ValidateTOTPCode(secret, ""))
	assert.False(t, ValidateTOTPCode(secret, "not-a-code"))
}

func TestGenerateCodeInvalidSecret(t *testing.T) {
	// A non-base32 secret cannot be decoded; generateCode returns "" and
	// validation therefore fails rather than panicking.
	assert.Equal(t, "", generateCode("!!!not-base32!!!", 1))
	assert.False(t, ValidateTOTPCode("!!!not-base32!!!", "123456"))
}

func TestGenerateCodeDeterministic(t *testing.T) {
	// RFC 6238 / RFC 4226 determinism: same secret + counter => same code.
	secret := "JBSWY3DPEHPK3PXP"
	assert.Equal(t, generateCode(secret, 42), generateCode(secret, 42))
	assert.NotEqual(t, generateCode(secret, 42), generateCode(secret, 43))
}

// wrongCode returns a 6-digit code guaranteed not to be valid for any of the
// secret's accepted windows (counter-1 .. counter+1).
func wrongCode(t *testing.T, secret string, counter int64) string {
	t.Helper()
	valid := map[string]bool{}
	for off := int64(-1); off <= 1; off++ {
		valid[generateCode(secret, counter+off)] = true
	}
	for i := 0; i < 10; i++ {
		candidate := fmt.Sprintf("%06d", i)
		if !valid[candidate] {
			return candidate
		}
	}
	t.Fatal("could not find an invalid code (impossible: 3 valid codes, 10 candidates)")
	return ""
}

func TestValidateTOTPCodeCounter(t *testing.T) {
	secret, err := GenerateTOTPSecret()
	require.NoError(t, err)

	t.Run("current window code returns its counter", func(t *testing.T) {
		var got int64
		counter, ok := runInWindow(t, func(c int64) bool {
			var valid bool
			got, valid = ValidateTOTPCodeCounter(secret, generateCode(secret, c))
			return valid
		})
		require.True(t, ok)
		assert.Equal(t, counter, got)
	})

	t.Run("adjacent window codes return their counters", func(t *testing.T) {
		for _, off := range []int64{-1, 1} {
			var got int64
			counter, ok := runInWindow(t, func(c int64) bool {
				var valid bool
				got, valid = ValidateTOTPCodeCounter(secret, generateCode(secret, c+off))
				return valid
			})
			require.True(t, ok, "offset %d", off)
			// A neighbour's code can coincidentally equal the current window's
			// (1-in-10^6); only pin the counter when the codes differ.
			if generateCode(secret, counter+off) != generateCode(secret, counter) {
				assert.Equal(t, counter+off, got, "offset %d", off)
			}
		}
	})

	t.Run("wrong code rejected", func(t *testing.T) {
		_, ok := runInWindow(t, func(c int64) bool {
			_, valid := ValidateTOTPCodeCounter(secret, wrongCode(t, secret, c))
			return valid
		})
		assert.False(t, ok)
	})

	t.Run("wrong-length codes rejected", func(t *testing.T) {
		for _, code := range []string{"", "12345", "1234567", generateCode(secret, 1) + "0"} {
			_, ok := ValidateTOTPCodeCounter(secret, code)
			assert.False(t, ok, "code %q", code)
		}
	})

	t.Run("empty secret never validates", func(t *testing.T) {
		// Regression guard: generateCode("", n) returns "" on decode failure and
		// a plain string comparison would have matched an empty submitted code.
		_, ok := ValidateTOTPCodeCounter("", "")
		assert.False(t, ok)
		_, ok = ValidateTOTPCodeCounter("", "000000")
		assert.False(t, ok)
	})

	t.Run("undecodable secret never validates", func(t *testing.T) {
		for _, code := range []string{"", "000000"} {
			_, ok := ValidateTOTPCodeCounter("!!!not-base32!!!", code)
			assert.False(t, ok, "code %q", code)
		}
	})
}

func TestTOTPCodeAt(t *testing.T) {
	secret, err := GenerateTOTPSecret()
	require.NoError(t, err)
	now := time.Now()

	assert.Equal(t, generateCode(secret, now.Unix()/totpPeriod), TOTPCodeAt(secret, now))
	// +30s is always exactly the next time step (integer division).
	assert.Equal(t, generateCode(secret, now.Unix()/totpPeriod+1), TOTPCodeAt(secret, now.Add(30*time.Second)))
	assert.Len(t, TOTPCodeAt(secret, now), totpDigits)
}
