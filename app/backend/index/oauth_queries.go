package index

import (
	"context"
	"fmt"

	"github.com/zpush/zpush/types"
)

// GetOAuthProvider looks up an OAuth provider link by provider+providerID.
func (db *DB) GetOAuthProvider(ctx context.Context, provider, providerID string) (*types.OAuthProvider, error) {
	row := db.pool.QueryRow(ctx,
		`SELECT id, user_id, provider, provider_id, provider_email, created_at
		 FROM oauth_providers WHERE provider = $1 AND provider_id = $2`,
		provider, providerID,
	)
	op := &types.OAuthProvider{}
	err := row.Scan(&op.ID, &op.UserID, &op.Provider, &op.ProviderID, &op.ProviderEmail, &op.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get oauth provider: %w", err)
	}
	return op, nil
}

// CreateOAuthProvider inserts a new OAuth provider link.
func (db *DB) CreateOAuthProvider(ctx context.Context, op *types.OAuthProvider) error {
	_, err := db.pool.Exec(ctx,
		`INSERT INTO oauth_providers (id, user_id, provider, provider_id, provider_email)
		 VALUES ($1, $2, $3, $4, $5)`,
		op.ID, op.UserID, op.Provider, op.ProviderID, op.ProviderEmail,
	)
	if err != nil {
		return fmt.Errorf("create oauth provider: %w", err)
	}
	return nil
}

// GetOAuthProvidersByUser returns all OAuth providers linked to a user.
func (db *DB) GetOAuthProvidersByUser(ctx context.Context, userID string) ([]types.OAuthProvider, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT id, user_id, provider, provider_id, provider_email, created_at
		 FROM oauth_providers WHERE user_id = $1 ORDER BY created_at`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("list oauth providers: %w", err)
	}
	defer rows.Close()

	var providers []types.OAuthProvider
	for rows.Next() {
		var op types.OAuthProvider
		if err := rows.Scan(&op.ID, &op.UserID, &op.Provider, &op.ProviderID, &op.ProviderEmail, &op.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan oauth provider: %w", err)
		}
		providers = append(providers, op)
	}
	return providers, rows.Err()
}

// DeleteOAuthProvider removes an OAuth provider link for a user.
func (db *DB) DeleteOAuthProvider(ctx context.Context, userID, provider string) error {
	_, err := db.pool.Exec(ctx,
		`DELETE FROM oauth_providers WHERE user_id = $1 AND provider = $2`,
		userID, provider,
	)
	return err
}

// CountUserAuthMethods returns the number of auth methods a user has
// (password + OAuth providers), used to prevent unlinking the last method.
func (db *DB) CountUserAuthMethods(ctx context.Context, userID string) (int, error) {
	var count int
	// Count OAuth providers
	err := db.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM oauth_providers WHERE user_id = $1`, userID,
	).Scan(&count)
	if err != nil {
		return 0, err
	}

	// Check if user has a password set
	var passwordHash string
	err = db.pool.QueryRow(ctx,
		`SELECT password_hash FROM users WHERE id = $1`, userID,
	).Scan(&passwordHash)
	if err != nil {
		return count, nil
	}
	if passwordHash != "" {
		count++
	}

	return count, nil
}
