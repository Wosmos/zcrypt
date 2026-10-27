package index

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/zcrypt/zcrypt/types"
)

// GetUsersByIDs loads users by id, keyed by id. Unknown ids are absent.
func (db *DB) GetUsersByIDs(ctx context.Context, ids []string) (map[string]*types.User, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT id, email, username, role, plan, storage_quota_bytes FROM users WHERE id = ANY($1::uuid[])`, ids)
	if err != nil {
		return nil, fmt.Errorf("get users by ids: %w", err)
	}
	defer rows.Close()
	out := make(map[string]*types.User, len(ids))
	for rows.Next() {
		u := &types.User{}
		if err := rows.Scan(&u.ID, &u.Email, &u.Username, &u.Role, &u.Plan, &u.StorageQuota); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		out[u.ID] = u
	}
	return out, rows.Err()
}

// bulkUpdate applies one column update to every id in a single statement.
// column is one of plan, role, storage_quota_bytes (never user input).
func (db *DB) bulkUpdate(ctx context.Context, column string, ids []string, value any) error {
	tag, err := db.pool.Exec(ctx,
		`UPDATE users SET `+column+` = $1, updated_at = NOW() WHERE id = ANY($2::uuid[])`, value, ids)
	if err != nil {
		return fmt.Errorf("bulk update %s: %w", column, err)
	}
	if int(tag.RowsAffected()) != len(ids) {
		return fmt.Errorf("bulk update %s: affected %d of %d", column, tag.RowsAffected(), len(ids))
	}
	return nil
}

// BulkSetUserPlan sets the plan for all ids atomically.
func (db *DB) BulkSetUserPlan(ctx context.Context, ids []string, plan string) error {
	return db.bulkUpdate(ctx, "plan", ids, plan)
}

// BulkSetUserRole sets the role for all ids atomically.
func (db *DB) BulkSetUserRole(ctx context.Context, ids []string, role types.Role) error {
	return db.bulkUpdate(ctx, "role", ids, role)
}

// BulkSetUserQuota sets the quota override for all ids atomically.
func (db *DB) BulkSetUserQuota(ctx context.Context, ids []string, quota *int64) error {
	return db.bulkUpdate(ctx, "storage_quota_bytes", ids, quota)
}

// ListEmailRecipients returns verified, opted-in, not-deleting users for an
// audience: "all", "plan" (planID) or "ids".
func (db *DB) ListEmailRecipients(ctx context.Context, audience, planID string, ids []string) ([]types.EmailRecipient, error) {
	q := `SELECT id, email FROM users
	      WHERE email_verified AND NOT email_opt_out AND deletion_scheduled_at IS NULL AND email <> ''`
	var args []any
	switch audience {
	case "plan":
		q += ` AND plan = $1`
		args = append(args, planID)
	case "ids":
		q += ` AND id = ANY($1::uuid[])`
		args = append(args, ids)
	case "all":
	default:
		return nil, fmt.Errorf("unknown audience %q", audience)
	}
	rows, err := db.pool.Query(ctx, q+` ORDER BY created_at`, args...)
	if err != nil {
		return nil, fmt.Errorf("list email recipients: %w", err)
	}
	defer rows.Close()
	out := []types.EmailRecipient{}
	for rows.Next() {
		var r types.EmailRecipient
		if err := rows.Scan(&r.ID, &r.Email); err != nil {
			return nil, fmt.Errorf("scan recipient: %w", err)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// SetEmailOptOut records a user's announcement preference.
func (db *DB) SetEmailOptOut(ctx context.Context, userID string, optOut bool) error {
	tag, err := db.pool.Exec(ctx, `UPDATE users SET email_opt_out = $1 WHERE id = $2`, optOut, userID)
	if err != nil {
		return fmt.Errorf("set email opt out: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return pgx.ErrNoRows
	}
	return nil
}

// GetEmailOptOut reports whether a user opted out of announcements.
func (db *DB) GetEmailOptOut(ctx context.Context, userID string) (bool, error) {
	var v bool
	err := db.pool.QueryRow(ctx, `SELECT email_opt_out FROM users WHERE id = $1`, userID).Scan(&v)
	return v, err
}

// CreateEmailCampaign inserts a campaign row and returns it.
func (db *DB) CreateEmailCampaign(ctx context.Context, subject, body, audience string, recipients int, createdBy string) (*types.EmailCampaign, error) {
	c := &types.EmailCampaign{}
	err := db.pool.QueryRow(ctx,
		`INSERT INTO admin_email_campaigns (subject, body, audience, recipient_count, created_by)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, subject, body, audience, recipient_count, sent_count, failed_count, created_by, created_at, finished_at`,
		subject, body, audience, recipients, createdBy,
	).Scan(&c.ID, &c.Subject, &c.Body, &c.Audience, &c.RecipientCount, &c.SentCount, &c.FailedCount, &c.CreatedBy, &c.CreatedAt, &c.FinishedAt)
	if err != nil {
		return nil, fmt.Errorf("create email campaign: %w", err)
	}
	return c, nil
}

// UpdateEmailCampaign stores running counts; finished stamps finished_at.
func (db *DB) UpdateEmailCampaign(ctx context.Context, id string, sent, failed int, finished bool) error {
	q := `UPDATE admin_email_campaigns SET sent_count = $2, failed_count = $3`
	if finished {
		q += `, finished_at = NOW()`
	}
	_, err := db.pool.Exec(ctx, q+` WHERE id = $1`, id, sent, failed)
	if err != nil {
		return fmt.Errorf("update email campaign: %w", err)
	}
	return nil
}

const campaignCols = `id, subject, body, audience, recipient_count, sent_count, failed_count, created_by, created_at, finished_at`

// EmailCampaignSorts maps the campaign list's sort keys to SQL.
var EmailCampaignSorts = map[string]string{"created_at": "created_at", "recipient_count": "recipient_count"}

// ListEmailCampaigns returns one page of campaigns and how many match.
func (db *DB) ListEmailCampaigns(ctx context.Context, page ListPage) ([]types.EmailCampaign, int, error) {
	w := &whereBuilder{}
	if page.Search != "" {
		w.add("subject ILIKE " + w.arg(likePattern(page.Search)))
	}
	var total int
	if err := db.pool.QueryRow(ctx, `SELECT COUNT(*) FROM admin_email_campaigns`+w.sql(), w.args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count email campaigns: %w", err)
	}
	expr, ok := EmailCampaignSorts[page.Sort]
	if !ok {
		expr = EmailCampaignSorts["created_at"]
	}
	rows, err := db.pool.Query(ctx, `SELECT `+campaignCols+` FROM admin_email_campaigns`+w.sql()+
		orderSQL(expr, page.Desc, "id")+` LIMIT `+w.arg(page.Limit)+` OFFSET `+w.arg(page.Offset), w.args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list email campaigns: %w", err)
	}
	defer rows.Close()
	out := []types.EmailCampaign{}
	for rows.Next() {
		var c types.EmailCampaign
		if err := rows.Scan(&c.ID, &c.Subject, &c.Body, &c.Audience, &c.RecipientCount, &c.SentCount, &c.FailedCount, &c.CreatedBy, &c.CreatedAt, &c.FinishedAt); err != nil {
			return nil, 0, fmt.Errorf("scan campaign: %w", err)
		}
		out = append(out, c)
	}
	return out, total, rows.Err()
}

// GetEmailCampaign loads one campaign.
func (db *DB) GetEmailCampaign(ctx context.Context, id string) (*types.EmailCampaign, error) {
	var c types.EmailCampaign
	err := db.pool.QueryRow(ctx, `SELECT `+campaignCols+` FROM admin_email_campaigns WHERE id = $1`, id).
		Scan(&c.ID, &c.Subject, &c.Body, &c.Audience, &c.RecipientCount, &c.SentCount, &c.FailedCount, &c.CreatedBy, &c.CreatedAt, &c.FinishedAt)
	if err != nil {
		return nil, fmt.Errorf("get email campaign: %w", err)
	}
	return &c, nil
}
