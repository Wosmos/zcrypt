package index

import (
	"context"
	"time"

	"github.com/zcrypt/zcrypt/types"
)

// InsertClipboardItem stores an encrypted clipboard entry.
func (db *DB) InsertClipboardItem(ctx context.Context, item *types.ClipboardItem) error {
	_, err := db.pool.Exec(ctx,
		`INSERT INTO clipboard_items (id, user_id, content_type, encrypted_blob, content_size, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		item.ID, item.UserID, item.ContentType, item.EncryptedBlob, item.ContentSize, item.CreatedAt)
	return err
}

// ListClipboardItems returns the most recent clipboard items for a user.
func (db *DB) ListClipboardItems(ctx context.Context, userID string, limit int) ([]types.ClipboardItem, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	rows, err := db.pool.Query(ctx,
		`SELECT id, user_id, content_type, content_size, created_at
		 FROM clipboard_items
		 WHERE user_id = $1
		 ORDER BY created_at DESC
		 LIMIT $2`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []types.ClipboardItem
	for rows.Next() {
		var item types.ClipboardItem
		if err := rows.Scan(&item.ID, &item.UserID, &item.ContentType, &item.ContentSize, &item.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, nil
}

// GetClipboardItem fetches a single clipboard item by ID.
func (db *DB) GetClipboardItem(ctx context.Context, id, userID string) (*types.ClipboardItem, error) {
	var item types.ClipboardItem
	err := db.pool.QueryRow(ctx,
		`SELECT id, user_id, content_type, encrypted_blob, content_size, created_at
		 FROM clipboard_items
		 WHERE id = $1 AND user_id = $2`, id, userID).
		Scan(&item.ID, &item.UserID, &item.ContentType, &item.EncryptedBlob, &item.ContentSize, &item.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &item, nil
}

// DeleteClipboardItem removes a clipboard item.
func (db *DB) DeleteClipboardItem(ctx context.Context, id, userID string) error {
	_, err := db.pool.Exec(ctx,
		`DELETE FROM clipboard_items WHERE id = $1 AND user_id = $2`, id, userID)
	return err
}

// CleanupOldClipboardItems deletes clipboard items older than 24 hours.
func (db *DB) CleanupOldClipboardItems(ctx context.Context) (int, error) {
	cutoff := time.Now().Add(-24 * time.Hour)
	tag, err := db.pool.Exec(ctx,
		`DELETE FROM clipboard_items WHERE created_at < $1`, cutoff)
	if err != nil {
		return 0, err
	}
	return int(tag.RowsAffected()), nil
}

// PruneUserClipboard keeps only the latest N items per user, deleting older ones.
func (db *DB) PruneUserClipboard(ctx context.Context, userID string, keep int) error {
	_, err := db.pool.Exec(ctx,
		`DELETE FROM clipboard_items
		 WHERE user_id = $1
		   AND id NOT IN (
		     SELECT id FROM clipboard_items
		     WHERE user_id = $1
		     ORDER BY created_at DESC
		     LIMIT $2
		   )`, userID, keep)
	return err
}
