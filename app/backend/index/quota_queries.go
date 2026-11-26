package index

import (
	"context"
	"fmt"

	"github.com/zcrypt/zcrypt/types"
)

// QuotaSnapshot is everything GET /api/quota reads from the database.
type QuotaSnapshot struct {
	Role         types.Role
	Plan         string
	StorageQuota *int64
	UsedBytes    int64
	HasPersonal  bool
	Relay        RelayTotals
}

const quotaUsedFiles = `(SELECT COALESCE(SUM(original_size), 0) FROM files WHERE user_id = $1 AND status IN ('complete', 'uploading'))::bigint`

const quotaUsedDecoy = `(SELECT COALESCE(SUM(size), 0) FROM decoy_files WHERE user_id = $1)::bigint`

func quotaSnapshotSQL(used string) string {
	return `SELECT u.role, u.plan, u.storage_quota_bytes, ` + used + `,
  EXISTS(SELECT 1 FROM platform_tokens WHERE user_id = $1 AND is_global = FALSE),` + relayTotalsCols + `
FROM users u WHERE u.id = $1`
}

var (
	quotaSnapshotFilesSQL = quotaSnapshotSQL(quotaUsedFiles)
	quotaSnapshotDecoySQL = quotaSnapshotSQL(quotaUsedDecoy)
)

// QuotaSnapshot reads the user's quota inputs in one round trip. decoy counts
// the decoy vault's files instead of the real ones.
func (db *DB) QuotaSnapshot(ctx context.Context, userID string, decoy bool) (QuotaSnapshot, error) {
	query := quotaSnapshotFilesSQL
	if decoy {
		query = quotaSnapshotDecoySQL
	}
	var q QuotaSnapshot
	err := db.pool.QueryRow(ctx, query, userID).Scan(
		&q.Role, &q.Plan, &q.StorageQuota, &q.UsedBytes, &q.HasPersonal,
		&q.Relay.Day, &q.Relay.Month, &q.Relay.Reserved)
	if err != nil {
		return q, fmt.Errorf("quota snapshot: %w", err)
	}
	return q, nil
}
