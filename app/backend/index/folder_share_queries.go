package index

import (
	"context"
	"fmt"
	"strings"

	"github.com/zcrypt/zcrypt/types"
)

// CreateFolderShare inserts a folder share and its per-file wrapped CEKs
// atomically. Each wrapped_cek is opaque base64 (the file's CEK under the
// folder-share key, which never reaches the server).
func (db *DB) CreateFolderShare(ctx context.Context, s *types.FolderShare, files []types.FolderShareFileInput) error {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var folderID interface{}
	if s.FolderID != nil && *s.FolderID != "" {
		folderID = *s.FolderID
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO folder_shares (id, folder_id, user_id, name, token, password_hash, expires_at, max_downloads)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		s.ID, folderID, s.UserID, s.Name, s.Token, s.PasswordHash, s.ExpiresAt, s.MaxDownloads,
	); err != nil {
		return fmt.Errorf("create folder share: %w", err)
	}
	// Insert every file in ONE multi-row statement rather than a query per file.
	// A folder can carry hundreds of files, and one round trip per file to a
	// remote (Neon) DB dominates share-creation latency — this collapses it to a
	// single round trip.
	if len(files) > 0 {
		values := make([]string, 0, len(files))
		args := make([]interface{}, 0, len(files)*3)
		for i, f := range files {
			b := i * 3
			values = append(values, fmt.Sprintf("($%d, $%d, $%d)", b+1, b+2, b+3))
			args = append(args, s.ID, f.FileID, f.WrappedCEK)
		}
		query := `INSERT INTO folder_share_files (folder_share_id, file_id, wrapped_cek) VALUES ` +
			strings.Join(values, ", ") +
			` ON CONFLICT (folder_share_id, file_id) DO UPDATE SET wrapped_cek = EXCLUDED.wrapped_cek`
		if _, err := tx.Exec(ctx, query, args...); err != nil {
			return fmt.Errorf("add folder share files: %w", err)
		}
	}
	return tx.Commit(ctx)
}

// GetFolderShareByToken retrieves a folder share by its public token.
func (db *DB) GetFolderShareByToken(ctx context.Context, token string) (*types.FolderShare, error) {
	s := &types.FolderShare{}
	err := db.pool.QueryRow(ctx, `
		SELECT id, folder_id, user_id, name, token, password_hash, expires_at, max_downloads, download_count, revoked, created_at
		FROM folder_shares WHERE token = $1`, token,
	).Scan(&s.ID, &s.FolderID, &s.UserID, &s.Name, &s.Token, &s.PasswordHash, &s.ExpiresAt, &s.MaxDownloads, &s.DownloadCount, &s.Revoked, &s.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get folder share by token: %w", err)
	}
	s.HasPassword = s.PasswordHash != ""
	return s, nil
}

// ListFolderShareFiles returns the files carried by a folder share, joined with
// the owner's file name/size/chunk-count for the public listing. Includes the
// per-file wrapped CEK so a recipient can decrypt with the folder-share key.
func (db *DB) ListFolderShareFiles(ctx context.Context, folderShareID string) ([]types.FolderShareFile, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT fsf.file_id, fsf.wrapped_cek, f.original_name, f.original_size, f.chunk_count
		FROM folder_share_files fsf
		JOIN files f ON f.id = fsf.file_id
		WHERE fsf.folder_share_id = $1
		ORDER BY f.original_name`, folderShareID)
	if err != nil {
		return nil, fmt.Errorf("list folder share files: %w", err)
	}
	defer rows.Close()

	files := []types.FolderShareFile{}
	for rows.Next() {
		var f types.FolderShareFile
		if err := rows.Scan(&f.FileID, &f.WrappedCEK, &f.Name, &f.Size, &f.ChunkCount); err != nil {
			return nil, fmt.Errorf("scan folder share file: %w", err)
		}
		files = append(files, f)
	}
	return files, rows.Err()
}

// GetFolderShareFileWrap returns a file's wrapped CEK IF it belongs to the given
// folder share (pgx.ErrNoRows otherwise) — the authorization check for serving
// that file's meta/chunks publicly.
func (db *DB) GetFolderShareFileWrap(ctx context.Context, folderShareID, fileID string) (string, error) {
	var wrapped string
	err := db.pool.QueryRow(ctx,
		`SELECT wrapped_cek FROM folder_share_files WHERE folder_share_id = $1 AND file_id = $2`,
		folderShareID, fileID).Scan(&wrapped)
	return wrapped, err
}

// ListFolderSharesByUser returns a user's folder shares (optionally for one
// folder), each with its file count.
func (db *DB) ListFolderSharesByUser(ctx context.Context, userID, folderID string) ([]types.FolderShare, error) {
	query := `
		SELECT fs.id, fs.folder_id, fs.user_id, fs.name, fs.token, fs.password_hash, fs.expires_at,
		       fs.max_downloads, fs.download_count, fs.revoked, fs.created_at,
		       COUNT(fsf.file_id)
		FROM folder_shares fs
		LEFT JOIN folder_share_files fsf ON fsf.folder_share_id = fs.id
		WHERE fs.user_id = $1`
	args := []interface{}{userID}
	if folderID != "" {
		query += ` AND fs.folder_id = $2`
		args = append(args, folderID)
	}
	query += ` GROUP BY fs.id ORDER BY fs.created_at DESC`

	rows, err := db.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list folder shares: %w", err)
	}
	defer rows.Close()

	shares := []types.FolderShare{}
	for rows.Next() {
		var s types.FolderShare
		if err := rows.Scan(&s.ID, &s.FolderID, &s.UserID, &s.Name, &s.Token, &s.PasswordHash, &s.ExpiresAt,
			&s.MaxDownloads, &s.DownloadCount, &s.Revoked, &s.CreatedAt, &s.FileCount); err != nil {
			return nil, fmt.Errorf("scan folder share: %w", err)
		}
		s.HasPassword = s.PasswordHash != ""
		s.PasswordHash = ""
		shares = append(shares, s)
	}
	return shares, rows.Err()
}

// RevokeFolderShare marks a folder share revoked (owner-scoped).
func (db *DB) RevokeFolderShare(ctx context.Context, userID, shareID string) error {
	tag, err := db.pool.Exec(ctx,
		`UPDATE folder_shares SET revoked = TRUE WHERE id = $1 AND user_id = $2`, shareID, userID)
	if err != nil {
		return fmt.Errorf("revoke folder share: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("folder share not found")
	}
	return nil
}

// IncrementFolderShareDownloads atomically bumps the download counter.
func (db *DB) IncrementFolderShareDownloads(ctx context.Context, shareID string) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE folder_shares SET download_count = download_count + 1 WHERE id = $1`, shareID)
	if err != nil {
		return fmt.Errorf("increment folder share downloads: %w", err)
	}
	return nil
}
