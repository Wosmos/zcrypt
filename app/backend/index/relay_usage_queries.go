package index

import (
	"context"
	"fmt"
)

const relayToday = `(NOW() AT TIME ZONE 'UTC')::date`

const relayMonthStart = `date_trunc('month', NOW() AT TIME ZONE 'UTC')::date`

// AddRelayUsage adds bytes a user moved through the server to today's (UTC)
// row: up for a relay chunk upload, down for a chunk served by the API.
func (db *DB) AddRelayUsage(ctx context.Context, userID string, up, down int64) error {
	if up <= 0 && down <= 0 {
		return nil
	}
	_, err := db.pool.Exec(ctx,
		`INSERT INTO relay_usage (user_id, day, up_bytes, down_bytes) VALUES ($1, `+relayToday+`, $2, $3)
		 ON CONFLICT (user_id, day) DO UPDATE
		   SET up_bytes = relay_usage.up_bytes + EXCLUDED.up_bytes,
		       down_bytes = relay_usage.down_bytes + EXCLUDED.down_bytes`,
		userID, max(up, 0), max(down, 0))
	if err != nil {
		return fmt.Errorf("add relay usage: %w", err)
	}
	return nil
}

// RelayMonthBytes returns the bytes a user moved through the server in the
// current UTC calendar month, uploads and downloads together.
func (db *DB) RelayMonthBytes(ctx context.Context, userID string) (int64, error) {
	var n int64
	err := db.pool.QueryRow(ctx,
		`SELECT COALESCE(SUM(up_bytes + down_bytes), 0)::bigint FROM relay_usage
		  WHERE user_id = $1 AND day >= `+relayMonthStart, userID).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("relay month bytes: %w", err)
	}
	return n, nil
}
