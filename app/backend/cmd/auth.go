package cmd

import (
	"encoding/json"
	"fmt"
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

// smtpCfg converts config.SMTPConfig to auth.SMTPConfig.
func (s *Server) smtpCfg() *auth.SMTPConfig {
	if s.cfg.SMTP == nil {
		return nil
	}
	return &auth.SMTPConfig{
		Host:     s.cfg.SMTP.Host,
		Port:     s.cfg.SMTP.Port,
		Username: s.cfg.SMTP.Username,
		Password: s.cfg.SMTP.Password,
		From:     s.cfg.SMTP.From,
	}
}

func (s *Server) baseURL(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	if fwd := r.Header.Get("X-Forwarded-Proto"); fwd != "" {
		scheme = fwd
	}
	host := r.Host
	if fwd := r.Header.Get("X-Forwarded-Host"); fwd != "" {
		host = fwd
	}
	return fmt.Sprintf("%s://%s", scheme, host)
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
	if len(req.Password) == 0 {
		http.Error(w, `{"error":"password is required"}`, http.StatusBadRequest)
		return
	}

	// Check uniqueness
	if existing, _ := s.db.GetUserByEmail(req.Email); existing != nil {
		http.Error(w, `{"error":"email already registered"}`, http.StatusConflict)
		return
	}
	if existing, _ := s.db.GetUserByUsername(req.Username); existing != nil {
		http.Error(w, `{"error":"username already taken"}`, http.StatusConflict)
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	user := &types.User{
		ID:           uuid.New().String(),
		Email:        req.Email,
		Username:     req.Username,
		PasswordHash: hash,
	}

	// Auto-verify if SMTP not configured
	if s.cfg.SMTP == nil {
		user.EmailVerified = true
	}

	if err := s.db.CreateUser(user); err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"create user: %s"}`, err), http.StatusInternalServerError)
		return
	}

	// Send verification email if SMTP configured
	if s.cfg.SMTP != nil {
		token, _ := auth.GenerateRandomToken()
		s.db.DeleteEmailTokensByUser(user.ID, "verify")
		s.db.InsertEmailToken(&types.EmailToken{
			ID:        uuid.New().String(),
			UserID:    user.ID,
			TokenHash: auth.HashToken(token),
			Kind:      "verify",
			ExpiresAt: time.Now().Add(24 * time.Hour),
		})
		auth.SendVerificationEmail(s.smtpCfg(), req.Email, token, s.baseURL(r))
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"message": "account created",
		"user":    user,
	})
}

// HandleLogin authenticates a user with email and password.
func (s *Server) HandleLogin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))

	user, err := s.db.GetUserByEmail(req.Email)
	if err != nil {
		http.Error(w, `{"error":"invalid email or password"}`, http.StatusUnauthorized)
		return
	}

	if err := auth.CheckPassword(req.Password, user.PasswordHash); err != nil {
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

	s.issueTokens(w, user)
}

// HandleRefreshToken exchanges a refresh token for a new access token.
func (s *Server) HandleRefreshToken(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	hash := auth.HashToken(req.RefreshToken)
	rt, err := s.db.GetRefreshTokenByHash(hash)
	if err != nil {
		http.Error(w, `{"error":"invalid refresh token"}`, http.StatusUnauthorized)
		return
	}

	if time.Now().After(rt.ExpiresAt) {
		s.db.DeleteRefreshToken(rt.ID)
		http.Error(w, `{"error":"refresh token expired"}`, http.StatusUnauthorized)
		return
	}

	user, err := s.db.GetUserByID(rt.UserID)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusUnauthorized)
		return
	}

	// Rotate refresh token
	s.db.DeleteRefreshToken(rt.ID)
	s.issueTokens(w, user)
}

// HandleLogout invalidates the refresh token.
func (s *Server) HandleLogout(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	hash := auth.HashToken(req.RefreshToken)
	rt, err := s.db.GetRefreshTokenByHash(hash)
	if err == nil {
		s.db.DeleteRefreshToken(rt.ID)
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// HandleForgotPassword sends a password reset email.
func (s *Server) HandleForgotPassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Always return success to prevent email enumeration
	defer writeJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "if that email exists, a reset link has been sent",
	})

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	user, err := s.db.GetUserByEmail(req.Email)
	if err != nil || user == nil {
		return
	}

	token, _ := auth.GenerateRandomToken()
	s.db.DeleteEmailTokensByUser(user.ID, "reset")
	s.db.InsertEmailToken(&types.EmailToken{
		ID:        uuid.New().String(),
		UserID:    user.ID,
		TokenHash: auth.HashToken(token),
		Kind:      "reset",
		ExpiresAt: time.Now().Add(1 * time.Hour),
	})
	auth.SendPasswordResetEmail(s.smtpCfg(), req.Email, token, s.baseURL(r))
}

// HandleResetPassword resets a user's password using a token.
func (s *Server) HandleResetPassword(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token       string `json:"token"`
		NewPassword string `json:"new_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	if len(req.NewPassword) == 0 {
		http.Error(w, `{"error":"password is required"}`, http.StatusBadRequest)
		return
	}

	hash := auth.HashToken(req.Token)
	et, err := s.db.GetEmailTokenByHash(hash)
	if err != nil || et.Kind != "reset" {
		http.Error(w, `{"error":"invalid or expired reset token"}`, http.StatusBadRequest)
		return
	}

	if time.Now().After(et.ExpiresAt) {
		s.db.DeleteEmailToken(et.ID)
		http.Error(w, `{"error":"reset token expired"}`, http.StatusBadRequest)
		return
	}

	passwordHash, err := auth.HashPassword(req.NewPassword)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	s.db.UpdateUserPassword(et.UserID, passwordHash)
	s.db.DeleteEmailToken(et.ID)
	s.db.DeleteRefreshTokensByUser(et.UserID) // force re-login everywhere

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// HandleVerifyEmail verifies a user's email address.
func (s *Server) HandleVerifyEmail(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	hash := auth.HashToken(req.Token)
	et, err := s.db.GetEmailTokenByHash(hash)
	if err != nil || et.Kind != "verify" {
		http.Error(w, `{"error":"invalid or expired verification token"}`, http.StatusBadRequest)
		return
	}

	if time.Now().After(et.ExpiresAt) {
		s.db.DeleteEmailToken(et.ID)
		http.Error(w, `{"error":"verification token expired"}`, http.StatusBadRequest)
		return
	}

	s.db.SetEmailVerified(et.UserID)
	s.db.DeleteEmailToken(et.ID)

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// HandleResendVerification resends the email verification link.
func (s *Server) HandleResendVerification(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	user, err := s.db.GetUserByEmail(req.Email)
	if err != nil || user.EmailVerified {
		writeJSON(w, http.StatusOK, map[string]bool{"success": true})
		return
	}

	token, _ := auth.GenerateRandomToken()
	s.db.DeleteEmailTokensByUser(user.ID, "verify")
	s.db.InsertEmailToken(&types.EmailToken{
		ID:        uuid.New().String(),
		UserID:    user.ID,
		TokenHash: auth.HashToken(token),
		Kind:      "verify",
		ExpiresAt: time.Now().Add(24 * time.Hour),
	})
	auth.SendVerificationEmail(s.smtpCfg(), req.Email, token, s.baseURL(r))

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// Handle2FASetup generates a TOTP secret for the user.
func (s *Server) Handle2FASetup(w http.ResponseWriter, r *http.Request) {
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

	if err := s.db.SetTOTPSecret(claims.Sub, secret); err != nil {
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

	user, err := s.db.GetUserByID(claims.Sub)
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

	if err := s.db.EnableTOTP(user.ID); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// Handle2FAVerify validates a TOTP code during login (after password was correct).
func (s *Server) Handle2FAVerify(w http.ResponseWriter, r *http.Request) {
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

	user, err := s.db.GetUserByID(claims.Sub)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	if !auth.ValidateTOTPCode(user.TOTPSecret, req.Code) {
		http.Error(w, `{"error":"invalid 2FA code"}`, http.StatusUnauthorized)
		return
	}

	s.issueTokens(w, user)
}

// Handle2FADisable turns off 2FA after verifying password and current code.
func (s *Server) Handle2FADisable(w http.ResponseWriter, r *http.Request) {
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

	user, err := s.db.GetUserByID(claims.Sub)
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

	if err := s.db.DisableTOTP(user.ID); err != nil {
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

	user, err := s.db.GetUserByID(claims.Sub)
	if err != nil {
		http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
		return
	}

	writeJSON(w, http.StatusOK, user)
}

// issueTokens generates JWT + refresh token and writes them as JSON response.
func (s *Server) issueTokens(w http.ResponseWriter, user *types.User) {
	accessToken, err := auth.GenerateAccessToken(s.cfg.JWTSecret, user.ID, user.Email, user.Username)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	refreshToken, err := auth.GenerateRandomToken()
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	s.db.InsertRefreshToken(&types.RefreshToken{
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
