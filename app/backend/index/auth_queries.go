package index

import (
	"fmt"
	"time"

	"github.com/zpush/zpush/types"
)

// --- Users ---

// CreateUser inserts a new user.
func (db *DB) CreateUser(u *types.User) error {
	_, err := db.conn.Exec(
		`INSERT INTO users (id, email, username, password_hash, email_verified, totp_secret, totp_enabled)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		u.ID, u.Email, u.Username, u.PasswordHash,
		boolToInt(u.EmailVerified), u.TOTPSecret, boolToInt(u.TOTPEnabled),
	)
	if err != nil {
		return fmt.Errorf("create user: %w", err)
	}
	return nil
}

// GetUserByEmail retrieves a user by email.
func (db *DB) GetUserByEmail(email string) (*types.User, error) {
	return db.scanUser(
		`SELECT id, email, username, password_hash, email_verified, totp_secret, totp_enabled, created_at, updated_at
		 FROM users WHERE email = ?`, email,
	)
}

// GetUserByID retrieves a user by ID.
func (db *DB) GetUserByID(id string) (*types.User, error) {
	return db.scanUser(
		`SELECT id, email, username, password_hash, email_verified, totp_secret, totp_enabled, created_at, updated_at
		 FROM users WHERE id = ?`, id,
	)
}

// GetUserByUsername retrieves a user by username.
func (db *DB) GetUserByUsername(username string) (*types.User, error) {
	return db.scanUser(
		`SELECT id, email, username, password_hash, email_verified, totp_secret, totp_enabled, created_at, updated_at
		 FROM users WHERE username = ?`, username,
	)
}

func (db *DB) scanUser(query string, args ...interface{}) (*types.User, error) {
	row := db.conn.QueryRow(query, args...)
	u := &types.User{}
	var verified, totpEnabled int
	err := row.Scan(&u.ID, &u.Email, &u.Username, &u.PasswordHash,
		&verified, &u.TOTPSecret, &totpEnabled, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}
	u.EmailVerified = verified == 1
	u.TOTPEnabled = totpEnabled == 1
	return u, nil
}

// SetEmailVerified marks a user's email as verified.
func (db *DB) SetEmailVerified(userID string) error {
	_, err := db.conn.Exec(
		`UPDATE users SET email_verified = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, userID,
	)
	return err
}

// UpdateUserPassword updates a user's password hash.
func (db *DB) UpdateUserPassword(userID, passwordHash string) error {
	_, err := db.conn.Exec(
		`UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		passwordHash, userID,
	)
	return err
}

// SetTOTPSecret stores a TOTP secret (before enabling).
func (db *DB) SetTOTPSecret(userID, secret string) error {
	_, err := db.conn.Exec(
		`UPDATE users SET totp_secret = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
		secret, userID,
	)
	return err
}

// EnableTOTP enables TOTP 2FA for a user.
func (db *DB) EnableTOTP(userID string) error {
	_, err := db.conn.Exec(
		`UPDATE users SET totp_enabled = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, userID,
	)
	return err
}

// DisableTOTP disables TOTP 2FA and clears the secret.
func (db *DB) DisableTOTP(userID string) error {
	_, err := db.conn.Exec(
		`UPDATE users SET totp_enabled = 0, totp_secret = '', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, userID,
	)
	return err
}

// --- Refresh Tokens ---

// InsertRefreshToken stores a refresh token hash.
func (db *DB) InsertRefreshToken(rt *types.RefreshToken) error {
	_, err := db.conn.Exec(
		`INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
		rt.ID, rt.UserID, rt.TokenHash, rt.ExpiresAt,
	)
	if err != nil {
		return fmt.Errorf("insert refresh token: %w", err)
	}
	return nil
}

// GetRefreshTokenByHash looks up a refresh token by its SHA256 hash.
func (db *DB) GetRefreshTokenByHash(hash string) (*types.RefreshToken, error) {
	row := db.conn.QueryRow(
		`SELECT id, user_id, token_hash, expires_at, created_at
		 FROM refresh_tokens WHERE token_hash = ?`, hash,
	)
	rt := &types.RefreshToken{}
	err := row.Scan(&rt.ID, &rt.UserID, &rt.TokenHash, &rt.ExpiresAt, &rt.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get refresh token: %w", err)
	}
	return rt, nil
}

// DeleteRefreshToken removes a specific refresh token.
func (db *DB) DeleteRefreshToken(id string) error {
	_, err := db.conn.Exec(`DELETE FROM refresh_tokens WHERE id = ?`, id)
	return err
}

// DeleteRefreshTokensByUser removes all refresh tokens for a user.
func (db *DB) DeleteRefreshTokensByUser(userID string) error {
	_, err := db.conn.Exec(`DELETE FROM refresh_tokens WHERE user_id = ?`, userID)
	return err
}

// CleanExpiredRefreshTokens deletes expired refresh tokens.
func (db *DB) CleanExpiredRefreshTokens() error {
	_, err := db.conn.Exec(`DELETE FROM refresh_tokens WHERE expires_at < ?`, time.Now())
	return err
}

// --- Email Tokens ---

// InsertEmailToken stores an email verification or password reset token.
func (db *DB) InsertEmailToken(et *types.EmailToken) error {
	_, err := db.conn.Exec(
		`INSERT INTO email_tokens (id, user_id, token_hash, kind, expires_at) VALUES (?, ?, ?, ?, ?)`,
		et.ID, et.UserID, et.TokenHash, et.Kind, et.ExpiresAt,
	)
	if err != nil {
		return fmt.Errorf("insert email token: %w", err)
	}
	return nil
}

// GetEmailTokenByHash looks up an email token by its SHA256 hash.
func (db *DB) GetEmailTokenByHash(hash string) (*types.EmailToken, error) {
	row := db.conn.QueryRow(
		`SELECT id, user_id, token_hash, kind, expires_at
		 FROM email_tokens WHERE token_hash = ?`, hash,
	)
	et := &types.EmailToken{}
	err := row.Scan(&et.ID, &et.UserID, &et.TokenHash, &et.Kind, &et.ExpiresAt)
	if err != nil {
		return nil, fmt.Errorf("get email token: %w", err)
	}
	return et, nil
}

// DeleteEmailToken removes a specific email token.
func (db *DB) DeleteEmailToken(id string) error {
	_, err := db.conn.Exec(`DELETE FROM email_tokens WHERE id = ?`, id)
	return err
}

// DeleteEmailTokensByUser removes all tokens of a kind for a user.
func (db *DB) DeleteEmailTokensByUser(userID, kind string) error {
	_, err := db.conn.Exec(`DELETE FROM email_tokens WHERE user_id = ? AND kind = ?`, userID, kind)
	return err
}
