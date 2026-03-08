package index

import (
	"fmt"

	"github.com/zpush/zpush/types"
)

// InsertFile stores file metadata in the index.
func (db *DB) InsertFile(f *types.FileMetadata) error {
	status := f.Status
	if status == "" {
		status = "complete"
	}
	_, err := db.conn.Exec(
		`INSERT INTO files (id, original_name, original_size, compressed_size, encrypted_size, chunk_count, sha256, salt, iv, status)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		f.ID, f.OriginalName, f.OriginalSize, f.CompressedSize, f.EncryptedSize,
		f.ChunkCount, f.SHA256, f.Salt, f.IV, status,
	)
	if err != nil {
		return fmt.Errorf("insert file: %w", err)
	}
	return nil
}

// InsertChunk stores a chunk reference in the index.
func (db *DB) InsertChunk(c *types.ChunkRef) error {
	_, err := db.conn.Exec(
		`INSERT INTO chunks (chunk_id, file_id, idx, size, sha256, platform, account, repo, remote_path)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		c.ChunkID, c.FileID, c.Index, c.Size, c.SHA256, c.Platform, c.Account, c.Repo, c.RemotePath,
	)
	if err != nil {
		return fmt.Errorf("insert chunk: %w", err)
	}
	return nil
}

// GetFile retrieves file metadata by original name (most recent complete upload).
func (db *DB) GetFile(originalName string) (*types.FileMetadata, error) {
	row := db.conn.QueryRow(
		`SELECT id, original_name, original_size, compressed_size, encrypted_size, chunk_count, sha256, salt, iv, status, created_at
		 FROM files WHERE original_name = ? AND status = 'complete' ORDER BY created_at DESC LIMIT 1`, originalName,
	)

	f := &types.FileMetadata{}
	err := row.Scan(&f.ID, &f.OriginalName, &f.OriginalSize, &f.CompressedSize,
		&f.EncryptedSize, &f.ChunkCount, &f.SHA256, &f.Salt, &f.IV, &f.Status, &f.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get file: %w", err)
	}
	return f, nil
}

// GetFileByID retrieves file metadata by ID.
func (db *DB) GetFileByID(id string) (*types.FileMetadata, error) {
	row := db.conn.QueryRow(
		`SELECT id, original_name, original_size, compressed_size, encrypted_size, chunk_count, sha256, salt, iv, status, created_at
		 FROM files WHERE id = ?`, id,
	)

	f := &types.FileMetadata{}
	err := row.Scan(&f.ID, &f.OriginalName, &f.OriginalSize, &f.CompressedSize,
		&f.EncryptedSize, &f.ChunkCount, &f.SHA256, &f.Salt, &f.IV, &f.Status, &f.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get file by id: %w", err)
	}
	return f, nil
}

// ListFiles returns all stored files, optionally filtered by name substring.
func (db *DB) ListFiles(filter string) ([]types.FileMetadata, error) {
	query := `SELECT id, original_name, original_size, compressed_size, encrypted_size, chunk_count, sha256, salt, iv, status, created_at FROM files WHERE status = 'complete'`
	var args []interface{}

	if filter != "" {
		query += ` AND original_name LIKE ?`
		args = append(args, "%"+filter+"%")
	}
	query += ` ORDER BY created_at DESC`

	rows, err := db.conn.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("list files: %w", err)
	}
	defer rows.Close()

	var files []types.FileMetadata
	for rows.Next() {
		var f types.FileMetadata
		if err := rows.Scan(&f.ID, &f.OriginalName, &f.OriginalSize, &f.CompressedSize,
			&f.EncryptedSize, &f.ChunkCount, &f.SHA256, &f.Salt, &f.IV, &f.Status, &f.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan file: %w", err)
		}
		files = append(files, f)
	}
	return files, nil
}

// GetChunksForFile returns all uploaded chunks belonging to a file, ordered by index.
func (db *DB) GetChunksForFile(fileID string) ([]types.ChunkRef, error) {
	rows, err := db.conn.Query(
		`SELECT chunk_id, file_id, idx, size, sha256, platform, account, repo, remote_path
		 FROM chunks WHERE file_id = ? AND remote_path != '' ORDER BY idx`, fileID,
	)
	if err != nil {
		return nil, fmt.Errorf("get chunks: %w", err)
	}
	defer rows.Close()

	var chunks []types.ChunkRef
	for rows.Next() {
		var c types.ChunkRef
		if err := rows.Scan(&c.ChunkID, &c.FileID, &c.Index, &c.Size, &c.SHA256,
			&c.Platform, &c.Account, &c.Repo, &c.RemotePath); err != nil {
			return nil, fmt.Errorf("scan chunk: %w", err)
		}
		chunks = append(chunks, c)
	}
	return chunks, nil
}

// DeleteFile removes a file from the index and queues its chunks for deferred GitHub deletion.
func (db *DB) DeleteFile(fileID string) error {
	tx, err := db.conn.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	// Move chunks to pending_deletions before removing them
	if _, err := tx.Exec(
		`INSERT INTO pending_deletions (platform, account, repo, remote_path)
		 SELECT platform, account, repo, remote_path FROM chunks WHERE file_id = ?`, fileID,
	); err != nil {
		return fmt.Errorf("queue deletions: %w", err)
	}

	if _, err := tx.Exec(`DELETE FROM chunks WHERE file_id = ?`, fileID); err != nil {
		return fmt.Errorf("delete chunks: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM files WHERE id = ?`, fileID); err != nil {
		return fmt.Errorf("delete file: %w", err)
	}

	return tx.Commit()
}

// PendingDeletion represents a chunk queued for remote deletion.
type PendingDeletion struct {
	ID         int64
	Platform   string
	Account    string
	Repo       string
	RemotePath string
	Attempts   int
}

// GetPendingDeletions returns up to `limit` pending deletions with fewer than maxAttempts.
func (db *DB) GetPendingDeletions(limit, maxAttempts int) ([]PendingDeletion, error) {
	rows, err := db.conn.Query(
		`SELECT id, platform, account, repo, remote_path, attempts
		 FROM pending_deletions WHERE attempts < ? ORDER BY created_at ASC LIMIT ?`,
		maxAttempts, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("get pending deletions: %w", err)
	}
	defer rows.Close()

	var items []PendingDeletion
	for rows.Next() {
		var d PendingDeletion
		if err := rows.Scan(&d.ID, &d.Platform, &d.Account, &d.Repo, &d.RemotePath, &d.Attempts); err != nil {
			return nil, fmt.Errorf("scan pending deletion: %w", err)
		}
		items = append(items, d)
	}
	return items, nil
}

// MarkDeletionDone removes a completed deletion from the queue.
func (db *DB) MarkDeletionDone(id int64) error {
	_, err := db.conn.Exec(`DELETE FROM pending_deletions WHERE id = ?`, id)
	return err
}

// MarkDeletionFailed increments the attempt count and records the error.
func (db *DB) MarkDeletionFailed(id int64, errMsg string) error {
	_, err := db.conn.Exec(
		`UPDATE pending_deletions SET attempts = attempts + 1, last_error = ? WHERE id = ?`,
		errMsg, id,
	)
	return err
}

// PendingDeletionCount returns how many deletions are queued.
func (db *DB) PendingDeletionCount() (int, error) {
	var count int
	err := db.conn.QueryRow(`SELECT COUNT(*) FROM pending_deletions`).Scan(&count)
	return count, err
}

// InsertRepo adds a repo to the pool.
func (db *DB) InsertRepo(r *types.RepoInfo) error {
	_, err := db.conn.Exec(
		`INSERT INTO repos (id, platform, account, name, url, used_bytes, max_bytes, active)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		r.ID, r.Platform, r.Account, r.Name, r.URL, r.UsedBytes, r.MaxBytes, boolToInt(r.Active),
	)
	if err != nil {
		return fmt.Errorf("insert repo: %w", err)
	}
	return nil
}

// GetActiveRepo returns the current active repo for a platform and account.
func (db *DB) GetActiveRepo(platform, account string) (*types.RepoInfo, error) {
	row := db.conn.QueryRow(
		`SELECT id, platform, account, name, url, used_bytes, max_bytes, active
		 FROM repos WHERE platform = ? AND account = ? AND active = 1 LIMIT 1`, platform, account,
	)

	r := &types.RepoInfo{}
	var active int
	err := row.Scan(&r.ID, &r.Platform, &r.Account, &r.Name, &r.URL, &r.UsedBytes, &r.MaxBytes, &active)
	if err != nil {
		return nil, fmt.Errorf("get active repo: %w", err)
	}
	r.Active = active == 1
	return r, nil
}

// UpdateRepoUsage updates the used_bytes for a repo.
func (db *DB) UpdateRepoUsage(repoID string, usedBytes int64) error {
	_, err := db.conn.Exec(`UPDATE repos SET used_bytes = ? WHERE id = ?`, usedBytes, repoID)
	if err != nil {
		return fmt.Errorf("update repo usage: %w", err)
	}
	return nil
}

// DeactivateRepo marks a repo as inactive (full).
func (db *DB) DeactivateRepo(repoID string) error {
	_, err := db.conn.Exec(`UPDATE repos SET active = 0 WHERE id = ?`, repoID)
	if err != nil {
		return fmt.Errorf("deactivate repo: %w", err)
	}
	return nil
}

// ListRepos returns all repos, optionally filtered by platform.
func (db *DB) ListRepos(platform string) ([]types.RepoInfo, error) {
	query := `SELECT id, platform, account, name, url, used_bytes, max_bytes, active FROM repos`
	var args []interface{}
	if platform != "" {
		query += ` WHERE platform = ?`
		args = append(args, platform)
	}
	query += ` ORDER BY active DESC, name`

	rows, err := db.conn.Query(query, args...)
	if err != nil {
		return nil, fmt.Errorf("list repos: %w", err)
	}
	defer rows.Close()

	var repos []types.RepoInfo
	for rows.Next() {
		var r types.RepoInfo
		var active int
		if err := rows.Scan(&r.ID, &r.Platform, &r.Account, &r.Name, &r.URL, &r.UsedBytes, &r.MaxBytes, &active); err != nil {
			return nil, fmt.Errorf("scan repo: %w", err)
		}
		r.Active = active == 1
		repos = append(repos, r)
	}
	return repos, nil
}

// UpdateFileStatus updates the status of a file ('uploading' or 'complete').
func (db *DB) UpdateFileStatus(fileID, status string) error {
	_, err := db.conn.Exec(`UPDATE files SET status = ? WHERE id = ?`, status, fileID)
	if err != nil {
		return fmt.Errorf("update file status: %w", err)
	}
	return nil
}

// ListIncompleteFiles returns all files with status='uploading'.
func (db *DB) ListIncompleteFiles() ([]types.FileMetadata, error) {
	rows, err := db.conn.Query(
		`SELECT id, original_name, original_size, compressed_size, encrypted_size, chunk_count, sha256, salt, iv, status, created_at
		 FROM files WHERE status = 'uploading' ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("list incomplete files: %w", err)
	}
	defer rows.Close()

	var files []types.FileMetadata
	for rows.Next() {
		var f types.FileMetadata
		if err := rows.Scan(&f.ID, &f.OriginalName, &f.OriginalSize, &f.CompressedSize,
			&f.EncryptedSize, &f.ChunkCount, &f.SHA256, &f.Salt, &f.IV, &f.Status, &f.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan incomplete file: %w", err)
		}
		files = append(files, f)
	}
	return files, nil
}

// UpdateChunkRemotePath sets the remote_path for a chunk after successful upload.
func (db *DB) UpdateChunkRemotePath(chunkID, remotePath string) error {
	_, err := db.conn.Exec(`UPDATE chunks SET remote_path = ? WHERE chunk_id = ?`, remotePath, chunkID)
	if err != nil {
		return fmt.Errorf("update chunk remote path: %w", err)
	}
	return nil
}

// GetPendingChunksForFile returns chunks with empty remote_path (not yet uploaded).
func (db *DB) GetPendingChunksForFile(fileID string) ([]types.ChunkRef, error) {
	rows, err := db.conn.Query(
		`SELECT chunk_id, file_id, idx, size, sha256, platform, account, repo, remote_path
		 FROM chunks WHERE file_id = ? AND remote_path = '' ORDER BY idx`, fileID,
	)
	if err != nil {
		return nil, fmt.Errorf("get pending chunks: %w", err)
	}
	defer rows.Close()

	var chunks []types.ChunkRef
	for rows.Next() {
		var c types.ChunkRef
		if err := rows.Scan(&c.ChunkID, &c.FileID, &c.Index, &c.Size, &c.SHA256,
			&c.Platform, &c.Account, &c.Repo, &c.RemotePath); err != nil {
			return nil, fmt.Errorf("scan pending chunk: %w", err)
		}
		chunks = append(chunks, c)
	}
	return chunks, nil
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
