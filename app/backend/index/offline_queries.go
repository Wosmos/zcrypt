package index

import (
	"context"

	"github.com/zcrypt/zcrypt/types"
)

// PinFileOffline pins a file for offline access on a device.
func (db *DB) PinFileOffline(ctx context.Context, userID, fileID, deviceID string) (*types.OfflinePin, error) {
	pin := &types.OfflinePin{}
	err := db.pool.QueryRow(ctx, `
		INSERT INTO offline_pins (user_id, file_id, device_id)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id, file_id, device_id) DO UPDATE SET pinned_at = NOW()
		RETURNING id, user_id, file_id, device_id, pinned_at`,
		userID, fileID, deviceID,
	).Scan(&pin.ID, &pin.UserID, &pin.FileID, &pin.DeviceID, &pin.PinnedAt)
	return pin, err
}

// UnpinFileOffline removes an offline pin.
func (db *DB) UnpinFileOffline(ctx context.Context, userID, fileID, deviceID string) error {
	_, err := db.pool.Exec(ctx, `
		DELETE FROM offline_pins WHERE user_id = $1 AND file_id = $2 AND device_id = $3`,
		userID, fileID, deviceID)
	return err
}

// ListOfflinePins returns all pinned files for a user+device.
func (db *DB) ListOfflinePins(ctx context.Context, userID, deviceID string) ([]types.OfflinePin, error) {
	rows, err := db.pool.Query(ctx, `
		SELECT id, user_id, file_id, device_id, pinned_at
		FROM offline_pins WHERE user_id = $1 AND ($2 = '' OR device_id = $2)
		ORDER BY pinned_at DESC`, userID, deviceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var pins []types.OfflinePin
	for rows.Next() {
		var p types.OfflinePin
		if err := rows.Scan(&p.ID, &p.UserID, &p.FileID, &p.DeviceID, &p.PinnedAt); err != nil {
			return nil, err
		}
		pins = append(pins, p)
	}
	return pins, nil
}

// IsFilePinned checks if a file is pinned for offline access.
func (db *DB) IsFilePinned(ctx context.Context, userID, fileID, deviceID string) (bool, error) {
	var exists bool
	err := db.pool.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM offline_pins WHERE user_id = $1 AND file_id = $2 AND device_id = $3)`,
		userID, fileID, deviceID).Scan(&exists)
	return exists, err
}
