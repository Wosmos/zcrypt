package index

import (
	"context"
	"time"

	"github.com/zcrypt/zcrypt/types"
)

// CreateSyncFolder registers a new folder for selective sync.
func (db *DB) CreateSyncFolder(ctx context.Context, f *types.SyncFolder) error {
	_, err := db.pool.Exec(ctx,
		`INSERT INTO sync_folders (id, user_id, folder_path, label, device_name, enabled, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
		f.ID, f.UserID, f.FolderPath, f.Label, f.DeviceName, f.Enabled, f.CreatedAt)
	return err
}

// ListSyncFolders returns all sync folder configs for a user.
func (db *DB) ListSyncFolders(ctx context.Context, userID string) ([]types.SyncFolder, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT id, user_id, folder_path, label, device_name, enabled, last_synced, file_count, total_size, created_at, updated_at
		 FROM sync_folders
		 WHERE user_id = $1
		 ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var folders []types.SyncFolder
	for rows.Next() {
		var f types.SyncFolder
		if err := rows.Scan(&f.ID, &f.UserID, &f.FolderPath, &f.Label, &f.DeviceName, &f.Enabled, &f.LastSynced, &f.FileCount, &f.TotalSize, &f.CreatedAt, &f.UpdatedAt); err != nil {
			return nil, err
		}
		folders = append(folders, f)
	}
	return folders, nil
}

// GetSyncFolder fetches a specific sync folder by ID.
func (db *DB) GetSyncFolder(ctx context.Context, id, userID string) (*types.SyncFolder, error) {
	var f types.SyncFolder
	err := db.pool.QueryRow(ctx,
		`SELECT id, user_id, folder_path, label, device_name, enabled, last_synced, file_count, total_size, created_at, updated_at
		 FROM sync_folders
		 WHERE id = $1 AND user_id = $2`, id, userID).
		Scan(&f.ID, &f.UserID, &f.FolderPath, &f.Label, &f.DeviceName, &f.Enabled, &f.LastSynced, &f.FileCount, &f.TotalSize, &f.CreatedAt, &f.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &f, nil
}

// UpdateSyncFolder updates a sync folder's settings.
func (db *DB) UpdateSyncFolder(ctx context.Context, id, userID string, enabled bool, label string) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE sync_folders SET enabled = $3, label = $4, updated_at = $5
		 WHERE id = $1 AND user_id = $2`,
		id, userID, enabled, label, time.Now())
	return err
}

// UpdateSyncFolderStats updates the file count and total size after a sync.
func (db *DB) UpdateSyncFolderStats(ctx context.Context, id, userID string, fileCount int, totalSize int64) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE sync_folders SET file_count = $3, total_size = $4, last_synced = $5, updated_at = $5
		 WHERE id = $1 AND user_id = $2`,
		id, userID, fileCount, totalSize, time.Now())
	return err
}

// DeleteSyncFolder removes a sync folder config.
func (db *DB) DeleteSyncFolder(ctx context.Context, id, userID string) error {
	_, err := db.pool.Exec(ctx,
		`DELETE FROM sync_folders WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}
