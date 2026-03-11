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

// GetChunksForFile returns all uploaded chunks belonging to a file, optionally scoped by user.
func (db *DB) GetChunksForFile(ctx context.Context, fileID string, userIDs ...string) ([]types.ChunkRef, error) {
	query := `SELECT chunk_id, file_id, user_id, idx, size, sha256, platform, account, repo, remote_path
		 FROM chunks WHERE file_id = $1 AND remote_path != ''`
	args := []interface{}{fileID}
	if len(userIDs) > 0 && userIDs[0] != "" {
		query += ` AND user_id = $2`
		args = append(args, userIDs[0])
	}
	query += ` ORDER BY idx`
	rows, err := db.pool.Query(ctx, query, args...)
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

// --- Upload Session Queries (client-side encryption) ---

// CreateUploadSession creates a new upload session and returns its ID.
func (db *DB) CreateUploadSession(ctx context.Context, s *types.UploadSession) (string, error) {
	var id string
	err := db.pool.QueryRow(ctx,
		`INSERT INTO upload_sessions (user_id, file_id, filename, original_size, salt, sha256, chunk_count, platform, account, repo_id, repo_url)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		 RETURNING id`,
		s.UserID, s.FileID, s.Filename, s.OriginalSize, s.Salt, s.SHA256, s.ChunkCount,
		s.Platform, s.Account, s.RepoID, s.RepoURL,
	).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("create upload session: %w", err)
	}
	return id, nil
}

// GetUploadSession retrieves an upload session by ID, scoped to a user.
func (db *DB) GetUploadSession(ctx context.Context, sessionID, userID string) (*types.UploadSession, error) {
	s := &types.UploadSession{}
	err := db.pool.QueryRow(ctx,
		`SELECT id, user_id, file_id, filename, original_size, salt, sha256, chunk_count,
		        platform, account, repo_id, repo_url, uploaded_chunks, status, created_at, expires_at
		 FROM upload_sessions WHERE id = $1 AND user_id = $2`,
		sessionID, userID,
	).Scan(&s.ID, &s.UserID, &s.FileID, &s.Filename, &s.OriginalSize, &s.Salt, &s.SHA256, &s.ChunkCount,
		&s.Platform, &s.Account, &s.RepoID, &s.RepoURL, &s.UploadedChunks, &s.Status, &s.CreatedAt, &s.ExpiresAt)
	if err != nil {
		return nil, fmt.Errorf("get upload session: %w", err)
	}
	return s, nil
}

// IncrementSessionChunks atomically increments the uploaded_chunks counter.
func (db *DB) IncrementSessionChunks(ctx context.Context, sessionID string) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE upload_sessions SET uploaded_chunks = uploaded_chunks + 1 WHERE id = $1`,
		sessionID,
	)
	if err != nil {
		return fmt.Errorf("increment session chunks: %w", err)
	}
	return nil
}

// CompleteUploadSession marks a session as complete.
func (db *DB) CompleteUploadSession(ctx context.Context, sessionID string) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE upload_sessions SET status = 'complete' WHERE id = $1`,
		sessionID,
	)
	if err != nil {
		return fmt.Errorf("complete upload session: %w", err)
	}
	return nil
}

// CancelUploadSession marks a session as cancelled.
func (db *DB) CancelUploadSession(ctx context.Context, sessionID string) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE upload_sessions SET status = 'cancelled' WHERE id = $1`,
		sessionID,
	)
	if err != nil {
		return fmt.Errorf("cancel upload session: %w", err)
	}
	return nil
}

// GetUploadedChunkIndices returns the indices of chunks already uploaded for a session's file.
func (db *DB) GetUploadedChunkIndices(ctx context.Context, fileID string) ([]int, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT idx FROM chunks WHERE file_id = $1 AND remote_path != '' ORDER BY idx`, fileID,
	)
	if err != nil {
		return nil, fmt.Errorf("get uploaded chunk indices: %w", err)
	}
	defer rows.Close()

	var indices []int
	for rows.Next() {
		var idx int
		if err := rows.Scan(&idx); err != nil {
			return nil, fmt.Errorf("scan chunk index: %w", err)
		}
		indices = append(indices, idx)
	}
	return indices, rows.Err()
}

// InsertClientChunk inserts a chunk uploaded by the client (already encrypted).
func (db *DB) InsertClientChunk(ctx context.Context, userID string, c *types.ChunkRef) error {
	_, err := db.pool.Exec(ctx,
		`INSERT INTO chunks (chunk_id, file_id, user_id, idx, size, sha256, platform, account, repo, remote_path, compressed)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
		c.ChunkID, c.FileID, userID, c.Index, c.Size, c.SHA256, c.Platform, c.Account, c.Repo, c.RemotePath, c.Compressed,
	)
	if err != nil {
		return fmt.Errorf("insert client chunk: %w", err)
	}
	return nil
}

// GetChunkByIndex returns a single chunk by file ID and index.
func (db *DB) GetChunkByIndex(ctx context.Context, fileID string, index int, userIDs ...string) (*types.ChunkRef, error) {
	c := &types.ChunkRef{}
	query := `SELECT chunk_id, file_id, user_id, idx, size, sha256, platform, account, repo, remote_path, compressed
		 FROM chunks WHERE file_id = $1 AND idx = $2 AND remote_path != ''`
	args := []interface{}{fileID, index}
	if len(userIDs) > 0 && userIDs[0] != "" {
		query += ` AND user_id = $3`
		args = append(args, userIDs[0])
	}
	err := db.pool.QueryRow(ctx, query, args...,
	).Scan(&c.ChunkID, &c.FileID, &c.UserID, &c.Index, &c.Size, &c.SHA256, &c.Platform, &c.Account, &c.Repo, &c.RemotePath, &c.Compressed)
	if err != nil {
		return nil, fmt.Errorf("get chunk by index: %w", err)
	}
	return c, nil
}

// CleanExpiredSessions deletes expired upload sessions and their associated incomplete data.
func (db *DB) CleanExpiredSessions(ctx context.Context) (int, error) {
	tag, err := db.pool.Exec(ctx,
		`DELETE FROM upload_sessions WHERE status = 'active' AND expires_at < NOW()`,
	)
	if err != nil {
		return 0, fmt.Errorf("clean expired sessions: %w", err)
	}
	return int(tag.RowsAffected()), nil
}

// UpdateFileSizes updates the compressed and encrypted sizes for a file.
func (db *DB) UpdateFileSizes(ctx context.Context, fileID string, compressedSize, encryptedSize int64) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE files SET compressed_size = $1, encrypted_size = $2 WHERE id = $3`,
		compressedSize, encryptedSize, fileID,
	)
	if err != nil {
		return fmt.Errorf("update file sizes: %w", err)
	}
	return nil
}
