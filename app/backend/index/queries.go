package index

import (
	"context"
	"fmt"

	"github.com/zpush/zpush/types"
)

// InsertFile stores file metadata in the index.
func (db *DB) InsertFile(ctx context.Context, userID string, f *types.FileMetadata) error {
	status := f.Status
	if status == "" {
		status = "complete"
	}
	_, err := db.pool.Exec(ctx,
		`INSERT INTO files (id, user_id, original_name, original_size, compressed_size, encrypted_size, chunk_count, sha256, salt, iv, status)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
		f.ID, userID, f.OriginalName, f.OriginalSize, f.CompressedSize, f.EncryptedSize,
		f.ChunkCount, f.SHA256, f.Salt, f.IV, status,
	)
	if err != nil {
		return fmt.Errorf("insert file: %w", err)
	}
	return nil
}

// InsertChunk stores a chunk reference in the index.
func (db *DB) InsertChunk(ctx context.Context, userID string, c *types.ChunkRef) error {
	_, err := db.pool.Exec(ctx,
		`INSERT INTO chunks (chunk_id, file_id, user_id, idx, size, sha256, platform, account, repo, remote_path)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
		c.ChunkID, c.FileID, userID, c.Index, c.Size, c.SHA256, c.Platform, c.Account, c.Repo, c.RemotePath,
	)
	if err != nil {
		return fmt.Errorf("insert chunk: %w", err)
	}
	return nil
}

// InsertChunksBatch inserts multiple chunk placeholders in a single query.
func (db *DB) InsertChunksBatch(ctx context.Context, userID string, chunks []*types.ChunkRef) error {
	if len(chunks) == 0 {
		return nil
	}

	query := `INSERT INTO chunks (chunk_id, file_id, user_id, idx, size, sha256, platform, account, repo, remote_path) VALUES `
	args := make([]interface{}, 0, len(chunks)*10)

	for i, c := range chunks {
		if i > 0 {
			query += ","
		}
		base := i * 10
		query += fmt.Sprintf("($%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d)",
			base+1, base+2, base+3, base+4, base+5, base+6, base+7, base+8, base+9, base+10)
		args = append(args, c.ChunkID, c.FileID, userID, c.Index, c.Size, c.SHA256, c.Platform, c.Account, c.Repo, c.RemotePath)
	}

	_, err := db.pool.Exec(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("insert chunks batch: %w", err)
	}
	return nil
}

// GetFile retrieves file metadata by original name for a user (most recent complete upload).
func (db *DB) GetFile(ctx context.Context, userID, originalName string) (*types.FileMetadata, error) {
	row := db.pool.QueryRow(ctx,
		`SELECT id, user_id, original_name, original_size, compressed_size, encrypted_size, chunk_count, sha256, salt, iv, status, created_at
		 FROM files WHERE user_id = $1 AND original_name = $2 AND status = 'complete' ORDER BY created_at DESC LIMIT 1`,
		userID, originalName,
	)

	f := &types.FileMetadata{}
	err := row.Scan(&f.ID, &f.UserID, &f.OriginalName, &f.OriginalSize, &f.CompressedSize,
		&f.EncryptedSize, &f.ChunkCount, &f.SHA256, &f.Salt, &f.IV, &f.Status, &f.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get file: %w", err)
	}
	return f, nil
}

// GetFileByID retrieves file metadata by ID, scoped to user.
func (db *DB) GetFileByID(ctx context.Context, userID, id string) (*types.FileMetadata, error) {
	row := db.pool.QueryRow(ctx,
		`SELECT id, user_id, original_name, original_size, compressed_size, encrypted_size, chunk_count, sha256, salt, iv, status, created_at
		 FROM files WHERE id = $1 AND user_id = $2`, id, userID,
	)

	f := &types.FileMetadata{}
	err := row.Scan(&f.ID, &f.UserID, &f.OriginalName, &f.OriginalSize, &f.CompressedSize,
		&f.EncryptedSize, &f.ChunkCount, &f.SHA256, &f.Salt, &f.IV, &f.Status, &f.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get file by id: %w", err)
	}
	return f, nil
}

// ListFiles returns all stored files for a user, optionally filtered by name substring.
func (db *DB) ListFiles(ctx context.Context, userID, filter string) ([]types.FileMetadata, error) {
	query := `SELECT id, user_id, original_name, original_size, compressed_size, encrypted_size, chunk_count, sha256, salt, iv, status, created_at
	          FROM files WHERE user_id = $1 AND status = 'complete'`
	args := []interface{}{userID}

	if filter != "" {
		query += ` AND original_name LIKE $2`
		args = append(args, "%"+filter+"%")
	}
	query += ` ORDER BY created_at DESC`

	rows, err := db.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list files: %w", err)
	}
	defer rows.Close()

	var files []types.FileMetadata
	for rows.Next() {
		var f types.FileMetadata
		if err := rows.Scan(&f.ID, &f.UserID, &f.OriginalName, &f.OriginalSize, &f.CompressedSize,
			&f.EncryptedSize, &f.ChunkCount, &f.SHA256, &f.Salt, &f.IV, &f.Status, &f.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan file: %w", err)
		}
		files = append(files, f)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate files: %w", err)
	}
	return files, nil
}

// GetChunksForFile returns all uploaded chunks belonging to a file.
func (db *DB) GetChunksForFile(ctx context.Context, fileID string) ([]types.ChunkRef, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT chunk_id, file_id, user_id, idx, size, sha256, platform, account, repo, remote_path
		 FROM chunks WHERE file_id = $1 AND remote_path != '' ORDER BY idx`, fileID,
	)
	if err != nil {
		return nil, fmt.Errorf("get chunks: %w", err)
	}
	defer rows.Close()

	var chunks []types.ChunkRef
	for rows.Next() {
		var c types.ChunkRef
		if err := rows.Scan(&c.ChunkID, &c.FileID, &c.UserID, &c.Index, &c.Size, &c.SHA256,
			&c.Platform, &c.Account, &c.Repo, &c.RemotePath); err != nil {
			return nil, fmt.Errorf("scan chunk: %w", err)
		}
		chunks = append(chunks, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate chunks: %w", err)
	}
	return chunks, nil
}

// DeleteFile removes a file from the index and queues its chunks for deferred deletion.
func (db *DB) DeleteFile(ctx context.Context, userID, fileID string) error {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Move chunks to pending_deletions before removing them
	if _, err := tx.Exec(ctx,
		`INSERT INTO pending_deletions (user_id, platform, account, repo, remote_path)
		 SELECT user_id, platform, account, repo, remote_path FROM chunks WHERE file_id = $1 AND user_id = $2`,
		fileID, userID,
	); err != nil {
		return fmt.Errorf("queue deletions: %w", err)
	}

	if _, err := tx.Exec(ctx, `DELETE FROM chunks WHERE file_id = $1 AND user_id = $2`, fileID, userID); err != nil {
		return fmt.Errorf("delete chunks: %w", err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM files WHERE id = $1 AND user_id = $2`, fileID, userID); err != nil {
		return fmt.Errorf("delete file: %w", err)
	}

	return tx.Commit(ctx)
}

// PendingDeletion represents a chunk queued for remote deletion.
type PendingDeletion struct {
	ID         int64
	UserID     string
	Platform   string
	Account    string
	Repo       string
	RemotePath string
	Attempts   int
}

// GetPendingDeletions returns up to `limit` pending deletions with fewer than maxAttempts.
func (db *DB) GetPendingDeletions(ctx context.Context, limit, maxAttempts int) ([]PendingDeletion, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT id, user_id, platform, account, repo, remote_path, attempts
		 FROM pending_deletions WHERE attempts < $1 ORDER BY created_at ASC LIMIT $2`,
		maxAttempts, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("get pending deletions: %w", err)
	}
	defer rows.Close()

	var items []PendingDeletion
	for rows.Next() {
		var d PendingDeletion
		if err := rows.Scan(&d.ID, &d.UserID, &d.Platform, &d.Account, &d.Repo, &d.RemotePath, &d.Attempts); err != nil {
			return nil, fmt.Errorf("scan pending deletion: %w", err)
		}
		items = append(items, d)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate deletions: %w", err)
	}
	return items, nil
}

// MarkDeletionDone removes a completed deletion from the queue.
func (db *DB) MarkDeletionDone(ctx context.Context, id int64) error {
	_, err := db.pool.Exec(ctx, `DELETE FROM pending_deletions WHERE id = $1`, id)
	return err
}

// MarkDeletionFailed increments the attempt count and records the error.
func (db *DB) MarkDeletionFailed(ctx context.Context, id int64, errMsg string) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE pending_deletions SET attempts = attempts + 1, last_error = $1 WHERE id = $2`,
		errMsg, id,
	)
	return err
}

// PendingDeletionCount returns how many deletions are queued.
func (db *DB) PendingDeletionCount(ctx context.Context) (int, error) {
	var count int
	err := db.pool.QueryRow(ctx, `SELECT COUNT(*) FROM pending_deletions`).Scan(&count)
	return count, err
}

// InsertRepo adds a repo to the pool.
func (db *DB) InsertRepo(ctx context.Context, userID string, r *types.RepoInfo) error {
	_, err := db.pool.Exec(ctx,
		`INSERT INTO repos (id, user_id, platform, account, name, url, used_bytes, max_bytes, active)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		r.ID, userID, r.Platform, r.Account, r.Name, r.URL, r.UsedBytes, r.MaxBytes, r.Active,
	)
	if err != nil {
		return fmt.Errorf("insert repo: %w", err)
	}
	return nil
}

// GetActiveRepo returns the current active repo for a platform and account for a user.
func (db *DB) GetActiveRepo(ctx context.Context, userID, platform, account string) (*types.RepoInfo, error) {
	row := db.pool.QueryRow(ctx,
		`SELECT id, user_id, platform, account, name, url, used_bytes, max_bytes, active
		 FROM repos WHERE user_id = $1 AND platform = $2 AND account = $3 AND active = TRUE LIMIT 1`,
		userID, platform, account,
	)

	r := &types.RepoInfo{}
	err := row.Scan(&r.ID, &r.UserID, &r.Platform, &r.Account, &r.Name, &r.URL, &r.UsedBytes, &r.MaxBytes, &r.Active)
	if err != nil {
		return nil, fmt.Errorf("get active repo: %w", err)
	}
	return r, nil
}

// UpdateRepoUsage updates the used_bytes for a repo.
func (db *DB) UpdateRepoUsage(ctx context.Context, repoID string, usedBytes int64) error {
	_, err := db.pool.Exec(ctx, `UPDATE repos SET used_bytes = $1 WHERE id = $2`, usedBytes, repoID)
	if err != nil {
		return fmt.Errorf("update repo usage: %w", err)
	}
	return nil
}

// DeactivateRepo marks a repo as inactive (full).
func (db *DB) DeactivateRepo(ctx context.Context, repoID string) error {
	_, err := db.pool.Exec(ctx, `UPDATE repos SET active = FALSE WHERE id = $1`, repoID)
	if err != nil {
		return fmt.Errorf("deactivate repo: %w", err)
	}
	return nil
}

// ListRepos returns all repos for a user, optionally filtered by platform.
func (db *DB) ListRepos(ctx context.Context, userID, platform string) ([]types.RepoInfo, error) {
	query := `SELECT id, user_id, platform, account, name, url, used_bytes, max_bytes, active FROM repos WHERE user_id = $1`
	args := []interface{}{userID}
	if platform != "" {
		query += ` AND platform = $2`
		args = append(args, platform)
	}
	query += ` ORDER BY active DESC, name`

	rows, err := db.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list repos: %w", err)
	}
	defer rows.Close()

	var repos []types.RepoInfo
	for rows.Next() {
		var r types.RepoInfo
		if err := rows.Scan(&r.ID, &r.UserID, &r.Platform, &r.Account, &r.Name, &r.URL, &r.UsedBytes, &r.MaxBytes, &r.Active); err != nil {
			return nil, fmt.Errorf("scan repo: %w", err)
		}
		repos = append(repos, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate repos: %w", err)
	}
	return repos, nil
}

// UpdateFileStatus updates the status of a file ('uploading' or 'complete').
func (db *DB) UpdateFileStatus(ctx context.Context, fileID, status string) error {
	_, err := db.pool.Exec(ctx, `UPDATE files SET status = $1 WHERE id = $2`, status, fileID)
	if err != nil {
		return fmt.Errorf("update file status: %w", err)
	}
	return nil
}

// ListIncompleteFiles returns all files with status='uploading'.
func (db *DB) ListIncompleteFiles(ctx context.Context) ([]types.FileMetadata, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT id, user_id, original_name, original_size, compressed_size, encrypted_size, chunk_count, sha256, salt, iv, status, created_at
		 FROM files WHERE status = 'uploading' ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("list incomplete files: %w", err)
	}
	defer rows.Close()

	var files []types.FileMetadata
	for rows.Next() {
		var f types.FileMetadata
		if err := rows.Scan(&f.ID, &f.UserID, &f.OriginalName, &f.OriginalSize, &f.CompressedSize,
			&f.EncryptedSize, &f.ChunkCount, &f.SHA256, &f.Salt, &f.IV, &f.Status, &f.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan incomplete file: %w", err)
		}
		files = append(files, f)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate incomplete files: %w", err)
	}
	return files, nil
}

// UpdateChunkRemotePath sets the remote_path for a chunk after successful upload.
func (db *DB) UpdateChunkRemotePath(ctx context.Context, chunkID, remotePath string) error {
	_, err := db.pool.Exec(ctx, `UPDATE chunks SET remote_path = $1 WHERE chunk_id = $2`, remotePath, chunkID)
	if err != nil {
		return fmt.Errorf("update chunk remote path: %w", err)
	}
	return nil
}

// InsertFileWithChunks atomically inserts a file and its chunk placeholders in a single transaction.
func (db *DB) InsertFileWithChunks(ctx context.Context, userID string, f *types.FileMetadata, chunks []*types.ChunkRef) error {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	status := f.Status
	if status == "" {
		status = "complete"
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO files (id, user_id, original_name, original_size, compressed_size, encrypted_size, chunk_count, sha256, salt, iv, status)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
		f.ID, userID, f.OriginalName, f.OriginalSize, f.CompressedSize, f.EncryptedSize,
		f.ChunkCount, f.SHA256, f.Salt, f.IV, status,
	); err != nil {
		return fmt.Errorf("insert file: %w", err)
	}

	if len(chunks) > 0 {
		query := `INSERT INTO chunks (chunk_id, file_id, user_id, idx, size, sha256, platform, account, repo, remote_path) VALUES `
		args := make([]interface{}, 0, len(chunks)*10)
		for i, c := range chunks {
			if i > 0 {
				query += ","
			}
			base := i * 10
			query += fmt.Sprintf("($%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d)",
				base+1, base+2, base+3, base+4, base+5, base+6, base+7, base+8, base+9, base+10)
			args = append(args, c.ChunkID, c.FileID, userID, c.Index, c.Size, c.SHA256, c.Platform, c.Account, c.Repo, c.RemotePath)
		}
		if _, err := tx.Exec(ctx, query, args...); err != nil {
			return fmt.Errorf("insert chunks: %w", err)
		}
	}

	return tx.Commit(ctx)
}

// GetPendingChunksForFile returns chunks with empty remote_path (not yet uploaded).
func (db *DB) GetPendingChunksForFile(ctx context.Context, fileID string) ([]types.ChunkRef, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT chunk_id, file_id, user_id, idx, size, sha256, platform, account, repo, remote_path
		 FROM chunks WHERE file_id = $1 AND remote_path = '' ORDER BY idx`, fileID,
	)
	if err != nil {
		return nil, fmt.Errorf("get pending chunks: %w", err)
	}
	defer rows.Close()

	var chunks []types.ChunkRef
	for rows.Next() {
		var c types.ChunkRef
		if err := rows.Scan(&c.ChunkID, &c.FileID, &c.UserID, &c.Index, &c.Size, &c.SHA256,
			&c.Platform, &c.Account, &c.Repo, &c.RemotePath); err != nil {
			return nil, fmt.Errorf("scan pending chunk: %w", err)
		}
		chunks = append(chunks, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate pending chunks: %w", err)
	}
	return chunks, nil
}
