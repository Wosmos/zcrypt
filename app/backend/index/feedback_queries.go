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

// FeedbackSorts maps the feedback list's sort keys to SQL.
var FeedbackSorts = map[string]string{"created_at": "f.created_at", "rating": "f.rating"}

// ListFeedback returns one page of feedback with user info for admins, the
// number matching the search, and the average rating across all of them.
func (db *DB) ListFeedback(ctx context.Context, page ListPage) ([]types.FeedbackWithUser, int, float64, error) {
	w := &whereBuilder{}
	if page.Search != "" {
		p := w.arg(likePattern(page.Search))
		w.add("(f.message ILIKE " + p + " OR u.email ILIKE " + p + " OR u.username ILIKE " + p + ")")
	}
	from := ` FROM feedback f JOIN users u ON f.user_id = u.id` + w.sql()
	var total int
	var avg float64
	if err := db.pool.QueryRow(ctx, `SELECT COUNT(*), COALESCE(AVG(f.rating), 0)`+from, w.args...).Scan(&total, &avg); err != nil {
		return nil, 0, 0, fmt.Errorf("count feedback: %w", err)
	}
	expr, ok := FeedbackSorts[page.Sort]
	if !ok {
		expr = FeedbackSorts["created_at"]
	}
	rows, err := db.pool.Query(ctx,
		`SELECT f.id, f.user_id, f.rating, f.message, f.context, f.created_at, u.email, u.username`+from+
			orderSQL(expr, page.Desc, "f.id")+` LIMIT `+w.arg(page.Limit)+` OFFSET `+w.arg(page.Offset),
		w.args...,
	)
	if err != nil {
		return nil, 0, 0, fmt.Errorf("list feedback: %w", err)
	}
	defer rows.Close()

	items := []types.FeedbackWithUser{}
	for rows.Next() {
		var fb types.FeedbackWithUser
		if err := rows.Scan(&fb.ID, &fb.UserID, &fb.Rating, &fb.Message,
			&fb.Context, &fb.CreatedAt, &fb.Email, &fb.Username); err != nil {
			return nil, 0, 0, fmt.Errorf("scan feedback: %w", err)
		}
		items = append(items, fb)
	}
	return items, total, avg, rows.Err()
}
