package main

import (
	"context"
	"os"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/zcrypt/zcrypt/crypto"
)

// TestMasterKeyRotationEndToEnd exercises the real rotation path against a
// real Postgres: seed rows encrypted under an "old" master key, run the exact
// resealPlatformTokens/resealTOTPSecrets logic reseal -apply uses, then
// confirm every row now decrypts under the "new" key and no longer under the
// old one. Requires RESEAL_TEST_DATABASE_URL (a throwaway/ephemeral Postgres
// — never point this at a real database).
func TestMasterKeyRotationEndToEnd(t *testing.T) {
	dbURL := os.Getenv("RESEAL_TEST_DATABASE_URL")
	if dbURL == "" {
		t.Skip("RESEAL_TEST_DATABASE_URL not set, skipping (needs a real ephemeral Postgres)")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	mustExec(t, ctx, pool, `DROP TABLE IF EXISTS platform_tokens, users`)
	mustExec(t, ctx, pool, `CREATE TABLE users (id UUID PRIMARY KEY, totp_secret TEXT NOT NULL DEFAULT '')`)
	mustExec(t, ctx, pool, `CREATE TABLE platform_tokens (
		id UUID PRIMARY KEY, user_id UUID NOT NULL,
		token_encrypted BYTEA NOT NULL, token_nonce BYTEA NOT NULL)`)

	oldKey := fixedKey(0x01)
	newKey := fixedKey(0x02)

	userID := uuid.New().String()
	mustExec(t, ctx, pool, `INSERT INTO users (id) VALUES ($1)`, userID)

	// Seed a sealed TOTP secret under the OLD key.
	oldKEK, err := crypto.DeriveUserKEK(oldKey, userID)
	if err != nil {
		t.Fatalf("derive old KEK: %v", err)
	}
	sealedTOTP, err := crypto.SealSecret(oldKEK, "JBSWY3DPEHPK3PXP")
	if err != nil {
		t.Fatalf("seal totp: %v", err)
	}
	mustExec(t, ctx, pool, `UPDATE users SET totp_secret = $1 WHERE id = $2`, sealedTOTP, userID)

	// Seed a platform token under the OLD key.
	tokenID := uuid.New().String()
	ct, nonce, err := crypto.EncryptToken(oldKEK, "fake-platform-token-for-tests")
	if err != nil {
		t.Fatalf("encrypt token: %v", err)
	}
	mustExec(t, ctx, pool,
		`INSERT INTO platform_tokens (id, user_id, token_encrypted, token_nonce) VALUES ($1, $2, $3, $4)`,
		tokenID, userID, ct, nonce)

	// Run the exact migration logic reseal -apply uses.
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin tx: %v", err)
	}
	tokenCounts, err := resealPlatformTokens(ctx, tx, oldKey, newKey)
	if err != nil {
		t.Fatalf("resealPlatformTokens: %v", err)
	}
	totpCounts, err := resealTOTPSecrets(ctx, tx, oldKey, newKey)
	if err != nil {
		t.Fatalf("resealTOTPSecrets: %v", err)
	}
	if err := tx.Commit(ctx); err != nil {
		t.Fatalf("commit: %v", err)
	}

	if tokenCounts.migrated != 1 || tokenCounts.skipped != 0 {
		t.Errorf("platform_tokens: migrated=%d skipped=%d, want 1/0", tokenCounts.migrated, tokenCounts.skipped)
	}
	if totpCounts.migrated != 1 || totpCounts.skipped != 0 {
		t.Errorf("totp_secret: migrated=%d skipped=%d, want 1/0", totpCounts.migrated, totpCounts.skipped)
	}

	newKEK, err := crypto.DeriveUserKEK(newKey, userID)
	if err != nil {
		t.Fatalf("derive new KEK: %v", err)
	}

	// Platform token now decrypts under NEW, no longer under OLD.
	var gotCT, gotNonce []byte
	if err := pool.QueryRow(ctx, `SELECT token_encrypted, token_nonce FROM platform_tokens WHERE id = $1`, tokenID).
		Scan(&gotCT, &gotNonce); err != nil {
		t.Fatalf("query re-sealed token: %v", err)
	}
	pt, err := crypto.DecryptToken(newKEK, gotCT, gotNonce)
	if err != nil {
		t.Fatalf("decrypt re-sealed token under new key: %v", err)
	}
	if pt != "fake-platform-token-for-tests" {
		t.Errorf("re-sealed token plaintext = %q, want the original", pt)
	}
	if _, err := crypto.DecryptToken(oldKEK, gotCT, gotNonce); err == nil {
		t.Error("re-sealed token should no longer decrypt under the OLD key")
	}

	// TOTP secret now decrypts under NEW, no longer under OLD.
	var gotSealed string
	if err := pool.QueryRow(ctx, `SELECT totp_secret FROM users WHERE id = $1`, userID).Scan(&gotSealed); err != nil {
		t.Fatalf("query re-sealed totp: %v", err)
	}
	totpPt, err := crypto.OpenSecret(newKEK, gotSealed)
	if err != nil {
		t.Fatalf("open re-sealed totp under new key: %v", err)
	}
	if totpPt != "JBSWY3DPEHPK3PXP" {
		t.Errorf("re-sealed totp plaintext = %q, want the original", totpPt)
	}
	if _, err := crypto.OpenSecret(oldKEK, gotSealed); err == nil {
		t.Error("re-sealed totp should no longer decrypt under the OLD key")
	}

	// Re-running against already-migrated rows must be idempotent: skip, not
	// double-encrypt or error (the tool's own documented safety guarantee).
	tx2, err := pool.Begin(ctx)
	if err != nil {
		t.Fatalf("begin tx2: %v", err)
	}
	tokenCounts2, err := resealPlatformTokens(ctx, tx2, oldKey, newKey)
	if err != nil {
		t.Fatalf("re-run resealPlatformTokens: %v", err)
	}
	totpCounts2, err := resealTOTPSecrets(ctx, tx2, oldKey, newKey)
	if err != nil {
		t.Fatalf("re-run resealTOTPSecrets: %v", err)
	}
	tx2.Rollback(ctx) //nolint:errcheck
	if tokenCounts2.migrated != 0 || tokenCounts2.skipped != 1 {
		t.Errorf("re-run platform_tokens: migrated=%d skipped=%d, want 0/1 (idempotent)", tokenCounts2.migrated, tokenCounts2.skipped)
	}
	if totpCounts2.migrated != 0 || totpCounts2.skipped != 1 {
		t.Errorf("re-run totp_secret: migrated=%d skipped=%d, want 0/1 (idempotent)", totpCounts2.migrated, totpCounts2.skipped)
	}
}

func TestMaintenanceToggleWithoutConfigReturnsFalse(t *testing.T) {
	t.Setenv("BACKEND_URL", "")
	t.Setenv("MAINTENANCE_SECRET", "")
	if maintenanceToggle(true) {
		t.Error("expected false when BACKEND_URL/MAINTENANCE_SECRET are unset")
	}
}

func fixedKey(b byte) []byte {
	k := make([]byte, 32)
	for i := range k {
		k[i] = b
	}
	return k
}

func mustExec(t *testing.T, ctx context.Context, pool *pgxpool.Pool, sql string, args ...interface{}) {
	t.Helper()
	if _, err := pool.Exec(ctx, sql, args...); err != nil {
		t.Fatalf("exec %q: %v", sql, err)
	}
}
