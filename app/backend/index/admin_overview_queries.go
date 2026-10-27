package index

import (
	"context"
	"fmt"
	"time"
)

// OverviewDay is one day of the admin overview chart.
type OverviewDay struct {
	Date    string `json:"date"`
	Signups int    `json:"signups"`
	Active  int    `json:"active"`
}

// RecentEvent is an audit event with the acting user's name, for the
// overview's recent activity list.
type RecentEvent struct {
	ID        string    `json:"id"`
	EventType string    `json:"event_type"`
	UserID    *string   `json:"user_id"`
	Username  string    `json:"username"`
	Country   string    `json:"country"`
	CreatedAt time.Time `json:"created_at"`
}

// StaleReport is an open bug report nobody has looked at in a while.
type StaleReport struct {
	ID          string    `json:"id"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
}

// AdminOverview is the data behind the admin home page.
type AdminOverview struct {
	TotalUsers       int            `json:"total_users"`
	Active7d         int            `json:"active_7d"`
	Active30d        int            `json:"active_30d"`
	SignupsThisWeek  int            `json:"signups_this_week"`
	SignupsLastWeek  int            `json:"signups_last_week"`
	TotalFiles       int            `json:"total_files"`
	TotalBytes       int64          `json:"total_size"`
	OpenBugReports   int            `json:"open_bug_reports"`
	StaleBugReports  int            `json:"stale_bug_reports"`
	PendingReviews   int            `json:"pending_reviews"`
	EmailsSending    int            `json:"emails_sending"`
	EmailsQueued     int            `json:"emails_queued"`
	EmailsFailed30d  int            `json:"emails_failed_30d"`
	PendingDeletions int            `json:"pending_deletions"`
	Series           []OverviewDay  `json:"series"`
	Countries        []CountryCount `json:"countries"`
	Recent           []RecentEvent  `json:"recent"`
	StaleReports     []StaleReport  `json:"stale_reports"`
}

// staleReportAge is how long a bug report can stay open before the overview
// lists it as needing attention.
const staleReportAge = "7 days"

// GetAdminOverview collects the overview's counts, a days-long sign-up and
// activity series, the user countries and the latest activity.
func (db *DB) GetAdminOverview(ctx context.Context, days int) (*AdminOverview, error) {
	o := &AdminOverview{}
	if err := db.pool.QueryRow(ctx, `SELECT
		(SELECT COUNT(*) FROM users),
		(SELECT COUNT(*) FROM users u WHERE u.last_seen_at > NOW() - INTERVAL '7 days'
		    OR EXISTS (SELECT 1 FROM audit_events a WHERE a.user_id = u.id AND a.created_at > NOW() - INTERVAL '7 days')),
		(SELECT COUNT(*) FROM users u WHERE u.last_seen_at > NOW() - INTERVAL '30 days'
		    OR EXISTS (SELECT 1 FROM audit_events a WHERE a.user_id = u.id AND a.created_at > NOW() - INTERVAL '30 days')),
		(SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '7 days'),
		(SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '14 days' AND created_at <= NOW() - INTERVAL '7 days'),
		(SELECT COUNT(*) FROM files WHERE status = 'complete'),
		(SELECT COALESCE(SUM(original_size), 0) FROM files WHERE status = 'complete'),
		(SELECT COUNT(*) FROM bug_reports WHERE status = 'open'),
		(SELECT COUNT(*) FROM bug_reports WHERE status = 'open' AND created_at < NOW() - INTERVAL '`+staleReportAge+`'),
		(SELECT COUNT(*) FROM reviews WHERE status = 'pending'),
		(SELECT COUNT(*) FROM admin_email_campaigns WHERE finished_at IS NULL),
		(SELECT COALESCE(SUM(GREATEST(recipient_count - sent_count - failed_count, 0)), 0) FROM admin_email_campaigns WHERE finished_at IS NULL),
		(SELECT COALESCE(SUM(failed_count), 0) FROM admin_email_campaigns WHERE created_at > NOW() - INTERVAL '30 days'),
		(SELECT COUNT(*) FROM pending_deletions)`).Scan(
		&o.TotalUsers, &o.Active7d, &o.Active30d, &o.SignupsThisWeek, &o.SignupsLastWeek,
		&o.TotalFiles, &o.TotalBytes, &o.OpenBugReports, &o.StaleBugReports, &o.PendingReviews,
		&o.EmailsSending, &o.EmailsQueued, &o.EmailsFailed30d, &o.PendingDeletions); err != nil {
		return nil, fmt.Errorf("overview counts: %w", err)
	}

	rows, err := db.pool.Query(ctx,
		`SELECT to_char(d.day, 'YYYY-MM-DD'),
		        (SELECT COUNT(*) FROM users u WHERE u.created_at >= d.day AND u.created_at < d.day + INTERVAL '1 day'),
		        (SELECT COUNT(DISTINCT a.user_id) FROM audit_events a
		          WHERE a.created_at >= d.day AND a.created_at < d.day + INTERVAL '1 day')
		   FROM generate_series(CURRENT_DATE - ($1::int - 1), CURRENT_DATE, '1 day') AS d(day)
		  ORDER BY d.day`, days)
	if err != nil {
		return nil, fmt.Errorf("overview series: %w", err)
	}
	o.Series = []OverviewDay{}
	for rows.Next() {
		var d OverviewDay
		if err := rows.Scan(&d.Date, &d.Signups, &d.Active); err != nil {
			rows.Close()
			return nil, fmt.Errorf("scan overview day: %w", err)
		}
		o.Series = append(o.Series, d)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("overview series: %w", err)
	}

	if o.Countries, err = db.UserCountries(ctx, 12); err != nil {
		return nil, err
	}
	if o.Recent, err = db.recentEvents(ctx, 8); err != nil {
		return nil, err
	}
	if o.StaleReports, err = db.staleReports(ctx, 5); err != nil {
		return nil, err
	}
	return o, nil
}

func (db *DB) recentEvents(ctx context.Context, limit int) ([]RecentEvent, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT a.id, a.event_type, a.user_id, COALESCE(u.username, ''), COALESCE(a.metadata->>'country', ''), a.created_at
		   FROM audit_events a LEFT JOIN users u ON u.id = a.user_id
		  ORDER BY a.created_at DESC LIMIT $1`, limit)
	if err != nil {
		return nil, fmt.Errorf("recent events: %w", err)
	}
	defer rows.Close()
	out := []RecentEvent{}
	for rows.Next() {
		var e RecentEvent
		if err := rows.Scan(&e.ID, &e.EventType, &e.UserID, &e.Username, &e.Country, &e.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan recent event: %w", err)
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (db *DB) staleReports(ctx context.Context, limit int) ([]StaleReport, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT id, left(description, 140), created_at FROM bug_reports
		  WHERE status = 'open' AND created_at < NOW() - INTERVAL '`+staleReportAge+`'
		  ORDER BY created_at LIMIT $1`, limit)
	if err != nil {
		return nil, fmt.Errorf("stale reports: %w", err)
	}
	defer rows.Close()
	out := []StaleReport{}
	for rows.Next() {
		var s StaleReport
		if err := rows.Scan(&s.ID, &s.Description, &s.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan stale report: %w", err)
		}
		out = append(out, s)
	}
	return out, rows.Err()
}
