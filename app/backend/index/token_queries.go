package index

import (
	"context"
	"fmt"

	"github.com/zpush/zpush/types"
)

// InsertPlatformToken stores an encrypted platform token.
func (db *DB) InsertPlatformToken(ctx context.Context, userID, platform, username string, encrypted, nonce []byte, isGlobal bool) error {
	_, err := db.pool.Exec(ctx,
		`INSERT INTO platform_tokens (user_id, platform, username, token_encrypted, token_nonce, is_global)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 ON CONFLICT (user_id, platform, username) DO UPDATE
		 SET token_encrypted = $4, token_nonce = $5, is_global = $6`,
		userID, platform, username, encrypted, nonce, isGlobal,
	)
	if err != nil {
		return fmt.Errorf("insert platform token: %w", err)
	}
	return nil
}

// GetPlatformTokens returns a user's own tokens plus all global tokens.
func (db *DB) GetPlatformTokens(ctx context.Context, userID string) ([]types.PlatformTokenRow, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT id, user_id, platform, username, token_encrypted, token_nonce, is_global, created_at
		 FROM platform_tokens WHERE user_id = $1 OR is_global = TRUE
		 ORDER BY platform, username`, userID,
	)
	if err != nil {
		return nil, fmt.Errorf("get platform tokens: %w", err)
	}
	defer rows.Close()

	var tokens []types.PlatformTokenRow
	for rows.Next() {
		var t types.PlatformTokenRow
		if err := rows.Scan(&t.ID, &t.UserID, &t.Platform, &t.Username,
			&t.TokenEncrypted, &t.TokenNonce, &t.IsGlobal, &t.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan platform token: %w", err)
		}
		tokens = append(tokens, t)
	}
	return tokens, nil
}

// GetPlatformTokensByPlatform returns tokens for a specific platform (user's own + global).
func (db *DB) GetPlatformTokensByPlatform(ctx context.Context, userID, platform string) ([]types.PlatformTokenRow, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT id, user_id, platform, username, token_encrypted, token_nonce, is_global, created_at
		 FROM platform_tokens WHERE (user_id = $1 OR is_global = TRUE) AND platform = $2
		 ORDER BY username`, userID, platform,
	)
	if err != nil {
		return nil, fmt.Errorf("get platform tokens by platform: %w", err)
	}
	defer rows.Close()

	var tokens []types.PlatformTokenRow
	for rows.Next() {
		var t types.PlatformTokenRow
		if err := rows.Scan(&t.ID, &t.UserID, &t.Platform, &t.Username,
			&t.TokenEncrypted, &t.TokenNonce, &t.IsGlobal, &t.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan platform token: %w", err)
		}
		tokens = append(tokens, t)
	}
	return tokens, nil
}

// DeletePlatformToken deletes a platform token by ID.
func (db *DB) DeletePlatformToken(ctx context.Context, tokenID string) error {
	_, err := db.pool.Exec(ctx, `DELETE FROM platform_tokens WHERE id = $1`, tokenID)
	return err
}

// DeletePlatformTokenByUser deletes a specific platform token for a user.
func (db *DB) DeletePlatformTokenByUser(ctx context.Context, userID, platform, username string) error {
	_, err := db.pool.Exec(ctx,
		`DELETE FROM platform_tokens WHERE user_id = $1 AND platform = $2 AND username = $3`,
		userID, platform, username,
	)
	return err
}

// ListAllPlatformTokens returns metadata for all tokens (admin only, no encrypted data).
func (db *DB) ListAllPlatformTokens(ctx context.Context) ([]types.PlatformTokenInfo, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT id, user_id, platform, username, is_global, created_at
		 FROM platform_tokens ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("list all platform tokens: %w", err)
	}
	defer rows.Close()

	var tokens []types.PlatformTokenInfo
	for rows.Next() {
		var t types.PlatformTokenInfo
		if err := rows.Scan(&t.ID, &t.UserID, &t.Platform, &t.Username, &t.IsGlobal, &t.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan platform token info: %w", err)
		}
		tokens = append(tokens, t)
	}
	return tokens, nil
}

// GetUserPlatformTokenInfo returns token metadata for a user (no encrypted data).
func (db *DB) GetUserPlatformTokenInfo(ctx context.Context, userID string) ([]types.PlatformTokenInfo, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT id, user_id, platform, username, is_global, created_at
		 FROM platform_tokens WHERE user_id = $1 OR is_global = TRUE
		 ORDER BY platform, username`, userID,
	)
	if err != nil {
		return nil, fmt.Errorf("get user platform token info: %w", err)
	}
	defer rows.Close()

	var tokens []types.PlatformTokenInfo
	for rows.Next() {
		var t types.PlatformTokenInfo
		if err := rows.Scan(&t.ID, &t.UserID, &t.Platform, &t.Username, &t.IsGlobal, &t.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan platform token info: %w", err)
		}
		tokens = append(tokens, t)
	}
	return tokens, nil
}
