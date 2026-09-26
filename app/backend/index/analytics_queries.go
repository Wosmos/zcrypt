// Package index implements the PostgreSQL persistence layer (via pgx) for
// zcrypt's file/folder/account/analytics metadata.
package index

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// LargestFile is the single biggest file in a period, for the Insights page's
// "largest file" stat.
type LargestFile struct {
	ID            string    `json:"id"`
	OriginalName  string    `json:"original_name"`
	EncryptedName string    `json:"encrypted_name"`
	OriginalSize  int64     `json:"original_size"`
	CreatedAt     time.Time `json:"created_at"`
}

// AnalyticsSummary aggregates a user's files over a period (plus the
// immediately-preceding period of equal length, for trend deltas) without
// ever shipping per-file rows to the caller: every number here comes from a
// single indexed SQL aggregate, so cost scales with the period's row count,
// not the whole vault's.
type AnalyticsSummary struct {
	FileCount          int64        `json:"file_count"`
	PrevFileCount      int64        `json:"prev_file_count"`
	OriginalBytes      int64        `json:"original_bytes"`
	PrevOriginalBytes  int64        `json:"prev_original_bytes"`
	EncryptedBytes     int64        `json:"encrypted_bytes"`
	PrevEncryptedBytes int64        `json:"prev_encrypted_bytes"`
	CompressedBytes    int64        `json:"compressed_bytes"`
	ChunkCount         int64        `json:"chunk_count"`
	MedianSize         int64        `json:"median_size"`
	AvgChunksPerFile   float64      `json:"avg_chunks_per_file"`
	OldestUpload       *time.Time   `json:"oldest_upload,omitempty"`
	NewestUpload       *time.Time   `json:"newest_upload,omitempty"`
	LargestFile        *LargestFile `json:"largest_file,omitempty"`
}

// GetAnalyticsSummary computes the current-period aggregate (and, unless
// allTime, the previous equal-length period's headline totals for trend
// chips) in at most three bounded queries, none of which scan more than the
// requested window. allTime drops the previous-period comparison (there is
// no meaningful "previous period" for "all time").
func (db *DB) GetAnalyticsSummary(ctx context.Context, userID string, start, end time.Time, allTime bool) (*AnalyticsSummary, error) {
	s := &AnalyticsSummary{}

	curQuery := `SELECT
			COUNT(*),
			COALESCE(SUM(original_size), 0),
			COALESCE(SUM(encrypted_size), 0),
			COALESCE(SUM(compressed_size), 0),
			COALESCE(SUM(chunk_count), 0),
			COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY original_size), 0)::BIGINT,
			COALESCE(AVG(chunk_count), 0),
			MIN(created_at),
			MAX(created_at)
		FROM files
		WHERE user_id = $1 AND status = 'complete' AND deleted_at IS NULL`
	curArgs := []interface{}{userID}
	if !allTime {
		curQuery += ` AND created_at >= $2 AND created_at < $3`
		curArgs = append(curArgs, start, end)
	}

	var oldest, newest *time.Time
	if err := db.pool.QueryRow(ctx, curQuery, curArgs...).Scan(
		&s.FileCount, &s.OriginalBytes, &s.EncryptedBytes, &s.CompressedBytes, &s.ChunkCount,
		&s.MedianSize, &s.AvgChunksPerFile, &oldest, &newest,
	); err != nil {
		return nil, fmt.Errorf("analytics summary: %w", err)
	}
	s.OldestUpload, s.NewestUpload = oldest, newest

	if !allTime {
		prevStart := start.Add(-end.Sub(start))
		if err := db.pool.QueryRow(ctx,
			`SELECT COUNT(*), COALESCE(SUM(original_size), 0), COALESCE(SUM(encrypted_size), 0)
			 FROM files
			 WHERE user_id = $1 AND status = 'complete' AND deleted_at IS NULL
			   AND created_at >= $2 AND created_at < $3`,
			userID, prevStart, start,
		).Scan(&s.PrevFileCount, &s.PrevOriginalBytes, &s.PrevEncryptedBytes); err != nil {
			return nil, fmt.Errorf("analytics summary (previous period): %w", err)
		}
	}

	lfQuery := `SELECT id, original_name, encrypted_name, original_size, created_at
		FROM files WHERE user_id = $1 AND status = 'complete' AND deleted_at IS NULL`
	lfArgs := []interface{}{userID}
	if !allTime {
		lfQuery += ` AND created_at >= $2 AND created_at < $3`
		lfArgs = append(lfArgs, start, end)
	}
	lfQuery += ` ORDER BY original_size DESC LIMIT 1`

	lf := &LargestFile{}
	err := db.pool.QueryRow(ctx, lfQuery, lfArgs...).Scan(
		&lf.ID, &lf.OriginalName, &lf.EncryptedName, &lf.OriginalSize, &lf.CreatedAt,
	)
	switch {
	case err == nil:
		s.LargestFile = lf
	case errors.Is(err, pgx.ErrNoRows):
		// Empty period: no largest file, not an error.
	default:
		return nil, fmt.Errorf("analytics summary (largest file): %w", err)
	}

	return s, nil
}

// GetDecoyAnalyticsSummary is the reduced-shape equivalent served to decoy
// sessions: decoy_files only carries id/name/size/created_at, so there is no
// encrypted/compressed/chunk data to report.
func (db *DB) GetDecoyAnalyticsSummary(ctx context.Context, userID string, start, end time.Time, allTime bool) (*AnalyticsSummary, error) {
	s := &AnalyticsSummary{}

	curQuery := `SELECT
			COUNT(*),
			COALESCE(SUM(size), 0),
			COALESCE(percentile_cont(0.5) WITHIN GROUP (ORDER BY size), 0)::BIGINT,
			MIN(created_at),
			MAX(created_at)
		FROM decoy_files WHERE user_id = $1`
	curArgs := []interface{}{userID}
	if !allTime {
		curQuery += ` AND created_at >= $2 AND created_at < $3`
		curArgs = append(curArgs, start, end)
	}

	var oldest, newest *time.Time
	if err := db.pool.QueryRow(ctx, curQuery, curArgs...).Scan(
		&s.FileCount, &s.OriginalBytes, &s.MedianSize, &oldest, &newest,
	); err != nil {
		return nil, fmt.Errorf("decoy analytics summary: %w", err)
	}
	s.OldestUpload, s.NewestUpload = oldest, newest
	s.EncryptedBytes = s.OriginalBytes // decoy files have no separate encrypted size; keep savings% at 0

	if !allTime {
		prevStart := start.Add(-end.Sub(start))
		if err := db.pool.QueryRow(ctx,
			`SELECT COUNT(*), COALESCE(SUM(size), 0) FROM decoy_files
			 WHERE user_id = $1 AND created_at >= $2 AND created_at < $3`,
			userID, prevStart, start,
		).Scan(&s.PrevFileCount, &s.PrevOriginalBytes); err != nil {
			return nil, fmt.Errorf("decoy analytics summary (previous period): %w", err)
		}
		s.PrevEncryptedBytes = s.PrevOriginalBytes
	}

	lfQuery := `SELECT id, name, size, created_at FROM decoy_files WHERE user_id = $1`
	lfArgs := []interface{}{userID}
	if !allTime {
		lfQuery += ` AND created_at >= $2 AND created_at < $3`
		lfArgs = append(lfArgs, start, end)
	}
	lfQuery += ` ORDER BY size DESC LIMIT 1`

	var id, name string
	var size int64
	var createdAt time.Time
	err := db.pool.QueryRow(ctx, lfQuery, lfArgs...).Scan(&id, &name, &size, &createdAt)
	switch {
	case err == nil:
		lf := &LargestFile{ID: id, OriginalSize: size, CreatedAt: createdAt}
		if len(name) >= 5 && name[:5] == "enc1:" {
			lf.EncryptedName = name[5:]
		} else {
			lf.OriginalName = name
		}
		s.LargestFile = lf
	case errors.Is(err, pgx.ErrNoRows):
	default:
		return nil, fmt.Errorf("decoy analytics summary (largest file): %w", err)
	}

	return s, nil
}

// TimeseriesPoint is one bucket of upload activity, for the activity chart.
type TimeseriesPoint struct {
	Bucket  string `json:"bucket"` // ISO 8601
	Uploads int64  `json:"uploads"`
	Bytes   int64  `json:"bytes"`
}

// bucketStep maps a validated bucket name to its generate_series step. Never
// index this with an unvalidated caller-supplied string — callers must first
// run the value through a whitelist switch (see cmd/analytics.go).
var bucketStep = map[string]string{
	"hour":  "1 hour",
	"day":   "1 day",
	"month": "1 month",
}

// scanTimeseriesPoints drains rows into TimeseriesPoint slices and closes
// rows. Shared by GetUploadTimeseries and GetDecoyUploadTimeseries, which
// differ only in their SQL (files vs decoy_files), not this scan loop.
func scanTimeseriesPoints(rows pgx.Rows, errPrefix string) ([]TimeseriesPoint, error) {
	defer rows.Close()
	points := []TimeseriesPoint{}
	for rows.Next() {
		var p TimeseriesPoint
		if err := rows.Scan(&p.Bucket, &p.Uploads, &p.Bytes); err != nil {
			return nil, fmt.Errorf("%s scan: %w", errPrefix, err)
		}
		points = append(points, p)
	}
	return points, rows.Err()
}

// GetUploadTimeseries returns a gap-filled, bucketed upload count/byte series
// between start and end. bucket must already be one of "hour"/"day"/"month"
// (validated by the caller) — it is used to build the SQL via fmt.Sprintf, so
// an unvalidated value here would be a SQL injection vector.
func (db *DB) GetUploadTimeseries(ctx context.Context, userID string, start, end time.Time, bucket string) ([]TimeseriesPoint, error) {
	step, ok := bucketStep[bucket]
	if !ok {
		return nil, fmt.Errorf("upload timeseries: invalid bucket %q", bucket)
	}

	rows, err := db.pool.Query(ctx, fmt.Sprintf(`
		SELECT to_char(d.bucket, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       COUNT(f.id), COALESCE(SUM(f.original_size), 0)
		FROM generate_series(date_trunc('%s', $2::timestamptz), date_trunc('%s', $3::timestamptz), '%s'::interval) AS d(bucket)
		LEFT JOIN files f ON f.user_id = $1 AND f.status = 'complete' AND f.deleted_at IS NULL
		     AND date_trunc('%s', f.created_at) = d.bucket
		GROUP BY d.bucket ORDER BY d.bucket`, bucket, bucket, step, bucket),
		userID, start, end,
	)
	if err != nil {
		return nil, fmt.Errorf("upload timeseries: %w", err)
	}
	return scanTimeseriesPoints(rows, "upload timeseries")
}

// GetDecoyUploadTimeseries is the decoy_files equivalent (no encrypted-size
// column to report, so Bytes is the fake file's plain size).
func (db *DB) GetDecoyUploadTimeseries(ctx context.Context, userID string, start, end time.Time, bucket string) ([]TimeseriesPoint, error) {
	step, ok := bucketStep[bucket]
	if !ok {
		return nil, fmt.Errorf("decoy upload timeseries: invalid bucket %q", bucket)
	}

	rows, err := db.pool.Query(ctx, fmt.Sprintf(`
		SELECT to_char(d.bucket, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       COUNT(f.id), COALESCE(SUM(f.size), 0)
		FROM generate_series(date_trunc('%s', $2::timestamptz), date_trunc('%s', $3::timestamptz), '%s'::interval) AS d(bucket)
		LEFT JOIN decoy_files f ON f.user_id = $1
		     AND date_trunc('%s', f.created_at) = d.bucket
		GROUP BY d.bucket ORDER BY d.bucket`, bucket, bucket, step, bucket),
		userID, start, end,
	)
	if err != nil {
		return nil, fmt.Errorf("decoy upload timeseries: %w", err)
	}
	return scanTimeseriesPoints(rows, "decoy upload timeseries")
}

// GrowthPoint is one bucket of the lifetime cumulative-storage chart.
type GrowthPoint struct {
	Bucket          string `json:"bucket"`
	CumulativeBytes int64  `json:"cumulative_bytes"`
}

// growthBucketFor picks a coarser bucket (day/week/month) as minCreated ages,
// so a storage-growth response stays bounded (roughly 365-400 points)
// regardless of account age or file count. Shared by GetStorageGrowth and
// GetDecoyStorageGrowth.
func growthBucketFor(minCreated time.Time) (bucket, step string) {
	switch age := time.Since(minCreated); {
	case age > 3*365*24*time.Hour:
		return "month", "1 month"
	case age > 365*24*time.Hour:
		return "week", "1 week"
	default:
		return "day", "1 day"
	}
}

// scanGrowthPoints drains rows into GrowthPoint slices and closes rows.
// Shared by GetStorageGrowth and GetDecoyStorageGrowth, which differ only in
// their SQL (files vs decoy_files), not this scan loop.
func scanGrowthPoints(rows pgx.Rows, errPrefix string) ([]GrowthPoint, error) {
	defer rows.Close()
	points := []GrowthPoint{}
	for rows.Next() {
		var p GrowthPoint
		if err := rows.Scan(&p.Bucket, &p.CumulativeBytes); err != nil {
			return nil, fmt.Errorf("%s scan: %w", errPrefix, err)
		}
		points = append(points, p)
	}
	return points, rows.Err()
}

// GetStorageGrowth returns a lifetime cumulative-storage series, auto-choosing
// a coarser bucket (day/week/month) as the account ages so the response stays
// bounded (roughly 365-400 points) regardless of account age or file count.
func (db *DB) GetStorageGrowth(ctx context.Context, userID string) ([]GrowthPoint, error) {
	var n int64
	var minCreated time.Time
	if err := db.pool.QueryRow(ctx,
		`SELECT COUNT(*), COALESCE(MIN(created_at), NOW())
		 FROM files WHERE user_id = $1 AND status = 'complete' AND deleted_at IS NULL`,
		userID,
	).Scan(&n, &minCreated); err != nil {
		return nil, fmt.Errorf("storage growth bounds: %w", err)
	}
	if n == 0 {
		return []GrowthPoint{}, nil
	}
	bucket, step := growthBucketFor(minCreated)

	rows, err := db.pool.Query(ctx, fmt.Sprintf(`
		SELECT to_char(bucket, 'YYYY-MM-DD'), SUM(bucket_bytes) OVER (ORDER BY bucket)
		FROM (
			SELECT d.bucket, COALESCE(SUM(f.original_size), 0) AS bucket_bytes
			FROM generate_series(date_trunc('%s', $2::timestamptz), date_trunc('%s', NOW()), '%s'::interval) AS d(bucket)
			LEFT JOIN files f ON f.user_id = $1 AND f.status = 'complete' AND f.deleted_at IS NULL
			     AND date_trunc('%s', f.created_at) = d.bucket
			GROUP BY d.bucket
		) sub ORDER BY bucket`, bucket, bucket, step, bucket),
		userID, minCreated,
	)
	if err != nil {
		return nil, fmt.Errorf("storage growth: %w", err)
	}
	return scanGrowthPoints(rows, "storage growth")
}

// GetDecoyStorageGrowth is the decoy_files equivalent.
func (db *DB) GetDecoyStorageGrowth(ctx context.Context, userID string) ([]GrowthPoint, error) {
	var n int64
	var minCreated time.Time
	if err := db.pool.QueryRow(ctx,
		`SELECT COUNT(*), COALESCE(MIN(created_at), NOW()) FROM decoy_files WHERE user_id = $1`,
		userID,
	).Scan(&n, &minCreated); err != nil {
		return nil, fmt.Errorf("decoy storage growth bounds: %w", err)
	}
	if n == 0 {
		return []GrowthPoint{}, nil
	}
	bucket, step := growthBucketFor(minCreated)

	rows, err := db.pool.Query(ctx, fmt.Sprintf(`
		SELECT to_char(bucket, 'YYYY-MM-DD'), SUM(bucket_bytes) OVER (ORDER BY bucket)
		FROM (
			SELECT d.bucket, COALESCE(SUM(f.size), 0) AS bucket_bytes
			FROM generate_series(date_trunc('%s', $2::timestamptz), date_trunc('%s', NOW()), '%s'::interval) AS d(bucket)
			LEFT JOIN decoy_files f ON f.user_id = $1
			     AND date_trunc('%s', f.created_at) = d.bucket
			GROUP BY d.bucket
		) sub ORDER BY bucket`, bucket, bucket, step, bucket),
		userID, minCreated,
	)
	if err != nil {
		return nil, fmt.Errorf("decoy storage growth: %w", err)
	}
	return scanGrowthPoints(rows, "decoy storage growth")
}

// FileTypeItem is the lean per-file shape used only for the client-side
// file-type/extension breakdown (the server cannot GROUP BY extension itself:
// newer uploads' names are zero-knowledge encrypted). Bounded to a date range
// so it stays cheap at any vault size for anything but an explicit "all time"
// pick on a very large vault.
type FileTypeItem struct {
	ID            string    `json:"id"`
	OriginalName  string    `json:"original_name"`
	EncryptedName string    `json:"encrypted_name"`
	OriginalSize  int64     `json:"original_size"`
	EncryptedSize int64     `json:"encrypted_size"`
	CreatedAt     time.Time `json:"created_at"`
}

// maxFileTypeItems caps the lean file-type listing so an "All time" pick on a
// huge vault degrades to a truncated (still useful) breakdown instead of an
// unbounded response.
const maxFileTypeItems = 5000

// GetFileTypeItems returns the lean per-file rows needed for the client-side
// extension breakdown, scoped to [start, end) unless allTime.
func (db *DB) GetFileTypeItems(ctx context.Context, userID string, start, end time.Time, allTime bool) ([]FileTypeItem, error) {
	query := `SELECT id, original_name, encrypted_name, original_size, encrypted_size, created_at
		FROM files WHERE user_id = $1 AND status = 'complete' AND deleted_at IS NULL`
	args := []interface{}{userID}
	if !allTime {
		query += ` AND created_at >= $2 AND created_at < $3`
		args = append(args, start, end)
	}
	query += fmt.Sprintf(` ORDER BY created_at DESC LIMIT %d`, maxFileTypeItems)

	rows, err := db.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("file type items: %w", err)
	}
	defer rows.Close()

	items := []FileTypeItem{}
	for rows.Next() {
		var it FileTypeItem
		if err := rows.Scan(&it.ID, &it.OriginalName, &it.EncryptedName, &it.OriginalSize, &it.EncryptedSize, &it.CreatedAt); err != nil {
			return nil, fmt.Errorf("file type items scan: %w", err)
		}
		items = append(items, it)
	}
	return items, rows.Err()
}

// GetDecoyFileTypeItems is the decoy_files equivalent.
func (db *DB) GetDecoyFileTypeItems(ctx context.Context, userID string, start, end time.Time, allTime bool) ([]FileTypeItem, error) {
	query := `SELECT id, name, size, created_at FROM decoy_files WHERE user_id = $1`
	args := []interface{}{userID}
	if !allTime {
		query += ` AND created_at >= $2 AND created_at < $3`
		args = append(args, start, end)
	}
	query += fmt.Sprintf(` ORDER BY created_at DESC LIMIT %d`, maxFileTypeItems)

	rows, err := db.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("decoy file type items: %w", err)
	}
	defer rows.Close()

	items := []FileTypeItem{}
	for rows.Next() {
		var id, name string
		var size int64
		var createdAt time.Time
		if err := rows.Scan(&id, &name, &size, &createdAt); err != nil {
			return nil, fmt.Errorf("decoy file type items scan: %w", err)
		}
		it := FileTypeItem{ID: id, OriginalSize: size, EncryptedSize: size, CreatedAt: createdAt}
		if len(name) >= 5 && name[:5] == "enc1:" {
			it.EncryptedName = name[5:]
		} else {
			it.OriginalName = name
		}
		items = append(items, it)
	}
	return items, rows.Err()
}
