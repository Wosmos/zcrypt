package index

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/zcrypt/zcrypt/types"
)

// InsertBugReport stores a new bug report. userID and screenshot may be nil.
func (db *DB) InsertBugReport(ctx context.Context, r *types.BugReport, screenshot []byte) error {
	var shot any
	if len(screenshot) > 0 {
		shot = screenshot
	}
	_, err := db.pool.Exec(ctx,
		`INSERT INTO bug_reports (id, user_id, description, screenshot, app_version, platform, route, user_agent)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		r.ID, r.UserID, r.Description, shot, r.AppVersion, r.Platform, r.Route, r.UserAgent,
	)
	if err != nil {
		return fmt.Errorf("insert bug report: %w", err)
	}
	return nil
}

// ListBugReports returns paginated bug reports, newest first. An empty status
// returns every status.
func (db *DB) ListBugReports(ctx context.Context, status string, limit, offset int) ([]types.BugReport, int, error) {
	var total int
	if err := db.pool.QueryRow(ctx,
		`SELECT COUNT(*) FROM bug_reports WHERE ($1 = '' OR status = $1)`, status,
	).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count bug reports: %w", err)
	}

	rows, err := db.pool.Query(ctx,
		`SELECT b.id, b.user_id, COALESCE(u.email, ''), COALESCE(u.username, ''),
		        b.description, b.screenshot IS NOT NULL, b.app_version, b.platform,
		        b.route, b.user_agent, b.status, b.created_at
		 FROM bug_reports b LEFT JOIN users u ON b.user_id = u.id
		 WHERE ($1 = '' OR b.status = $1)
		 ORDER BY b.created_at DESC LIMIT $2 OFFSET $3`,
		status, limit, offset,
	)
	if err != nil {
		return nil, 0, fmt.Errorf("list bug reports: %w", err)
	}
	defer rows.Close()

	items := []types.BugReport{}
	for rows.Next() {
		var b types.BugReport
		if err := rows.Scan(&b.ID, &b.UserID, &b.Email, &b.Username, &b.Description,
			&b.HasScreenshot, &b.AppVersion, &b.Platform, &b.Route, &b.UserAgent,
			&b.Status, &b.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan bug report: %w", err)
		}
		items = append(items, b)
	}
	return items, total, rows.Err()
}

// UpdateBugReportStatus sets a report's status. It returns false when the id
// matches no report.
func (db *DB) UpdateBugReportStatus(ctx context.Context, id, status string) (bool, error) {
	tag, err := db.pool.Exec(ctx, `UPDATE bug_reports SET status = $2 WHERE id = $1`, id, status)
	if err != nil {
		return false, fmt.Errorf("update bug report: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

// GetBugReportScreenshot returns the stored screenshot bytes, or nil when the
// report has none. found is false when the id matches no report.
func (db *DB) GetBugReportScreenshot(ctx context.Context, id string) (data []byte, found bool, err error) {
	err = db.pool.QueryRow(ctx, `SELECT screenshot FROM bug_reports WHERE id = $1`, id).Scan(&data)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, fmt.Errorf("get bug report screenshot: %w", err)
	}
	return data, true, nil
}
