package index

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/zcrypt/zcrypt/types"
)

// UpsertReview stores the user's single review. Every save goes back to
// pending so an edited quote is moderated again.
func (db *DB) UpsertReview(ctx context.Context, r *types.Review) error {
	err := db.pool.QueryRow(ctx,
		`INSERT INTO reviews (user_id, rating, quote, display_name, public_ok)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (user_id) DO UPDATE SET
		   rating = EXCLUDED.rating, quote = EXCLUDED.quote,
		   display_name = EXCLUDED.display_name, public_ok = EXCLUDED.public_ok,
		   status = 'pending', updated_at = NOW()
		 RETURNING id, status, created_at, updated_at`,
		r.UserID, r.Rating, r.Quote, r.DisplayName, r.PublicOK,
	).Scan(&r.ID, &r.Status, &r.CreatedAt, &r.UpdatedAt)
	if err != nil {
		return fmt.Errorf("upsert review: %w", err)
	}
	return nil
}

// GetReviewByUser returns the user's review, or nil when they have none.
func (db *DB) GetReviewByUser(ctx context.Context, userID string) (*types.Review, error) {
	var r types.Review
	err := db.pool.QueryRow(ctx,
		`SELECT id, user_id, rating, quote, display_name, public_ok, status, created_at, updated_at
		 FROM reviews WHERE user_id = $1`, userID,
	).Scan(&r.ID, &r.UserID, &r.Rating, &r.Quote, &r.DisplayName, &r.PublicOK, &r.Status, &r.CreatedAt, &r.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get review: %w", err)
	}
	return &r, nil
}

// ListPublicReviews returns approved reviews whose author consented to being
// shown, newest first.
func (db *DB) ListPublicReviews(ctx context.Context, limit int) ([]types.PublicReview, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT display_name, rating, quote FROM reviews
		 WHERE status = 'approved' AND public_ok
		 ORDER BY updated_at DESC LIMIT $1`, limit)
	if err != nil {
		return nil, fmt.Errorf("list public reviews: %w", err)
	}
	defer rows.Close()

	items := []types.PublicReview{}
	for rows.Next() {
		var p types.PublicReview
		if err := rows.Scan(&p.DisplayName, &p.Rating, &p.Quote); err != nil {
			return nil, fmt.Errorf("scan public review: %w", err)
		}
		items = append(items, p)
	}
	return items, rows.Err()
}

// ListReviews returns paginated reviews for moderation, newest first. An empty
// status returns every status.
func (db *DB) ListReviews(ctx context.Context, status string, limit, offset int) ([]types.Review, int, error) {
	var total int
	if err := db.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM reviews WHERE ($1 = '' OR status = $1)`, status,
	).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count reviews: %w", err)
	}

	rows, err := db.pool.Query(ctx,
		`SELECT r.id, r.user_id, COALESCE(u.email, ''), COALESCE(u.username, ''),
		        r.rating, r.quote, r.display_name, r.public_ok, r.status, r.created_at, r.updated_at
		 FROM reviews r LEFT JOIN users u ON r.user_id = u.id
		 WHERE ($1 = '' OR r.status = $1)
		 ORDER BY r.updated_at DESC LIMIT $2 OFFSET $3`,
		status, limit, offset,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("list reviews: %w", err)
	}
	defer rows.Close()

	items := []types.Review{}
	for rows.Next() {
		var r types.Review
		if err := rows.Scan(&r.ID, &r.UserID, &r.Email, &r.Username, &r.Rating, &r.Quote,
			&r.DisplayName, &r.PublicOK, &r.Status, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan review: %w", err)
		}
		items = append(items, r)
	}
	return items, total, rows.Err()
}

// UpdateReviewStatus sets a review's moderation status. It returns false when
// the id matches no review.
func (db *DB) UpdateReviewStatus(ctx context.Context, id, status string) (bool, error) {
	tag, err := db.pool.Exec(ctx, `UPDATE reviews SET status = $2 WHERE id = $1`, id, status)
	if err != nil {
		return false, fmt.Errorf("update review: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}
