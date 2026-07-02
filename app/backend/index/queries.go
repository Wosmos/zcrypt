package index

import (
	"context"
	"fmt"
	"time"

	"github.com/zcrypt/zcrypt/types"
)

// InsertFile stores file metadata in the index.
//
// folder_id assignment is atomic and ownership-validated in the same INSERT: the
// value is only persisted when a live folder with that id is owned by this user
// (the scalar subquery resolves to NULL otherwise, landing the file at Root). A
// nil f.FolderID means Root, exactly as before — so existing callers that never
// set FolderID are unaffected (backward compatible).
func (db *DB) InsertFile(ctx context.Context, userID string, f *types.FileMetadata) error {
	status := f.Status
	if status == "" {
		status = "complete"
	}
	_, err := db.pool.Exec(ctx,
		`INSERT INTO files (id, user_id, original_name, original_size, compressed_size, encrypted_size, chunk_count, sha256, salt, iv, wrapped_cek, status, folder_id)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
		         (SELECT id FROM folders WHERE id = $13::uuid AND user_id = $2 AND deleted_at IS NULL))`,
		f.ID, userID, f.OriginalName, f.OriginalSize, f.CompressedSize, f.EncryptedSize,
		f.ChunkCount, f.SHA256, f.Salt, f.IV, f.WrappedCEK, status, f.FolderID,
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
		`SELECT id, user_id, original_name, original_size, compressed_size, encrypted_size, chunk_count, sha256, salt, iv, wrapped_cek, status, created_at
		 FROM files WHERE user_id = $1 AND original_name = $2 AND status = 'complete' ORDER BY created_at DESC LIMIT 1`,
		userID, originalName,
	)

	f := &types.FileMetadata{}
	err := row.Scan(&f.ID, &f.UserID, &f.OriginalName, &f.OriginalSize, &f.CompressedSize,
		&f.EncryptedSize, &f.ChunkCount, &f.SHA256, &f.Salt, &f.IV, &f.WrappedCEK, &f.Status, &f.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get file: %w", err)
	}
	return f, nil
}

// GetFileByID retrieves file metadata by ID, scoped to user.
func (db *DB) GetFileByID(ctx context.Context, userID, id string) (*types.FileMetadata, error) {
	row := db.pool.QueryRow(ctx,
		`SELECT id, user_id, original_name, original_size, compressed_size, encrypted_size, chunk_count, sha256, salt, iv, wrapped_cek, status, created_at
		 FROM files WHERE id = $1 AND user_id = $2`, id, userID,
	)

	f := &types.FileMetadata{}
	err := row.Scan(&f.ID, &f.UserID, &f.OriginalName, &f.OriginalSize, &f.CompressedSize,
		&f.EncryptedSize, &f.ChunkCount, &f.SHA256, &f.Salt, &f.IV, &f.WrappedCEK, &f.Status, &f.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get file by id: %w", err)
	}
	return f, nil
}

// UpdateFileKey re-keys a single file by overwriting ONLY its salt + wrapped_cek columns,
// scoped to the owning user. salt is the raw 32-byte per-file salt (BYTEA); wrappedCek is the
// opaque base64 envelope. Used when a file crosses a protection boundary (vault <-> folder
// password). The server stores opaque values only and never derives or sees any key.
func (db *DB) UpdateFileKey(ctx context.Context, userID, fileID string, salt []byte, wrappedCek string) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE files SET salt = $3, wrapped_cek = $4 WHERE id = $1 AND user_id = $2`,
		fileID, userID, salt, wrappedCek,
	)
	if err != nil {
		return fmt.Errorf("update file key: %w", err)
	}
	return nil
}

// ListFiles returns stored files for a user, newest first, optionally filtered by
// name substring. limit caps the number of rows returned (a safety bound against an
// unbounded scan/transfer for accounts with very large libraries); pass <= 0 for no
// explicit cap. Search uses ILIKE (case-insensitive) to match the frontend's
// case-insensitive client-side filter and is backed by the pg_trgm GIN index when present.
func (db *DB) ListFiles(ctx context.Context, userID, filter string, limit int) ([]types.FileMetadata, error) {
	query := `SELECT id, user_id, original_name, original_size, compressed_size, encrypted_size, chunk_count, sha256, salt, iv, wrapped_cek, status, created_at, folder_id, encrypted_name, deleted_at
	          FROM files WHERE user_id = $1 AND status = 'complete' AND deleted_at IS NULL`
	args := []interface{}{userID}

	if filter != "" {
		query += ` AND original_name ILIKE $2`
		args = append(args, "%"+filter+"%")
	}
	query += ` ORDER BY created_at DESC`
	if limit > 0 {
		args = append(args, limit)
		query += fmt.Sprintf(` LIMIT $%d`, len(args))
	}

	rows, err := db.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list files: %w", err)
	}
	defer rows.Close()

	var files []types.FileMetadata
	for rows.Next() {
		var (
			f         types.FileMetadata
			deletedAt *time.Time
		)
		if err := rows.Scan(&f.ID, &f.UserID, &f.OriginalName, &f.OriginalSize, &f.CompressedSize,
			&f.EncryptedSize, &f.ChunkCount, &f.SHA256, &f.Salt, &f.IV, &f.WrappedCEK, &f.Status, &f.CreatedAt,
			&f.FolderID, &f.EncryptedName, &deletedAt); err != nil {
			return nil, fmt.Errorf("scan file: %w", err)
		}
		f.DeletedAt = folderTimeStr(deletedAt)
		files = append(files, f)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate files: %w", err)
	}
	return files, nil
}

// ListFilesInFolder returns a user's live (non-trashed) complete files within a specific
// folder, newest first. A nil folderID returns root-level files (folder_id IS NULL) via
// IS NOT DISTINCT FROM. This is a sibling of ListFiles so existing callers stay untouched.
func (db *DB) ListFilesInFolder(ctx context.Context, userID string, folderID *string) ([]types.FileMetadata, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT id, user_id, original_name, original_size, compressed_size, encrypted_size, chunk_count, sha256, salt, iv, wrapped_cek, status, created_at, folder_id, encrypted_name, deleted_at
		 FROM files
		 WHERE user_id = $1 AND status = 'complete' AND deleted_at IS NULL AND folder_id IS NOT DISTINCT FROM $2
		 ORDER BY created_at DESC`,
		userID, folderID,
	)
	if err != nil {
		return nil, fmt.Errorf("list files in folder: %w", err)
	}
	defer rows.Close()

	var files []types.FileMetadata
	for rows.Next() {
		var (
			f         types.FileMetadata
			deletedAt *time.Time
		)
		if err := rows.Scan(&f.ID, &f.UserID, &f.OriginalName, &f.OriginalSize, &f.CompressedSize,
			&f.EncryptedSize, &f.ChunkCount, &f.SHA256, &f.Salt, &f.IV, &f.WrappedCEK, &f.Status, &f.CreatedAt,
			&f.FolderID, &f.EncryptedName, &deletedAt); err != nil {
			return nil, fmt.Errorf("scan file: %w", err)
		}
		f.DeletedAt = folderTimeStr(deletedAt)
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

	// Decrement repos.used_bytes for each affected repo (before chunks are deleted)
	rows, err := tx.Query(ctx,
		`SELECT repo, SUM(size) FROM chunks
		 WHERE file_id = $1 AND user_id = $2 AND remote_path != ''
		 GROUP BY repo`,
		fileID, userID,
	)
	if err != nil {
		return fmt.Errorf("aggregate chunk sizes: %w", err)
	}
	type repoUsage struct {
		repoURL string
		size    int64
	}
	var decrements []repoUsage
	for rows.Next() {
		var ru repoUsage
		if err := rows.Scan(&ru.repoURL, &ru.size); err != nil {
			rows.Close()
			return fmt.Errorf("scan repo usage: %w", err)
		}
		decrements = append(decrements, ru)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate repo usage: %w", err)
	}

	for _, d := range decrements {
		if _, err := tx.Exec(ctx,
			`UPDATE repos SET used_bytes = GREATEST(used_bytes - $1, 0)
			 WHERE url = $2 AND user_id = $3`,
			d.size, d.repoURL, userID,
		); err != nil {
			return fmt.Errorf("decrement repo usage: %w", err)
		}
	}

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

// DeleteFilesBatch deletes many files in a single transaction using set-based SQL,
// returning the number of files actually removed. This replaces the old pattern of
// looping DeleteFile once per id (~7 round-trips * N files, all serial) with a fixed
// ~4 statements regardless of N — the difference between minutes and milliseconds on
// a large multi-select. As with DeleteFile, chunk refs are copied into
// pending_deletions for deferred remote cleanup before the rows are removed.
//
// fileIDs is cast to uuid[] so the uuid = ANY(...) comparisons type-check.
func (db *DB) DeleteFilesBatch(ctx context.Context, userID string, fileIDs []string) (int, error) {
	if len(fileIDs) == 0 {
		return 0, nil
	}

	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Decrement repos.used_bytes for every affected repo in one statement.
	if _, err := tx.Exec(ctx,
		`UPDATE repos r SET used_bytes = GREATEST(r.used_bytes - agg.total, 0)
		 FROM (
		     SELECT repo, SUM(size) AS total FROM chunks
		     WHERE user_id = $1 AND file_id = ANY($2::uuid[]) AND remote_path != ''
		     GROUP BY repo
		 ) agg
		 WHERE r.url = agg.repo AND r.user_id = $1`,
		userID, fileIDs,
	); err != nil {
		return 0, fmt.Errorf("decrement repo usage: %w", err)
	}

	// Queue remote chunk deletions before deleting the chunk rows.
	if _, err := tx.Exec(ctx,
		`INSERT INTO pending_deletions (user_id, platform, account, repo, remote_path)
		 SELECT user_id, platform, account, repo, remote_path FROM chunks
		 WHERE user_id = $1 AND file_id = ANY($2::uuid[])`,
		userID, fileIDs,
	); err != nil {
		return 0, fmt.Errorf("queue deletions: %w", err)
	}

	if _, err := tx.Exec(ctx,
		`DELETE FROM chunks WHERE user_id = $1 AND file_id = ANY($2::uuid[])`,
		userID, fileIDs,
	); err != nil {
		return 0, fmt.Errorf("delete chunks: %w", err)
	}

	tag, err := tx.Exec(ctx,
		`DELETE FROM files WHERE user_id = $1 AND id = ANY($2::uuid[])`,
		userID, fileIDs,
	)
	if err != nil {
		return 0, fmt.Errorf("delete files: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit: %w", err)
	}
	return int(tag.RowsAffected()), nil
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
//
// Ordered by attempts first (then age): this rotates a persistently-failing item to
// the back of the queue so the drain loop keeps making forward progress on fresh items
// instead of re-fetching and re-failing the same oldest batch every pass (head-of-line
// blocking). It also matches the (attempts, created_at) index for an index-ordered scan.
func (db *DB) GetPendingDeletions(ctx context.Context, limit, maxAttempts int) ([]PendingDeletion, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT id, user_id, platform, account, repo, remote_path, attempts
		 FROM pending_deletions WHERE attempts < $1 ORDER BY attempts ASC, created_at ASC LIMIT $2`,
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
		`SELECT id, user_id, original_name, original_size, compressed_size, encrypted_size, chunk_count, sha256, salt, iv, wrapped_cek, status, created_at
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
			&f.EncryptedSize, &f.ChunkCount, &f.SHA256, &f.Salt, &f.IV, &f.WrappedCEK, &f.Status, &f.CreatedAt); err != nil {
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
		`INSERT INTO files (id, user_id, original_name, original_size, compressed_size, encrypted_size, chunk_count, sha256, salt, iv, wrapped_cek, status)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
		f.ID, userID, f.OriginalName, f.OriginalSize, f.CompressedSize, f.EncryptedSize,
		f.ChunkCount, f.SHA256, f.Salt, f.IV, f.WrappedCEK, status,
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

// IncrementSessionChunks atomically increments the uploaded_chunks counter and
// returns the new count, so concurrent uploaders can compute progress from the
// post-increment value instead of a stale read.
func (db *DB) IncrementSessionChunks(ctx context.Context, sessionID string) (int, error) {
	var uploaded int
	err := db.pool.QueryRow(ctx,
		`UPDATE upload_sessions SET uploaded_chunks = uploaded_chunks + 1 WHERE id = $1 RETURNING uploaded_chunks`,
		sessionID,
	).Scan(&uploaded)
	if err != nil {
		return 0, fmt.Errorf("increment session chunks: %w", err)
	}
	return uploaded, nil
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

// GetTotalChunkSize returns the sum of all chunk sizes for a file.
func (db *DB) GetTotalChunkSize(ctx context.Context, fileID string) (int64, error) {
	var total int64
	err := db.pool.QueryRow(ctx,
		`SELECT COALESCE(SUM(size), 0) FROM chunks WHERE file_id = $1 AND remote_path != ''`,
		fileID,
	).Scan(&total)
	return total, err
}

// CountActiveUploadSessions returns the number of active upload sessions for a user.
func (db *DB) CountActiveUploadSessions(ctx context.Context, userID string) (int, error) {
	var count int
	err := db.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM upload_sessions WHERE user_id = $1 AND status = 'active' AND expires_at > NOW()`,
		userID,
	).Scan(&count)
	return count, err
}

// CleanupExpiredUploadSessions cancels expired active sessions and marks their files for cleanup.
// Returns the number of sessions cleaned up.
func (db *DB) CleanupExpiredUploadSessions(ctx context.Context) (int, error) {
	// Mark expired sessions as cancelled
	tag, err := db.pool.Exec(ctx,
		`UPDATE upload_sessions SET status = 'cancelled' WHERE status = 'active' AND expires_at < NOW()`,
	)
	if err != nil {
		return 0, fmt.Errorf("cleanup expired sessions: %w", err)
	}
	count := int(tag.RowsAffected())

	// Delete orphaned files from expired sessions (status still 'uploading')
	if count > 0 {
		_, _ = db.pool.Exec(ctx,
			`DELETE FROM files WHERE status = 'uploading' AND id IN (
				SELECT file_id FROM upload_sessions WHERE status = 'cancelled' AND expires_at < NOW()
			)`,
		)
	}
	return count, nil
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

// GetChunkByIndex returns a single chunk by file ID and index (including pending-sync chunks).
func (db *DB) GetChunkByIndex(ctx context.Context, fileID string, index int, userIDs ...string) (*types.ChunkRef, error) {
	c := &types.ChunkRef{}
	query := `SELECT chunk_id, file_id, user_id, idx, size, sha256, platform, account, repo, remote_path, compressed
		 FROM chunks WHERE file_id = $1 AND idx = $2`
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

// GetReceivedChunkIndices returns indices of all chunks received for a file (including pending sync).
func (db *DB) GetReceivedChunkIndices(ctx context.Context, fileID string) ([]int, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT idx FROM chunks WHERE file_id = $1 ORDER BY idx`, fileID,
	)
	if err != nil {
		return nil, fmt.Errorf("get received chunk indices: %w", err)
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

// GetTotalReceivedChunkSize returns the sum of all chunk sizes for a file (including pending).
func (db *DB) GetTotalReceivedChunkSize(ctx context.Context, fileID string) (int64, error) {
	var total int64
	err := db.pool.QueryRow(ctx,
		`SELECT COALESCE(SUM(size), 0) FROM chunks WHERE file_id = $1`, fileID,
	).Scan(&total)
	return total, err
}

// GetPendingChunks returns chunks that have been received but not yet synced to
// the git platform and are still under the retry cap. Chunks at or above
// maxAttempts are skipped so a permanently-broken chunk (e.g. missing staging
// file) doesn't starve the queue or loop forever. Fewer-attempt chunks are
// returned first so a single stuck chunk can't block fresh ones.
func (db *DB) GetPendingChunks(ctx context.Context, limit, maxAttempts int) ([]types.ChunkRef, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT chunk_id, file_id, user_id, idx, size, sha256, platform, account, repo, compressed, sync_attempts
		 FROM chunks WHERE remote_path = '' AND sync_attempts < $1
		 ORDER BY sync_attempts, chunk_id LIMIT $2`, maxAttempts, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("get pending chunks: %w", err)
	}
	defer rows.Close()

	var chunks []types.ChunkRef
	for rows.Next() {
		var c types.ChunkRef
		if err := rows.Scan(&c.ChunkID, &c.FileID, &c.UserID, &c.Index, &c.Size, &c.SHA256,
			&c.Platform, &c.Account, &c.Repo, &c.Compressed, &c.SyncAttempts); err != nil {
			return nil, fmt.Errorf("scan pending chunk: %w", err)
		}
		chunks = append(chunks, c)
	}
	return chunks, rows.Err()
}

// IncrementChunkSyncAttempts bumps the retry counter for a chunk after a failed
// sync attempt. Once it reaches the cap the chunk is no longer returned by
// GetPendingChunks.
func (db *DB) IncrementChunkSyncAttempts(ctx context.Context, chunkID string) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE chunks SET sync_attempts = sync_attempts + 1 WHERE chunk_id = $1`, chunkID)
	if err != nil {
		return fmt.Errorf("increment chunk sync attempts: %w", err)
	}
	return nil
}

// CountStuckChunks returns the number of chunks that have hit the retry cap
// without syncing — used for surfacing data-loss risk in logs/metrics.
func (db *DB) CountStuckChunks(ctx context.Context, maxAttempts int) (int, error) {
	var n int
	err := db.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM chunks WHERE remote_path = '' AND sync_attempts >= $1`, maxAttempts,
	).Scan(&n)
	return n, err
}

// GetChunkByID returns a single chunk by its ID (regardless of sync status).
func (db *DB) GetChunkByID(ctx context.Context, chunkID string) (*types.ChunkRef, error) {
	c := &types.ChunkRef{}
	err := db.pool.QueryRow(ctx,
		`SELECT chunk_id, file_id, user_id, idx, size, sha256, platform, account, repo, remote_path, compressed
		 FROM chunks WHERE chunk_id = $1`, chunkID,
	).Scan(&c.ChunkID, &c.FileID, &c.UserID, &c.Index, &c.Size, &c.SHA256, &c.Platform, &c.Account, &c.Repo, &c.RemotePath, &c.Compressed)
	if err != nil {
		return nil, fmt.Errorf("get chunk by id: %w", err)
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

// UpdateFileOriginalSizeVerified updates the encrypted_size field with server-verified total
// to ensure quota calculations use actual uploaded data, not client-claimed values.
func (db *DB) UpdateFileOriginalSizeVerified(ctx context.Context, fileID string, verifiedEncryptedSize int64) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE files SET encrypted_size = $1 WHERE id = $2`,
		verifiedEncryptedSize, fileID,
	)
	return err
}

// ── Share queries ──

// GetFileByIDUnsafe returns file metadata without user scoping (for share access).
func (db *DB) GetFileByIDUnsafe(ctx context.Context, fileID string) (*types.FileMetadata, error) {
	f := &types.FileMetadata{}
	err := db.pool.QueryRow(ctx,
		`SELECT id, user_id, original_name, original_size, compressed_size, encrypted_size, chunk_count, sha256, salt, iv, wrapped_cek, status, created_at
		 FROM files WHERE id = $1`, fileID,
	).Scan(&f.ID, &f.UserID, &f.OriginalName, &f.OriginalSize, &f.CompressedSize,
		&f.EncryptedSize, &f.ChunkCount, &f.SHA256, &f.Salt, &f.IV, &f.WrappedCEK, &f.Status, &f.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get file by id (unsafe): %w", err)
	}
	return f, nil
}

// CreateShare inserts a new share link.
func (db *DB) CreateShare(ctx context.Context, s *types.ShareLink) error {
	_, err := db.pool.Exec(ctx,
		`INSERT INTO shares (id, file_id, user_id, token, password_hash, wrapped_cek, expires_at, max_downloads)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		s.ID, s.FileID, s.UserID, s.Token, s.PasswordHash, s.WrappedCEK, s.ExpiresAt, s.MaxDownloads,
	)
	if err != nil {
		return fmt.Errorf("create share: %w", err)
	}
	return nil
}

// GetShareByToken retrieves a share by its public token.
func (db *DB) GetShareByToken(ctx context.Context, token string) (*types.ShareLink, error) {
	s := &types.ShareLink{}
	err := db.pool.QueryRow(ctx,
		`SELECT id, file_id, user_id, token, password_hash, wrapped_cek, expires_at, max_downloads, download_count, revoked, created_at
		 FROM shares WHERE token = $1`, token,
	).Scan(&s.ID, &s.FileID, &s.UserID, &s.Token, &s.PasswordHash, &s.WrappedCEK, &s.ExpiresAt, &s.MaxDownloads, &s.DownloadCount, &s.Revoked, &s.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get share by token: %w", err)
	}
	s.HasPassword = s.PasswordHash != ""
	return s, nil
}

// ListSharesByUser returns all shares for a user, optionally filtered by file.
func (db *DB) ListSharesByUser(ctx context.Context, userID, fileID string) ([]types.ShareLink, error) {
	query := `SELECT id, file_id, user_id, token, password_hash, expires_at, max_downloads, download_count, revoked, created_at
	          FROM shares WHERE user_id = $1`
	args := []interface{}{userID}

	if fileID != "" {
		query += ` AND file_id = $2`
		args = append(args, fileID)
	}
	query += ` ORDER BY created_at DESC`

	rows, err := db.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list shares: %w", err)
	}
	defer rows.Close()

	var shares []types.ShareLink
	for rows.Next() {
		var s types.ShareLink
		if err := rows.Scan(&s.ID, &s.FileID, &s.UserID, &s.Token, &s.PasswordHash, &s.ExpiresAt, &s.MaxDownloads, &s.DownloadCount, &s.Revoked, &s.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan share: %w", err)
		}
		s.HasPassword = s.PasswordHash != ""
		shares = append(shares, s)
	}
	return shares, nil
}

// RevokeShare marks a share as revoked.
func (db *DB) RevokeShare(ctx context.Context, userID, shareID string) error {
	tag, err := db.pool.Exec(ctx,
		`UPDATE shares SET revoked = TRUE WHERE id = $1 AND user_id = $2`, shareID, userID,
	)
	if err != nil {
		return fmt.Errorf("revoke share: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("share not found")
	}
	return nil
}

// IncrementShareDownloads atomically increments the download count.
func (db *DB) IncrementShareDownloads(ctx context.Context, shareID string) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE shares SET download_count = download_count + 1 WHERE id = $1`, shareID,
	)
	if err != nil {
		return fmt.Errorf("increment share downloads: %w", err)
	}
	return nil
}
