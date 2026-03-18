package cmd

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/zcrypt/zcrypt/auth"
	"github.com/zcrypt/zcrypt/config"
	"github.com/zcrypt/zcrypt/types"
)

// getOAuthProviderConfig returns the OAuth config for a provider, or nil if not configured.
func getOAuthProviderConfig(cfg *config.Config, provider string) *config.OAuthProviderConfig {
	if cfg.OAuth == nil {
		return nil
	}
	switch provider {
	case "google":
		return cfg.OAuth.Google
	case "github":
		return cfg.OAuth.GitHub
	default:
		return nil
	}
}

// HandleOAuthStart initiates the OAuth flow by redirecting to the provider.
// GET /api/auth/oauth/{provider}
func (s *Server) HandleOAuthStart(w http.ResponseWriter, r *http.Request) {
	provider := r.PathValue("provider")
	if provider != "google" && provider != "github" {
		http.Error(w, `{"error":"unsupported provider"}`, http.StatusBadRequest)
		return
	}

	providerCfg := getOAuthProviderConfig(s.cfg, provider)
	if providerCfg == nil {
		http.Error(w, `{"error":"provider not configured"}`, http.StatusBadRequest)
		return
	}

	// Generate cryptographic state
	stateBytes := make([]byte, 16)
	if _, err := rand.Read(stateBytes); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	state := hex.EncodeToString(stateBytes)

	// Set state in cookie (HttpOnly, SameSite=Lax for OAuth redirect)
	http.SetCookie(w, &http.Cookie{
		Name:     "oauth_state",
		Value:    state,
		Path:     "/",
		MaxAge:   600, // 10 minutes
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https",
	})

	redirectURI := s.oauthCallbackURL(r, provider)

	authURL, err := auth.BuildOAuthURL(provider, providerCfg.ClientID, redirectURI, state)
	if err != nil {
		log.Printf("oauth: build auth URL failed: %v", err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	http.Redirect(w, r, authURL, http.StatusTemporaryRedirect)
}

// HandleOAuthCallback handles the OAuth callback from the provider.
// GET /api/auth/oauth/{provider}/callback
func (s *Server) HandleOAuthCallback(w http.ResponseWriter, r *http.Request) {
	provider := r.PathValue("provider")
	if provider != "google" && provider != "github" {
		s.oauthError(w, r, "unsupported provider")
		return
	}

	providerCfg := getOAuthProviderConfig(s.cfg, provider)
	if providerCfg == nil {
		s.oauthError(w, r, "provider not configured")
		return
	}

	// Verify state cookie
	stateCookie, err := r.Cookie("oauth_state")
	if err != nil || stateCookie.Value == "" {
		s.oauthError(w, r, "missing state")
		return
	}
	if r.URL.Query().Get("state") != stateCookie.Value {
		s.oauthError(w, r, "invalid state")
		return
	}

	// Clear state cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "oauth_state",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
	})

	// Check for provider error
	if errStr := r.URL.Query().Get("error"); errStr != "" {
		desc := r.URL.Query().Get("error_description")
		s.oauthError(w, r, fmt.Sprintf("%s: %s", errStr, desc))
		return
	}

	code := r.URL.Query().Get("code")
	if code == "" {
		s.oauthError(w, r, "missing code")
		return
	}

	ctx := r.Context()
	redirectURI := s.oauthCallbackURL(r, provider)

	// Exchange code for token
	accessToken, err := auth.ExchangeOAuthCode(ctx, provider, providerCfg.ClientID, providerCfg.ClientSecret, code, redirectURI)
	if err != nil {
		log.Printf("oauth: exchange code failed for %s: %v", provider, err)
		s.oauthError(w, r, "authentication failed")
		return
	}

	// Fetch user info
	userInfo, err := auth.FetchOAuthUserInfo(ctx, provider, accessToken)
	if err != nil {
		log.Printf("oauth: fetch user info failed for %s: %v", provider, err)
		s.oauthError(w, r, "failed to get user info")
		return
	}

	userInfo.Email = strings.TrimSpace(strings.ToLower(userInfo.Email))

	// 1. Check if this OAuth account is already linked
	oauthProvider, _ := s.db.GetOAuthProvider(ctx, provider, userInfo.ProviderID)
	if oauthProvider != nil {
		// Existing link — load user and issue tokens
		user, err := s.db.GetUserByID(ctx, oauthProvider.UserID)
		if err != nil {
			s.oauthError(w, r, "user not found")
			return
		}
		s.audit(r, &user.ID, "oauth_login", map[string]interface{}{"provider": provider, "email": userInfo.Email})
		s.oauthRedirect(w, r, user)
		return
	}

	// 2. Check if a user with this email exists
	existingUser, _ := s.db.GetUserByEmail(ctx, userInfo.Email)
	if existingUser != nil {
		// Auto-link OAuth to existing user
		s.db.CreateOAuthProvider(ctx, &types.OAuthProvider{
			ID:            uuid.New().String(),
			UserID:        existingUser.ID,
			Provider:      provider,
			ProviderID:    userInfo.ProviderID,
			ProviderEmail: userInfo.Email,
		})
		s.audit(r, &existingUser.ID, "oauth_link", map[string]interface{}{"provider": provider, "email": userInfo.Email})
		s.oauthRedirect(w, r, existingUser)
		return
	}

	// 3. Create new user
	username := generateUsername(userInfo.Name, userInfo.Email)

	// Ensure username uniqueness
	for i := 0; i < 10; i++ {
		if existing, _ := s.db.GetUserByUsername(ctx, username); existing == nil {
			break
		}
		suffix := make([]byte, 3)
		rand.Read(suffix)
		username = username + hex.EncodeToString(suffix)[:4]
		if len(username) > 32 {
			username = username[:32]
		}
	}

	// Role is set atomically by CreateUser — first user becomes admin via SQL CASE.
	user := &types.User{
		ID:            uuid.New().String(),
		Email:         userInfo.Email,
		Username:      username,
		PasswordHash:  "", // OAuth-only user, no password
		EmailVerified: true,
		Role:          types.RoleUser,
	}

	if err := s.db.CreateUser(ctx, user); err != nil {
		log.Printf("oauth: create user failed: %v", err)
		s.oauthError(w, r, "failed to create account")
		return
	}

	s.db.CreateOAuthProvider(ctx, &types.OAuthProvider{
		ID:            uuid.New().String(),
		UserID:        user.ID,
		Provider:      provider,
		ProviderID:    userInfo.ProviderID,
		ProviderEmail: userInfo.Email,
	})

	s.audit(r, &user.ID, "oauth_register", map[string]interface{}{"provider": provider, "email": userInfo.Email})
	s.oauthRedirect(w, r, user)
}

// HandleLinkedAccounts returns the current user's linked OAuth providers.
// GET /api/auth/linked-accounts
func (s *Server) HandleLinkedAccounts(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	providers, err := s.db.GetOAuthProvidersByUser(r.Context(), userID)
	if err != nil {
		log.Printf("oauth: get linked accounts failed: %v", err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	if providers == nil {
		providers = []types.OAuthProvider{}
	}

	// Also check if user has a password
	user, _ := s.db.GetUserByID(r.Context(), userID)
	hasPassword := user != nil && user.PasswordHash != ""

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"providers":    providers,
		"has_password": hasPassword,
	})
}

// HandleUnlinkAccount removes an OAuth provider link.
// DELETE /api/auth/linked-accounts/{provider}
func (s *Server) HandleUnlinkAccount(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r)
	provider := r.PathValue("provider")
	if provider != "google" && provider != "github" {
		http.Error(w, `{"error":"unsupported provider"}`, http.StatusBadRequest)
		return
	}

	// Guard: must keep at least one auth method
	count, err := s.db.CountUserAuthMethods(r.Context(), userID)
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	if count <= 1 {
		http.Error(w, `{"error":"cannot remove last login method — add a password or link another provider first"}`, http.StatusBadRequest)
		return
	}

	if err := s.db.DeleteOAuthProvider(r.Context(), userID, provider); err != nil {
		log.Printf("oauth: unlink account failed: %v", err)
		http.Error(w, `{"error":"failed to unlink account"}`, http.StatusInternalServerError)
		return
	}

	s.audit(r, &userID, "oauth_unlink", map[string]interface{}{"provider": provider})

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// oauthCallbackURL builds the callback URL for an OAuth provider.
func (s *Server) oauthCallbackURL(r *http.Request, provider string) string {
	// Use the backend URL (where the callback comes to)
	scheme := "https"
	host := r.Host
	if r.TLS == nil && r.Header.Get("X-Forwarded-Proto") != "https" {
		scheme = "http"
	}
	return fmt.Sprintf("%s://%s/api/auth/oauth/%s/callback", scheme, host, provider)
}

// oauthRedirect generates tokens and redirects to the frontend with tokens in URL.
func (s *Server) oauthRedirect(w http.ResponseWriter, r *http.Request, user *types.User) {
	jwtToken, err := auth.GenerateAccessToken(s.cfg.JWTSecret, user.ID, user.Email, user.Username, user.Role.String(), user.TokenVersion)
	if err != nil {
		s.oauthError(w, r, "internal error")
		return
	}

	refreshToken, err := auth.GenerateRandomToken()
	if err != nil {
		s.oauthError(w, r, "internal error")
		return
	}

	s.db.InsertRefreshToken(r.Context(), &types.RefreshToken{
		ID:        uuid.New().String(),
		UserID:    user.ID,
		TokenHash: auth.HashToken(refreshToken),
		ExpiresAt: time.Now().Add(auth.RefreshTokenDuration),
		IP:        extractClientIP(r),
		UserAgent: r.UserAgent(),
	})

	frontendURL := strings.TrimRight(s.cfg.FrontendURL, "/")
	if frontendURL == "" {
		frontendURL = "http://localhost:3000"
	}

	// Use URL fragment (#) instead of query params (?) so tokens are NOT sent to the server
	// in Referrer headers or logged in server access logs. Fragments are client-side only.
	redirectURL := fmt.Sprintf("%s/oauth/callback#access_token=%s&refresh_token=%s",
		frontendURL, jwtToken, refreshToken)

	http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
}

// oauthError redirects to the frontend with an error message.
func (s *Server) oauthError(w http.ResponseWriter, r *http.Request, errMsg string) {
	frontendURL := strings.TrimRight(s.cfg.FrontendURL, "/")
	if frontendURL == "" {
		frontendURL = "http://localhost:3000"
	}
	http.Redirect(w, r, fmt.Sprintf("%s/oauth/callback?error=%s", frontendURL, errMsg), http.StatusTemporaryRedirect)
}

// generateUsername creates a username from OAuth name/email.
func generateUsername(name, email string) string {
	// Try name first
	if name != "" {
		username := strings.ToLower(strings.ReplaceAll(name, " ", "_"))
		// Keep only valid chars
		var clean []byte
		for _, c := range []byte(username) {
			if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' {
				clean = append(clean, c)
			}
		}
		if len(clean) >= 3 {
			if len(clean) > 32 {
				clean = clean[:32]
			}
			return string(clean)
		}
	}

	// Fallback: use email prefix
	parts := strings.SplitN(email, "@", 2)
	username := strings.ToLower(parts[0])
	var clean []byte
	for _, c := range []byte(username) {
		if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' {
			clean = append(clean, c)
		}
	}
	if len(clean) < 3 {
		clean = append(clean, []byte("user")...)
	}
	if len(clean) > 32 {
		clean = clean[:32]
	}
	return string(clean)
}
