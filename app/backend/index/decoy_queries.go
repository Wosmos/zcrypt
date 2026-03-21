package index

import (
	"context"

	"github.com/zcrypt/zcrypt/types"
)

// UpsertDecoyVault creates or updates a user's decoy vault configuration.
func (db *DB) UpsertDecoyVault(ctx context.Context, dv *types.DecoyVault) error {
	_, err := db.pool.Exec(ctx,
		`INSERT INTO decoy_vaults (id, user_id, decoy_password_hash, enabled, created_at)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (user_id) DO UPDATE SET decoy_password_hash = $3, enabled = $4`,
		dv.ID, dv.UserID, dv.DecoyPasswordHash, dv.Enabled, dv.CreatedAt)
	return err
}

// GetDecoyVault fetches a user's decoy vault config.
func (db *DB) GetDecoyVault(ctx context.Context, userID string) (*types.DecoyVault, error) {
	var dv types.DecoyVault
	err := db.pool.QueryRow(ctx,
		`SELECT id, user_id, decoy_password_hash, enabled, created_at
		 FROM decoy_vaults WHERE user_id = $1`, userID).
		Scan(&dv.ID, &dv.UserID, &dv.DecoyPasswordHash, &dv.Enabled, &dv.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &dv, nil
}

// DeleteDecoyVault removes a user's decoy vault config and files.
func (db *DB) DeleteDecoyVault(ctx context.Context, userID string) error {
	_, err := db.pool.Exec(ctx,
		`DELETE FROM decoy_vaults WHERE user_id = $1`, userID)
	if err != nil {
		return err
	}
	_, err = db.pool.Exec(ctx,
		`DELETE FROM decoy_files WHERE user_id = $1`, userID)
	return err
}

// InsertDecoyFile adds a fake file to the decoy vault.
func (db *DB) InsertDecoyFile(ctx context.Context, f *types.DecoyFile) error {
	_, err := db.pool.Exec(ctx,
		`INSERT INTO decoy_files (id, user_id, name, size, created_at)
		 VALUES ($1, $2, $3, $4, $5)`,
		f.ID, f.UserID, f.Name, f.Size, f.CreatedAt)
	return err
}

// ListDecoyFiles returns all decoy files for a user.
func (db *DB) ListDecoyFiles(ctx context.Context, userID string) ([]types.DecoyFile, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT id, user_id, name, size, created_at
		 FROM decoy_files WHERE user_id = $1 ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var files []types.DecoyFile
	for rows.Next() {
		var f types.DecoyFile
		if err := rows.Scan(&f.ID, &f.UserID, &f.Name, &f.Size, &f.CreatedAt); err != nil {
			return nil, err
		}
		files = append(files, f)
	}
	return files, nil
}

// DeleteDecoyFile removes a specific decoy file.
func (db *DB) DeleteDecoyFile(ctx context.Context, id, userID string) error {
	_, err := db.pool.Exec(ctx,
		`DELETE FROM decoy_files WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}
