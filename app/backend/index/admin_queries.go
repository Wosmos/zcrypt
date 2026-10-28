package index

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/zcrypt/zcrypt/types"
)

// ListPage is a validated page request shared by the admin lists. Sort is
// always a key the caller checked against its own allowlist.
type ListPage struct {
	Limit  int
	Offset int
	Search string
	Sort   string
	Desc   bool
}

// AdminUserFilter narrows the admin user list.
type AdminUserFilter struct {
	ListPage
	Country string
	Role    string
	Plan    string
}

// UnknownCountry selects users whose country is not known.
const UnknownCountry = "unknown"

// AdminUserSorts maps the user list's sort keys to their SQL expressions.
var AdminUserSorts = map[string]string{
	"created_at":   "u.created_at",
	"last_seen_at": "u.last_seen_at",
	"username":     "lower(u.username)",
	"email":        "lower(u.email)",
	"file_count":   "file_count",
	"total_size":   "total_size",
	"country":      "country",
}

// whereBuilder collects AND-ed conditions and their positional arguments.
type whereBuilder struct {
	conds []string
	args  []any
}

func (w *whereBuilder) arg(v any) string {
	w.args = append(w.args, v)
	return fmt.Sprintf("$%d", len(w.args))
}

func (w *whereBuilder) add(cond string) { w.conds = append(w.conds, cond) }

func (w *whereBuilder) sql() string {
	if len(w.conds) == 0 {
		return ""
	}
	return " WHERE " + strings.Join(w.conds, " AND ")
}

func likePattern(s string) string {
	return "%" + strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(s) + "%"
}

func orderSQL(expr string, desc bool, tie string) string {
	dir := "ASC"
	if desc {
		dir = "DESC"
	}
	return fmt.Sprintf(" ORDER BY %s %s NULLS LAST, %s %s", expr, dir, tie, dir)
}

const userCountryExpr = `COALESCE(NULLIF(u.last_country, ''), u.signup_country)`

const adminUserSelect = `WITH f AS (
	SELECT user_id, COUNT(*) AS cnt, COALESCE(SUM(original_size), 0) AS total
	  FROM files WHERE status = 'complete' GROUP BY user_id
), s AS (
	SELECT user_id, COUNT(DISTINCT COALESCE(session_id, id)) AS cnt
	  FROM refresh_tokens WHERE expires_at > NOW() GROUP BY user_id
)
SELECT u.id, u.email, u.username, u.email_verified, u.totp_enabled, u.role, u.plan,
       u.storage_quota_bytes, u.deletion_scheduled_at, u.created_at, u.updated_at,
       u.signup_country, u.signup_region, u.signup_city,
       u.last_country, u.last_region, u.last_city, u.last_ip_prefix, u.last_seen_at, u.last_user_agent,
       COALESCE(f.cnt, 0) AS file_count, COALESCE(f.total, 0) AS total_size, COALESCE(s.cnt, 0),
       ` + userCountryExpr + ` AS country
  FROM users u LEFT JOIN f ON f.user_id = u.id LEFT JOIN s ON s.user_id = u.id`

func scanAdminUser(row interface{ Scan(...any) error }) (types.AdminUser, error) {
	var u types.AdminUser
	var country string
	err := row.Scan(&u.ID, &u.Email, &u.Username, &u.EmailVerified, &u.TOTPEnabled, &u.Role, &u.Plan,
		&u.StorageQuota, &u.DeletionScheduledAt, &u.CreatedAt, &u.UpdatedAt,
		&u.SignupCountry, &u.SignupRegion, &u.SignupCity,
		&u.LastCountry, &u.LastRegion, &u.LastCity, &u.LastIPPrefix, &u.LastSeenAt, &u.LastUserAgent,
		&u.FileCount, &u.TotalStorage, &u.SessionCount, &country)
	return u, err
}

func adminUserWhere(f AdminUserFilter) *whereBuilder {
	w := &whereBuilder{}
	if f.Search != "" {
		p := w.arg(likePattern(f.Search))
		w.add("(u.email ILIKE " + p + " OR u.username ILIKE " + p + ")")
	}
	switch {
	case f.Country == UnknownCountry:
		w.add(userCountryExpr + " = ''")
	case f.Country != "":
		w.add(userCountryExpr + " = " + w.arg(f.Country))
	}
	if f.Role != "" {
		w.add("u.role = " + w.arg(f.Role))
	}
	if f.Plan != "" {
		w.add("u.plan = " + w.arg(f.Plan))
	}
	return w
}

// ListAdminUsers returns one page of users with their storage, sessions and
// last known location, plus the number of users matching the filter.
func (db *DB) ListAdminUsers(ctx context.Context, f AdminUserFilter) ([]types.AdminUser, int, error) {
	w := adminUserWhere(f)
	var total int
	if err := db.pool.QueryRow(ctx, `SELECT COUNT(*) FROM users u`+w.sql(), w.args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("count admin users: %w", err)
	}
	expr, ok := AdminUserSorts[f.Sort]
	if !ok {
		expr = AdminUserSorts["created_at"]
	}
	q := adminUserSelect + w.sql() + orderSQL(expr, f.Desc, "u.id") +
		" LIMIT " + w.arg(f.Limit) + " OFFSET " + w.arg(f.Offset)
	rows, err := db.pool.Query(ctx, q, w.args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list admin users: %w", err)
	}
	defer rows.Close()
	users := []types.AdminUser{}
	for rows.Next() {
		u, err := scanAdminUser(rows)
		if err != nil {
			return nil, 0, fmt.Errorf("scan admin user: %w", err)
		}
		users = append(users, u)
	}
	return users, total, rows.Err()
}

// GetAdminUser returns one user with the same fields as ListAdminUsers.
func (db *DB) GetAdminUser(ctx context.Context, id string) (*types.AdminUser, error) {
	u, err := scanAdminUser(db.pool.QueryRow(ctx, adminUserSelect+` WHERE u.id = $1`, id))
	if err != nil {
		return nil, fmt.Errorf("get admin user: %w", err)
	}
	return &u, nil
}

// SetSignupLocation records where an account was created. It only fills an
// empty value, so a later call never rewrites history.
func (db *DB) SetSignupLocation(ctx context.Context, userID string, loc types.GeoLocation) error {
	if loc == (types.GeoLocation{}) {
		return nil
	}
	_, err := db.pool.Exec(ctx,
		`UPDATE users SET signup_country = $2, signup_region = $3, signup_city = $4
		  WHERE id = $1 AND signup_country = '' AND signup_region = '' AND signup_city = ''`,
		userID, loc.Country, loc.Region, loc.City)
	if err != nil {
		return fmt.Errorf("set signup location: %w", err)
	}
	return nil
}

// CountryCount is how many users are in one country; Country is empty for
// users whose country is not known.
type CountryCount struct {
	Country string `json:"country"`
	Count   int    `json:"count"`
}

// UserCountries counts users by their last known country (or signup country).
func (db *DB) UserCountries(ctx context.Context, limit int) ([]CountryCount, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT `+userCountryExpr+` AS c, COUNT(*) FROM users u GROUP BY c ORDER BY 2 DESC, `+userCountryExpr+` = '', 1 LIMIT $1`, limit)
	if err != nil {
		return nil, fmt.Errorf("user countries: %w", err)
	}
	defer rows.Close()
	out := []CountryCount{}
	for rows.Next() {
		var c CountryCount
		if err := rows.Scan(&c.Country, &c.Count); err != nil {
			return nil, fmt.Errorf("scan user country: %w", err)
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// AdminSession is one live sign-in of a user as the admin console shows it.
type AdminSession struct {
	ID         string    `json:"id"`
	IPPrefix   string    `json:"ip_prefix"`
	UserAgent  string    `json:"user_agent"`
	Device     string    `json:"device"`
	Country    string    `json:"country"`
	Region     string    `json:"region"`
	City       string    `json:"city"`
	StartedAt  time.Time `json:"started_at"`
	LastActive time.Time `json:"last_active"`
	ExpiresAt  time.Time `json:"expires_at"`
}

// ListAdminSessions returns a user's live sessions, newest activity first,
// each described by its most recent refresh token.
func (db *DB) ListAdminSessions(ctx context.Context, userID string) ([]AdminSession, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT sid, ip, user_agent, country, region, city, session_started_at, created_at, expires_at FROM (
		     SELECT DISTINCT ON (COALESCE(session_id, id))
		            COALESCE(session_id, id)::text AS sid, ip, user_agent, country, region, city,
		            session_started_at, created_at, expires_at
		       FROM refresh_tokens
		      WHERE user_id = $1 AND expires_at > NOW()
		      ORDER BY COALESCE(session_id, id), created_at DESC
		 ) s ORDER BY created_at DESC LIMIT 50`, userID)
	if err != nil {
		return nil, fmt.Errorf("list admin sessions: %w", err)
	}
	defer rows.Close()
	out := []AdminSession{}
	for rows.Next() {
		var s AdminSession
		if err := rows.Scan(&s.ID, &s.IPPrefix, &s.UserAgent, &s.Country, &s.Region, &s.City,
			&s.StartedAt, &s.LastActive, &s.ExpiresAt); err != nil {
			return nil, fmt.Errorf("scan admin session: %w", err)
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func decodeMeta(b []byte) map[string]interface{} {
	m := map[string]interface{}{}
	if len(b) > 0 {
		_ = json.Unmarshal(b, &m)
	}
	return m
}
