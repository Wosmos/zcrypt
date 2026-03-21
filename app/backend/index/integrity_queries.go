package index

import (
	"context"

	"github.com/zcrypt/zcrypt/types"
)

// CreateIntegritySnapshot stores a hash snapshot for a file.
func (db *DB) CreateIntegritySnapshot(ctx context.Context, userID, fileID, fileName, sha256 string, size int64) (*types.IntegritySnapshot, error) {
	snap := &types.IntegritySnapshot{}
	err := db.pool.QueryRow(ctx, `
		INSERT INTO integrity_snapshots (user_id, file_id, file_name, sha256, size)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, user_id, file_id, file_name, sha256, size, status, checked_at, created_at`,
		userID, fileID, fileName, sha256, size,
	).Scan(&snap.ID, &snap.UserID, &snap.FileID, &snap.FileName, &snap.SHA256,
		&snap.Size, &snap.Status, &snap.CheckedAt, &snap.CreatedAt)
	return snap, err
}

// ListIntegritySnapshots returns all snapshots for a user.
func (db *DB) ListIntegritySnapshots(ctx context.Context, userID string) ([]types.IntegritySnapshot, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT id, user_id, file_id, file_name, sha256, size, status, checked_at, created_at
		FROM integrity_snapshots WHERE user_id = $1
		ORDER BY checked_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var snaps []types.IntegritySnapshot
	for rows.Next() {
		var s types.IntegritySnapshot
		if err := rows.Scan(&s.ID, &s.UserID, &s.FileID, &s.FileName, &s.SHA256,
			&s.Size, &s.Status, &s.CheckedAt, &s.CreatedAt); err != nil {
			return nil, err
		}
		snaps = append(snaps, s)
	}
	return snaps, nil
}

// CheckFileIntegrity compares current file hash against latest snapshot.
func (db *DB) CheckFileIntegrity(ctx context.Context, userID, fileID, currentSHA256 string, currentSize int64) (*types.IntegritySnapshot, error) {
	// Get the latest snapshot for this file
	var latestSHA256 string
	var latestSize int64
	err := db.pool.QueryRow(ctx, `
		SELECT sha256, size FROM integrity_snapshots
		WHERE user_id = $1 AND file_id = $2
		ORDER BY created_at DESC LIMIT 1`, userID, fileID).Scan(&latestSHA256, &latestSize)
	if err != nil {
		return nil, err
	}

	status := "ok"
	if currentSHA256 != latestSHA256 || currentSize != latestSize {
		status = "changed"
	}

	// Create a new check record
	snap := &types.IntegritySnapshot{}
	err = db.pool.QueryRow(ctx, `
		INSERT INTO integrity_snapshots (user_id, file_id, file_name, sha256, size, status)
		VALUES ($1, $2, (SELECT original_name FROM files WHERE id = $2), $3, $4, $5)
		RETURNING id, user_id, file_id, file_name, sha256, size, status, checked_at, created_at`,
		userID, fileID, currentSHA256, currentSize, status,
	).Scan(&snap.ID, &snap.UserID, &snap.FileID, &snap.FileName, &snap.SHA256,
		&snap.Size, &snap.Status, &snap.CheckedAt, &snap.CreatedAt)
	return snap, err
}

// GetLatestSnapshot returns the most recent snapshot for a file.
func (db *DB) GetLatestSnapshot(ctx context.Context, userID, fileID string) (*types.IntegritySnapshot, error) {
	snap := &types.IntegritySnapshot{}
	err := db.pool.QueryRow(ctx, `
		SELECT id, user_id, file_id, file_name, sha256, size, status, checked_at, created_at
		FROM integrity_snapshots WHERE user_id = $1 AND file_id = $2
		ORDER BY created_at DESC LIMIT 1`, userID, fileID,
	).Scan(&snap.ID, &snap.UserID, &snap.FileID, &snap.FileName, &snap.SHA256,
		&snap.Size, &snap.Status, &snap.CheckedAt, &snap.CreatedAt)
	return snap, err
}

// DeleteIntegritySnapshots deletes all snapshots for a file.
func (db *DB) DeleteIntegritySnapshots(ctx context.Context, userID, fileID string) error {
	_, err := db.pool.Exec(ctx, `DELETE FROM integrity_snapshots WHERE user_id = $1 AND file_id = $2`, userID, fileID)
	return err
}

// GetChangedFiles returns all files with "changed" or "missing" status.
func (db *DB) GetChangedFiles(ctx context.Context, userID string) ([]types.IntegritySnapshot, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT DISTINCT ON (file_id) id, user_id, file_id, file_name, sha256, size, status, checked_at, created_at
		FROM integrity_snapshots WHERE user_id = $1 AND status != 'ok'
		ORDER BY file_id, checked_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var snaps []types.IntegritySnapshot
	for rows.Next() {
		var s types.IntegritySnapshot
		if err := rows.Scan(&s.ID, &s.UserID, &s.FileID, &s.FileName, &s.SHA256,
			&s.Size, &s.Status, &s.CheckedAt, &s.CreatedAt); err != nil {
			return nil, err
		}
		snaps = append(snaps, s)
	}
	return snaps, nil
}
