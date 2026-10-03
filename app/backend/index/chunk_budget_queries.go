package index

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/zcrypt/zcrypt/types"
)

// ErrChunkExceedsDeclaredSize is returned when storing or presigning a chunk
// would take a file's ciphertext past what its declared size allows.
var ErrChunkExceedsDeclaredSize = errors.New("chunk data exceeds the declared file size")

// withChunkBudget runs fn in a transaction that holds the file's chunk lock,
// after checking that n more bytes at idx keep the file within maxTotal. Every
// index counts its stored chunk, or failing that its presign reservation, so
// parallel uploads and presign-before-confirm cannot each see the same headroom.
func (db *DB) withChunkBudget(ctx context.Context, fileID string, idx int, n, maxTotal int64, fn func(pgx.Tx) error) error {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op after commit

	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended('chunks:' || $1, 0))`, fileID); err != nil {
		return fmt.Errorf("lock file chunks: %w", err)
	}
	var used int64
	if err := tx.QueryRow(ctx,
		`SELECT COALESCE(SUM(COALESCE(c.size, r.size)), 0)
		 FROM (SELECT idx, size FROM chunks WHERE file_id = $1) c
		 FULL JOIN (SELECT idx, size FROM chunk_reservations WHERE file_id = $1) r ON r.idx = c.idx
		 WHERE COALESCE(c.idx, r.idx) <> $2`,
		fileID, idx,
	).Scan(&used); err != nil {
		return fmt.Errorf("sum chunk sizes: %w", err)
	}
	if used+n > maxTotal {
		return ErrChunkExceedsDeclaredSize
	}
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// ReserveChunk records the size a presigned chunk was granted, so the bytes
// count against the file before the client confirms them.
func (db *DB) ReserveChunk(ctx context.Context, fileID string, idx int, n, maxTotal int64) error {
	return db.withChunkBudget(ctx, fileID, idx, n, maxTotal, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx,
			`INSERT INTO chunk_reservations (file_id, idx, size) VALUES ($1, $2, $3)
			 ON CONFLICT (file_id, idx) DO UPDATE SET size = EXCLUDED.size`,
			fileID, idx, n,
		); err != nil {
			return fmt.Errorf("reserve chunk: %w", err)
		}
		return nil
	})
}

func (db *DB) insertChunkWithinBudget(ctx context.Context, userID string, c *types.ChunkRef, committed bool, maxTotal int64) (bool, error) {
	var inserted bool
	err := db.withChunkBudget(ctx, c.FileID, c.Index, c.Size, maxTotal, func(tx pgx.Tx) error {
		tag, err := tx.Exec(ctx,
			`INSERT INTO chunks (chunk_id, file_id, user_id, idx, size, sha256, platform, account, repo, remote_path, compressed, committed)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
			 ON CONFLICT (file_id, idx) DO NOTHING`,
			c.ChunkID, c.FileID, userID, c.Index, c.Size, c.SHA256, c.Platform, c.Account, c.Repo, c.RemotePath, c.Compressed, committed,
		)
		if err != nil {
			return fmt.Errorf("insert chunk: %w", err)
		}
		inserted = tag.RowsAffected() > 0
		if _, err := tx.Exec(ctx, `DELETE FROM chunk_reservations WHERE file_id = $1 AND idx = $2`, c.FileID, c.Index); err != nil {
			return fmt.Errorf("release chunk reservation: %w", err)
		}
		return nil
	})
	return inserted, err
}
