package index

import (
	"context"
	"fmt"
)

const shareTicketRetention = "2 days"

func (db *DB) completeDownload(ctx context.Context, table, shareID, nonce string) (bool, error) {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return false, fmt.Errorf("begin complete download: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	_, _ = tx.Exec(ctx, `DELETE FROM share_download_tickets WHERE created_at < NOW() - INTERVAL '`+shareTicketRetention+`'`)

	tag, err := tx.Exec(ctx,
		`INSERT INTO share_download_tickets (nonce) VALUES ($1) ON CONFLICT DO NOTHING`, nonce)
	if err != nil {
		return false, fmt.Errorf("record download ticket: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return false, nil
	}

	tag, err = tx.Exec(ctx,
		`UPDATE `+table+` SET download_count = download_count + 1
		 WHERE id = $1 AND (max_downloads = 0 OR download_count < max_downloads)`, shareID)
	if err != nil {
		return false, fmt.Errorf("increment downloads: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return false, fmt.Errorf("commit complete download: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

// ShareDownloadTicketUsed reports whether a ticket nonce was already redeemed.
func (db *DB) ShareDownloadTicketUsed(ctx context.Context, nonce string) (bool, error) {
	var used bool
	err := db.pool.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM share_download_tickets WHERE nonce = $1)`, nonce).Scan(&used)
	if err != nil {
		return false, fmt.Errorf("check download ticket: %w", err)
	}
	return used, nil
}

// RecordShareTicketChunk notes that a chunk was served under a ticket and
// returns how many distinct chunks that ticket has now been served.
func (db *DB) RecordShareTicketChunk(ctx context.Context, nonce string, idx int) (int, error) {
	_, _ = db.pool.Exec(ctx, `DELETE FROM share_ticket_chunks WHERE created_at < NOW() - INTERVAL '`+shareTicketRetention+`'`)
	if _, err := db.pool.Exec(ctx,
		`INSERT INTO share_ticket_chunks (nonce, idx) VALUES ($1, $2) ON CONFLICT DO NOTHING`, nonce, idx); err != nil {
		return 0, fmt.Errorf("record ticket chunk: %w", err)
	}
	var n int
	if err := db.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM share_ticket_chunks WHERE nonce = $1`, nonce).Scan(&n); err != nil {
		return 0, fmt.Errorf("count ticket chunks: %w", err)
	}
	return n, nil
}
