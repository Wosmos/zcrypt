package index

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/zcrypt/zcrypt/types"
)

// GetDevicePreference returns the stored UI preference for a user+device, or
// sensible defaults (default theme / system mode) when none has been saved.
func (db *DB) GetDevicePreference(ctx context.Context, userID, deviceID string) (*types.DevicePreference, error) {
	pref := &types.DevicePreference{DeviceID: deviceID, ColorTheme: "default", Mode: "system"}
	err := db.pool.QueryRow(ctx, `
		SELECT device_id, color_theme, mode, updated_at
		FROM device_preferences
		WHERE user_id = $1 AND device_id = $2`,
		userID, deviceID,
	).Scan(&pref.DeviceID, &pref.ColorTheme, &pref.Mode, &pref.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return pref, nil // defaults, Saved stays false
	}
	if err != nil {
		return nil, err
	}
	pref.Saved = true
	return pref, nil
}

// UpsertDevicePreference stores (creating or replacing) the UI preference for a
// user+device, and returns the persisted row.
func (db *DB) UpsertDevicePreference(ctx context.Context, userID, deviceID, colorTheme, mode string) (*types.DevicePreference, error) {
	pref := &types.DevicePreference{}
	err := db.pool.QueryRow(ctx, `
		INSERT INTO device_preferences (user_id, device_id, color_theme, mode)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (user_id, device_id)
		DO UPDATE SET color_theme = EXCLUDED.color_theme, mode = EXCLUDED.mode, updated_at = NOW()
		RETURNING device_id, color_theme, mode, updated_at`,
		userID, deviceID, colorTheme, mode,
	).Scan(&pref.DeviceID, &pref.ColorTheme, &pref.Mode, &pref.UpdatedAt)
	if err != nil {
		return nil, err
	}
	pref.Saved = true
	return pref, nil
}
