package index

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/zcrypt/zcrypt/types"
)

// InsertAuditEvent inserts a new audit event.
func (db *DB) InsertAuditEvent(ctx context.Context, e *types.AuditEvent) error {
	meta, err := json.Marshal(e.Metadata)
	if err != nil {
		meta = []byte("{}")
	}
	_, err = db.pool.Exec(ctx,
		`INSERT INTO audit_events (id, user_id, event_type, ip, user_agent, metadata)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		e.ID, e.UserID, e.EventType, e.IP, e.UserAgent, meta,
	)
	if err != nil {
		return fmt.Errorf("insert audit event: %w", err)
	}
	return nil
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
