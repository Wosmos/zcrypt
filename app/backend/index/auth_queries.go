package index

import (
	"context"
	"fmt"
	"time"

	"github.com/zpush/zpush/types"
)

// --- Users ---

// CreateUser inserts a new user.
func (db *DB) CreateUser(ctx context.Context, u *types.User) error {
	plan := u.Plan
	if plan == "" {
		plan = "free"
	}
	_, err := db.pool.Exec(ctx,
		`INSERT INTO users (id, email, username, password_hash, email_verified, totp_secret, totp_enabled, role, plan)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		u.ID, u.Email, u.Username, u.PasswordHash,
		u.EmailVerified, u.TOTPSecret, u.TOTPEnabled, u.Role, plan,
	)
	if err != nil {
		return fmt.Errorf("create user: %w", err)
	}
	return nil
}

// GetUserByEmail retrieves a user by email.
func (db *DB) GetUserByEmail(ctx context.Context, email string) (*types.User, error) {
	return db.scanUser(ctx,
		`SELECT id, email, username, password_hash, email_verified, totp_secret, totp_enabled, role, plan, storage_quota_bytes, created_at, updated_at
		 FROM users WHERE email = $1`, email,
	)
}

// GetUserByID retrieves a user by ID.
func (db *DB) GetUserByID(ctx context.Context, id string) (*types.User, error) {
	return db.scanUser(ctx,
		`SELECT id, email, username, password_hash, email_verified, totp_secret, totp_enabled, role, plan, storage_quota_bytes, created_at, updated_at
		 FROM users WHERE id = $1`, id,
	)
}

// GetUserByUsername retrieves a user by username.
func (db *DB) GetUserByUsername(ctx context.Context, username string) (*types.User, error) {
	return db.scanUser(ctx,
		`SELECT id, email, username, password_hash, email_verified, totp_secret, totp_enabled, role, plan, storage_quota_bytes, created_at, updated_at
		 FROM users WHERE username = $1`, username,
	)
}

func (db *DB) scanUser(ctx context.Context, query string, args ...interface{}) (*types.User, error) {
	row := db.pool.QueryRow(ctx, query, args...)
	u := &types.User{}
	err := row.Scan(&u.ID, &u.Email, &u.Username, &u.PasswordHash,
		&u.EmailVerified, &u.TOTPSecret, &u.TOTPEnabled, &u.Role, &u.Plan, &u.StorageQuota, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}
	return u, nil
}

// GetUserCount returns the total number of users.
func (db *DB) GetUserCount(ctx context.Context) (int, error) {
	var count int
	err := db.pool.QueryRow(ctx, `SELECT COUNT(*) FROM users`).Scan(&count)
	return count, err
}

// SetEmailVerified marks a user's email as verified.
func (db *DB) SetEmailVerified(ctx context.Context, userID string) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE id = $1`, userID,
	)
	return err
}

// UpdateUserPassword updates a user's password hash.
func (db *DB) UpdateUserPassword(ctx context.Context, userID, passwordHash string) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
		passwordHash, userID,
	)
	return err
}

// SetTOTPSecret stores a TOTP secret (before enabling).
func (db *DB) SetTOTPSecret(ctx context.Context, userID, secret string) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE users SET totp_secret = $1, updated_at = NOW() WHERE id = $2`,
		secret, userID,
	)
	return err
}

// EnableTOTP enables TOTP 2FA for a user.
func (db *DB) EnableTOTP(ctx context.Context, userID string) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE users SET totp_enabled = TRUE, updated_at = NOW() WHERE id = $1`, userID,
	)
	return err
}

// DisableTOTP disables TOTP 2FA and clears the secret.
func (db *DB) DisableTOTP(ctx context.Context, userID string) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE users SET totp_enabled = FALSE, totp_secret = '', updated_at = NOW() WHERE id = $1`, userID,
	)
	return err
}

// SetUserRole updates a user's role.
func (db *DB) SetUserRole(ctx context.Context, userID string, role types.Role) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2`, role, userID,
	)
	return err
}

// SetUserPlan updates a user's plan (e.g. "free" or "pro").
func (db *DB) SetUserPlan(ctx context.Context, userID, plan string) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE users SET plan = $1, updated_at = NOW() WHERE id = $2`, plan, userID,
	)
	return err
}

// DeleteUser removes a user and all associated data (cascade).
func (db *DB) DeleteUser(ctx context.Context, userID string) error {
	_, err := db.pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	return err
}

// ListUsers returns all users with file count and storage stats.
func (db *DB) ListUsers(ctx context.Context) ([]types.AdminUser, error) {
	rows, err := db.pool.Query(ctx,
		`SELECT u.id, u.email, u.username, u.password_hash, u.email_verified,
		        u.totp_secret, u.totp_enabled, u.role, u.plan, u.storage_quota_bytes, u.created_at, u.updated_at,
		        COALESCE(f.cnt, 0), COALESCE(f.total, 0)
		 FROM users u
		 LEFT JOIN (
		     SELECT user_id, COUNT(*) as cnt, COALESCE(SUM(original_size), 0) as total
		     FROM files WHERE status = 'complete' GROUP BY user_id
		 ) f ON f.user_id = u.id
		 ORDER BY u.created_at DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()

	var users []types.AdminUser
	for rows.Next() {
		var u types.AdminUser
		if err := rows.Scan(&u.ID, &u.Email, &u.Username, &u.PasswordHash,
			&u.EmailVerified, &u.TOTPSecret, &u.TOTPEnabled, &u.Role, &u.Plan, &u.StorageQuota,
			&u.CreatedAt, &u.UpdatedAt, &u.FileCount, &u.TotalStorage); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		users = append(users, u)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate users: %w", err)
	}
	return users, nil
}

// GetSystemStats returns aggregate system statistics.
func (db *DB) GetSystemStats(ctx context.Context) (*types.SystemStats, error) {
	s := &types.SystemStats{}
	err := db.pool.QueryRow(ctx, `SELECT COUNT(*) FROM users`).Scan(&s.TotalUsers)
	if err != nil {
		return nil, err
	}
	db.pool.QueryRow(ctx, `SELECT COUNT(*), COALESCE(SUM(original_size), 0) FROM files WHERE status = 'complete'`).Scan(&s.TotalFiles, &s.TotalStorageBytes)
	db.pool.QueryRow(ctx, `SELECT COUNT(*) FROM repos`).Scan(&s.TotalRepos)
	return s, nil
}

// --- Storage Quotas ---

// SetUserQuota updates a user's storage quota override. Pass nil to reset to global default.
func (db *DB) SetUserQuota(ctx context.Context, userID string, quotaBytes *int64) error {
	_, err := db.pool.Exec(ctx,
		`UPDATE users SET storage_quota_bytes = $1, updated_at = NOW() WHERE id = $2`,
		quotaBytes, userID,
	)
	return err
}

// GetUserStorageUsed returns the total bytes used by a user (including in-progress uploads).
func (db *DB) GetUserStorageUsed(ctx context.Context, userID string) (int64, error) {
	var used int64
	err := db.pool.QueryRow(ctx,
		`SELECT COALESCE(SUM(original_size), 0) FROM files WHERE user_id = $1 AND status IN ('complete', 'uploading')`,
		userID,
	).Scan(&used)
	return used, err
}

// UserHasPersonalTokens returns true if the user has any non-global platform tokens.
func (db *DB) UserHasPersonalTokens(ctx context.Context, userID string) (bool, error) {
	var exists bool
	err := db.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM platform_tokens WHERE user_id = $1 AND is_global = FALSE)`,
		userID,
	).Scan(&exists)
	return exists, err
}

// --- System Settings ---

// GetSystemSetting retrieves a value from the system_settings table.
func (db *DB) GetSystemSetting(ctx context.Context, key string) (string, error) {
	var value string
	err := db.pool.QueryRow(ctx, `SELECT value FROM system_settings WHERE key = $1`, key).Scan(&value)
	if err != nil {
		return "", fmt.Errorf("get setting %q: %w", key, err)
	}
	return value, nil
}

// SetSystemSetting upserts a value in the system_settings table.
func (db *DB) SetSystemSetting(ctx context.Context, key, value string) error {
	_, err := db.pool.Exec(ctx,
		`INSERT INTO system_settings (key, value, updated_at) VALUES ($1, $2, NOW())
		 ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
		key, value,
	)
	return err
}

// --- Refresh Tokens ---

// InsertRefreshToken stores a refresh token hash.
func (db *DB) InsertRefreshToken(ctx context.Context, rt *types.RefreshToken) error {
	_, err := db.pool.Exec(ctx,
		`INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
		rt.ID, rt.UserID, rt.TokenHash, rt.ExpiresAt,
	)
	if err != nil {
		return fmt.Errorf("insert refresh token: %w", err)
	}
	return nil
}

// GetRefreshTokenByHash looks up a refresh token by its SHA256 hash.
func (db *DB) GetRefreshTokenByHash(ctx context.Context, hash string) (*types.RefreshToken, error) {
	row := db.pool.QueryRow(ctx,
		`SELECT id, user_id, token_hash, expires_at, created_at
		 FROM refresh_tokens WHERE token_hash = $1`, hash,
	)
	rt := &types.RefreshToken{}
	err := row.Scan(&rt.ID, &rt.UserID, &rt.TokenHash, &rt.ExpiresAt, &rt.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get refresh token: %w", err)
	}
	return rt, nil
}

// DeleteRefreshToken removes a specific refresh token.
func (db *DB) DeleteRefreshToken(ctx context.Context, id string) error {
	_, err := db.pool.Exec(ctx, `DELETE FROM refresh_tokens WHERE id = $1`, id)
	return err
}

// DeleteRefreshTokensByUser removes all refresh tokens for a user.
func (db *DB) DeleteRefreshTokensByUser(ctx context.Context, userID string) error {
	_, err := db.pool.Exec(ctx, `DELETE FROM refresh_tokens WHERE user_id = $1`, userID)
	return err
}

// CleanExpiredRefreshTokens deletes expired refresh tokens.
func (db *DB) CleanExpiredRefreshTokens(ctx context.Context) error {
	_, err := db.pool.Exec(ctx, `DELETE FROM refresh_tokens WHERE expires_at < $1`, time.Now())
	return err
}

// --- Email Tokens ---

// InsertEmailToken stores an email verification or password reset token.
func (db *DB) InsertEmailToken(ctx context.Context, et *types.EmailToken) error {
	_, err := db.pool.Exec(ctx,
		`INSERT INTO email_tokens (id, user_id, token_hash, kind, expires_at) VALUES ($1, $2, $3, $4, $5)`,
		et.ID, et.UserID, et.TokenHash, et.Kind, et.ExpiresAt,
	)
	if err != nil {
		return fmt.Errorf("insert email token: %w", err)
	}
	return nil
}

// GetEmailTokenByHash looks up an email token by its SHA256 hash.
func (db *DB) GetEmailTokenByHash(ctx context.Context, hash string) (*types.EmailToken, error) {
	row := db.pool.QueryRow(ctx,
		`SELECT id, user_id, token_hash, kind, expires_at
		 FROM email_tokens WHERE token_hash = $1`, hash,
	)
	et := &types.EmailToken{}
	err := row.Scan(&et.ID, &et.UserID, &et.TokenHash, &et.Kind, &et.ExpiresAt)
	if err != nil {
		return nil, fmt.Errorf("get email token: %w", err)
	}
	return et, nil
}

// DeleteEmailToken removes a specific email token.
func (db *DB) DeleteEmailToken(ctx context.Context, id string) error {
	_, err := db.pool.Exec(ctx, `DELETE FROM email_tokens WHERE id = $1`, id)
	return err
}

// DeleteEmailTokensByUser removes all tokens of a kind for a user.
func (db *DB) DeleteEmailTokensByUser(ctx context.Context, userID, kind string) error {
	_, err := db.pool.Exec(ctx, `DELETE FROM email_tokens WHERE user_id = $1 AND kind = $2`, userID, kind)
	return err
}
