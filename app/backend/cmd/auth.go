package cmd

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/zpush/zpush/auth"
	"github.com/zpush/zpush/types"
)

var emailRe = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
var usernameRe = regexp.MustCompile(`^[a-zA-Z0-9_]{3,32}$`)

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
		Name:   s.cfg.Email.Name,
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

// getClientIP extracts the real client IP from request headers or RemoteAddr.
func getClientIP(r *http.Request) string {
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		if idx := strings.Index(forwarded, ","); idx != -1 {
			return strings.TrimSpace(forwarded[:idx])
		}
		return strings.TrimSpace(forwarded)
	}
	if realIP := r.Header.Get("X-Real-IP"); realIP != "" {
		return strings.TrimSpace(realIP)
	}
	return r.RemoteAddr
}

// HandleRegister creates a new user account.
func (s *Server) HandleRegister(w http.ResponseWriter, r *http.Request) {
	// Auth-specific rate limiting: 5 attempts per 5 minutes per IP
	if !s.authLimiter.allow(getClientIP(r)) {
		http.Error(w, `{"error":"too many attempts, please try again later"}`, http.StatusTooManyRequests)
		return
	}

	ctx := r.Context()

	var req struct {
		Email    string `json:"email"`
		Username string `json:"username"`
		Password string `json:"password"`
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

	// Check uniqueness
	if existing, _ := s.db.GetUserByEmail(ctx, req.Email); existing != nil {
		http.Error(w, `{"error":"email already registered"}`, http.StatusConflict)
		return
	}
	if existing, _ := s.db.GetUserByUsername(ctx, req.Username); existing != nil {
		http.Error(w, `{"error":"username already taken"}`, http.StatusConflict)
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// First user becomes admin; if we can't check, default to regular user
	role := types.RoleUser
	if userCount, err := s.db.GetUserCount(ctx); err == nil && userCount == 0 {
		role = types.RoleAdmin
	}

	user := &types.User{
		ID:           uuid.New().String(),
		Email:        req.Email,
		Username:     req.Username,
		PasswordHash: hash,
		Role:         role,
	}

	// Auto-verify if SMTP not configured
	if s.cfg.Email == nil {
		user.EmailVerified = true
	}

	if err := s.db.CreateUser(ctx, user); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"create user: %s"}`, err), http.StatusInternalServerError)
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

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"message": "account created",
		"user":    user,
	})
}

// HandleLogin authenticates a user with email and password.
func (s *Server) HandleLogin(w http.ResponseWriter, r *http.Request) {
	// Auth-specific rate limiting: 5 attempts per 5 minutes per IP
	clientIP := getClientIP(r)
	if !s.authLimiter.allow(clientIP) {
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

	user, err := s.db.GetUserByEmail(ctx, req.Email)
	if err != nil {
		log.Printf("auth: login failed email=%s ip=%s reason=not_found", req.Email, clientIP)
		http.Error(w, `{"error":"invalid email or password"}`, http.StatusUnauthorized)
		return
	}

	if err := auth.CheckPassword(req.Password, user.PasswordHash); err != nil {
		log.Printf("auth: login failed email=%s ip=%s reason=wrong_password", req.Email, clientIP)
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

	if err := auth.SendPasswordResetEmail(s.emailCfg(), req.Email, token, s.baseURL(r)); err != nil {
		log.Printf("send password reset email to %s: %v", req.Email, err)
	}

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
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if err := validatePassword(req.NewPassword); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err), http.StatusBadRequest)
		return
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
	s.db.DeleteRefreshTokensByUser(ctx, et.UserID) // force re-login everywhere

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

	if err := auth.SendVerificationEmail(s.emailCfg(), req.Email, token, s.baseURL(r)); err != nil {
		log.Printf("resend verification email to %s: %v", req.Email, err)
		http.Error(w, `{"error":"failed to send verification email"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// Handle2FASetup generates a TOTP secret for the user.
func (s *Server) Handle2FASetup(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	claims := GetUserClaims(r)
	if claims == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}

	secret, err := auth.GenerateTOTPSecret()
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	if err := s.db.SetTOTPSecret(ctx, claims.Sub, secret); err != nil {
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

	if !auth.ValidateTOTPCode(user.TOTPSecret, req.Code) {
		http.Error(w, `{"error":"invalid code"}`, http.StatusBadRequest)
		return
	}

	if err := s.db.EnableTOTP(ctx, user.ID); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// Handle2FAVerify validates a TOTP code during login (after password was correct).
func (s *Server) Handle2FAVerify(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var req struct {
		TempToken string `json:"temp_token"`
		Code      string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	claims, err := auth.ValidateAccessToken(s.cfg.JWTSecret, req.TempToken)
	if err != nil {
		http.Error(w, `{"error":"invalid or expired temp token"}`, http.StatusUnauthorized)
		return
	}

	user, err := s.db.GetUserByID(ctx, claims.Sub)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	if !auth.ValidateTOTPCode(user.TOTPSecret, req.Code) {
		http.Error(w, `{"error":"invalid 2FA code"}`, http.StatusUnauthorized)
		return
	}

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

	if !auth.ValidateTOTPCode(user.TOTPSecret, req.Code) {
		http.Error(w, `{"error":"invalid 2FA code"}`, http.StatusUnauthorized)
		return
	}

	if err := s.db.DisableTOTP(ctx, user.ID); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

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

// issueTokens generates JWT + refresh token and writes them as JSON response.
func (s *Server) issueTokens(w http.ResponseWriter, r *http.Request, user *types.User) {
	ctx := r.Context()

	accessToken, err := auth.GenerateAccessToken(s.cfg.JWTSecret, user.ID, user.Email, user.Username, user.Role.String())
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
	})

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"access_token":  accessToken,
		"refresh_token": refreshToken,
		"user":          user,
	})
}
