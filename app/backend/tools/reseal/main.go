// Command reseal rotates the MASTER_KEY by re-encrypting every at-rest secret
// that is wrapped by a MASTER_KEY-derived KEK.
//
// It covers the two sealed surfaces in the schema:
//   - platform_tokens.token_encrypted / token_nonce   (raw AES-GCM byte columns)
//   - users.totp_secret                                ("enc:v1:" sealed string)
//
// Both are keyed by DeriveUserKEK(masterKey, <row's user id>), so each row is
// decrypted under the OLD key and re-encrypted under the NEW key using that
// same user id — this correctly handles per-user AND is_global platform tokens.
//
// Usage:
//
//	export DATABASE_URL='postgres://...'          # the DB to migrate
//	export MASTER_KEY_OLD='<current/leaked key>'  # 64 hex chars
//	export MASTER_KEY_NEW='<freshly generated>'   # 64 hex chars (openssl rand -hex 32)
//	go run ./tools/reseal            # DRY RUN: reports what would change, writes nothing
//	go run ./tools/reseal -apply     # performs the migration inside one transaction
//
// The tool is safe to re-run: a row already re-sealed under NEW (e.g. after a
// partial/interrupted apply) is detected and skipped rather than double-encrypted.
// After -apply succeeds, set MASTER_KEY=<new> in the backend environment and redeploy.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/zcrypt/zcrypt/crypto"
)

func main() {
	apply := flag.Bool("apply", false, "write changes (default is a dry run that writes nothing)")
	flag.Parse()

	if err := run(context.Background(), *apply); err != nil {
		fmt.Fprintf(os.Stderr, "reseal: %v\n", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, apply bool) error {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return errors.New("DATABASE_URL is required")
	}
	oldKey, err := crypto.ParseMasterKey(os.Getenv("MASTER_KEY_OLD"))
	if err != nil {
		return fmt.Errorf("MASTER_KEY_OLD: %w", err)
	}
	newKey, err := crypto.ParseMasterKey(os.Getenv("MASTER_KEY_NEW"))
	if err != nil {
		return fmt.Errorf("MASTER_KEY_NEW: %w", err)
	}
	if string(oldKey) == string(newKey) {
		return errors.New("MASTER_KEY_OLD and MASTER_KEY_NEW are identical — nothing to rotate")
	}

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	defer pool.Close()

	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // rollback is a no-op after a successful commit

	tokens, err := resealPlatformTokens(ctx, tx, oldKey, newKey)
	if err != nil {
		return fmt.Errorf("platform_tokens: %w", err)
	}
	totp, err := resealTOTPSecrets(ctx, tx, oldKey, newKey)
	if err != nil {
		return fmt.Errorf("users.totp_secret: %w", err)
	}

	mode := "DRY RUN (no changes written)"
	if apply {
		if err := tx.Commit(ctx); err != nil {
			return fmt.Errorf("commit: %w", err)
		}
		mode = "APPLIED"
	}

	fmt.Printf("\n%s\n", mode)
	fmt.Printf("  platform_tokens : %d re-sealed, %d already-new (skipped)\n", tokens.migrated, tokens.skipped)
	fmt.Printf("  totp_secret     : %d re-sealed, %d already-new (skipped)\n", totp.migrated, totp.skipped)
	if !apply {
		fmt.Printf("\nRe-run with -apply to write these changes, then set MASTER_KEY=<new> and redeploy.\n")
	}
	return nil
}

type counts struct{ migrated, skipped int }

// openUnderEitherKey decrypts a value under oldKey; if that fails it tries
// newKey to detect a row already migrated by a prior (interrupted) run. It
// returns (plaintext, alreadyNew, error).
func openUnderEitherKey(oldKek, newKek, ciphertext, nonce []byte) (string, bool, error) {
	if pt, err := crypto.DecryptToken(oldKek, ciphertext, nonce); err == nil {
		return pt, false, nil
	}
	if pt, err := crypto.DecryptToken(newKek, ciphertext, nonce); err == nil {
		return pt, true, nil
	}
	return "", false, errors.New("value does not decrypt under either the old or the new master key")
}

func resealPlatformTokens(ctx context.Context, tx pgx.Tx, oldKey, newKey []byte) (counts, error) {
	var c counts
	rows, err := tx.Query(ctx,
		`SELECT id::text, user_id::text, token_encrypted, token_nonce FROM platform_tokens`)
	if err != nil {
		return c, err
	}
	type row struct {
		id, userID string
		ct, nonce  []byte
	}
	var batch []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.id, &r.userID, &r.ct, &r.nonce); err != nil {
			rows.Close()
			return c, err
		}
		batch = append(batch, r)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return c, err
	}

	for _, r := range batch {
		oldKek, err := crypto.DeriveUserKEK(oldKey, r.userID)
		if err != nil {
			return c, fmt.Errorf("row %s: derive old KEK: %w", r.id, err)
		}
		newKek, err := crypto.DeriveUserKEK(newKey, r.userID)
		if err != nil {
			return c, fmt.Errorf("row %s: derive new KEK: %w", r.id, err)
		}
		plaintext, alreadyNew, err := openUnderEitherKey(oldKek, newKek, r.ct, r.nonce)
		if err != nil {
			return c, fmt.Errorf("row %s: %w", r.id, err)
		}
		if alreadyNew {
			c.skipped++
			continue
		}
		newCT, newNonce, err := crypto.EncryptToken(newKek, plaintext)
		if err != nil {
			return c, fmt.Errorf("row %s: re-encrypt: %w", r.id, err)
		}
		if _, err := crypto.DecryptToken(newKek, newCT, newNonce); err != nil {
			return c, fmt.Errorf("row %s: verify re-encrypt: %w", r.id, err)
		}
		if _, err := tx.Exec(ctx,
			`UPDATE platform_tokens SET token_encrypted = $1, token_nonce = $2 WHERE id = $3`,
			newCT, newNonce, r.id); err != nil {
			return c, fmt.Errorf("row %s: update: %w", r.id, err)
		}
		c.migrated++
	}
	return c, nil
}

func resealTOTPSecrets(ctx context.Context, tx pgx.Tx, oldKey, newKey []byte) (counts, error) {
	var c counts
	rows, err := tx.Query(ctx,
		`SELECT id::text, totp_secret FROM users WHERE totp_secret LIKE 'enc:v1:%'`)
	if err != nil {
		return c, err
	}
	type row struct{ id, sealed string }
	var batch []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.id, &r.sealed); err != nil {
			rows.Close()
			return c, err
		}
		batch = append(batch, r)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return c, err
	}

	for _, r := range batch {
		oldKek, err := crypto.DeriveUserKEK(oldKey, r.id)
		if err != nil {
			return c, fmt.Errorf("user %s: derive old KEK: %w", r.id, err)
		}
		newKek, err := crypto.DeriveUserKEK(newKey, r.id)
		if err != nil {
			return c, fmt.Errorf("user %s: derive new KEK: %w", r.id, err)
		}
		plaintext, err := crypto.OpenSecret(oldKek, r.sealed)
		if err != nil {
			// Already re-sealed under the new key by a prior run?
			if pt, newErr := crypto.OpenSecret(newKek, r.sealed); newErr == nil {
				_ = pt
				c.skipped++
				continue
			}
			return c, fmt.Errorf("user %s: open totp under old key: %w", r.id, err)
		}
		resealed, err := crypto.SealSecret(newKek, plaintext)
		if err != nil {
			return c, fmt.Errorf("user %s: re-seal: %w", r.id, err)
		}
		if _, err := crypto.OpenSecret(newKek, resealed); err != nil {
			return c, fmt.Errorf("user %s: verify re-seal: %w", r.id, err)
		}
		if _, err := tx.Exec(ctx,
			`UPDATE users SET totp_secret = $1 WHERE id = $2`, resealed, r.id); err != nil {
			return c, fmt.Errorf("user %s: update: %w", r.id, err)
		}
		c.migrated++
	}
	return c, nil
}
