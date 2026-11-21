package index

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/zcrypt/zcrypt/types"
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

// RelayTotals is a user's transfer-allowance position: bytes used today and
// this month (UTC), and bytes promised to in-flight server transfers.
type RelayTotals struct {
	Day      int64
	Month    int64
	Reserved int64
}

// RelayLimits are the windows a transfer is checked against; 0 = no cap.
type RelayLimits struct {
	Day   int64
	Month int64
}

// ErrRelayWindowExceeded is returned when a transfer would not fit a window.
type ErrRelayWindowExceeded struct {
	Daily bool
	Used  int64
	Limit int64
}

func (e *ErrRelayWindowExceeded) Error() string {
	if e.Daily {
		return "daily transfer allowance exceeded"
	}
	return "monthly transfer allowance exceeded"
}

// Check reports the first window that need more bytes would overflow, the
// daily one first. Reserved bytes count against both windows.
func (t RelayTotals) Check(l RelayLimits, need int64) *ErrRelayWindowExceeded {
	if l.Day > 0 && t.Day+t.Reserved+need > l.Day {
		return &ErrRelayWindowExceeded{Daily: true, Used: t.Day + t.Reserved, Limit: l.Day}
	}
	if l.Month > 0 && t.Month+t.Reserved+need > l.Month {
		return &ErrRelayWindowExceeded{Used: t.Month + t.Reserved, Limit: l.Month}
	}
	return nil
}

type relayQuerier interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// relayReserveIdle is how long an upload session's reservation holds allowance
// after it last stored a chunk.
const relayReserveIdle = `INTERVAL '24 hours'`

const relayTotalsSQL = `
SELECT
  COALESCE((SELECT SUM(up_bytes + down_bytes) FROM relay_usage WHERE user_id = $1 AND day = ` + relayToday + `), 0)::bigint,
  COALESCE((SELECT SUM(up_bytes + down_bytes) FROM relay_usage WHERE user_id = $1 AND day >= ` + relayMonthStart + `), 0)::bigint,
  (COALESCE((SELECT SUM(GREATEST(us.relay_reserve - COALESCE(c.recv, 0), 0))
               FROM upload_sessions us
               LEFT JOIN LATERAL (SELECT SUM(size) AS recv FROM chunks WHERE file_id = us.file_id) c ON TRUE
              WHERE us.user_id = $1 AND us.status = 'active' AND us.expires_at > NOW() AND us.relay_reserve > 0
                AND us.last_active_at > NOW() - ` + relayReserveIdle + `), 0)
 + COALESCE((SELECT SUM(GREATEST(st.original_size - COALESCE(c.recv, 0), 0))
               FROM send_transfers st
               LEFT JOIN LATERAL (SELECT SUM(size) AS recv FROM send_chunks WHERE transfer_id = st.id) c ON TRUE
              WHERE st.user_id = $1 AND st.status = 'uploading' AND st.expires_at > NOW()), 0))::bigint`

func relayTotals(ctx context.Context, q relayQuerier, userID string) (RelayTotals, error) {
	var t RelayTotals
	if err := q.QueryRow(ctx, relayTotalsSQL, userID).Scan(&t.Day, &t.Month, &t.Reserved); err != nil {
		return t, fmt.Errorf("relay totals: %w", err)
	}
	return t, nil
}

// RelayTotals returns the user's day, month and reserved bytes in one query.
func (db *DB) RelayTotals(ctx context.Context, userID string) (RelayTotals, error) {
	return relayTotals(ctx, db.pool, userID)
}

// lockRelay serialises allowance checks and reservations of one user.
func lockRelay(ctx context.Context, tx pgx.Tx, userID string) error {
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended('relay:' || $1, 0))`, userID); err != nil {
		return fmt.Errorf("lock relay: %w", err)
	}
	return nil
}

// CreateRelayUploadSession checks the file's declared size against both windows
// and creates the session, reserving that size, in one locked transaction, so
// parallel inits cannot each pass against the same headroom. It returns
// *ErrRelayWindowExceeded when the file does not fit.
func (db *DB) CreateRelayUploadSession(ctx context.Context, s *types.UploadSession, limits RelayLimits) (string, error) {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if err := lockRelay(ctx, tx, s.UserID); err != nil {
		return "", err
	}
	t, err := relayTotals(ctx, tx, s.UserID)
	if err != nil {
		return "", err
	}
	if exceeded := t.Check(limits, s.OriginalSize); exceeded != nil {
		return "", exceeded
	}
	s.RelayReserve = s.OriginalSize
	id, err := insertUploadSession(ctx, tx, s)
	if err != nil {
		return "", err
	}
	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("commit: %w", err)
	}
	return id, nil
}
