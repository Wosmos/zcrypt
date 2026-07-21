package index

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/zcrypt/zcrypt/types"
)

// PersonalTokenAccount returns the username of the user's OWN (non-global)
// platform token for a platform, and whether one exists. byos-direct uploads
// require a personal token — the shared managed-pool token (is_global = TRUE)
// must never back a client-direct transfer, since the client would need its
// plaintext and it must stay server-side.
func (db *DB) PersonalTokenAccount(ctx context.Context, userID, platform string) (string, bool, error) {
	var username string
	err := db.pool.QueryRow(ctx,
		`SELECT username FROM platform_tokens
		 WHERE user_id = $1 AND platform = $2 AND is_global = FALSE
		 ORDER BY username LIMIT 1`,
		userID, platform,
	).Scan(&username)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("personal token account: %w", err)
	}
	return username, true, nil
}

// RegisterClientRepo records a repo the CLIENT created on the user's own
// platform (byos-direct). The client generates the globally-unique id (same
// scheme as the server pool), so this is idempotent: a re-register of the same
// repo (retry, or two devices) is a no-op via ON CONFLICT (id). Ownership is
// pinned by user_id so one user can never register an id into another's pool.
func (db *DB) RegisterClientRepo(ctx context.Context, userID string, r *types.RepoInfo) error {
	_, err := db.pool.Exec(ctx,
		`INSERT INTO repos (id, user_id, platform, account, name, url, used_bytes, max_bytes, active)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
		 ON CONFLICT (id) DO NOTHING`,
		r.ID, userID, r.Platform, r.Account, r.Name, r.URL, r.UsedBytes, r.MaxBytes,
	)
	if err != nil {
		return fmt.Errorf("register client repo: %w", err)
	}
	return nil
}

// GetRepoByID returns a repo owned by the given user, or pgx.ErrNoRows. Used to
// validate that a byos-direct confirm references a repo the caller actually owns
// (never trust a client-supplied repo_id without an ownership check).
func (db *DB) GetRepoByID(ctx context.Context, userID, repoID string) (*types.RepoInfo, error) {
	r := &types.RepoInfo{}
	err := db.pool.QueryRow(ctx,
		`SELECT id, user_id, platform, account, name, url, used_bytes, max_bytes, active
		 FROM repos WHERE id = $1 AND user_id = $2`,
		repoID, userID,
	).Scan(&r.ID, &r.UserID, &r.Platform, &r.Account, &r.Name, &r.URL, &r.UsedBytes, &r.MaxBytes, &r.Active)
	if err != nil {
		return nil, fmt.Errorf("get repo by id: %w", err)
	}
	return r, nil
}

// DeactivateClientRepo marks a client-owned repo inactive (full), scoped to the
// caller so one user can never deactivate another's repo. Reports whether a row
// actually matched — false means the id is unknown or not owned, which the
// handler surfaces as 404 rather than a silent success.
func (db *DB) DeactivateClientRepo(ctx context.Context, userID, repoID string) (bool, error) {
	tag, err := db.pool.Exec(ctx,
		`UPDATE repos SET active = FALSE WHERE id = $1 AND user_id = $2`,
		repoID, userID,
	)
	if err != nil {
		return false, fmt.Errorf("deactivate client repo: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

// BumpRepoUsage adds delta bytes to a repo's used_bytes (byos-direct confirm:
// the server never sees the bytes, so usage is credited from the confirmed
// chunk size). Unlike UpdateRepoUsage this is a relative increment, safe under
// concurrent confirms.
func (db *DB) BumpRepoUsage(ctx context.Context, repoID string, delta int64) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE repos SET used_bytes = used_bytes + $2 WHERE id = $1`,
		repoID, delta,
	)
	if err != nil {
		return fmt.Errorf("bump repo usage: %w", err)
	}
	return nil
}

// InsertDirectChunk records a byos-direct chunk: the client already PUT the
// ciphertext to its own platform AND (for git/Telegram) committed it, so this
// is stored committed = TRUE immediately — there is no server-side commit pass.
// Idempotent via ON CONFLICT (file_id, idx); returns whether a new row landed.
func (db *DB) InsertDirectChunk(ctx context.Context, userID string, c *types.ChunkRef) (bool, error) {
	tag, err := db.pool.Exec(ctx,
		`INSERT INTO chunks (chunk_id, file_id, user_id, idx, size, sha256, platform, account, repo, remote_path, compressed, committed)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE)
		 ON CONFLICT (file_id, idx) DO NOTHING`,
		c.ChunkID, c.FileID, userID, c.Index, c.Size, c.SHA256, c.Platform, c.Account, c.Repo, c.RemotePath, c.Compressed,
	)
	if err != nil {
		return false, fmt.Errorf("insert direct chunk: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

// GetFileLocatorsForOwner returns the per-chunk platform locations for a file,
// OWNER-ONLY (joined on files.user_id) — this endpoint hands out where every
// chunk physically lives, which must never be exposed through a share or space
// membership. Ordered by idx. Only committed, actually-placed chunks
// (remote_path set) are returned.
func (db *DB) GetFileLocatorsForOwner(ctx context.Context, userID, fileID string) ([]types.ChunkRef, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT c.idx, c.platform, c.account, c.repo, c.remote_path, c.size, c.sha256, c.compressed
		 FROM chunks c
		 JOIN files f ON f.id = c.file_id
		 WHERE c.file_id = $1 AND f.user_id = $2 AND c.remote_path <> ''
		 ORDER BY c.idx`,
		fileID, userID,
	)
	if err != nil {
		return nil, fmt.Errorf("get file locators: %w", err)
	}
	defer rows.Close()

	var chunks []types.ChunkRef
	for rows.Next() {
		var c types.ChunkRef
		if err := rows.Scan(&c.Index, &c.Platform, &c.Account, &c.Repo, &c.RemotePath, &c.Size, &c.SHA256, &c.Compressed); err != nil {
			return nil, fmt.Errorf("scan locator: %w", err)
		}
		chunks = append(chunks, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate locators: %w", err)
	}
	return chunks, nil
}

// BumpUserFileRev advances the user's monotonic change counter and stamps the
// file with the new rev + updated_at, returning the rev. This is the single
// source of the cross-device sync cursor: every file mutation calls it, and the
// returned rev rides both the SSE "file" event and GET /api/changes?since=. The
// counter is bumped and read in one UPDATE ... RETURNING so concurrent
// mutations (multiple devices) never collide on a rev value.
//
// A rev is only assigned to a file that still exists; for a hard-deleted file
// (row gone) the UPDATE affects nothing and the returned rev is still valid as
// an event cursor — the SSE payload carries the file_id + op so late joiners
// reconcile via a full pull.
func (db *DB) BumpUserFileRev(ctx context.Context, userID, fileID string) (int64, error) {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("begin rev tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var seq int64
	if err := tx.QueryRow(ctx,
		`INSERT INTO user_change_seq (user_id, seq) VALUES ($1, 1)
		 ON CONFLICT (user_id) DO UPDATE SET seq = user_change_seq.seq + 1
		 RETURNING seq`,
		userID,
	).Scan(&seq); err != nil {
		return 0, fmt.Errorf("bump change seq: %w", err)
	}

	if _, err := tx.Exec(ctx,
		`UPDATE files SET rev = $1, updated_at = NOW() WHERE id = $2 AND user_id = $3`,
		seq, fileID, userID,
	); err != nil {
		return 0, fmt.Errorf("stamp file rev: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit rev tx: %w", err)
	}
	return seq, nil
}

// PurgeFileMetadata permanently removes a file and its chunk rows WITHOUT
// queuing any platform deletion — for byos-direct files whose owner's device
// already deleted the ciphertext from the user's own storage directly. This is
// the whole point of byos-direct deletion: the backend never touches the bytes,
// so there is no deletion worker load. Scoped to the owner. ON DELETE CASCADE on
// chunks.file_id removes the chunk rows when the file row goes.
func (db *DB) PurgeFileMetadata(ctx context.Context, userID, fileID string) error {
	tag, err := db.pool.Exec(ctx,
		`DELETE FROM files WHERE id = $1 AND user_id = $2`,
		fileID, userID,
	)
	if err != nil {
		return fmt.Errorf("purge file metadata: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("file not found")
	}
	return nil
}

// FileChange is one row in the cross-device delta feed.
type FileChange struct {
	FileID   string `json:"file_id"`
	Rev      int64  `json:"rev"`
	Deleted  bool   `json:"deleted"`
	FolderID string `json:"folder_id,omitempty"`
}

// GetChangesSince returns every file whose rev is greater than the cursor, for
// a cheap cross-device delta pull. A soft-deleted file (deleted_at set) comes
// back with Deleted = true so the client drops it locally. The returned cursor
// is the max rev seen (or the input cursor when nothing changed), which the
// client passes as ?since= next time. limit caps a single page.
func (db *DB) GetChangesSince(ctx context.Context, userID string, since int64, limit int) ([]FileChange, int64, error) {
	if limit <= 0 || limit > 1000 {
		limit = 1000
	}
	rows, err := db.pool.Query(ctx,
		`SELECT id, rev, (deleted_at IS NOT NULL) AS deleted, COALESCE(folder_id::text, '')
		 FROM files
		 WHERE user_id = $1 AND rev > $2
		 ORDER BY rev ASC
		 LIMIT $3`,
		userID, since, limit,
	)
	if err != nil {
		return nil, since, fmt.Errorf("get changes: %w", err)
	}
	defer rows.Close()

	changes := make([]FileChange, 0)
	cursor := since
	for rows.Next() {
		var c FileChange
		if err := rows.Scan(&c.FileID, &c.Rev, &c.Deleted, &c.FolderID); err != nil {
			return nil, since, fmt.Errorf("scan change: %w", err)
		}
		if c.Rev > cursor {
			cursor = c.Rev
		}
		changes = append(changes, c)
	}
	if err := rows.Err(); err != nil {
		return nil, since, fmt.Errorf("iterate changes: %w", err)
	}
	return changes, cursor, nil
}
