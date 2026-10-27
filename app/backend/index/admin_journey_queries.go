package index

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"
)

// JourneyFamilies groups event kinds for the admin user journey. Kinds not
// listed fall into "account"; any admin_* kind is "admin".
var JourneyFamilies = map[string][]string{
	"auth": {"register", "oauth_register", "login", "login_decoy", "oauth_login", "magic_link_sent",
		"magic_link_used", "logout", "email_verify", "session_revoke", "sessions_revoke_others"},
	"security": {"login_failed", "2fa_enable", "2fa_disable", "2fa_failed", "2fa_replay", "2fa_ratelimited",
		"2fa_backup_codes_regenerated", "password_changed", "password_change_failed", "password_reset",
		"password_reset_requested", "oauth_link", "oauth_unlink", "oauth_link_rejected", "file_rekey",
		"account_deletion_requested", "account_deletion_denied", "account_deletion_cancelled"},
	"files": {"uploads", "file_delete", "file_restore", "file_purge", "file_purge_client", "folder_delete",
		"folder_password_set", "folder_password_remove", "files_verify", "account_export"},
	"sharing": {"share_create", "space_join", "send_init", "send_complete"},
	"storage": {"platform_connect", "platform_disconnect", "token_scope_change", "repo_register", "repo_deactivate"},
}

// JourneyFamilyNames lists every family, including the catch-alls.
var JourneyFamilyNames = []string{"auth", "security", "files", "sharing", "storage", "admin", "account"}

// journeyHiddenKinds are per-file upload events: the journey shows uploads as
// one entry per day from the files table instead.
var journeyHiddenKinds = []string{"upload_init", "upload_complete", "upload_resume"}

// JourneyEvent is one entry of a user's journey.
type JourneyEvent struct {
	ID        string                 `json:"id"`
	Kind      string                 `json:"kind"`
	Family    string                 `json:"family"`
	CreatedAt time.Time              `json:"created_at"`
	IPPrefix  string                 `json:"ip_prefix"`
	UserAgent string                 `json:"user_agent"`
	Device    string                 `json:"device"`
	Metadata  map[string]interface{} `json:"metadata"`
	Actor     string                 `json:"actor,omitempty"`
	Count     int64                  `json:"count,omitempty"`
	Bytes     int64                  `json:"bytes,omitempty"`
}

func journeyFamilySQL(w *whereBuilder) string {
	names := make([]string, 0, len(JourneyFamilies))
	for name := range JourneyFamilies {
		names = append(names, name)
	}
	sort.Strings(names)
	var b strings.Builder
	b.WriteString("CASE")
	for _, name := range names {
		fmt.Fprintf(&b, " WHEN kind = ANY(%s::text[]) THEN '%s'", w.arg(JourneyFamilies[name]), name)
	}
	b.WriteString(` WHEN kind LIKE 'admin\_%' THEN 'admin' ELSE 'account' END`)
	return b.String()
}

// journeyCTE is every journey entry for user $1 with its family.
func journeyCTE(w *whereBuilder) string {
	return `WITH j AS (
	SELECT a.id::text AS id, a.event_type AS kind, a.created_at, a.ip, a.user_agent, a.metadata,
	       ''::text AS actor, 0::bigint AS n, 0::bigint AS bytes
	  FROM audit_events a
	 WHERE a.user_id = $1::uuid AND a.event_type <> ALL(` + w.arg(journeyHiddenKinds) + `::text[])
	UNION ALL
	SELECT a.id::text, a.event_type, a.created_at, a.ip, a.user_agent, a.metadata, COALESCE(u.username, ''), 0, 0
	  FROM audit_events a LEFT JOIN users u ON u.id = a.user_id
	 WHERE a.metadata ? 'target_user' AND a.metadata->>'target_user' = ($1::uuid)::text
	   AND a.user_id IS DISTINCT FROM $1::uuid
	UNION ALL
	SELECT 'uploads-' || to_char(d, 'YYYY-MM-DD'), 'uploads', MAX(created_at), '', '', '{}'::jsonb, '', COUNT(*), COALESCE(SUM(original_size), 0)
	  FROM (SELECT date_trunc('day', created_at) AS d, created_at, original_size
	          FROM files WHERE user_id = $1::uuid AND status = 'complete') up
	 GROUP BY d
	UNION ALL
	SELECT 'share-' || id::text, 'share_create', created_at, '', '', '{}'::jsonb, '', 0, 0
	  FROM shares WHERE user_id = $1::uuid
	UNION ALL
	SELECT 'space-' || id::text, 'space_join', joined_at, '', '', jsonb_build_object('role', role), '', 0, 0
	  FROM shared_vault_members WHERE user_id = $1::uuid
), k AS (SELECT j.*, ` + journeyFamilySQL(w) + ` AS family FROM j)`
}

// UserJourney returns one page of a user's journey (newest first) filtered to
// the given families, the number of entries matching the filter, and the
// count in every family so the filter can show them.
func (db *DB) UserJourney(ctx context.Context, userID string, families []string, limit, offset int) ([]JourneyEvent, int, map[string]int, error) {
	w := &whereBuilder{args: []any{userID}}
	cte := journeyCTE(w)

	counts := map[string]int{}
	for _, name := range JourneyFamilyNames {
		counts[name] = 0
	}
	rows, err := db.pool.Query(ctx, cte+` SELECT family, COUNT(*) FROM k GROUP BY family`, w.args...)
	if err != nil {
		return nil, 0, nil, fmt.Errorf("journey counts: %w", err)
	}
	for rows.Next() {
		var fam string
		var n int
		if err := rows.Scan(&fam, &n); err != nil {
			rows.Close()
			return nil, 0, nil, fmt.Errorf("scan journey count: %w", err)
		}
		counts[fam] = n
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, 0, nil, fmt.Errorf("journey counts: %w", err)
	}

	total := 0
	for _, fam := range families {
		total += counts[fam]
	}

	q := cte + ` SELECT id, kind, family, created_at, ip, user_agent, metadata, actor, n, bytes FROM k
	 WHERE family = ANY(` + w.arg(families) + `::text[])
	 ORDER BY created_at DESC, id DESC LIMIT ` + w.arg(limit) + ` OFFSET ` + w.arg(offset)
	rows, err = db.pool.Query(ctx, q, w.args...)
	if err != nil {
		return nil, 0, nil, fmt.Errorf("journey: %w", err)
	}
	defer rows.Close()
	out := []JourneyEvent{}
	for rows.Next() {
		var e JourneyEvent
		var meta []byte
		if err := rows.Scan(&e.ID, &e.Kind, &e.Family, &e.CreatedAt, &e.IPPrefix, &e.UserAgent, &meta,
			&e.Actor, &e.Count, &e.Bytes); err != nil {
			return nil, 0, nil, fmt.Errorf("scan journey event: %w", err)
		}
		e.Metadata = decodeMeta(meta)
		out = append(out, e)
	}
	return out, total, counts, rows.Err()
}

// DayCount is a per-day number for charts; Date is YYYY-MM-DD.
type DayCount struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

// LabelCount is a count and byte total for one label (file type, platform).
type LabelCount struct {
	Label string `json:"label"`
	Count int64  `json:"count"`
	Bytes int64  `json:"bytes"`
}

// UserReportStats is the database half of an admin user report.
type UserReportStats struct {
	DaysActive       int          `json:"days_active"`
	LastActiveAt     *time.Time   `json:"last_active_at"`
	Activity         []DayCount   `json:"activity"`
	FilesByType      []LabelCount `json:"files_by_type"`
	Platforms        []LabelCount `json:"platforms"`
	Shares           int          `json:"shares"`
	Spaces           int          `json:"spaces"`
	FailedSignins7d  int          `json:"failed_signins_7d"`
	Countries7d      []string     `json:"countries_7d"`
	SignedInEvents7d int          `json:"sign_ins_7d"`
}

// fileTypeExpr labels a file by its extension when its name is still
// readable; sealed names only say "sealed". Names themselves never leave.
const fileTypeExpr = `CASE
	WHEN encrypted_name <> '' OR original_name LIKE 'enc1:%' THEN 'sealed'
	ELSE COALESCE(lower(substring(original_name from '\.([A-Za-z0-9]{1,8})$')), 'none') END`

// UserReport gathers the activity, files, platforms and risk inputs for one
// user's admin report in a handful of bounded queries.
func (db *DB) UserReport(ctx context.Context, userID string, activityDays int) (*UserReportStats, error) {
	r := &UserReportStats{Countries7d: []string{}}
	if err := db.pool.QueryRow(ctx,
		`SELECT COUNT(DISTINCT date_trunc('day', created_at)), MAX(created_at) FROM audit_events WHERE user_id = $1`,
		userID).Scan(&r.DaysActive, &r.LastActiveAt); err != nil {
		return nil, fmt.Errorf("report days active: %w", err)
	}

	var err error
	if r.Activity, err = db.dayCounts(ctx,
		`SELECT to_char(d.day, 'YYYY-MM-DD'), COUNT(a.id)
		   FROM generate_series(CURRENT_DATE - ($2::int - 1), CURRENT_DATE, '1 day') AS d(day)
		   LEFT JOIN audit_events a ON a.user_id = $1 AND a.created_at >= d.day AND a.created_at < d.day + INTERVAL '1 day'
		  GROUP BY d.day ORDER BY d.day`, userID, activityDays); err != nil {
		return nil, fmt.Errorf("report activity: %w", err)
	}
	if r.FilesByType, err = db.labelCounts(ctx,
		`SELECT `+fileTypeExpr+` AS t, COUNT(*), COALESCE(SUM(original_size), 0)
		   FROM files WHERE user_id = $1 AND status = 'complete' GROUP BY t ORDER BY 2 DESC, t LIMIT 12`, userID); err != nil {
		return nil, fmt.Errorf("report file types: %w", err)
	}
	if r.Platforms, err = db.labelCounts(ctx,
		`SELECT platform, COUNT(*), COALESCE(SUM(size), 0) FROM chunks WHERE user_id = $1
		  GROUP BY platform ORDER BY 3 DESC, platform`, userID); err != nil {
		return nil, fmt.Errorf("report platforms: %w", err)
	}
	if err := db.pool.QueryRow(ctx,
		`SELECT (SELECT COUNT(*) FROM shares WHERE user_id = $1),
		        (SELECT COUNT(*) FROM shared_vault_members WHERE user_id = $1),
		        (SELECT COUNT(*) FROM audit_events WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days'
		            AND event_type IN ('login_failed', '2fa_failed', 'password_change_failed')),
		        (SELECT COUNT(*) FROM audit_events WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days'
		            AND event_type IN ('login', 'login_decoy', 'oauth_login', 'magic_link_used'))`,
		userID).Scan(&r.Shares, &r.Spaces, &r.FailedSignins7d, &r.SignedInEvents7d); err != nil {
		return nil, fmt.Errorf("report counts: %w", err)
	}
	rows, err := db.pool.Query(ctx,
		`SELECT DISTINCT c FROM (
		     SELECT metadata->>'country' AS c FROM audit_events
		      WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days' AND metadata ? 'country'
		     UNION
		     SELECT country FROM refresh_tokens WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days'
		 ) x WHERE c <> '' ORDER BY c`, userID)
	if err != nil {
		return nil, fmt.Errorf("report countries: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			return nil, fmt.Errorf("scan report country: %w", err)
		}
		r.Countries7d = append(r.Countries7d, c)
	}
	return r, rows.Err()
}

func (db *DB) dayCounts(ctx context.Context, q string, args ...any) ([]DayCount, error) {
	rows, err := db.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []DayCount{}
	for rows.Next() {
		var d DayCount
		if err := rows.Scan(&d.Date, &d.Count); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (db *DB) labelCounts(ctx context.Context, q string, args ...any) ([]LabelCount, error) {
	rows, err := db.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []LabelCount{}
	for rows.Next() {
		var l LabelCount
		if err := rows.Scan(&l.Label, &l.Count, &l.Bytes); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}
