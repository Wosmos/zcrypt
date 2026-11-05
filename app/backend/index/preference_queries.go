package index

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/zcrypt/zcrypt/types"
)

// AccountPreferenceDevice is the device_id of the account-wide theme row.
const AccountPreferenceDevice = "*"

// ThemeValues is the look a preference row stores.
type ThemeValues struct {
	ColorTheme  string
	Mode        string
	CustomTheme *string
}

type preferenceRow struct {
	pref       types.DevicePreference
	useAccount bool
}

func scanPreferenceRows(rows pgx.Rows) (device, account *preferenceRow, err error) {
	defer rows.Close()
	for rows.Next() {
		row := &preferenceRow{}
		if err := rows.Scan(&row.pref.DeviceID, &row.pref.ColorTheme, &row.pref.Mode, &row.pref.CustomTheme, &row.useAccount, &row.pref.UpdatedAt); err != nil {
			return nil, nil, fmt.Errorf("scan preference: %w", err)
		}
		if row.pref.DeviceID == AccountPreferenceDevice {
			account = row
		} else {
			device = row
		}
	}
	if err := rows.Err(); err != nil {
		return nil, nil, fmt.Errorf("iterate preferences: %w", err)
	}
	return device, account, nil
}

type queryer interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// resolvePreference picks what a device should show: the account theme when the
// device follows it and one exists, else the device's own row, else defaults.
func resolvePreference(ctx context.Context, q queryer, userID, deviceID string) (*types.DevicePreference, error) {
	rows, err := q.Query(ctx, `
		SELECT device_id, color_theme, mode, custom_theme, use_account, updated_at
		FROM device_preferences
		WHERE user_id = $1 AND device_id IN ($2, $3)`,
		userID, deviceID, AccountPreferenceDevice,
	)
	if err != nil {
		return nil, fmt.Errorf("load preferences: %w", err)
	}
	device, account, err := scanPreferenceRows(rows)
	if err != nil {
		return nil, err
	}

	sync := device == nil || device.useAccount
	source := device
	if sync && account != nil {
		source = account
	}
	pref := &types.DevicePreference{ColorTheme: "default", Mode: "system"}
	if source != nil {
		*pref = source.pref
		pref.Saved = true
	}
	pref.DeviceID = deviceID
	pref.Sync = sync
	return pref, nil
}

// GetDevicePreference returns the look this device should show for the user,
// with Sync saying whether it follows the account-wide theme. Saved is false
// when nothing has been stored yet and the fields are defaults.
func (db *DB) GetDevicePreference(ctx context.Context, userID, deviceID string) (*types.DevicePreference, error) {
	return resolvePreference(ctx, db.pool, userID, deviceID)
}

// SaveDevicePreference stores a device's look and whether it follows the
// account theme. A following device also writes the account theme, unless
// join is set and the account already has one, in which case the device adopts
// it. Returns what the device should now show and whether the account theme
// changed, so other devices can be told.
func (db *DB) SaveDevicePreference(ctx context.Context, userID, deviceID string, v ThemeValues, sync, join bool) (*types.DevicePreference, bool, error) {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return nil, false, fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op after commit

	upsert := func(device string, useAccount, keepExisting bool) (bool, error) {
		conflict := `DO UPDATE SET color_theme = EXCLUDED.color_theme, mode = EXCLUDED.mode,
			custom_theme = COALESCE($5, device_preferences.custom_theme),
			use_account = EXCLUDED.use_account, updated_at = NOW()`
		if keepExisting {
			conflict = `DO NOTHING`
		}
		tag, err := tx.Exec(ctx, `
			INSERT INTO device_preferences (user_id, device_id, color_theme, mode, custom_theme, use_account)
			VALUES ($1, $2, $3, $4, COALESCE($5, ''), $6)
			ON CONFLICT (user_id, device_id) `+conflict,
			userID, device, v.ColorTheme, v.Mode, v.CustomTheme, useAccount,
		)
		if err != nil {
			return false, fmt.Errorf("save preference: %w", err)
		}
		return tag.RowsAffected() > 0, nil
	}

	if _, err := upsert(deviceID, sync, false); err != nil {
		return nil, false, err
	}
	accountChanged := false
	if sync {
		if accountChanged, err = upsert(AccountPreferenceDevice, true, join); err != nil {
			return nil, false, err
		}
	}
	pref, err := resolvePreference(ctx, tx, userID, deviceID)
	if err != nil {
		return nil, false, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, false, fmt.Errorf("commit: %w", err)
	}
	return pref, accountChanged, nil
}
