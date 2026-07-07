//go:build integration

package integration_test

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/zcrypt/zcrypt/auth"
)

// setup2FA registers a user, runs 2FA setup, and enables it with a valid code.
// It returns the access token and the TOTP secret. Enabling consumes the
// current time-step counter, so subsequent verifications must use the NEXT
// window's code (the server accepts +/-1 window).
func setup2FA(ts *testServer, t *testing.T, email, password string) (token, secret string) {
	t.Helper()
	// A leftover user from a previous run has 2FA enabled, which would make
	// registerAndLogin get a requires_2fa challenge instead of tokens. Start
	// clean (CASCADE clears the user's tokens and sessions).
	_, err := ts.db.Pool().Exec(context.Background(), `DELETE FROM users WHERE email = $1`, email)
	require.NoError(t, err)

	token = ts.registerAndLogin(email, password)

	resp := ts.POST("/api/auth/2fa/setup", map[string]string{}, token)
	body := requireStatus(t, resp, http.StatusOK)
	var setup struct {
		Secret string `json:"secret"`
		URI    string `json:"uri"`
	}
	require.NoError(t, jsonUnmarshal(body, &setup))
	require.NotEmpty(t, setup.Secret)
	require.Contains(t, setup.URI, "otpauth://totp/")

	resp = ts.POST("/api/auth/2fa/enable", map[string]string{
		"code": auth.TOTPCodeAt(setup.Secret, time.Now()),
	}, token)
	body = requireStatus(t, resp, http.StatusOK)
	// Enable mints one-time recovery codes; every backup-code test needs them, and
	// asserting them here keeps the happy-path callers unaffected.
	var enable struct {
		BackupCodes []string `json:"backup_codes"`
	}
	require.NoError(t, jsonUnmarshal(body, &enable))
	require.Len(t, enable.BackupCodes, 10, "enable must return 10 recovery codes")
	lastBackupCodes = enable.BackupCodes

	return token, setup.Secret
}

// lastBackupCodes holds the recovery codes returned by the most recent setup2FA
// call, so a backup-code test can use them without threading them through every
// caller's return signature. Tests run sequentially, so this is race-free.
var lastBackupCodes []string

// loginFor2FA logs in with password and returns the temp token from the
// requires_2fa response.
func loginFor2FA(ts *testServer, t *testing.T, email, password string) string {
	t.Helper()
	resp := ts.POST("/api/auth/login", map[string]string{
		"email":    email,
		"password": password,
	}, "")
	body := requireStatus(t, resp, http.StatusOK)
	var result struct {
		Requires2FA bool   `json:"requires_2fa"`
		TempToken   string `json:"temp_token"`
	}
	require.NoError(t, jsonUnmarshal(body, &result))
	require.True(t, result.Requires2FA, "login with 2FA enabled must demand a code")
	require.NotEmpty(t, result.TempToken)
	return result.TempToken
}

func TestTwoFALifecycle(t *testing.T) {
	ts := setupTestServer(t)
	const email = "twofa@example.com"
	const password = "SecurePass@123!"

	_, secret := setup2FA(ts, t, email, password)
	tempToken := loginFor2FA(ts, t, email, password)

	// Enable consumed the current counter — verify with the next window's code,
	// which the server accepts (+1 tolerance) and which claims a fresh counter.
	code := auth.TOTPCodeAt(secret, time.Now().Add(30*time.Second))

	t.Run("valid code issues tokens", func(t *testing.T) {
		resp := ts.POST("/api/auth/2fa/verify", map[string]string{
			"temp_token": tempToken,
			"code":       code,
		}, "")
		body := requireStatus(t, resp, http.StatusOK)
		var tokens struct {
			AccessToken  string `json:"access_token"`
			RefreshToken string `json:"refresh_token"`
		}
		require.NoError(t, jsonUnmarshal(body, &tokens))
		assert.NotEmpty(t, tokens.AccessToken)
		assert.NotEmpty(t, tokens.RefreshToken)
	})

	t.Run("replayed code rejected", func(t *testing.T) {
		resp := ts.POST("/api/auth/2fa/verify", map[string]string{
			"temp_token": tempToken,
			"code":       code, // the exact code that just succeeded
		}, "")
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
		resp.Body.Close()
	})

	t.Run("garbage temp token rejected", func(t *testing.T) {
		resp := ts.POST("/api/auth/2fa/verify", map[string]string{
			"temp_token": "not.a.token",
			"code":       auth.TOTPCodeAt(secret, time.Now()),
		}, "")
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
		resp.Body.Close()
	})
}

func TestTwoFABruteForceCap(t *testing.T) {
	ts := setupTestServer(t)
	const email = "twofa-brute@example.com"
	const password = "SecurePass@123!"

	setup2FA(ts, t, email, password)
	tempToken := loginFor2FA(ts, t, email, password)

	// The per-user limiter allows 5 attempts per 5 minutes; enabling consumed
	// one. Wrong codes burn the remaining 4, then the limiter kicks in with 429
	// — an attacker never gets an unbounded run at the 10^6 code space.
	// "000000" can collide with a live code (1-in-10^6 per window); accept 401
	// or 429 per attempt and require that the run ends rate-limited.
	sawUnauthorized := false
	sawRateLimited := false
	for i := 0; i < 8 && !sawRateLimited; i++ {
		resp := ts.POST("/api/auth/2fa/verify", map[string]string{
			"temp_token": tempToken,
			"code":       "000000",
		}, "")
		switch resp.StatusCode {
		case http.StatusUnauthorized:
			sawUnauthorized = true
		case http.StatusTooManyRequests:
			sawRateLimited = true
		default:
			t.Fatalf("attempt %d: unexpected status %d", i+1, resp.StatusCode)
		}
		resp.Body.Close()
	}
	assert.True(t, sawUnauthorized, "wrong codes should first be rejected as invalid")
	assert.True(t, sawRateLimited, "repeated wrong codes must trip the per-user rate limit")
}

func TestTwoFASetupGuard(t *testing.T) {
	ts := setupTestServer(t)
	token, _ := setup2FA(ts, t, "twofa-guard@example.com", "SecurePass@123!")

	// With 2FA already enabled, a (possibly stolen) access token must not be
	// able to rotate the secret out from under the account owner.
	resp := ts.POST("/api/auth/2fa/setup", map[string]string{}, token)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	resp.Body.Close()
}

func TestTwoFAEnableRejectsReusedCode(t *testing.T) {
	ts := setupTestServer(t)
	_, err := ts.db.Pool().Exec(context.Background(), `DELETE FROM users WHERE email = $1`, "twofa-reuse@example.com")
	require.NoError(t, err)
	token := ts.registerAndLogin("twofa-reuse@example.com", "SecurePass@123!")

	resp := ts.POST("/api/auth/2fa/setup", map[string]string{}, token)
	body := requireStatus(t, resp, http.StatusOK)
	var setup struct {
		Secret string `json:"secret"`
	}
	require.NoError(t, jsonUnmarshal(body, &setup))

	code := auth.TOTPCodeAt(setup.Secret, time.Now())
	resp = ts.POST("/api/auth/2fa/enable", map[string]string{"code": code}, token)
	requireStatus(t, resp, http.StatusOK)

	// Disable requires password + a FRESH code — the enable code is spent.
	resp = ts.POST("/api/auth/2fa/disable", map[string]string{
		"password": "SecurePass@123!",
		"code":     code,
	}, token)
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
	resp.Body.Close()

	// The next window's code works, and disabling resets 2FA fully.
	resp = ts.POST("/api/auth/2fa/disable", map[string]string{
		"password": "SecurePass@123!",
		"code":     auth.TOTPCodeAt(setup.Secret, time.Now().Add(30*time.Second)),
	}, token)
	requireStatus(t, resp, http.StatusOK)
}

// dbTOTPSecret reads the stored totp_secret column directly — asserting on
// what an attacker with a database dump would actually see.
func dbTOTPSecret(ts *testServer, t *testing.T, email string) string {
	t.Helper()
	var stored string
	err := ts.db.Pool().QueryRow(context.Background(),
		`SELECT totp_secret FROM users WHERE email = $1`, email).Scan(&stored)
	require.NoError(t, err)
	return stored
}

func TestTwoFASecretSealedAtRest(t *testing.T) {
	ts := setupTestServer(t)
	const email = "twofa-rest@example.com"

	_, secret := setup2FA(ts, t, email, "SecurePass@123!")

	stored := dbTOTPSecret(ts, t, email)
	assert.True(t, strings.HasPrefix(stored, "enc:v1:"),
		"totp_secret must be sealed at rest, got %q", stored)
	assert.NotContains(t, stored, secret, "DB row must not contain the plaintext secret")
}

func TestTwoFALegacyPlaintextSecretUpgraded(t *testing.T) {
	ts := setupTestServer(t)
	const email = "twofa-legacy@example.com"
	const password = "SecurePass@123!"

	_, err := ts.db.Pool().Exec(context.Background(), `DELETE FROM users WHERE email = $1`, email)
	require.NoError(t, err)

	ts.registerAndLogin(email, password)

	// Simulate a row written before encryption-at-rest existed: plaintext
	// secret, 2FA enabled directly in the database.
	secret, err := auth.GenerateTOTPSecret()
	require.NoError(t, err)
	_, err = ts.db.Pool().Exec(context.Background(),
		`UPDATE users SET totp_secret = $1, totp_enabled = TRUE WHERE email = $2`, secret, email)
	require.NoError(t, err)

	// The legacy secret still verifies…
	tempToken := loginFor2FA(ts, t, email, password)
	resp := ts.POST("/api/auth/2fa/verify", map[string]string{
		"temp_token": tempToken,
		"code":       auth.TOTPCodeAt(secret, time.Now()),
	}, "")
	requireStatus(t, resp, http.StatusOK)

	// …and the successful login re-sealed it in place.
	stored := dbTOTPSecret(ts, t, email)
	assert.True(t, strings.HasPrefix(stored, "enc:v1:"),
		"legacy plaintext row must be re-sealed after a successful verify, got %q", stored)
	assert.NotContains(t, stored, secret)
}

// backupCodesRemaining counts a user's unused recovery codes directly.
func backupCodesRemaining(ts *testServer, t *testing.T, email string) int {
	t.Helper()
	var n int
	err := ts.db.Pool().QueryRow(context.Background(),
		`SELECT count(*) FROM totp_backup_codes b JOIN users u ON u.id = b.user_id
		 WHERE u.email = $1 AND b.used_at IS NULL`, email).Scan(&n)
	require.NoError(t, err)
	return n
}

func TestTwoFABackupCodeLogin(t *testing.T) {
	ts := setupTestServer(t)
	const email = "twofa-backup@example.com"
	const password = "SecurePass@123!"

	setup2FA(ts, t, email, password)
	codes := append([]string(nil), lastBackupCodes...)
	require.Len(t, codes, 10)
	require.Equal(t, 10, backupCodesRemaining(ts, t, email), "all codes unused after enable")

	// Log in once and reuse the temp token across attempts — the per-email login
	// limiter (3/15min) would otherwise trip before we exercise every case, and
	// temp tokens are not single-use (they're a short-lived JWT).
	tempToken := loginFor2FA(ts, t, email, password)

	// Redeem a backup code (as if the authenticator were lost).
	resp := ts.POST("/api/auth/2fa/verify", map[string]string{
		"temp_token": tempToken,
		"code":       codes[0],
	}, "")
	body := requireStatus(t, resp, http.StatusOK)
	var tokens struct {
		AccessToken string `json:"access_token"`
	}
	require.NoError(t, jsonUnmarshal(body, &tokens))
	assert.NotEmpty(t, tokens.AccessToken, "a valid backup code logs the user in")
	assert.Equal(t, 9, backupCodesRemaining(ts, t, email), "the redeemed code is consumed")

	t.Run("a consumed backup code cannot be reused", func(t *testing.T) {
		resp := ts.POST("/api/auth/2fa/verify", map[string]string{
			"temp_token": tempToken,
			"code":       codes[0], // already redeemed
		}, "")
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
		resp.Body.Close()
		assert.Equal(t, 9, backupCodesRemaining(ts, t, email), "a rejected reuse consumes nothing")
	})

	t.Run("a different unused backup code still works", func(t *testing.T) {
		resp := ts.POST("/api/auth/2fa/verify", map[string]string{
			"temp_token": tempToken,
			"code":       codes[1],
		}, "")
		requireStatus(t, resp, http.StatusOK)
		assert.Equal(t, 8, backupCodesRemaining(ts, t, email))
	})
}

func TestTwoFARegenerateBackupCodes(t *testing.T) {
	ts := setupTestServer(t)
	const email = "twofa-regen@example.com"
	const password = "SecurePass@123!"

	token, secret := setup2FA(ts, t, email, password)
	oldCodes := append([]string(nil), lastBackupCodes...)

	// Regenerate with a fresh TOTP code (enable consumed the current window).
	resp := ts.POST("/api/auth/2fa/backup-codes", map[string]string{
		"code": auth.TOTPCodeAt(secret, time.Now().Add(30*time.Second)),
	}, token)
	body := requireStatus(t, resp, http.StatusOK)
	var regen struct {
		BackupCodes []string `json:"backup_codes"`
	}
	require.NoError(t, jsonUnmarshal(body, &regen))
	require.Len(t, regen.BackupCodes, 10, "regenerate returns a fresh set")
	assert.NotEqual(t, oldCodes, regen.BackupCodes, "the set is actually new")
	assert.Equal(t, 10, backupCodesRemaining(ts, t, email), "old set replaced, not appended")

	// An OLD code no longer works; a NEW one does.
	tt := loginFor2FA(ts, t, email, password)
	resp = ts.POST("/api/auth/2fa/verify", map[string]string{
		"temp_token": tt, "code": oldCodes[0],
	}, "")
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "old code invalidated by regenerate")
	resp.Body.Close()

	tt = loginFor2FA(ts, t, email, password)
	resp = ts.POST("/api/auth/2fa/verify", map[string]string{
		"temp_token": tt, "code": regen.BackupCodes[0],
	}, "")
	requireStatus(t, resp, http.StatusOK)
}

func TestTwoFADisableClearsBackupCodes(t *testing.T) {
	ts := setupTestServer(t)
	const email = "twofa-disable-codes@example.com"
	const password = "SecurePass@123!"

	token, secret := setup2FA(ts, t, email, password)
	codes := append([]string(nil), lastBackupCodes...)
	require.Equal(t, 10, backupCodesRemaining(ts, t, email))

	// Disable with a fresh TOTP code.
	resp := ts.POST("/api/auth/2fa/disable", map[string]string{
		"password": password,
		"code":     auth.TOTPCodeAt(secret, time.Now().Add(30*time.Second)),
	}, token)
	requireStatus(t, resp, http.StatusOK)
	assert.Equal(t, 0, backupCodesRemaining(ts, t, email), "disable drops all recovery codes")

	// Re-enable, then confirm an OLD (pre-disable) code does not work against the
	// new set — disable truly invalidated them.
	setup2FA(ts, t, email, password)
	tt := loginFor2FA(ts, t, email, password)
	resp = ts.POST("/api/auth/2fa/verify", map[string]string{
		"temp_token": tt, "code": codes[0],
	}, "")
	assert.Equal(t, http.StatusUnauthorized, resp.StatusCode, "codes from before disable are dead")
	resp.Body.Close()
}
