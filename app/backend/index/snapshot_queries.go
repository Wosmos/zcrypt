package index

import (
	"context"

	"github.com/zcrypt/zcrypt/types"
)

// CreateVaultSnapshot captures current vault state as a snapshot.
func (db *DB) CreateVaultSnapshot(ctx context.Context, userID, label string) (*types.VaultSnapshot, error) {
	snap := &types.VaultSnapshot{}
	err := db.pool.QueryRow(ctx, `
		WITH current_files AS (
			SELECT id, original_size FROM files WHERE user_id = $1 AND status = 'complete'
		)
		INSERT INTO vault_snapshots (user_id, label, file_count, total_size, file_ids)
		VALUES (
			$1, $2,
			(SELECT COUNT(*) FROM current_files),
			(SELECT COALESCE(SUM(original_size), 0) FROM current_files),
			(SELECT COALESCE(array_agg(id::text), '{}') FROM current_files)
		)
		RETURNING id, user_id, label, file_count, total_size, file_ids, created_at`,
		userID, label,
	).Scan(&snap.ID, &snap.UserID, &snap.Label, &snap.FileCount, &snap.TotalSize, &snap.FileIDs, &snap.CreatedAt)
	return snap, err
}

// ListVaultSnapshots returns all snapshots for a user.
func (db *DB) ListVaultSnapshots(ctx context.Context, userID string) ([]types.VaultSnapshot, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT id, user_id, label, file_count, total_size, file_ids, created_at
		FROM vault_snapshots WHERE user_id = $1
		ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var snaps []types.VaultSnapshot
	for rows.Next() {
		var s types.VaultSnapshot
		if err := rows.Scan(&s.ID, &s.UserID, &s.Label, &s.FileCount, &s.TotalSize, &s.FileIDs, &s.CreatedAt); err != nil {
			return nil, err
		}
		snaps = append(snaps, s)
	}
	return snaps, nil
}

// GetVaultSnapshot returns a specific snapshot.
func (db *DB) GetVaultSnapshot(ctx context.Context, userID, snapshotID string) (*types.VaultSnapshot, error) {
	snap := &types.VaultSnapshot{}
	err := db.pool.QueryRow(ctx, `
		SELECT id, user_id, label, file_count, total_size, file_ids, created_at
		FROM vault_snapshots WHERE id = $1 AND user_id = $2`, snapshotID, userID,
	).Scan(&snap.ID, &snap.UserID, &snap.Label, &snap.FileCount, &snap.TotalSize, &snap.FileIDs, &snap.CreatedAt)
	return snap, err
}

// DeleteVaultSnapshot deletes a snapshot.
func (db *DB) DeleteVaultSnapshot(ctx context.Context, userID, snapshotID string) error {
	_, err := db.pool.Exec(ctx, `DELETE FROM vault_snapshots WHERE id = $1 AND user_id = $2`, snapshotID, userID)
	return err
}
