package index

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/zcrypt/zcrypt/types"
)

// ErrSendDailyCap is returned by CreateSendTransferCapped when the sender has
// already used up the rolling 24h byte allowance.
var ErrSendDailyCap = errors.New("daily send limit reached")

const insertSendTransferSQL = `INSERT INTO send_transfers (id, token, original_name, original_size, chunk_count, sha256, salt, status, burn_after_read, max_downloads, expires_at, sender_ip, user_id)
	 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NULLIF($13, '')::uuid)`

// CreateSendTransfer inserts a new anonymous send transfer.
func (db *DB) CreateSendTransfer(ctx context.Context, t *types.SendTransfer) error {
	_, err := db.pool.Exec(ctx, insertSendTransferSQL,
		t.ID, t.Token, t.OriginalName, t.OriginalSize, t.ChunkCount, t.SHA256, t.Salt,
		t.Status, t.BurnAfterRead, t.MaxDownloads, t.ExpiresAt, t.SenderIP, t.UserID,
	)
	if err != nil {
		return fmt.Errorf("create send transfer: %w", err)
	}
	return nil
}

// CreateSendTransferCapped inserts the transfer and its send_usage ledger row
// only if the sender (the user when UserID is set, otherwise the coarsened IP
// among anonymous senders) has sent at most limit-OriginalSize bytes in the last
// 24h. The check and insert share a transaction under a per-sender advisory
// lock, so parallel inits cannot each slip under the cap. The ledger, not the
// transfer row, is what is summed: burn-after-read and expiry delete the row.
func (db *DB) CreateSendTransferCapped(ctx context.Context, t *types.SendTransfer, limit int64) error {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var used int64
	if t.UserID != "" {
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "send-user:"+t.UserID); err != nil {
			return fmt.Errorf("lock sender: %w", err)
		}
		err = tx.QueryRow(ctx,
			`SELECT COALESCE(SUM(bytes), 0) FROM send_usage WHERE user_id = $1::uuid AND created_at > NOW() - INTERVAL '24 hours'`,
			t.UserID).Scan(&used)
	} else {
		if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext($1))`, "send-ip:"+t.SenderIP); err != nil {
			return fmt.Errorf("lock sender: %w", err)
		}
		err = tx.QueryRow(ctx,
			`SELECT COALESCE(SUM(bytes), 0) FROM send_usage WHERE user_id IS NULL AND sender_ip = $1 AND created_at > NOW() - INTERVAL '24 hours'`,
			t.SenderIP).Scan(&used)
	}
	if err != nil {
		return fmt.Errorf("sum send usage: %w", err)
	}
	if used+t.OriginalSize > limit {
		return ErrSendDailyCap
	}

	if _, err := tx.Exec(ctx, insertSendTransferSQL,
		t.ID, t.Token, t.OriginalName, t.OriginalSize, t.ChunkCount, t.SHA256, t.Salt,
		t.Status, t.BurnAfterRead, t.MaxDownloads, t.ExpiresAt, t.SenderIP, t.UserID,
	); err != nil {
		return fmt.Errorf("create send transfer: %w", err)
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO send_usage (sender_ip, user_id, bytes) VALUES ($1, NULLIF($2, '')::uuid, $3)`,
		t.SenderIP, t.UserID, t.OriginalSize); err != nil {
		return fmt.Errorf("record send usage: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}

// MarkSendChunkServed records that a chunk was delivered and returns how many
// distinct chunks of the transfer have now been served.
func (db *DB) MarkSendChunkServed(ctx context.Context, id string, idx int) (int, error) {
	var n int
	err := db.pool.QueryRow(ctx,
		`UPDATE send_transfers
		 SET served_chunks = ARRAY(SELECT DISTINCT unnest(served_chunks || $2::int))
		 WHERE id = $1 RETURNING cardinality(served_chunks)`, id, idx).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("mark send chunk served: %w", err)
	}
	return n, nil
}

// DeleteSendTransfer queues one transfer's synced chunks into pending_deletions
// (user_id NULL, resolved through the global adapter set) and deletes the row,
// in one transaction. Returns the number of chunk deletions queued; the caller
// should signalDeletion() when it is above zero.
func (db *DB) DeleteSendTransfer(ctx context.Context, id string) (int, error) {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	queueTag, err := tx.Exec(ctx,
		`INSERT INTO pending_deletions (user_id, platform, account, repo, remote_path)
		 SELECT NULL, platform, account, repo, remote_path FROM send_chunks
		 WHERE transfer_id = $1 AND remote_path != ''`, id)
	if err != nil {
		return 0, fmt.Errorf("queue send chunk deletions: %w", err)
	}
	if _, err := tx.Exec(ctx, `DELETE FROM send_transfers WHERE id = $1`, id); err != nil {
		return 0, fmt.Errorf("delete send transfer: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit: %w", err)
	}
	return int(queueTag.RowsAffected()), nil
}

// SendLocationUsage is the stored footprint of live sends in one repo.
type SendLocationUsage struct {
	Platform  string
	Account   string
	Repo      string
	Transfers int64
	Chunks    int64
	Bytes     int64
}

// SendStorageUsage summarises everything live sends currently hold on the
// platforms: totals, the earliest expiry, and a per-repo breakdown. Metadata only.
type SendStorageUsage struct {
	Transfers       int64
	Chunks          int64
	Bytes           int64
	OldestExpiresAt *time.Time
	ByLocation      []SendLocationUsage
}

// GetSendStorageUsage reads the live-send footprint for the admin view.
func (db *DB) GetSendStorageUsage(ctx context.Context) (SendStorageUsage, error) {
	var u SendStorageUsage
	err := db.pool.QueryRow(ctx,
		`SELECT (SELECT COUNT(*) FROM send_transfers),
		        (SELECT COUNT(*) FROM send_chunks),
		        (SELECT COALESCE(SUM(size), 0) FROM send_chunks),
		        (SELECT MIN(expires_at) FROM send_transfers)`,
	).Scan(&u.Transfers, &u.Chunks, &u.Bytes, &u.OldestExpiresAt)
	if err != nil {
		return u, fmt.Errorf("send storage totals: %w", err)
	}
	rows, err := db.pool.Query(ctx,
		`SELECT platform, account, repo, COUNT(DISTINCT transfer_id), COUNT(*), COALESCE(SUM(size), 0)
		 FROM send_chunks GROUP BY platform, account, repo ORDER BY SUM(size) DESC, platform, account, repo`)
	if err != nil {
		return u, fmt.Errorf("send storage by location: %w", err)
	}
	defer rows.Close()
	u.ByLocation = []SendLocationUsage{}
	for rows.Next() {
		var l SendLocationUsage
		if err := rows.Scan(&l.Platform, &l.Account, &l.Repo, &l.Transfers, &l.Chunks, &l.Bytes); err != nil {
			return u, fmt.Errorf("scan send location: %w", err)
		}
		u.ByLocation = append(u.ByLocation, l)
	}
	return u, rows.Err()
}

// GetSendTransferByID retrieves a send transfer by its ID.
func (db *DB) GetSendTransferByID(ctx context.Context, id string) (*types.SendTransfer, error) {
	var t types.SendTransfer
	err := db.pool.QueryRow(ctx,
		`SELECT id, token, original_name, original_size, encrypted_size, chunk_count, sha256, salt, status, burn_after_read, max_downloads, download_count, expires_at, sender_ip, created_at
		 FROM send_transfers WHERE id = $1`, id,
	).Scan(&t.ID, &t.Token, &t.OriginalName, &t.OriginalSize, &t.EncryptedSize, &t.ChunkCount,
		&t.SHA256, &t.Salt, &t.Status, &t.BurnAfterRead, &t.MaxDownloads, &t.DownloadCount,
		&t.ExpiresAt, &t.SenderIP, &t.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get send transfer by id: %w", err)
	}
	return &t, nil
}

// GetSendTransferByToken retrieves a send transfer by its public token.
func (db *DB) GetSendTransferByToken(ctx context.Context, token string) (*types.SendTransfer, error) {
	var t types.SendTransfer
	err := db.pool.QueryRow(ctx,
		`SELECT id, token, original_name, original_size, encrypted_size, chunk_count, sha256, salt, status, burn_after_read, max_downloads, download_count, expires_at, sender_ip, created_at
		 FROM send_transfers WHERE token = $1`, token,
	).Scan(&t.ID, &t.Token, &t.OriginalName, &t.OriginalSize, &t.EncryptedSize, &t.ChunkCount,
		&t.SHA256, &t.Salt, &t.Status, &t.BurnAfterRead, &t.MaxDownloads, &t.DownloadCount,
		&t.ExpiresAt, &t.SenderIP, &t.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get send transfer by token: %w", err)
	}
	return &t, nil
}

// UpdateSendTransferStatus updates the status of a send transfer.
func (db *DB) UpdateSendTransferStatus(ctx context.Context, id, status string) error {
	tag, err := db.pool.Exec(ctx,
		`UPDATE send_transfers SET status = $2 WHERE id = $1`, id, status,
	)
	if err != nil {
		return fmt.Errorf("update send transfer status: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("send transfer not found")
	}
	return nil
}

// UpdateSendTransferSize updates the encrypted size after upload completes.
func (db *DB) UpdateSendTransferSize(ctx context.Context, id string, encryptedSize int64) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE send_transfers SET encrypted_size = $2 WHERE id = $1`, id, encryptedSize,
	)
	if err != nil {
		return fmt.Errorf("update send transfer size: %w", err)
	}
	return nil
}

// IncrementSendDownloads atomically increments the download counter.
func (db *DB) IncrementSendDownloads(ctx context.Context, id string) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE send_transfers SET download_count = download_count + 1 WHERE id = $1`, id,
	)
	if err != nil {
		return fmt.Errorf("increment send downloads: %w", err)
	}
	return nil
}

// InsertSendChunk inserts a chunk reference for a send transfer.
func (db *DB) InsertSendChunk(ctx context.Context, c *types.SendChunk) error {
	_, err := db.pool.Exec(ctx,
		`INSERT INTO send_chunks (transfer_id, idx, size, sha256, platform, account, repo, remote_path, compressed)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		c.TransferID, c.Index, c.Size, c.SHA256, c.Platform, c.Account, c.Repo, c.RemotePath, c.Compressed,
	)
	if err != nil {
		return fmt.Errorf("insert send chunk: %w", err)
	}
	return nil
}

// GetSendChunks returns all chunks for a send transfer ordered by index.
func (db *DB) GetSendChunks(ctx context.Context, transferID string) ([]types.SendChunk, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT id, transfer_id, idx, size, sha256, platform, account, repo, remote_path, compressed
		 FROM send_chunks WHERE transfer_id = $1 ORDER BY idx`, transferID,
	)
	if err != nil {
		return nil, fmt.Errorf("get send chunks: %w", err)
	}
	defer rows.Close()

	var chunks []types.SendChunk
	for rows.Next() {
		var c types.SendChunk
		if err := rows.Scan(&c.ID, &c.TransferID, &c.Index, &c.Size, &c.SHA256,
			&c.Platform, &c.Account, &c.Repo, &c.RemotePath, &c.Compressed); err != nil {
			return nil, fmt.Errorf("scan send chunk: %w", err)
		}
		chunks = append(chunks, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate send chunks: %w", err)
	}
	return chunks, nil
}

// GetSendChunkByIndex returns a specific chunk by transfer ID and index.
func (db *DB) GetSendChunkByIndex(ctx context.Context, transferID string, idx int) (*types.SendChunk, error) {
	var c types.SendChunk
	err := db.pool.QueryRow(ctx,
		`SELECT id, transfer_id, idx, size, sha256, platform, account, repo, remote_path, compressed
		 FROM send_chunks WHERE transfer_id = $1 AND idx = $2`, transferID, idx,
	).Scan(&c.ID, &c.TransferID, &c.Index, &c.Size, &c.SHA256,
		&c.Platform, &c.Account, &c.Repo, &c.RemotePath, &c.Compressed)
	if err != nil {
		return nil, fmt.Errorf("get send chunk by index: %w", err)
	}
	return &c, nil
}

// CountSendChunks returns the number of chunks uploaded for a transfer.
func (db *DB) CountSendChunks(ctx context.Context, transferID string) (int, error) {
	var count int
	err := db.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM send_chunks WHERE transfer_id = $1`, transferID,
	).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count send chunks: %w", err)
	}
	return count, nil
}

// GetTotalSendChunkSize returns the total size of all chunks for a transfer.
func (db *DB) GetTotalSendChunkSize(ctx context.Context, transferID string) (int64, error) {
	var total int64
	err := db.pool.QueryRow(ctx,
		`SELECT COALESCE(SUM(size), 0) FROM send_chunks WHERE transfer_id = $1`, transferID,
	).Scan(&total)
	if err != nil {
		return 0, fmt.Errorf("get total send chunk size: %w", err)
	}
	return total, nil
}

// CleanupExpiredSendTransfers queues the expired transfers' synced chunks into
// pending_deletions (user_id NULL: the deletion worker resolves those via the
// global adapter set) and then deletes the transfer rows, in one transaction.
// Routing send-chunk cleanup through the durable retry queue replaces the old
// inline best-effort adapter.Delete loop, whose failures orphaned the platform
// blobs permanently because the DB refs were deleted regardless. Returns the
// number of transfers deleted and the number of chunk deletions queued; the
// caller should signalDeletion() when queued > 0.
func (db *DB) CleanupExpiredSendTransfers(ctx context.Context) (int, int, error) {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return 0, 0, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	const expiredTransfers = `SELECT id FROM send_transfers
		WHERE expires_at < NOW() OR (status = 'uploading' AND created_at < NOW() - INTERVAL '2 hours')`

	queueTag, err := tx.Exec(ctx,
		`INSERT INTO pending_deletions (user_id, platform, account, repo, remote_path)
		 SELECT NULL, platform, account, repo, remote_path FROM send_chunks
		 WHERE transfer_id IN (`+expiredTransfers+`) AND remote_path != ''`,
	)
	if err != nil {
		return 0, 0, fmt.Errorf("queue send chunk deletions: %w", err)
	}

	if _, err := tx.Exec(ctx, `DELETE FROM send_usage WHERE created_at < NOW() - INTERVAL '48 hours'`); err != nil {
		return 0, 0, fmt.Errorf("prune send usage: %w", err)
	}

	tag, err := tx.Exec(ctx, `DELETE FROM send_transfers WHERE id IN (`+expiredTransfers+`)`)
	if err != nil {
		return 0, 0, fmt.Errorf("cleanup expired send transfers: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, 0, fmt.Errorf("commit: %w", err)
	}
	return int(tag.RowsAffected()), int(queueTag.RowsAffected()), nil
}

// GetExpiredSendChunks returns chunk info for expired transfers (for remote cleanup before deletion).
func (db *DB) GetExpiredSendChunks(ctx context.Context) ([]types.SendChunk, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT sc.id, sc.transfer_id, sc.idx, sc.size, sc.sha256, sc.platform, sc.account, sc.repo, sc.remote_path, sc.compressed
		 FROM send_chunks sc
		 JOIN send_transfers st ON st.id = sc.transfer_id
		 WHERE st.expires_at < NOW() OR (st.status = 'uploading' AND st.created_at < NOW() - INTERVAL '2 hours')
		 ORDER BY sc.transfer_id, sc.idx`,
	)
	if err != nil {
		return nil, fmt.Errorf("get expired send chunks: %w", err)
	}
	defer rows.Close()

	var chunks []types.SendChunk
	for rows.Next() {
		var c types.SendChunk
		if err := rows.Scan(&c.ID, &c.TransferID, &c.Index, &c.Size, &c.SHA256,
			&c.Platform, &c.Account, &c.Repo, &c.RemotePath, &c.Compressed); err != nil {
			return nil, fmt.Errorf("scan expired send chunk: %w", err)
		}
		chunks = append(chunks, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate expired send chunks: %w", err)
	}
	return chunks, nil
}

// GetGlobalPlatformTokens returns only global platform tokens (for anonymous send).
func (db *DB) GetGlobalPlatformTokens(ctx context.Context) ([]types.PlatformTokenRow, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT id, user_id, platform, username, token_encrypted, token_nonce, is_global, created_at
		 FROM platform_tokens WHERE is_global = TRUE
		 ORDER BY platform, username`,
	)
	if err != nil {
		return nil, fmt.Errorf("get global platform tokens: %w", err)
	}
	defer rows.Close()

	var tokens []types.PlatformTokenRow
	for rows.Next() {
		var t types.PlatformTokenRow
		if err := rows.Scan(&t.ID, &t.UserID, &t.Platform, &t.Username,
			&t.TokenEncrypted, &t.TokenNonce, &t.IsGlobal, &t.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan global platform token: %w", err)
		}
		tokens = append(tokens, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate global platform tokens: %w", err)
	}
	return tokens, nil
}
