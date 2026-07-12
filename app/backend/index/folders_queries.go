package index

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/zcrypt/zcrypt/types"
)

// ErrFolderCycle is returned by MoveFolder when the requested move would create a
// cycle — i.e. the target parent is the folder itself or one of its descendants.
// Handlers should surface it as a 4xx (client) error, not a 500. Its message is the
// authoritative, user-facing rejection string for an attempted cyclic folder move.
var ErrFolderCycle = errors.New("cannot move a folder into its own subfolder")

// folderTimeStr formats a non-zero time as RFC3339, or returns nil for the zero value.
func folderTimeStr(t *time.Time) *string {
	if t == nil || t.IsZero() {
		return nil
	}
	s := t.Format(time.RFC3339)
	return &s
}

// CreateFolder inserts a new folder for a user. ParentID nil = root.
func (db *DB) CreateFolder(ctx context.Context, userID string, req types.FolderRequest) (*types.Folder, error) {
	var (
		id        string
		parentID  *string
		createdAt time.Time
		deletedAt *time.Time
	)
	var (
		pwSalt     *string
		pwVerifier *string
	)
	err := db.pool.QueryRow(ctx, `
		INSERT INTO folders (user_id, parent_id, encrypted_name)
		VALUES ($1, $2, $3)
		RETURNING id, parent_id, encrypted_name, created_at, deleted_at, pw_salt, pw_verifier`,
		userID, req.ParentID, req.EncryptedName,
	).Scan(&id, &parentID, &req.EncryptedName, &createdAt, &deletedAt, &pwSalt, &pwVerifier)
	if err != nil {
		return nil, fmt.Errorf("create folder: %w", err)
	}
	return &types.Folder{
		ID:            id,
		UserID:        userID,
		ParentID:      parentID,
		EncryptedName: req.EncryptedName,
		CreatedAt:     createdAt.Format(time.RFC3339),
		DeletedAt:     folderTimeStr(deletedAt),
		PwSalt:        pwSalt,
		PwVerifier:    pwVerifier,
	}, nil
}

// ListFolders returns live (non-trashed) folders under the given parent for a user.
// A nil parentID returns root folders (parent_id IS NULL) via IS NOT DISTINCT FROM.
func (db *DB) ListFolders(ctx context.Context, userID string, parentID *string) ([]types.Folder, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT id, user_id, parent_id, encrypted_name, created_at, deleted_at, pw_salt, pw_verifier
		FROM folders
		WHERE user_id = $1 AND deleted_at IS NULL AND parent_id IS NOT DISTINCT FROM $2
		ORDER BY created_at`, userID, parentID)
	if err != nil {
		return nil, fmt.Errorf("list folders: %w", err)
	}
	defer rows.Close()

	var folders []types.Folder
	for rows.Next() {
		var (
			f         types.Folder
			createdAt time.Time
			deletedAt *time.Time
		)
		if err := rows.Scan(&f.ID, &f.UserID, &f.ParentID, &f.EncryptedName, &createdAt, &deletedAt, &f.PwSalt, &f.PwVerifier); err != nil {
			return nil, fmt.Errorf("scan folder: %w", err)
		}
		f.CreatedAt = createdAt.Format(time.RFC3339)
		f.DeletedAt = folderTimeStr(deletedAt)
		folders = append(folders, f)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate folders: %w", err)
	}
	return folders, nil
}

// ListFolderSubtree returns the root folder plus EVERY live descendant (any
// depth) in a single query. Used by folder sharing to build each file's relative
// path in one round trip instead of walking the tree one listing at a time — the
// per-folder walk could silently drop a branch if any one request hiccupped,
// flattening those files in the recipient's zip.
func (db *DB) ListFolderSubtree(ctx context.Context, userID, rootID string) ([]types.Folder, error) {
	rows, err := db.pool.Query(ctx, `
		WITH RECURSIVE subtree AS (
			SELECT id, user_id, parent_id, encrypted_name, created_at, deleted_at, pw_salt, pw_verifier
			FROM folders
			WHERE id = $2 AND user_id = $1 AND deleted_at IS NULL
			UNION ALL
			SELECT f.id, f.user_id, f.parent_id, f.encrypted_name, f.created_at, f.deleted_at, f.pw_salt, f.pw_verifier
			FROM folders f
			JOIN subtree s ON f.parent_id = s.id
			WHERE f.user_id = $1 AND f.deleted_at IS NULL
		)
		SELECT id, user_id, parent_id, encrypted_name, created_at, deleted_at, pw_salt, pw_verifier
		FROM subtree`, userID, rootID)
	if err != nil {
		return nil, fmt.Errorf("list folder subtree: %w", err)
	}
	defer rows.Close()

	var folders []types.Folder
	for rows.Next() {
		var (
			f         types.Folder
			createdAt time.Time
			deletedAt *time.Time
		)
		if err := rows.Scan(&f.ID, &f.UserID, &f.ParentID, &f.EncryptedName, &createdAt, &deletedAt, &f.PwSalt, &f.PwVerifier); err != nil {
			return nil, fmt.Errorf("scan folder: %w", err)
		}
		f.CreatedAt = createdAt.Format(time.RFC3339)
		f.DeletedAt = folderTimeStr(deletedAt)
		folders = append(folders, f)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate folder subtree: %w", err)
	}
	return folders, nil
}

// RenameFolder updates a folder's encrypted name, scoped to the owning user.
func (db *DB) RenameFolder(ctx context.Context, userID, folderID, encryptedName string) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE folders SET encrypted_name = $3 WHERE id = $1 AND user_id = $2`,
		folderID, userID, encryptedName,
	)
	if err != nil {
		return fmt.Errorf("rename folder: %w", err)
	}
	return nil
}

// SetFolderPassword stores (or replaces) a folder's opaque password-protection blobs,
// scoped to the owning user. pwSalt + pwVerifier are client-computed base64 values; the
// server never derives or sees any key. A non-nil pwSalt marks the folder as protected.
func (db *DB) SetFolderPassword(ctx context.Context, userID, folderID, pwSalt, pwVerifier string) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE folders SET pw_salt = $3, pw_verifier = $4 WHERE id = $1 AND user_id = $2`,
		folderID, userID, pwSalt, pwVerifier,
	)
	if err != nil {
		return fmt.Errorf("set folder password: %w", err)
	}
	return nil
}

// RemoveFolderPassword clears a folder's password protection (sets both columns NULL),
// scoped to the owning user, returning it to the unprotected (vault-passphrase) model.
// The client must re-key the folder's files back to the vault passphrase BEFORE calling this.
func (db *DB) RemoveFolderPassword(ctx context.Context, userID, folderID string) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE folders SET pw_salt = NULL, pw_verifier = NULL WHERE id = $1 AND user_id = $2`,
		folderID, userID,
	)
	if err != nil {
		return fmt.Errorf("remove folder password: %w", err)
	}
	return nil
}

// MoveFolder reparents a folder, scoped to the owning user. newParentID nil = move to root.
//
// Cycle guard (authoritative for both the dialog and drag paths): a folder may not be
// moved into itself OR into any of its own descendants — doing so would detach the
// subtree from the tree. A recursive CTE walks the subtree rooted at folderID; if the
// requested newParentID is anywhere in that subtree the move is rejected with
// ErrFolderCycle (which handlers surface as a 4xx). Moving to root (nil) is always safe.
func (db *DB) MoveFolder(ctx context.Context, userID, folderID string, newParentID *string) error {
	if newParentID != nil {
		// Fast path: a direct self-move is always a cycle.
		if *newParentID == folderID {
			return ErrFolderCycle
		}
		// Walk the subtree rooted at folderID (folder + all descendants), scoped to
		// the user, and check whether the requested parent is inside it.
		var inSubtree bool
		err := db.pool.QueryRow(ctx,
			`WITH RECURSIVE subtree AS (
			     SELECT id FROM folders WHERE id = $1 AND user_id = $3
			     UNION ALL
			     SELECT f.id FROM folders f
			     JOIN subtree s ON f.parent_id = s.id
			     WHERE f.user_id = $3
			 )
			 SELECT EXISTS (SELECT 1 FROM subtree WHERE id = $2::uuid)`,
			folderID, *newParentID, userID,
		).Scan(&inSubtree)
		if err != nil {
			return fmt.Errorf("check folder cycle: %w", err)
		}
		if inSubtree {
			return ErrFolderCycle
		}
	}
	_, err := db.pool.Exec(ctx,
		`UPDATE folders SET parent_id = $3 WHERE id = $1 AND user_id = $2`,
		folderID, userID, newParentID,
	)
	if err != nil {
		return fmt.Errorf("move folder: %w", err)
	}
	return nil
}

// SoftDeleteFolder moves a folder and all of its descendants (folders + files) to the
// trash by stamping deleted_at = NOW(). A recursive CTE walks the folder subtree rooted
// at folderID; every folder in that subtree (including the root) and every file whose
// folder_id is in that subtree is soft-deleted in one transaction. All scoped to user_id.
func (db *DB) SoftDeleteFolder(ctx context.Context, userID, folderID string) error {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Soft-delete the folder subtree (root + all descendant folders) for this user.
	if _, err := tx.Exec(ctx,
		`WITH RECURSIVE subtree AS (
		     SELECT id FROM folders WHERE id = $1 AND user_id = $2
		     UNION ALL
		     SELECT f.id FROM folders f
		     JOIN subtree s ON f.parent_id = s.id
		     WHERE f.user_id = $2
		 )
		 UPDATE folders SET deleted_at = NOW()
		 WHERE user_id = $2 AND deleted_at IS NULL AND id IN (SELECT id FROM subtree)`,
		folderID, userID,
	); err != nil {
		return fmt.Errorf("soft-delete folders: %w", err)
	}

	// Soft-delete every live file whose folder_id is anywhere in that subtree.
	if _, err := tx.Exec(ctx,
		`WITH RECURSIVE subtree AS (
		     SELECT id FROM folders WHERE id = $1 AND user_id = $2
		     UNION ALL
		     SELECT f.id FROM folders f
		     JOIN subtree s ON f.parent_id = s.id
		     WHERE f.user_id = $2
		 )
		 UPDATE files SET deleted_at = NOW()
		 WHERE user_id = $2 AND deleted_at IS NULL AND folder_id IN (SELECT id FROM subtree)`,
		folderID, userID,
	); err != nil {
		return fmt.Errorf("soft-delete folder files: %w", err)
	}

	return tx.Commit(ctx)
}

// MoveFile reparents a file into a folder, scoped to the owning user. folderID nil = root.
func (db *DB) MoveFile(ctx context.Context, userID, fileID string, folderID *string) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE files SET folder_id = $3 WHERE id = $1 AND user_id = $2`,
		fileID, userID, folderID,
	)
	if err != nil {
		return fmt.Errorf("move file: %w", err)
	}
	return nil
}

// ListTrashedFiles returns a user's soft-deleted files (deleted_at IS NOT NULL), newest first.
func (db *DB) ListTrashedFiles(ctx context.Context, userID string) ([]types.FileMetadata, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT id, user_id, original_name, original_size, compressed_size, encrypted_size, chunk_count, sha256, salt, iv, wrapped_cek, status, created_at, folder_id, encrypted_name, deleted_at
		 FROM files WHERE user_id = $1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("list trashed files: %w", err)
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
			return nil, fmt.Errorf("scan trashed file: %w", err)
		}
		f.DeletedAt = folderTimeStr(deletedAt)
		files = append(files, f)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate trashed files: %w", err)
	}
	return files, nil
}

// SoftDeleteFile moves a file to the trash, scoped to the owning user.
func (db *DB) SoftDeleteFile(ctx context.Context, userID, fileID string) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE files SET deleted_at = NOW() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
		fileID, userID,
	)
	if err != nil {
		return fmt.Errorf("soft-delete file: %w", err)
	}
	return nil
}

// SoftDeleteFilesBatch moves many files to the trash in one statement, scoped to the user,
// returning the number actually moved. fileIDs is cast to uuid[] for the = ANY comparison.
func (db *DB) SoftDeleteFilesBatch(ctx context.Context, userID string, fileIDs []string) (int, error) {
	if len(fileIDs) == 0 {
		return 0, nil
	}
	tag, err := db.pool.Exec(ctx,
		`UPDATE files SET deleted_at = NOW()
		 WHERE user_id = $1 AND deleted_at IS NULL AND id = ANY($2::uuid[])`,
		userID, fileIDs,
	)
	if err != nil {
		return 0, fmt.Errorf("soft-delete files batch: %w", err)
	}
	return int(tag.RowsAffected()), nil
}

// RestoreFile brings a file back from the trash, scoped to the owning user. It
// delegates to RestoreFilesBatch so a single restore also revives the file's
// trashed ancestor folders (see below) — otherwise a file deleted via its folder
// would restore into a folder the user can't navigate into.
func (db *DB) RestoreFile(ctx context.Context, userID, fileID string) error {
	_, err := db.RestoreFilesBatch(ctx, userID, []string{fileID})
	return err
}

// RestoreFilesBatch brings many files back from the trash in one transaction,
// scoped to the user, returning the number of files actually restored.
//
// Deleting a folder cascade-soft-deletes every file inside it (see
// SoftDeleteFolderSubtree). Restoring just the files would strand them in a
// still-trashed folder — invisible, because folder listings filter deleted_at
// IS NULL. So after un-deleting the files we also revive their ANCESTOR folder
// chain up to the root, making the restored files reachable again.
func (db *DB) RestoreFilesBatch(ctx context.Context, userID string, fileIDs []string) (int, error) {
	if len(fileIDs) == 0 {
		return 0, nil
	}

	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("begin tx: %w", err)
	}
	// Rollback after a successful Commit is a documented no-op error — safe to drop.
	defer func() { _ = tx.Rollback(ctx) }()

	tag, err := tx.Exec(ctx,
		`UPDATE files SET deleted_at = NULL
		 WHERE user_id = $1 AND deleted_at IS NOT NULL AND id = ANY($2::uuid[])`,
		userID, fileIDs,
	)
	if err != nil {
		return 0, fmt.Errorf("restore files batch: %w", err)
	}

	// Revive any trashed folder on the path from each restored file up to the root.
	if _, err := tx.Exec(ctx,
		`WITH RECURSIVE ancestors AS (
		     SELECT folder_id AS id FROM files
		     WHERE user_id = $1 AND id = ANY($2::uuid[]) AND folder_id IS NOT NULL
		     UNION
		     SELECT f.parent_id FROM folders f
		     JOIN ancestors a ON f.id = a.id
		     WHERE f.parent_id IS NOT NULL
		 )
		 UPDATE folders SET deleted_at = NULL
		 WHERE user_id = $1 AND deleted_at IS NOT NULL AND id IN (SELECT id FROM ancestors)`,
		userID, fileIDs,
	); err != nil {
		return 0, fmt.Errorf("restore ancestor folders: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit: %w", err)
	}
	return int(tag.RowsAffected()), nil
}
