package index

import (
	"context"
	"fmt"
)

// PushSubscription is one browser's Web Push endpoint for a user.
type PushSubscription struct {
	ID       string
	UserID   string
	Endpoint string
	P256dh   string
	Auth     string
	Lang     string
}

// maxPushSubscriptionsPerUser bounds how many browsers one account can register,
// so a script can't make every notification fan out to thousands of endpoints.
const maxPushSubscriptionsPerUser = 20

// SavePushSubscription stores (or re-points to this user) a browser's endpoint.
// When the account is at its limit the oldest subscription makes room.
func (db *DB) SavePushSubscription(ctx context.Context, sub PushSubscription) error {
	tx, err := db.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin save push subscription: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx,
		`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, lang)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (endpoint) DO UPDATE
		   SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh,
		       auth = EXCLUDED.auth, lang = EXCLUDED.lang, created_at = NOW()`,
		sub.UserID, sub.Endpoint, sub.P256dh, sub.Auth, sub.Lang,
	); err != nil {
		return fmt.Errorf("save push subscription: %w", err)
	}
	if _, err := tx.Exec(ctx,
		`DELETE FROM push_subscriptions WHERE id IN (
		   SELECT id FROM push_subscriptions WHERE user_id = $1
		   ORDER BY created_at DESC OFFSET $2)`,
		sub.UserID, maxPushSubscriptionsPerUser,
	); err != nil {
		return fmt.Errorf("trim push subscriptions: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit push subscription: %w", err)
	}
	return nil
}

// DeletePushSubscription removes one of the user's endpoints.
func (db *DB) DeletePushSubscription(ctx context.Context, userID, endpoint string) error {
	if _, err := db.pool.Exec(ctx,
		`DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`, userID, endpoint,
	); err != nil {
		return fmt.Errorf("delete push subscription: %w", err)
	}
	return nil
}

// DeletePushEndpoint drops an endpoint the push service reported as gone.
func (db *DB) DeletePushEndpoint(ctx context.Context, endpoint string) error {
	if _, err := db.pool.Exec(ctx, `DELETE FROM push_subscriptions WHERE endpoint = $1`, endpoint); err != nil {
		return fmt.Errorf("delete push endpoint: %w", err)
	}
	return nil
}

// ListPushSubscriptions returns every endpoint registered for the user.
func (db *DB) ListPushSubscriptions(ctx context.Context, userID string) ([]PushSubscription, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT id, user_id, endpoint, p256dh, auth, lang FROM push_subscriptions WHERE user_id = $1`, userID,
	)
	if err != nil {
		return nil, fmt.Errorf("list push subscriptions: %w", err)
	}
	defer rows.Close()
	var out []PushSubscription
	for rows.Next() {
		var s PushSubscription
		if err := rows.Scan(&s.ID, &s.UserID, &s.Endpoint, &s.P256dh, &s.Auth, &s.Lang); err != nil {
			return nil, fmt.Errorf("scan push subscription: %w", err)
		}
		out = append(out, s)
	}
	return out, rows.Err()
}
