package index

import (
	"context"
	"fmt"

	"github.com/zcrypt/zcrypt/types"
)

// InsertFeedback stores new user feedback.
func (db *DB) InsertFeedback(ctx context.Context, f *types.Feedback) error {
	_, err := db.pool.Exec(ctx,
		`INSERT INTO feedback (id, user_id, rating, message, context) VALUES ($1, $2, $3, $4, $5)`,
		f.ID, f.UserID, f.Rating, f.Message, f.Context,
	)
	if err != nil {
		return fmt.Errorf("insert feedback: %w", err)
	}
	return nil
}

// HasUserSubmittedFeedback checks if a user has already submitted feedback.
func (db *DB) HasUserSubmittedFeedback(ctx context.Context, userID string) (bool, error) {
	var count int
	err := db.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM feedback WHERE user_id = $1`, userID,
	).Scan(&count)
	return count > 0, err
}

// ListFeedback returns paginated feedback with user info for admin.
func (db *DB) ListFeedback(ctx context.Context, limit, offset int) ([]types.FeedbackWithUser, int, error) {
	var total int
	if err := db.pool.QueryRow(ctx, `SELECT COUNT(*) FROM feedback`).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count feedback: %w", err)
	}

	rows, err := db.pool.Query(ctx,
		`SELECT f.id, f.user_id, f.rating, f.message, f.context, f.created_at,
		        u.email, u.username
		 FROM feedback f JOIN users u ON f.user_id = u.id
		 ORDER BY f.created_at DESC LIMIT $1 OFFSET $2`,
		limit, offset,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("list feedback: %w", err)
	}
	defer rows.Close()

	var items []types.FeedbackWithUser
	for rows.Next() {
		var fb types.FeedbackWithUser
		if err := rows.Scan(&fb.ID, &fb.UserID, &fb.Rating, &fb.Message,
			&fb.Context, &fb.CreatedAt, &fb.Email, &fb.Username); err != nil {
			return nil, 0, fmt.Errorf("scan feedback: %w", err)
		}
		items = append(items, fb)
	}
	return items, total, rows.Err()
}
