package index

import (
	"context"
	"fmt"

	"github.com/zcrypt/zcrypt/types"
)

// CreateSendTransfer inserts a new anonymous send transfer.
func (db *DB) CreateSendTransfer(ctx context.Context, t *types.SendTransfer) error {
	_, err := db.pool.Exec(ctx,
		`INSERT INTO send_transfers (id, token, original_name, original_size, chunk_count, sha256, salt, status, burn_after_read, max_downloads, expires_at, sender_ip)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
		t.ID, t.Token, t.OriginalName, t.OriginalSize, t.ChunkCount, t.SHA256, t.Salt,
		t.Status, t.BurnAfterRead, t.MaxDownloads, t.ExpiresAt, t.SenderIP,
	)
	if err != nil {
		return fmt.Errorf("create send transfer: %w", err)
	}
	return nil
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

// CleanupExpiredSendTransfers deletes expired send transfers and returns the count deleted.
func (db *DB) CleanupExpiredSendTransfers(ctx context.Context) (int, error) {
	tag, err := db.pool.Exec(ctx,
		`DELETE FROM send_transfers WHERE expires_at < NOW() OR (status = 'uploading' AND created_at < NOW() - INTERVAL '2 hours')`,
	)
	if err != nil {
		return 0, fmt.Errorf("cleanup expired send transfers: %w", err)
	}
	return int(tag.RowsAffected()), nil
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
