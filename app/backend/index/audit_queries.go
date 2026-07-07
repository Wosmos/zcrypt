package index

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/zcrypt/zcrypt/types"
)

// auditChainLockKey is the advisory-lock key that serializes audit inserts so
// the hash chain stays linear under concurrent (async) audit writes.
const auditChainLockKey = 0x2AC17_A0D1 // "audit log" mnemonic, arbitrary constant

// canonicalizeMeta produces a stable JSON string for hashing. JSONB is not
// byte-stable across a store/read round-trip (Postgres reorders keys and drops
// whitespace), so both the insert and verify paths parse the metadata and
// re-marshal it — Go sorts map keys and normalizes numbers to float64, yielding
// identical bytes for identical content on both sides.
func canonicalizeMeta(b []byte) string {
	if len(b) == 0 {
		return "{}"
	}
	var v interface{}
	if err := json.Unmarshal(b, &v); err != nil {
		return string(b) // unparseable (shouldn't happen for JSONB) — hash raw
	}
	out, err := json.Marshal(v)
	if err != nil {
		return string(b)
	}
	return string(out)
}

// computeAuditHash derives an event's chain hash from the previous hash and the
// event's immutable fields. Any change to a stored field (or a deleted row that
// shifts the chain) makes a later recomputation diverge — that's the tamper
// evidence. The field order and separators are the canonical form; changing them
// would invalidate every existing chain, so keep them stable.
func computeAuditHash(prevHash string, seq int64, e *types.AuditEvent, metaJSON string) string {
	uid := ""
	if e.UserID != nil {
		uid = *e.UserID
	}
	h := sha256.New()
	fmt.Fprintf(h, "%s\n%d\n%s\n%s\n%s\n%s\n%s\n%s",
		prevHash, seq, e.ID, uid, e.EventType, e.IP, e.UserAgent, metaJSON)
	// created_at is bound into the row but intentionally excluded from the hash:
	// it is set by the DB default and not known client-side at hash time. The
	// seq + chained prev_hash already fix ordering and immutability.
	return hex.EncodeToString(h.Sum(nil))
}

// InsertAuditEvent appends a tamper-evident audit event. It serializes on an
// advisory lock, reads the current chain head, and links this event to it, so
// the hash chain is linear even under concurrent writers.
func (db *DB) InsertAuditEvent(ctx context.Context, e *types.AuditEvent) error {
	meta, err := json.Marshal(e.Metadata)
	if err != nil {
		meta = []byte("{}")
	}

	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin audit tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Serialize all audit inserts so seq and the hash chain advance atomically.
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock($1)`, auditChainLockKey); err != nil {
		return fmt.Errorf("lock audit chain: %w", err)
	}

	// Read the current chain head (highest seq). An empty table → genesis
	// (prev_hash "", seq 0); any other error is real and aborts the insert.
	var prevHash string
	var prevSeq int64
	err = tx.QueryRow(ctx,
		`SELECT hash, seq FROM audit_events ORDER BY seq DESC NULLS LAST LIMIT 1`,
	).Scan(&prevHash, &prevSeq)
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("read audit chain head: %w", err)
		}
		prevHash, prevSeq = "", 0
	}

	seq := prevSeq + 1
	// Hash over the canonicalized metadata (not the raw marshal) so it matches
	// what VerifyAuditChain recomputes from the stored JSONB.
	hash := computeAuditHash(prevHash, seq, e, canonicalizeMeta(meta))

	if _, err := tx.Exec(ctx,
		`INSERT INTO audit_events (id, user_id, event_type, ip, user_agent, metadata, seq, prev_hash, hash)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		e.ID, e.UserID, e.EventType, e.IP, e.UserAgent, meta, seq, prevHash, hash,
	); err != nil {
		return fmt.Errorf("insert audit event: %w", err)
	}
	return tx.Commit(ctx)
}

// AuditChainResult reports the outcome of a tamper-evidence verification sweep.
type AuditChainResult struct {
	Checked    int    `json:"checked"`     // chained (hash<>'') events verified
	Valid      bool   `json:"valid"`       // true if the whole chain is intact
	BreakSeq   int64  `json:"break_seq"`   // seq where the chain first broke (0 if valid)
	BreakID    string `json:"break_id"`    // event id at the break (empty if valid)
	BreakError string `json:"break_error"` // human description of the break
}

// VerifyAuditChain recomputes the hash chain over all chained events (those with
// a non-empty hash — pre-chain legacy rows are skipped) in seq order and reports
// the first divergence. A break means a row was edited, deleted, or reordered.
func (db *DB) VerifyAuditChain(ctx context.Context) (*AuditChainResult, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT id, user_id, event_type, ip, user_agent, metadata, seq, prev_hash, hash
		 FROM audit_events WHERE hash <> '' ORDER BY seq ASC`)
	if err != nil {
		return nil, fmt.Errorf("read audit chain: %w", err)
	}
	defer rows.Close()

	res := &AuditChainResult{Valid: true}
	var expectedPrev string
	first := true
	for rows.Next() {
		var e types.AuditEvent
		var seq int64
		var storedPrev, storedHash string
		var metaBytes []byte
		if err := rows.Scan(&e.ID, &e.UserID, &e.EventType, &e.IP, &e.UserAgent, &metaBytes, &seq, &storedPrev, &storedHash); err != nil {
			return nil, fmt.Errorf("scan audit chain row: %w", err)
		}

		// Re-canonicalize the metadata the same way InsertAuditEvent did: JSONB is
		// not byte-stable (Postgres reorders keys / drops whitespace), so we must
		// hash a parsed-then-remarshaled form. Go marshals map keys sorted, so both
		// sides produce identical bytes for the same content.
		metaJSON := canonicalizeMeta(metaBytes)

		// Each event's prev_hash must equal the previous chained event's hash.
		if !first && storedPrev != expectedPrev {
			res.Valid, res.BreakSeq, res.BreakID = false, seq, e.ID
			res.BreakError = "prev_hash does not match the previous event's hash (a row was deleted, reordered, or edited)"
			return res, nil
		}
		// And its stored hash must match a recomputation of its own fields.
		want := computeAuditHash(storedPrev, seq, &e, metaJSON)
		if want != storedHash {
			res.Valid, res.BreakSeq, res.BreakID = false, seq, e.ID
			res.BreakError = "hash does not match the event's contents (the row was tampered with)"
			return res, nil
		}
		expectedPrev = storedHash
		first = false
		res.Checked++
	}
	return res, rows.Err()
}

// ListAuditEvents returns paginated audit events with optional filters.
func (db *DB) ListAuditEvents(ctx context.Context, limit, offset int, eventType, userID string) ([]types.AuditEvent, int, error) {
	// Build count query
	countQuery := `SELECT COUNT(*) FROM audit_events WHERE 1=1`
	query := `SELECT id, user_id, event_type, ip, user_agent, metadata, created_at
	          FROM audit_events WHERE 1=1`
	var args []interface{}
	argIdx := 1

	if eventType != "" {
		filter := fmt.Sprintf(` AND event_type = $%d`, argIdx)
		countQuery += filter
		query += filter
		args = append(args, eventType)
		argIdx++
	}
	if userID != "" {
		filter := fmt.Sprintf(` AND user_id = $%d`, argIdx)
		countQuery += filter
		query += filter
		args = append(args, userID)
		argIdx++
	}

	var total int
	if err := db.pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count audit events: %w", err)
	}

	query += fmt.Sprintf(` ORDER BY created_at DESC LIMIT $%d OFFSET $%d`, argIdx, argIdx+1)
	args = append(args, limit, offset)

	rows, err := db.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list audit events: %w", err)
	}
	defer rows.Close()

	var events []types.AuditEvent
	for rows.Next() {
		var e types.AuditEvent
		var metaBytes []byte
		if err := rows.Scan(&e.ID, &e.UserID, &e.EventType, &e.IP, &e.UserAgent, &metaBytes, &e.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan audit event: %w", err)
		}
		if metaBytes != nil {
			json.Unmarshal(metaBytes, &e.Metadata)
		}
		if e.Metadata == nil {
			e.Metadata = map[string]interface{}{}
		}
		events = append(events, e)
	}
	return events, total, rows.Err()
}

// ListUserAuditEvents returns a user's own audit events (most recent first).
func (db *DB) ListUserAuditEvents(ctx context.Context, userID string, limit int) ([]types.AuditEvent, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT id, user_id, event_type, ip, user_agent, metadata, created_at
		 FROM audit_events WHERE user_id = $1
		 ORDER BY created_at DESC LIMIT $2`,
		userID, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("list user audit events: %w", err)
	}
	defer rows.Close()

	var events []types.AuditEvent
	for rows.Next() {
		var e types.AuditEvent
		var metaBytes []byte
		if err := rows.Scan(&e.ID, &e.UserID, &e.EventType, &e.IP, &e.UserAgent, &metaBytes, &e.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan audit event: %w", err)
		}
		if metaBytes != nil {
			json.Unmarshal(metaBytes, &e.Metadata)
		}
		if e.Metadata == nil {
			e.Metadata = map[string]interface{}{}
		}
		events = append(events, e)
	}
	return events, rows.Err()
}
