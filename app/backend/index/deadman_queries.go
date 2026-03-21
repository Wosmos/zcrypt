package index

import (
	"context"

	"github.com/zcrypt/zcrypt/types"
)

// UpsertDeadManSwitch creates or updates a user's dead man's switch.
func (db *DB) UpsertDeadManSwitch(ctx context.Context, dms *types.DeadManSwitch) error {
	_, err := db.pool.Exec(ctx,
		`INSERT INTO dead_man_switches (id, user_id, contact_email, contact_name, timeout_days, message, include_files, enabled, last_checkin, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		 ON CONFLICT (user_id) DO UPDATE SET
		   contact_email = $3, contact_name = $4, timeout_days = $5,
		   message = $6, include_files = $7, enabled = $8`,
		dms.ID, dms.UserID, dms.ContactEmail, dms.ContactName, dms.TimeoutDays,
		dms.Message, dms.IncludeFiles, dms.Enabled, dms.LastCheckin, dms.CreatedAt)
	return err
}

// GetDeadManSwitch fetches a user's dead man's switch config.
func (db *DB) GetDeadManSwitch(ctx context.Context, userID string) (*types.DeadManSwitch, error) {
	var dms types.DeadManSwitch
	err := db.pool.QueryRow(ctx,
		`SELECT id, user_id, contact_email, contact_name, timeout_days, message, include_files, enabled, last_checkin, triggered, triggered_at, created_at
		 FROM dead_man_switches WHERE user_id = $1`, userID).
		Scan(&dms.ID, &dms.UserID, &dms.ContactEmail, &dms.ContactName, &dms.TimeoutDays,
			&dms.Message, &dms.IncludeFiles, &dms.Enabled, &dms.LastCheckin, &dms.Triggered, &dms.TriggeredAt, &dms.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &dms, nil
}

// CheckinDeadManSwitch resets the timer by updating last_checkin.
func (db *DB) CheckinDeadManSwitch(ctx context.Context, userID string) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE dead_man_switches SET last_checkin = NOW() WHERE user_id = $1`, userID)
	return err
}

// DeleteDeadManSwitch removes a user's dead man's switch.
func (db *DB) DeleteDeadManSwitch(ctx context.Context, userID string) error {
	_, err := db.pool.Exec(ctx,
		`DELETE FROM dead_man_switches WHERE user_id = $1`, userID)
	return err
}

// GetExpiredDeadManSwitches returns switches that have timed out and haven't been triggered.
func (db *DB) GetExpiredDeadManSwitches(ctx context.Context) ([]types.DeadManSwitch, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT id, user_id, contact_email, contact_name, timeout_days, message, include_files, enabled, last_checkin, triggered, triggered_at, created_at
		 FROM dead_man_switches
		 WHERE enabled = TRUE
		   AND triggered = FALSE
		   AND last_checkin + (timeout_days || ' days')::interval < NOW()`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var switches []types.DeadManSwitch
	for rows.Next() {
		var dms types.DeadManSwitch
		if err := rows.Scan(&dms.ID, &dms.UserID, &dms.ContactEmail, &dms.ContactName, &dms.TimeoutDays,
			&dms.Message, &dms.IncludeFiles, &dms.Enabled, &dms.LastCheckin, &dms.Triggered, &dms.TriggeredAt, &dms.CreatedAt); err != nil {
			return nil, err
		}
		switches = append(switches, dms)
	}
	return switches, nil
}

// MarkDeadManSwitchTriggered marks a switch as triggered.
func (db *DB) MarkDeadManSwitchTriggered(ctx context.Context, id string) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE dead_man_switches SET triggered = TRUE, triggered_at = NOW() WHERE id = $1`, id)
	return err
}
