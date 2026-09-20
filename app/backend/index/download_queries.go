package index

import (
	"context"
	"fmt"
	"time"
)

// AppDownload is one recorded click on the /api/download/{target} redirect:
// an install of the zcrypt app, not a file download from a vault.
type AppDownload struct {
	Target    string
	Platform  string
	Version   string
	UserID    *string
	IPPrefix  string
	Country   string
	UserAgent string
	Referrer  string
}

// InsertAppDownload records one installer download.
func (db *DB) InsertAppDownload(ctx context.Context, d *AppDownload) error {
	_, err := db.pool.Exec(ctx,
		`INSERT INTO app_downloads (target, platform, version, user_id, ip_prefix, country, user_agent, referrer)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
		d.Target, d.Platform, d.Version, d.UserID, d.IPPrefix, d.Country, d.UserAgent, d.Referrer,
	)
	if err != nil {
		return fmt.Errorf("insert app download: %w", err)
	}
	return nil
}

// DownloadCount is a label plus how many downloads it accounts for.
type DownloadCount struct {
	Key   string `json:"key"`
	Count int    `json:"count"`
}

// DownloadDay is one day's total, for the time series.
type DownloadDay struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

// DownloadStats is the whole rollup behind the admin downloads view.
type DownloadStats struct {
	Total     int             `json:"total"`
	Last30    int             `json:"last_30_days"`
	Platforms []DownloadCount `json:"platforms"`
	Targets   []DownloadCount `json:"targets"`
	Versions  []DownloadCount `json:"versions"`
	Countries []DownloadCount `json:"countries"`
	Referrers []DownloadCount `json:"referrers"`
	Daily     []DownloadDay   `json:"daily"`
	SignedIn  int             `json:"signed_in"`
}

// groupCounts runs one `SELECT <expr> AS key, COUNT(*) GROUP BY` rollup.
// Rows with an empty key are skipped so unknown referrers/countries don't
// render as a blank slice in the UI.
func (db *DB) groupCounts(ctx context.Context, query string, args ...interface{}) ([]DownloadCount, error) {
	rows, err := db.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []DownloadCount{}
	for rows.Next() {
		var c DownloadCount
		if err := rows.Scan(&c.Key, &c.Count); err != nil {
			return nil, err
		}
		if c.Key == "" {
			continue
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// GetDownloadStats aggregates app_downloads over the last `days` days for the
// time series, with all-time totals for the breakdowns.
func (db *DB) GetDownloadStats(ctx context.Context, days int) (*DownloadStats, error) {
	if days <= 0 || days > 365 {
		days = 30
	}
	since := time.Now().AddDate(0, 0, -days)

	s := &DownloadStats{}

	if err := db.pool.QueryRow(ctx,
		`SELECT COUNT(*),
		        COUNT(*) FILTER (WHERE created_at >= $1),
		        COUNT(*) FILTER (WHERE user_id IS NOT NULL)
		 FROM app_downloads`, since,
	).Scan(&s.Total, &s.Last30, &s.SignedIn); err != nil {
		return nil, fmt.Errorf("download totals: %w", err)
	}

	type rollup struct {
		dst   *[]DownloadCount
		query string
	}
	for _, r := range []rollup{
		{&s.Platforms, `SELECT platform, COUNT(*) FROM app_downloads GROUP BY platform ORDER BY 2 DESC`},
		{&s.Targets, `SELECT target, COUNT(*) FROM app_downloads GROUP BY target ORDER BY 2 DESC`},
		{&s.Versions, `SELECT version, COUNT(*) FROM app_downloads GROUP BY version ORDER BY 2 DESC LIMIT 20`},
		{&s.Countries, `SELECT country, COUNT(*) FROM app_downloads GROUP BY country ORDER BY 2 DESC LIMIT 20`},
		{&s.Referrers, `SELECT referrer, COUNT(*) FROM app_downloads GROUP BY referrer ORDER BY 2 DESC LIMIT 20`},
	} {
		v, err := db.groupCounts(ctx, r.query)
		if err != nil {
			return nil, fmt.Errorf("download rollup: %w", err)
		}
		*r.dst = v
	}

	// generate_series fills gaps so the chart has a continuous x-axis instead
	// of skipping days with no downloads.
	rows, err := db.pool.Query(ctx,
		`SELECT to_char(d.day, 'YYYY-MM-DD'), COUNT(a.id)
		   FROM generate_series($1::date, CURRENT_DATE, '1 day') AS d(day)
		   LEFT JOIN app_downloads a ON a.created_at::date = d.day
		  GROUP BY d.day ORDER BY d.day`, since,
	)
	if err != nil {
		return nil, fmt.Errorf("download daily: %w", err)
	}
	defer rows.Close()

	s.Daily = []DownloadDay{}
	for rows.Next() {
		var d DownloadDay
		if err := rows.Scan(&d.Date, &d.Count); err != nil {
			return nil, fmt.Errorf("download daily scan: %w", err)
		}
		s.Daily = append(s.Daily, d)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("download daily rows: %w", err)
	}

	return s, nil
}

// GetDownloadTotal is the public counter: all-time installs, nothing else.
func (db *DB) GetDownloadTotal(ctx context.Context) (int, error) {
	var n int
	if err := db.pool.QueryRow(ctx, `SELECT COUNT(*) FROM app_downloads`).Scan(&n); err != nil {
		return 0, fmt.Errorf("download total: %w", err)
	}
	return n, nil
}
