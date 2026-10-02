package index

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// File health values (files.health).
const (
	HealthOK       = "ok"
	HealthDegraded = "degraded"
	HealthDamaged  = "damaged"
)

// ErrPresignMismatch means a confirm did not match the path, hash and size the
// server minted at presign for that chunk (or no presign exists).
var ErrPresignMismatch = errors.New("confirm does not match the presigned chunk")

// ErrRekeyTargetMissing means a bulk re-key named a file that is not the
// caller's, or is not in the folder being (un)protected.
var ErrRekeyTargetMissing = errors.New("rekey target not found in folder")

// DeferPendingChunks pushes the next attempt of every due, unsynced chunk on one
// platform account out by delay without spending an attempt. Used when the
// platform itself is unhealthy (rate-limited or 5xx), so the rest of the queue
// waits instead of burning its retry budget against the same outage.
func (db *DB) DeferPendingChunks(ctx context.Context, platform, account string, delay time.Duration, maxAttempts int) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE chunks SET next_attempt_at = NOW() + make_interval(secs => $3)
		 WHERE remote_path = '' AND platform = $1 AND account = $2 AND sync_attempts < $4
		   AND (next_attempt_at IS NULL OR next_attempt_at < NOW() + make_interval(secs => $3))`,
		platform, account, delay.Seconds(), maxAttempts)
	if err != nil {
		return fmt.Errorf("defer pending chunks: %w", err)
	}
	return nil
}

// NextChunkAttemptAt returns when the earliest backed-off chunk (pending sync or
// awaiting commit, still under the cap) becomes due, or nil if none is waiting.
func (db *DB) NextChunkAttemptAt(ctx context.Context, maxAttempts int) (*time.Time, error) {
	var next *time.Time
	err := db.pool.QueryRow(ctx,
		`SELECT MIN(next_attempt_at) FROM chunks
		 WHERE (remote_path = '' OR committed = FALSE) AND sync_attempts < $1 AND next_attempt_at IS NOT NULL`,
		maxAttempts).Scan(&next)
	if err != nil {
		return nil, fmt.Errorf("next chunk attempt: %w", err)
	}
	return next, nil
}

// MarkFileDegraded flags a file whose chunk ran out of sync/commit retries.
// A file already marked damaged keeps that stronger state. Reports whether the
// health actually changed.
func (db *DB) MarkFileDegraded(ctx context.Context, fileID string) (bool, error) {
	tag, err := db.pool.Exec(ctx,
		`UPDATE files SET health = 'degraded' WHERE id = $1 AND health = 'ok'`, fileID)
	if err != nil {
		return false, fmt.Errorf("mark file degraded: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

// MarkFilesDamaged flags files with a chunk confirmed missing on its platform.
// Returns the ids whose health actually changed.
func (db *DB) MarkFilesDamaged(ctx context.Context, fileIDs []string) ([]string, error) {
	return db.setHealth(ctx, fileIDs, HealthDamaged, `health <> 'damaged'`)
}

// ClearFilesDamaged returns files a verify sweep found fully present back to ok.
// Returns the ids whose health actually changed.
func (db *DB) ClearFilesDamaged(ctx context.Context, fileIDs []string) ([]string, error) {
	return db.setHealth(ctx, fileIDs, HealthOK, `health = 'damaged'`)
}

func (db *DB) setHealth(ctx context.Context, fileIDs []string, health, guard string) ([]string, error) {
	if len(fileIDs) == 0 {
		return nil, nil
	}
	rows, err := db.pool.Query(ctx,
		`UPDATE files SET health = $2 WHERE id = ANY($1::uuid[]) AND `+guard+` RETURNING id`,
		fileIDs, health)
	if err != nil {
		return nil, fmt.Errorf("set file health: %w", err)
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

// RequeueFileSync gives every not-yet-durable chunk of a caller-owned file a
// fresh retry budget, due immediately, and returns a degraded file to ok. Returns
// how many chunks were requeued.
func (db *DB) RequeueFileSync(ctx context.Context, userID, fileID string) (int64, error) {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	tag, err := tx.Exec(ctx,
		`UPDATE chunks SET sync_attempts = 0, next_attempt_at = NULL
		 WHERE file_id = $1 AND user_id = $2 AND (remote_path = '' OR committed = FALSE)`,
		fileID, userID)
	if err != nil {
		return 0, fmt.Errorf("requeue chunks: %w", err)
	}
	if _, err := tx.Exec(ctx,
		`UPDATE files SET health = 'ok' WHERE id = $1 AND user_id = $2 AND health = 'degraded'`,
		fileID, userID); err != nil {
		return 0, fmt.Errorf("reset file health: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit: %w", err)
	}
	return tag.RowsAffected(), nil
}

// HealthCounts is the admin view of durability problems across all users.
type HealthCounts struct {
	DegradedFiles int `json:"degraded_files"`
	DamagedFiles  int `json:"damaged_files"`
	StuckChunks   int `json:"stuck_chunks"`
}

// CountHealth returns how many live files are degraded or damaged and how many
// chunks are stranded at the retry cap without being durable.
func (db *DB) CountHealth(ctx context.Context, maxAttempts int) (HealthCounts, error) {
	var hc HealthCounts
	err := db.pool.QueryRow(ctx,
		`SELECT
		   (SELECT COUNT(*) FROM files WHERE health = 'degraded' AND deleted_at IS NULL),
		   (SELECT COUNT(*) FROM files WHERE health = 'damaged' AND deleted_at IS NULL),
		   (SELECT COUNT(*) FROM chunks WHERE (remote_path = '' OR committed = FALSE) AND sync_attempts >= $1)`,
		maxAttempts).Scan(&hc.DegradedFiles, &hc.DamagedFiles, &hc.StuckChunks)
	if err != nil {
		return hc, fmt.Errorf("count health: %w", err)
	}
	return hc, nil
}

// RepoChunk is one durable chunk's location inside a repo, for a verify sweep.
type RepoChunk struct {
	ChunkID    string
	FileID     string
	RemotePath string
}

// ListCommittedRepoChunks returns the committed, placed chunks of a user's live
// files stored in one repo: what a verify sweep expects to find on the platform.
func (db *DB) ListCommittedRepoChunks(ctx context.Context, userID, platform, account, repo string) ([]RepoChunk, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT c.chunk_id, c.file_id, c.remote_path FROM chunks c
		 JOIN files f ON f.id = c.file_id
		 WHERE c.user_id = $1 AND c.platform = $2 AND c.account = $3 AND c.repo = $4
		   AND c.remote_path <> '' AND c.committed AND f.status = 'complete'`,
		userID, platform, account, repo)
	if err != nil {
		return nil, fmt.Errorf("list repo chunks: %w", err)
	}
	defer rows.Close()
	var out []RepoChunk
	for rows.Next() {
		var c RepoChunk
		if err := rows.Scan(&c.ChunkID, &c.FileID, &c.RemotePath); err != nil {
			return nil, fmt.Errorf("scan repo chunk: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// SavePresign records the remote path minted for a direct-upload chunk, replacing
// any earlier presign of the same index.
func (db *DB) SavePresign(ctx context.Context, sessionID string, idx int, remotePath, sha256 string, size int64) error {
	_, err := db.pool.Exec(ctx,
		`INSERT INTO upload_presigns (session_id, idx, remote_path, sha256, size)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (session_id, idx) DO UPDATE
		   SET remote_path = EXCLUDED.remote_path, sha256 = EXCLUDED.sha256, size = EXCLUDED.size, created_at = NOW()`,
		sessionID, idx, remotePath, sha256, size)
	if err != nil {
		return fmt.Errorf("save presign: %w", err)
	}
	return nil
}

// CheckPresign returns ErrPresignMismatch unless the confirm matches the latest
// presign of that chunk exactly.
func (db *DB) CheckPresign(ctx context.Context, sessionID string, idx int, remotePath, sha256 string, size int64) error {
	var ok bool
	err := db.pool.QueryRow(ctx,
		`SELECT remote_path = $3 AND sha256 = $4 AND size = $5 FROM upload_presigns
		 WHERE session_id = $1 AND idx = $2`,
		sessionID, idx, remotePath, sha256, size).Scan(&ok)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrPresignMismatch
	}
	if err != nil {
		return fmt.Errorf("check presign: %w", err)
	}
	if !ok {
		return ErrPresignMismatch
	}
	return nil
}

// RemotePathTaken reports whether another chunk of this user already lives at
// the same platform location, so a confirm can't alias two chunks to one blob.
func (db *DB) RemotePathTaken(ctx context.Context, userID, platform, account, repo, remotePath string) (bool, error) {
	var taken bool
	err := db.pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM chunks
		  WHERE user_id = $1 AND platform = $2 AND account = $3 AND repo = $4 AND remote_path = $5)`,
		userID, platform, account, repo, remotePath).Scan(&taken)
	if err != nil {
		return false, fmt.Errorf("check remote path: %w", err)
	}
	return taken, nil
}

// MoveFileWithKey reparents a file and, when salt is non-nil, replaces its
// envelope in the same statement, so a move across a protection boundary can
// never leave a file keyed for one folder while sitting in another. Returns
// pgx.ErrNoRows when the caller owns no such file.
func (db *DB) MoveFileWithKey(ctx context.Context, userID, fileID string, folderID *string, salt []byte, wrappedCEK string) error {
	tag, err := db.pool.Exec(ctx,
		`UPDATE files SET folder_id = $3,
		        salt = COALESCE($4, salt),
		        wrapped_cek = CASE WHEN $4::bytea IS NULL THEN wrapped_cek ELSE $5 END
		 WHERE id = $1 AND user_id = $2`,
		fileID, userID, folderID, salt, wrappedCEK)
	if err != nil {
		return fmt.Errorf("move file: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// FileKey is a decoded re-key entry for a bulk folder (un)protect.
type FileKey struct {
	FileID     string
	Salt       []byte
	WrappedCEK string
}

// SetFolderProtection sets (pwSalt/pwVerifier non-empty) or clears (both empty)
// a folder's password and applies every file re-key in ONE transaction. Each
// re-keyed file must be the caller's and sit in that folder, else nothing is
// applied (ErrRekeyTargetMissing).
func (db *DB) SetFolderProtection(ctx context.Context, userID, folderID, pwSalt, pwVerifier string, keys []FileKey) error {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	for _, k := range keys {
		tag, err := tx.Exec(ctx,
			`UPDATE files SET salt = $4, wrapped_cek = $5
			 WHERE id = $1 AND user_id = $2 AND folder_id = $3`,
			k.FileID, userID, folderID, k.Salt, k.WrappedCEK)
		if err != nil {
			return fmt.Errorf("rekey file: %w", err)
		}
		if tag.RowsAffected() == 0 {
			return ErrRekeyTargetMissing
		}
	}

	var salt, verifier interface{}
	if pwSalt != "" {
		salt, verifier = pwSalt, pwVerifier
	}
	if _, err := tx.Exec(ctx,
		`UPDATE folders SET pw_salt = $3, pw_verifier = $4 WHERE id = $1 AND user_id = $2`,
		folderID, userID, salt, verifier); err != nil {
		return fmt.Errorf("set folder protection: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}
