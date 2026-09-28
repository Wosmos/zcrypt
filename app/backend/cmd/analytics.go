package cmd

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"time"
)

// defaultAnalyticsWindowDays backs both the "no params supplied" fallback and
// documents the frontend's own default range preset ("30d"): cheap by
// default, since an unbounded aggregate is exactly what this endpoint exists
// to avoid.
const defaultAnalyticsWindowDays = 30

// parseAnalyticsWindow reads start/end/range from the query string.
// range=all short-circuits to the lifetime window (no previous-period
// comparison is meaningful for "all time"). Missing start/end falls back to
// the same cheap 30-day default the frontend uses, rather than erroring.
func parseAnalyticsWindow(r *http.Request) (start, end time.Time, allTime bool, err error) {
	q := r.URL.Query()
	if q.Get("range") == "all" {
		return time.Time{}, time.Now().UTC(), true, nil
	}

	startStr, endStr := q.Get("start"), q.Get("end")
	if startStr == "" || endStr == "" {
		end = time.Now().UTC()
		start = end.AddDate(0, 0, -defaultAnalyticsWindowDays)
		return start, end, false, nil
	}

	start, err = time.Parse(time.RFC3339, startStr)
	if err != nil {
		return time.Time{}, time.Time{}, false, fmt.Errorf("invalid start: %w", err)
	}
	end, err = time.Parse(time.RFC3339, endStr)
	if err != nil {
		return time.Time{}, time.Time{}, false, fmt.Errorf("invalid end: %w", err)
	}
	if !end.After(start) {
		return time.Time{}, time.Time{}, false, fmt.Errorf("end must be after start")
	}
	return start, end, false, nil
}

// clampBucket ignores an unreasonable client-requested bucket for the given
// window and returns a sane one instead: hourly buckets only make sense for a
// short window, and a long window at daily granularity would return an
// unbounded number of points. This is defense in depth — the frontend is
// expected to request the right bucket for its own range preset already.
func clampBucket(requested string, start, end time.Time) string {
	days := end.Sub(start).Hours() / 24
	switch requested {
	case "hour":
		if days <= 3 {
			return "hour"
		}
		return "day"
	case "month":
		return "month"
	default:
		if days > 400 {
			return "month"
		}
		return "day"
	}
}

// analyticsFn computes one analytics result over a window, real or decoy.
type analyticsFn func(ctx context.Context, userID string, start, end time.Time, allTime bool) (any, error)

// runAnalyticsQuery parses the request window, picks decoyFn or realFn per
// IsDecoy(r), and writes the result (or a decoy-labeled error) as JSON.
// Shared by every /api/analytics/* handler whose shape is just "parse window,
// branch on decoy, run one query, return it" - HandleAnalyticsSummary and
// HandleAnalyticsFileTypes are otherwise identical.
func (s *Server) runAnalyticsQuery(w http.ResponseWriter, r *http.Request, label string, decoyFn, realFn analyticsFn) {
	ctx := r.Context()
	userID := GetUserID(r)

	start, end, allTime, err := parseAnalyticsWindow(r)
	if err != nil {
		http.Error(w, `{"error":"invalid range"}`, http.StatusBadRequest)
		return
	}

	fn, prefix := realFn, ""
	if IsDecoy(r) {
		fn, prefix = decoyFn, "decoy "
	}
	result, err := fn(ctx, userID, start, end, allTime)
	if err != nil {
		log.Printf("analytics: %s%s failed: %v", prefix, label, err)
		http.Error(w, `{"error":"failed to load analytics"}`, http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// HandleAnalyticsSummary handles GET /api/analytics/summary?start=&end=&range=<all>.
func (s *Server) HandleAnalyticsSummary(w http.ResponseWriter, r *http.Request) {
	s.runAnalyticsQuery(w, r, "summary",
		func(ctx context.Context, userID string, start, end time.Time, allTime bool) (any, error) {
			return s.db.GetDecoyAnalyticsSummary(ctx, userID, start, end, allTime)
		},
		func(ctx context.Context, userID string, start, end time.Time, allTime bool) (any, error) {
			return s.db.GetAnalyticsSummary(ctx, userID, start, end, allTime)
		},
	)
}

// HandleAnalyticsTimeseries handles GET /api/analytics/timeseries?start=&end=&bucket=hour|day|month.
func (s *Server) HandleAnalyticsTimeseries(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	start, end, allTime, err := parseAnalyticsWindow(r)
	if err != nil {
		http.Error(w, `{"error":"invalid range"}`, http.StatusBadRequest)
		return
	}
	if allTime {
		// The timeseries chart always has a concrete window (the frontend picks
		// the whole-account lifetime as its own start/end for "All time"); a bare
		// range=all here has nothing to bucket, so treat it as a bad request
		// rather than guessing a window.
		http.Error(w, `{"error":"timeseries requires start and end"}`, http.StatusBadRequest)
		return
	}
	bucket := clampBucket(r.URL.Query().Get("bucket"), start, end)

	var points interface{}
	if IsDecoy(r) {
		v, err := s.db.GetDecoyUploadTimeseries(ctx, userID, start, end, bucket)
		if err != nil {
			log.Printf("analytics: decoy timeseries failed: %v", err)
			http.Error(w, `{"error":"failed to load analytics"}`, http.StatusInternalServerError)
			return
		}
		points = v
	} else {
		v, err := s.db.GetUploadTimeseries(ctx, userID, start, end, bucket)
		if err != nil {
			log.Printf("analytics: timeseries failed: %v", err)
			http.Error(w, `{"error":"failed to load analytics"}`, http.StatusInternalServerError)
			return
		}
		points = v
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"bucket": bucket, "points": points})
}

// HandleAnalyticsStorageGrowth handles GET /api/analytics/storage-growth — a
// lifetime cumulative chart, not range-scoped (matches the product's existing
// "growth since day one" chart).
func (s *Server) HandleAnalyticsStorageGrowth(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := GetUserID(r)

	var points interface{}
	if IsDecoy(r) {
		v, err := s.db.GetDecoyStorageGrowth(ctx, userID)
		if err != nil {
			log.Printf("analytics: decoy storage growth failed: %v", err)
			http.Error(w, `{"error":"failed to load analytics"}`, http.StatusInternalServerError)
			return
		}
		points = v
	} else {
		v, err := s.db.GetStorageGrowth(ctx, userID)
		if err != nil {
			log.Printf("analytics: storage growth failed: %v", err)
			http.Error(w, `{"error":"failed to load analytics"}`, http.StatusInternalServerError)
			return
		}
		points = v
	}

	writeJSON(w, http.StatusOK, points)
}

// HandleAnalyticsFileTypes handles GET /api/analytics/file-types?start=&end=&range=<all>
// — a lean per-file listing (id/size/encrypted-or-plain name/created_at
// only), bounded to the requested range, so the client can decrypt names and
// bucket by extension without the server needing to see plaintext names.
// Deliberately not the full FileMetadata shape returned by /api/files.
func (s *Server) HandleAnalyticsFileTypes(w http.ResponseWriter, r *http.Request) {
	s.runAnalyticsQuery(w, r, "file types",
		func(ctx context.Context, userID string, start, end time.Time, allTime bool) (any, error) {
			return s.db.GetDecoyFileTypeItems(ctx, userID, start, end, allTime)
		},
		func(ctx context.Context, userID string, start, end time.Time, allTime bool) (any, error) {
			return s.db.GetFileTypeItems(ctx, userID, start, end, allTime)
		},
	)
}
