package index

import (
	"context"

	"github.com/zcrypt/zcrypt/types"
)

// CreateExpiringVault inserts a new expiring vault.
func (db *DB) CreateExpiringVault(ctx context.Context, v *types.ExpiringVault) error {
	_, err := db.pool.Exec(ctx,
		`INSERT INTO expiring_vaults (id, user_id, name, description, expires_at, file_ids, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		v.ID, v.UserID, v.Name, v.Description, v.ExpiresAt, v.FileIDs, v.CreatedAt)
	return err
}

// ListExpiringVaults returns all expiring vaults for a user.
func (db *DB) ListExpiringVaults(ctx context.Context, userID string) ([]types.ExpiringVault, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT id, user_id, name, description, expires_at, expired, file_ids, created_at
		 FROM expiring_vaults
		 WHERE user_id = $1
		 ORDER BY expires_at ASC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var vaults []types.ExpiringVault
	for rows.Next() {
		var v types.ExpiringVault
		if err := rows.Scan(&v.ID, &v.UserID, &v.Name, &v.Description, &v.ExpiresAt, &v.Expired, &v.FileIDs, &v.CreatedAt); err != nil {
			return nil, err
		}
		vaults = append(vaults, v)
	}
	return vaults, nil
}

// GetExpiringVault fetches a specific expiring vault.
func (db *DB) GetExpiringVault(ctx context.Context, id, userID string) (*types.ExpiringVault, error) {
	var v types.ExpiringVault
	err := db.pool.QueryRow(ctx,
		`SELECT id, user_id, name, description, expires_at, expired, file_ids, created_at
		 FROM expiring_vaults WHERE id = $1 AND user_id = $2`, id, userID).
		Scan(&v.ID, &v.UserID, &v.Name, &v.Description, &v.ExpiresAt, &v.Expired, &v.FileIDs, &v.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &v, nil
}

// DeleteExpiringVault removes an expiring vault.
func (db *DB) DeleteExpiringVault(ctx context.Context, id, userID string) error {
	_, err := db.pool.Exec(ctx,
		`DELETE FROM expiring_vaults WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}

// ExpireVaults marks vaults as expired and returns the count.
func (db *DB) ExpireVaults(ctx context.Context) (int, error) {
	tag, err := db.pool.Exec(ctx,
		`UPDATE expiring_vaults SET expired = TRUE WHERE expired = FALSE AND expires_at < NOW()`)
	if err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}

// GetExpiredVaultFileIDs returns file IDs from newly expired vaults for deletion.
func (db *DB) GetExpiredVaultFileIDs(ctx context.Context) ([]string, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT unnest(file_ids) FROM expiring_vaults WHERE expired = TRUE`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, nil
}
