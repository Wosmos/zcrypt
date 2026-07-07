package cmd

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/zcrypt/zcrypt/auth"
	"github.com/zcrypt/zcrypt/crypto"
	"github.com/zcrypt/zcrypt/types"
)

var emailRe = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
var usernameRe = regexp.MustCompile(`^[a-zA-Z0-9_]{3,32}$`)

// dummyPasswordHash is a bcrypt hash (same cost as auth.HashPassword) of a
// random throwaway string. Login compares against it when the email is
// unknown, so the request burns the same ~quarter second as a real password
// check — otherwise the fast unknown-email path would let an attacker
// enumerate which emails have accounts by timing responses.
const dummyPasswordHash = "$2a$12$jwwcg/vWlmCOz/dPW1to.OtzGR8q8t7A4OlpzO7f9PTPsjOBCi6rS"

// audit logs an audit event asynchronously and emits it via SSE.
func (s *Server) audit(r *http.Request, userID *string, eventType string, metadata map[string]interface{}) {
	if metadata == nil {
		metadata = map[string]interface{}{}
	}
	e := types.AuditEvent{
		ID:        uuid.New().String(),
		UserID:    userID,
		EventType: eventType,
		IP:        s.clientIP(r),
		UserAgent: r.UserAgent(),
		Metadata:  metadata,
		CreatedAt: time.Now(),
	}
	// Emit to SSE subscribers in real-time
	s.progress.EmitAudit(e)
	// Persist to DB asynchronously
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := s.db.InsertAuditEvent(ctx, &e); err != nil {
			log.Printf("audit: %v", err)
		}
	}()
}

// validatePassword enforces password complexity: min 8 chars, 1 uppercase, 1 digit, 1 special char.
func validatePassword(pw string) error {
	if len(pw) < 8 {
		return fmt.Errorf("password must be at least 8 characters")
	}
	var hasUpper, hasDigit, hasSpecial bool
	for _, c := range pw {
		switch {
		case c >= 'A' && c <= 'Z':
			hasUpper = true
		case c >= '0' && c <= '9':
			hasDigit = true
		case !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')):
			hasSpecial = true
		}
	}
	if !hasUpper {
		return fmt.Errorf("password must contain at least one uppercase letter")
	}
	if !hasDigit {
		return fmt.Errorf("password must contain at least one digit")
	}
	if !hasSpecial {
		return fmt.Errorf("password must contain at least one special character")
	}
	return nil
}

// emailCfg converts config.EmailConfig to auth.EmailConfig.
func (s *Server) emailCfg() *auth.EmailConfig {
	if s.cfg.Email == nil {
		return nil
	}
	return &auth.EmailConfig{
		APIKey: s.cfg.Email.APIKey,
		From:   s.cfg.Email.From,
	}
}

func (s *Server) baseURL(r *http.Request) string {
	// Always prefer configured frontend URL — never trust forwarded headers for email links
	if s.cfg.FrontendURL != "" {
		return strings.TrimRight(s.cfg.FrontendURL, "/")
	}
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	return fmt.Sprintf("%s://%s", scheme, r.Host)
}

// writeJSON writes a JSON response.
func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

// --- Handlers ---

// HandleRegister creates a new user account.
func (s *Server) HandleRegister(w http.ResponseWriter, r *http.Request) {
	// Auth-specific rate limiting: 5 attempts per 5 minutes per IP
	if !s.devMode && !s.authLimiter.allow(s.clientIP(r)) {
		http.Error(w, `{"error":"too many attempts, please try again later"}`, http.StatusTooManyRequests)
		return
	}

	ctx := r.Context()

	var req struct {
		Email    string `json:"email"`
		Username string `json:"username"`
		Password string `json:"password"`
		Force    bool   `json:"force"` // bypass breach warning
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.Username = strings.TrimSpace(req.Username)

	if !emailRe.MatchString(req.Email) {
		http.Error(w, `{"error":"invalid email format"}`, http.StatusBadRequest)
		return
	}
	if !usernameRe.MatchString(req.Username) {
		http.Error(w, `{"error":"username must be 3-32 characters (letters, numbers, underscore)"}`, http.StatusBadRequest)
		return
	}
	if err := validatePassword(req.Password); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err), http.StatusBadRequest)
		return
	}

	// Check password against breach database (non-blocking, fail-open)
	if !req.Force {
		if breachCount, _ := auth.CheckPasswordBreach(req.Password); breachCount > 0 {
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"warning":      fmt.Sprintf("This password has appeared in %d data breach(es). Consider using a different password.", breachCount),
				"breach_count": breachCount,
				"requires":     "force",
			})
			return
		}
	}

	// Check uniqueness — use generic messages to prevent account enumeration
	if existing, _ := s.db.GetUserByEmail(ctx, req.Email); existing != nil {
		http.Error(w, `{"error":"an account with this email or username already exists"}`, http.StatusConflict)
		return
	}
	if existing, _ := s.db.GetUserByUsername(ctx, req.Username); existing != nil {
		http.Error(w, `{"error":"an account with this email or username already exists"}`, http.StatusConflict)
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// Role is set atomically by CreateUser — first user becomes admin via SQL CASE.
	user := &types.User{
		ID:           uuid.New().String(),
		Email:        req.Email,
		Username:     req.Username,
		PasswordHash: hash,
		Role:         types.RoleUser,
	}

	// Auto-verify if SMTP not configured
	if s.cfg.Email == nil {
		user.EmailVerified = true
	}

	if err := s.db.CreateUser(ctx, user); err != nil {
		log.Printf("register: create user failed: %v", err)
		http.Error(w, `{"error":"registration failed, please try again"}`, http.StatusInternalServerError)
		return
	}

	// Send verification email if SMTP configured (async to avoid blocking response)
	if s.cfg.Email != nil {
		token, _ := auth.GenerateRandomToken()
		s.db.DeleteEmailTokensByUser(ctx, user.ID, "verify")
		s.db.InsertEmailToken(ctx, &types.EmailToken{
			ID:        uuid.New().String(),
			UserID:    user.ID,
			TokenHash: auth.HashToken(token),
			Kind:      "verify",
			ExpiresAt: time.Now().Add(24 * time.Hour),
		})
		emailCfg := s.emailCfg()
		baseURL := s.baseURL(r)
		go func() {
			if err := auth.SendVerificationEmail(emailCfg, req.Email, token, baseURL); err != nil {
				log.Printf("send verification email to %s: %v", req.Email, err)
			}
		}()
	}

	s.audit(r, &user.ID, "register", map[string]interface{}{"email": user.Email})

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"message": "account created",
		"user":    user,
	})
}

// HandleLogin authenticates a user with email and password.
func (s *Server) HandleLogin(w http.ResponseWriter, r *http.Request) {
	// Auth-specific rate limiting: 5 attempts per 5 minutes per IP
	clientIP := s.clientIP(r)
	if !s.devMode && !s.authLimiter.allow(clientIP) {
		http.Error(w, `{"error":"too many login attempts, please try again later"}`, http.StatusTooManyRequests)
		return
	}

	ctx := r.Context()

	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	// Per-email rate limiting: 3 attempts per 15 minutes
	if !s.devMode && !s.emailLimiter.allow(req.Email) {
		http.Error(w, `{"error":"too many attempts for this email, please try again later"}`, http.StatusTooManyRequests)
		return
	}

	user, err := s.db.GetUserByEmail(ctx, req.Email)
	if err != nil {
		_ = auth.CheckPassword(req.Password, dummyPasswordHash) // timing equalization — see dummyPasswordHash
		log.Printf("auth: login failed email=%s ip=%s reason=not_found", req.Email, clientIP)
		s.audit(r, nil, "login_failed", map[string]interface{}{"email": req.Email, "reason": "not_found"})
		http.Error(w, `{"error":"invalid email or password"}`, http.StatusUnauthorized)
		return
	}

	if err := auth.CheckPassword(req.Password, user.PasswordHash); err != nil {
		// Check if this is a decoy password
		decoy, decoyErr := s.db.GetDecoyVault(ctx, user.ID)
		if decoyErr == nil && decoy.Enabled {
			if auth.CheckPassword(req.Password, decoy.DecoyPasswordHash) == nil {
				// Decoy password match — issue decoy tokens
				s.audit(r, &user.ID, "login_decoy", map[string]interface{}{"email": user.Email})
				s.issueDecoyTokens(w, r, user)
				return
			}
		}

		log.Printf("auth: login failed email=%s ip=%s reason=wrong_password", req.Email, clientIP)
		s.audit(r, &user.ID, "login_failed", map[string]interface{}{"email": req.Email, "reason": "wrong_password"})
		http.Error(w, `{"error":"invalid email or password"}`, http.StatusUnauthorized)
		return
	}

	// If 2FA enabled, return temp token instead of full JWT
	if user.TOTPEnabled {
		tempToken, err := auth.GenerateTempToken(s.cfg.JWTSecret, user.ID)
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"requires_2fa": true,
			"temp_token":   tempToken,
		})
		return
	}

	s.audit(r, &user.ID, "login", map[string]interface{}{"email": user.Email})

	// Auto-checkin dead man's switch on successful login
	_ = s.db.CheckinDeadManSwitch(ctx, user.ID)

	s.issueTokens(w, r, user)
}

// HandleRefreshToken exchanges a refresh token for a new access token.
func (s *Server) HandleRefreshToken(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	hash := auth.HashToken(req.RefreshToken)
	rt, err := s.db.GetRefreshTokenByHash(ctx, hash)
	if err != nil {
		http.Error(w, `{"error":"invalid refresh token"}`, http.StatusUnauthorized)
		return
	}

	if time.Now().After(rt.ExpiresAt) {
		s.db.DeleteRefreshToken(ctx, rt.ID)
		http.Error(w, `{"error":"refresh token expired"}`, http.StatusUnauthorized)
		return
	}

	// Log IP mismatch (potential stolen token usage) but don't block — IPs change legitimately
	clientIP := s.clientIP(r)
	if rt.IP != "" && rt.IP != clientIP {
		log.Printf("security: refresh token IP mismatch for user %s: issued=%s current=%s", rt.UserID, rt.IP, clientIP)
	}

	user, err := s.db.GetUserByID(ctx, rt.UserID)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusUnauthorized)
		return
	}

	// Rotate refresh token
	s.db.DeleteRefreshToken(ctx, rt.ID)
	s.issueTokens(w, r, user)
}

// HandleLogout invalidates the refresh token.
func (s *Server) HandleLogout(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	hash := auth.HashToken(req.RefreshToken)
	rt, err := s.db.GetRefreshTokenByHash(ctx, hash)
	if err == nil {
		s.db.DeleteRefreshToken(ctx, rt.ID)
	}

	userID := GetUserID(r)
	if userID != "" {
		s.audit(r, &userID, "logout", nil)
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// HandleForgotPassword sends a password reset email.
func (s *Server) HandleForgotPassword(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	// Per-email rate limiting
	if !s.devMode && !s.emailLimiter.allow(req.Email) {
		// Still return generic response to prevent enumeration
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "if an account exists with that email, a reset link has been sent",
		})
		return
	}

	// Always return 200 to prevent account enumeration
	if s.cfg.Email == nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "if an account exists with that email, a reset link has been sent",
		})
		return
	}

	user, err := s.db.GetUserByEmail(ctx, req.Email)
	if err != nil || user == nil {
		// Return generic response to prevent account enumeration
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "if an account exists with that email, a reset link has been sent",
		})
		return
	}

	token, _ := auth.GenerateRandomToken()
	s.db.DeleteEmailTokensByUser(ctx, user.ID, "reset")
	s.db.InsertEmailToken(ctx, &types.EmailToken{
		ID:        uuid.New().String(),
		UserID:    user.ID,
		TokenHash: auth.HashToken(token),
		Kind:      "reset",
		ExpiresAt: time.Now().Add(1 * time.Hour),
	})

	// Send asynchronously (like register/magic-link do): a synchronous send
	// makes known emails measurably slower than the instant generic response
	// for unknown ones — a timing oracle on account existence.
	emailCfg := s.emailCfg()
	baseURL := s.baseURL(r)
	go func() {
		if err := auth.SendPasswordResetEmail(emailCfg, req.Email, token, baseURL); err != nil {
			log.Printf("send password reset email to %s: %v", req.Email, err)
		}
	}()

	s.audit(r, &user.ID, "password_reset_requested", map[string]interface{}{"email": req.Email})

	// Always return same response regardless of outcome
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "if an account exists with that email, a reset link has been sent",
	})
}

// HandleResetPassword resets a user's password using a token.
func (s *Server) HandleResetPassword(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req struct {
		Token       string `json:"token"`
		NewPassword string `json:"new_password"`
		Force       bool   `json:"force"` // bypass breach warning
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if err := validatePassword(req.NewPassword); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err), http.StatusBadRequest)
		return
	}

	// Check password against breach database
	if !req.Force {
		if breachCount, _ := auth.CheckPasswordBreach(req.NewPassword); breachCount > 0 {
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"warning":      fmt.Sprintf("This password has appeared in %d data breach(es). Consider using a different password.", breachCount),
				"breach_count": breachCount,
				"requires":     "force",
			})
			return
		}
	}

	hash := auth.HashToken(req.Token)
	et, err := s.db.GetEmailTokenByHash(ctx, hash)
	if err != nil || et.Kind != "reset" {
		http.Error(w, `{"error":"invalid or expired reset token"}`, http.StatusBadRequest)
		return
	}

	if time.Now().After(et.ExpiresAt) {
		s.db.DeleteEmailToken(ctx, et.ID)
		http.Error(w, `{"error":"reset token expired"}`, http.StatusBadRequest)
		return
	}

	passwordHash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	s.db.UpdateUserPassword(ctx, et.UserID, passwordHash)
	s.db.DeleteEmailToken(ctx, et.ID)
	s.db.IncrementTokenVersion(ctx, et.UserID)     // invalidate all existing JWTs
	s.tokenVersions.invalidate(et.UserID)          // drop cache so revocation is immediate
	s.db.DeleteRefreshTokensByUser(ctx, et.UserID) // force re-login everywhere

	s.audit(r, &et.UserID, "password_reset", nil)

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// HandleVerifyEmail verifies a user's email address.
func (s *Server) HandleVerifyEmail(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	hash := auth.HashToken(req.Token)
	et, err := s.db.GetEmailTokenByHash(ctx, hash)
	if err != nil || et.Kind != "verify" {
		http.Error(w, `{"error":"invalid or expired verification token"}`, http.StatusBadRequest)
		return
	}

	if time.Now().After(et.ExpiresAt) {
		s.db.DeleteEmailToken(ctx, et.ID)
		http.Error(w, `{"error":"verification token expired"}`, http.StatusBadRequest)
		return
	}

	s.db.SetEmailVerified(ctx, et.UserID)
	s.db.DeleteEmailToken(ctx, et.ID)

	s.audit(r, &et.UserID, "email_verify", nil)

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// HandleResendVerification resends the email verification link.
func (s *Server) HandleResendVerification(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	genericResp := map[string]interface{}{
		"success": true,
		"message": "if an unverified account exists with that email, a verification link has been sent",
	}

	// Per-email rate limiting
	if !s.devMode && !s.emailLimiter.allow(req.Email) {
		writeJSON(w, http.StatusOK, genericResp)
		return
	}

	user, err := s.db.GetUserByEmail(ctx, req.Email)
	if err != nil || user.EmailVerified {
		// Return generic response to prevent account enumeration
		writeJSON(w, http.StatusOK, genericResp)
		return
	}

	token, _ := auth.GenerateRandomToken()
	s.db.DeleteEmailTokensByUser(ctx, user.ID, "verify")
	s.db.InsertEmailToken(ctx, &types.EmailToken{
		ID:        uuid.New().String(),
		UserID:    user.ID,
		TokenHash: auth.HashToken(token),
		Kind:      "verify",
		ExpiresAt: time.Now().Add(24 * time.Hour),
	})

	// Async send + the same generic body as every other branch: a synchronous
	// send (and its 500-on-failure) only ever happened for real unverified
	// accounts, which distinguished them from the instant generic response.
	emailCfg := s.emailCfg()
	baseURL := s.baseURL(r)
	go func() {
		if err := auth.SendVerificationEmail(emailCfg, req.Email, token, baseURL); err != nil {
			log.Printf("resend verification email to %s: %v", req.Email, err)
		}
	}()

	writeJSON(w, http.StatusOK, genericResp)
}

// totpSecret returns the user's TOTP secret in plaintext. Secrets are sealed
// at rest with the user's KEK (a DB dump alone can't clone authenticators);
// rows written before encryption-at-rest existed pass through as-is and get
// re-sealed on the next successful verification.
func (s *Server) totpSecret(user *types.User) (string, error) {
	if user.TOTPSecret == "" {
		return "", nil
	}
	kek, err := crypto.DeriveUserKEK(s.masterKey, user.ID)
	if err != nil {
		return "", err
	}
	return crypto.OpenSecret(kek, user.TOTPSecret)
}

// Handle2FASetup generates a TOTP secret for the user.
func (s *Server) Handle2FASetup(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetUserClaims(r)
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	user, err := s.db.GetUserByID(ctx, claims.Sub)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	// A stolen access token must not be able to silently rotate the secret of
	// an already-protected account (locking the owner out of their authenticator).
	if user.TOTPEnabled {
		http.Error(w, `{"error":"2FA is already enabled — disable it first to generate a new secret"}`, http.StatusBadRequest)
		return
	}

	secret, err := auth.GenerateTOTPSecret()
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// Seal before storing — the plaintext secret goes only to the user's
	// authenticator app (below), never to the database.
	kek, err := crypto.DeriveUserKEK(s.masterKey, claims.Sub)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	sealed, err := crypto.SealSecret(kek, secret)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	if err := s.db.SetTOTPSecret(ctx, claims.Sub, sealed); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	uri := auth.GenerateTOTPURI(secret, claims.Email)

	writeJSON(w, http.StatusOK, map[string]string{
		"secret": secret,
		"uri":    uri,
	})
}

// Handle2FAEnable validates a TOTP code and enables 2FA.
func (s *Server) Handle2FAEnable(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetUserClaims(r)
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	user, err := s.db.GetUserByID(ctx, claims.Sub)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	if user.TOTPSecret == "" {
		http.Error(w, `{"error":"run 2fa setup first"}`, http.StatusBadRequest)
		return
	}

	if !s.devMode && !s.twoFAUserLimiter.allow(user.ID) {
		http.Error(w, `{"error":"too many 2FA attempts, please try again later"}`, http.StatusTooManyRequests)
		return
	}

	secret, err := s.totpSecret(user)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	counter, ok := auth.ValidateTOTPCodeCounter(secret, req.Code)
	if !ok {
		http.Error(w, `{"error":"invalid code"}`, http.StatusBadRequest)
		return
	}

	claimed, err := s.db.ClaimTOTPCounter(ctx, user.ID, counter)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	if !claimed {
		http.Error(w, `{"error":"this code was already used — wait for the next one"}`, http.StatusBadRequest)
		return
	}

	if err := s.db.EnableTOTP(ctx, user.ID); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// Mint one-time recovery codes so a lost authenticator can't permanently lock
	// the user out. Returned once, here — only their hashes are stored.
	codes, err := s.issueBackupCodes(ctx, user.ID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	s.audit(r, &user.ID, "2fa_enable", nil)

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "backup_codes": codes})
}

// issueBackupCodes generates a fresh set of recovery codes, stores their hashes
// (replacing any existing set), and returns the plaintext codes to show once.
func (s *Server) issueBackupCodes(ctx context.Context, userID string) ([]string, error) {
	codes, err := auth.GenerateBackupCodes(auth.BackupCodeCount)
	if err != nil {
		return nil, err
	}
	hashes := make([]string, len(codes))
	for i, c := range codes {
		hashes[i] = auth.HashToken(auth.NormalizeBackupCode(c))
	}
	if err := s.db.ReplaceBackupCodes(ctx, userID, hashes); err != nil {
		return nil, err
	}
	return codes, nil
}

// Handle2FARegenerateBackupCodes issues a fresh set of recovery codes after
// verifying the user's current TOTP code, invalidating any previous set. Used
// when a user has consumed most of their codes or wants to rotate them.
func (s *Server) Handle2FARegenerateBackupCodes(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetUserClaims(r)
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	user, err := s.db.GetUserByID(ctx, claims.Sub)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}
	if !user.TOTPEnabled {
		http.Error(w, `{"error":"2fa is not enabled"}`, http.StatusBadRequest)
		return
	}

	if !s.devMode && !s.twoFAUserLimiter.allow(user.ID) {
		http.Error(w, `{"error":"too many 2FA attempts, please try again later"}`, http.StatusTooManyRequests)
		return
	}

	secret, err := s.totpSecret(user)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// Require a fresh, unused TOTP code — same replay guard as the login step, so
	// a stolen access token alone can't rotate (and reveal) the recovery codes.
	counter, ok := auth.ValidateTOTPCodeCounter(secret, req.Code)
	if !ok {
		http.Error(w, `{"error":"invalid 2FA code"}`, http.StatusUnauthorized)
		return
	}
	claimed, err := s.db.ClaimTOTPCounter(ctx, user.ID, counter)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	if !claimed {
		http.Error(w, `{"error":"this code was already used — wait for the next one"}`, http.StatusUnauthorized)
		return
	}

	codes, err := s.issueBackupCodes(ctx, user.ID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	s.audit(r, &user.ID, "2fa_backup_codes_regenerated", nil)

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "backup_codes": codes})
}

// Handle2FAVerify validates a TOTP code during login (after password was correct).
func (s *Server) Handle2FAVerify(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	if !s.devMode && !s.twoFAIPLimiter.allow(s.clientIP(r)) {
		http.Error(w, `{"error":"too many 2FA attempts, please try again later"}`, http.StatusTooManyRequests)
		return
	}

	var req struct {
		TempToken string `json:"temp_token"`
		Code      string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	claims, err := auth.ValidateTempToken(s.cfg.JWTSecret, req.TempToken)
	if err != nil {
		http.Error(w, `{"error":"invalid or expired temp token"}`, http.StatusUnauthorized)
		return
	}

	// Per-account cap, keyed by the temp token's subject: rotating IPs doesn't
	// buy an attacker more guesses against one account.
	if !s.devMode && !s.twoFAUserLimiter.allow(claims.Sub) {
		uid := claims.Sub
		s.audit(r, &uid, "2fa_ratelimited", nil)
		http.Error(w, `{"error":"too many 2FA attempts, please try again later"}`, http.StatusTooManyRequests)
		return
	}

	user, err := s.db.GetUserByID(ctx, claims.Sub)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	secret, err := s.totpSecret(user)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	counter, ok := auth.ValidateTOTPCodeCounter(secret, req.Code)
	if !ok {
		// Not a live TOTP code — try it as a one-time recovery code. Consuming is
		// atomic (used_at guard), so a backup code works exactly once.
		consumed, cErr := s.db.ConsumeBackupCode(ctx, user.ID, auth.HashToken(auth.NormalizeBackupCode(req.Code)))
		if cErr != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}
		if !consumed {
			s.audit(r, &user.ID, "2fa_failed", map[string]interface{}{"email": user.Email})
			http.Error(w, `{"error":"invalid 2FA code"}`, http.StatusUnauthorized)
			return
		}
		remaining, _ := s.db.CountUnusedBackupCodes(ctx, user.ID)
		s.audit(r, &user.ID, "login", map[string]interface{}{"email": user.Email, "method": "backup_code", "backup_codes_remaining": remaining})
		s.issueTokens(w, r, user)
		return
	}

	claimed, err := s.db.ClaimTOTPCounter(ctx, user.ID, counter)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	if !claimed {
		// Correct code, but its time step was already consumed — a replayed or
		// intercepted code. Refuse it and leave a trace.
		s.audit(r, &user.ID, "2fa_replay", map[string]interface{}{"email": user.Email})
		http.Error(w, `{"error":"this code was already used — wait for the next one"}`, http.StatusUnauthorized)
		return
	}

	// Legacy row (plaintext at rest, pre-encryption): re-seal it now that the
	// user has proven the code. Best-effort — a failure must not block login.
	if !crypto.IsSealed(user.TOTPSecret) {
		if kek, kekErr := crypto.DeriveUserKEK(s.masterKey, user.ID); kekErr == nil {
			if sealed, sealErr := crypto.SealSecret(kek, secret); sealErr == nil {
				if dbErr := s.db.SetTOTPSecret(ctx, user.ID, sealed); dbErr != nil {
					log.Printf("2fa: re-seal legacy totp secret for %s: %v", user.ID, dbErr)
				}
			}
		}
	}

	s.audit(r, &user.ID, "login", map[string]interface{}{"email": user.Email, "method": "2fa"})
	s.issueTokens(w, r, user)
}

// Handle2FADisable turns off 2FA after verifying password and current code.
func (s *Server) Handle2FADisable(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetUserClaims(r)
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	var req struct {
		Password string `json:"password"`
		Code     string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	user, err := s.db.GetUserByID(ctx, claims.Sub)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	if err := auth.CheckPassword(req.Password, user.PasswordHash); err != nil {
		http.Error(w, `{"error":"wrong password"}`, http.StatusUnauthorized)
		return
	}

	if !s.devMode && !s.twoFAUserLimiter.allow(user.ID) {
		http.Error(w, `{"error":"too many 2FA attempts, please try again later"}`, http.StatusTooManyRequests)
		return
	}

	secret, err := s.totpSecret(user)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	counter, ok := auth.ValidateTOTPCodeCounter(secret, req.Code)
	if !ok {
		http.Error(w, `{"error":"invalid 2FA code"}`, http.StatusUnauthorized)
		return
	}

	claimed, err := s.db.ClaimTOTPCounter(ctx, user.ID, counter)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	if !claimed {
		http.Error(w, `{"error":"this code was already used — wait for the next one"}`, http.StatusUnauthorized)
		return
	}

	if err := s.db.DisableTOTP(ctx, user.ID); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	s.audit(r, &user.ID, "2fa_disable", nil)

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// HandleGetMe returns the authenticated user's profile.
func (s *Server) HandleGetMe(w http.ResponseWriter, r *http.Request) {
	claims := GetUserClaims(r)
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	user, err := s.db.GetUserByID(r.Context(), claims.Sub)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	writeJSON(w, http.StatusOK, user)
}

// HandleMagicLinkRequest sends a magic link login email.
func (s *Server) HandleMagicLinkRequest(w http.ResponseWriter, r *http.Request) {
	// Auth-specific rate limiting
	if !s.devMode && !s.authLimiter.allow(s.clientIP(r)) {
		http.Error(w, `{"error":"too many attempts, please try again later"}`, http.StatusTooManyRequests)
		return
	}

	ctx := r.Context()

	var req struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	// Per-email rate limiting
	if !s.devMode && !s.emailLimiter.allow(req.Email) {
		// Anti-enumeration: always 200
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"success": true,
			"message": "if an account exists with that email, a login link has been sent",
		})
		return
	}

	// Always return 200 to prevent enumeration
	genericResp := map[string]interface{}{
		"success": true,
		"message": "if an account exists with that email, a login link has been sent",
	}

	if s.cfg.Email == nil {
		writeJSON(w, http.StatusOK, genericResp)
		return
	}

	user, err := s.db.GetUserByEmail(ctx, req.Email)
	if err != nil || user == nil {
		writeJSON(w, http.StatusOK, genericResp)
		return
	}

	token, _ := auth.GenerateRandomToken()
	s.db.DeleteEmailTokensByUser(ctx, user.ID, "magic_link")
	s.db.InsertEmailToken(ctx, &types.EmailToken{
		ID:        uuid.New().String(),
		UserID:    user.ID,
		TokenHash: auth.HashToken(token),
		Kind:      "magic_link",
		ExpiresAt: time.Now().Add(15 * time.Minute),
	})

	emailCfg := s.emailCfg()
	baseURL := s.baseURL(r)
	go func() {
		if err := auth.SendMagicLinkEmail(emailCfg, req.Email, token, baseURL); err != nil {
			log.Printf("send magic link email to %s: %v", req.Email, err)
		}
	}()

	s.audit(r, &user.ID, "magic_link_sent", map[string]interface{}{"email": req.Email})

	writeJSON(w, http.StatusOK, genericResp)
}

// HandleMagicLinkVerify validates a magic link token and logs the user in.
func (s *Server) HandleMagicLinkVerify(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	hash := auth.HashToken(req.Token)
	et, err := s.db.GetEmailTokenByHash(ctx, hash)
	if err != nil || et.Kind != "magic_link" {
		http.Error(w, `{"error":"invalid or expired login link"}`, http.StatusBadRequest)
		return
	}

	if time.Now().After(et.ExpiresAt) {
		s.db.DeleteEmailToken(ctx, et.ID)
		http.Error(w, `{"error":"login link expired"}`, http.StatusBadRequest)
		return
	}

	user, err := s.db.GetUserByID(ctx, et.UserID)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	// Auto-verify email if not yet verified
	if !user.EmailVerified {
		s.db.SetEmailVerified(ctx, user.ID)
		user.EmailVerified = true
	}

	// Delete used token
	s.db.DeleteEmailToken(ctx, et.ID)

	s.audit(r, &user.ID, "magic_link_used", map[string]interface{}{"email": user.Email})

	s.issueTokens(w, r, user)
}

// issueTokens generates JWT + refresh token and writes them as JSON response.
func (s *Server) issueTokens(w http.ResponseWriter, r *http.Request, user *types.User) {
	ctx := r.Context()

	accessToken, err := auth.GenerateAccessToken(s.cfg.JWTSecret, user.ID, user.Email, user.Username, user.Role.String(), user.TokenVersion)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	refreshToken, err := auth.GenerateRandomToken()
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	s.db.InsertRefreshToken(ctx, &types.RefreshToken{
		ID:        uuid.New().String(),
		UserID:    user.ID,
		TokenHash: auth.HashToken(refreshToken),
		ExpiresAt: time.Now().Add(auth.RefreshTokenDuration),
		IP:        s.clientIP(r),
		UserAgent: r.UserAgent(),
	})

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"access_token":  accessToken,
		"refresh_token": refreshToken,
		"user":          user,
	})
}

// issueDecoyTokens issues JWT tokens with the decoy flag set.
func (s *Server) issueDecoyTokens(w http.ResponseWriter, r *http.Request, user *types.User) {
	ctx := r.Context()

	accessToken, err := auth.GenerateDecoyAccessToken(s.cfg.JWTSecret, user.ID, user.Email, user.Username, user.Role.String(), user.TokenVersion)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	refreshToken, err := auth.GenerateRandomToken()
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	s.db.InsertRefreshToken(ctx, &types.RefreshToken{
		ID:        uuid.New().String(),
		UserID:    user.ID,
		TokenHash: auth.HashToken(refreshToken),
		ExpiresAt: time.Now().Add(auth.RefreshTokenDuration),
		IP:        s.clientIP(r),
		UserAgent: r.UserAgent(),
	})

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"access_token":  accessToken,
		"refresh_token": refreshToken,
		"user":          user,
	})
}
