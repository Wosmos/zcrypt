package cmd

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"log/slog"
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

	// Generate cryptographic state.
	// If platform=desktop, encode as "desktop:<session>:<random>" so the callback
	// can store tokens for the desktop app to poll.
	stateBytes := make([]byte, 16)
	if _, err := rand.Read(stateBytes); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}
	state := hex.EncodeToString(stateBytes)
	if r.URL.Query().Get("platform") == "desktop" {
		session := r.URL.Query().Get("session")
		challenge := strings.ToLower(r.URL.Query().Get("challenge"))
		if !validHexLen(session, 16) {
			http.Error(w, `{"error":"invalid session"}`, http.StatusBadRequest)
			return
		}
		if challenge == "" {
			challenge = desktopLegacyChallenge
		} else if !validHexLen(challenge, 32) {
			http.Error(w, `{"error":"invalid challenge"}`, http.StatusBadRequest)
			return
		}
		state = "desktop:" + session + ":" + challenge + ":" + state
	}

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
		s.oauthError(w, r, "unsupported provider", false, "")
		return
	}

	providerCfg := getOAuthProviderConfig(s.cfg, provider)
	if providerCfg == nil {
		s.oauthError(w, r, "provider not configured", false, "")
		return
	}

	// Verify state cookie
	stateCookie, err := r.Cookie("oauth_state")
	if err != nil || stateCookie.Value == "" {
		s.oauthError(w, r, "missing state", false, "")
		return
	}
	if r.URL.Query().Get("state") != stateCookie.Value {
		s.oauthError(w, r, "invalid state", false, "")
		return
	}

	// Desktop state: "desktop:<session>:<challenge>:<random>". The session key handed
	// to oauthRedirect/oauthError is "<session>:<challenge>".
	isDesktop := strings.HasPrefix(stateCookie.Value, "desktop:")
	var desktopSession string
	if isDesktop {
		parts := strings.SplitN(stateCookie.Value, ":", 4)
		if len(parts) == 4 {
			desktopSession = parts[1] + ":" + parts[2]
		} else {
			isDesktop = false
		}
	}

	// Clear state cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "oauth_state",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https",
	})

	// Check for provider error
	if errStr := r.URL.Query().Get("error"); errStr != "" {
		desc := r.URL.Query().Get("error_description")
		s.oauthError(w, r, fmt.Sprintf("%s: %s", errStr, desc), isDesktop, desktopSession)
		return
	}

	code := r.URL.Query().Get("code")
	if code == "" {
		s.oauthError(w, r, "missing code", isDesktop, desktopSession)
		return
	}

	ctx := r.Context()
	redirectURI := s.oauthCallbackURL(r, provider)

	// Exchange code for token
	accessToken, err := auth.ExchangeOAuthCode(ctx, provider, providerCfg.ClientID, providerCfg.ClientSecret, code, redirectURI)
	if err != nil {
		log.Printf("oauth: exchange code failed for %s: %v", provider, err)
		s.oauthError(w, r, "authentication failed", isDesktop, desktopSession)
		return
	}

	// Fetch user info
	userInfo, err := auth.FetchOAuthUserInfo(ctx, provider, accessToken)
	if err != nil {
		log.Printf("oauth: fetch user info failed for %s: %v", provider, err)
		s.oauthError(w, r, "failed to get user info", isDesktop, desktopSession)
		return
	}

	userInfo.Email = strings.TrimSpace(strings.ToLower(userInfo.Email))

	// 1. Check if this OAuth account is already linked
	oauthProvider, _ := s.db.GetOAuthProvider(ctx, provider, userInfo.ProviderID)
	if oauthProvider != nil {
		// Existing link: load user and issue tokens
		user, err := s.db.GetUserByID(ctx, oauthProvider.UserID)
		if err != nil {
			s.oauthError(w, r, "user not found", isDesktop, desktopSession)
			return
		}
		s.audit(r, &user.ID, "oauth_login", map[string]interface{}{"provider": provider, "email": userInfo.Email})
		s.oauthRedirect(w, r, user, isDesktop, desktopSession)
		return
	}

	// 2. Check if a user with this email exists
	existingUser, _ := s.db.GetUserByEmail(ctx, userInfo.Email)
	if existingUser != nil {
		// Only auto-link to an existing account whose email is verified. Otherwise an
		// attacker controlling an OAuth account for an unverified local email could
		// hijack it. Require logging in with the existing method, then link in Settings.
		if !existingUser.EmailVerified {
			s.audit(r, &existingUser.ID, "oauth_link_rejected", map[string]interface{}{"provider": provider, "email": userInfo.Email, "reason": "local_email_unverified"})
			s.oauthError(w, r, "an account with this email already exists: log in with your existing method, then link "+provider+" in Settings", isDesktop, desktopSession)
			return
		}
		// Auto-link OAuth to existing user
		s.db.CreateOAuthProvider(ctx, &types.OAuthProvider{
			ID:            uuid.New().String(),
			UserID:        existingUser.ID,
			Provider:      provider,
			ProviderID:    userInfo.ProviderID,
			ProviderEmail: userInfo.Email,
		})
		s.audit(r, &existingUser.ID, "oauth_link", map[string]interface{}{"provider": provider, "email": userInfo.Email})
		s.oauthRedirect(w, r, existingUser, isDesktop, desktopSession)
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

	// Role is set atomically by CreateUser: first user becomes admin via SQL CASE.
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
		s.oauthError(w, r, "failed to create account", isDesktop, desktopSession)
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
	s.oauthRedirect(w, r, user, isDesktop, desktopSession)
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
		http.Error(w, `{"error":"cannot remove last login method. Add a password or link another provider first"}`, http.StatusBadRequest)
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
	return s.backendBaseURL(r) + "/api/auth/oauth/" + provider + "/callback"
}

// backendBaseURL returns the public-facing base URL of the backend (no trailing slash).
// It prefers the explicit BACKEND_URL: which MUST match the redirect URIs registered
// with the OAuth providers, and otherwise derives the value from the request, honoring
// the reverse-proxy headers that Railway and similar platforms set.
func (s *Server) backendBaseURL(r *http.Request) string {
	if s.cfg.BackendURL != "" {
		return strings.TrimRight(s.cfg.BackendURL, "/")
	}
	// Fallback: derive from request. Behind a TLS-terminating proxy (Railway, etc.)
	// r.TLS is nil, so trust X-Forwarded-Proto / X-Forwarded-Host when present.
	scheme := "https"
	if proto := r.Header.Get("X-Forwarded-Proto"); proto != "" {
		scheme = proto
	} else if r.TLS == nil {
		scheme = "http"
	}
	host := r.Host
	if fwd := r.Header.Get("X-Forwarded-Host"); fwd != "" {
		host = fwd
	}
	return scheme + "://" + host
}

// LogOAuthConfig logs the effective OAuth configuration at startup so operators can
// see exactly which redirect URIs must be registered with each provider. It warns
// loudly when BACKEND_URL is unset, which is the most common cause of broken OAuth.
func (s *Server) LogOAuthConfig() {
	backend := strings.TrimRight(s.cfg.BackendURL, "/")
	if backend == "" {
		slog.Warn("oauth: BACKEND_URL is not set: callback URLs will be derived from each request. " +
			"This frequently mismatches what is registered with Google/GitHub and breaks login. " +
			"Set BACKEND_URL to your public backend URL, e.g. https://NEXT_PUBLIC_API_URL")
	}
	for _, provider := range []string{"google", "github"} {
		if getOAuthProviderConfig(s.cfg, provider) == nil {
			slog.Info("oauth: provider disabled (client id/secret not set)", "provider", provider)
			continue
		}
		redirect := "<derived per-request>/api/auth/oauth/" + provider + "/callback"
		if backend != "" {
			redirect = backend + "/api/auth/oauth/" + provider + "/callback"
		}
		slog.Info("oauth: provider enabled: register this EXACT redirect URI with the provider",
			"provider", provider, "redirect_uri", redirect)
	}
	if s.cfg.FrontendURL == "" {
		slog.Warn("oauth: FRONTEND_URL is not set: falling back to http://localhost:3000 after login")
	} else {
		slog.Info("oauth: post-login redirect", "frontend_url", strings.TrimRight(s.cfg.FrontendURL, "/"))
	}
}

// HandleOAuthConfig returns the non-secret OAuth configuration so operators can confirm,
// from a live request, exactly which redirect URIs to register with each provider.
// Reaching this endpoint also proves the backend domain is provisioned and serving.
// GET /api/auth/oauth/config
func (s *Server) HandleOAuthConfig(w http.ResponseWriter, r *http.Request) {
	providers := map[string]interface{}{}
	for _, provider := range []string{"google", "github"} {
		providers[provider] = map[string]interface{}{
			"configured":   getOAuthProviderConfig(s.cfg, provider) != nil,
			"redirect_uri": s.oauthCallbackURL(r, provider),
		}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"backend_url":      strings.TrimRight(s.cfg.BackendURL, "/"),
		"backend_url_set":  s.cfg.BackendURL != "",
		"frontend_url":     strings.TrimRight(s.cfg.FrontendURL, "/"),
		"derived_base_url": s.backendBaseURL(r),
		"providers":        providers,
	})
}

// oauthRedirect generates tokens and either redirects (web) or stores for polling (desktop).
func (s *Server) oauthRedirect(w http.ResponseWriter, r *http.Request, user *types.User, desktop bool, session string) {
	frontendURL := strings.TrimRight(s.cfg.FrontendURL, "/")
	if frontendURL == "" {
		frontendURL = "http://localhost:3000"
	}

	if user.TOTPEnabled {
		tempToken, err := auth.GenerateTempToken(s.cfg.JWTSecret, user.ID)
		if err != nil {
			s.oauthError(w, r, "internal error", desktop, session)
			return
		}
		if desktop && session != "" {
			s.desktopRelayRedirect(w, r, frontendURL, session, &desktopOAuthResult{
				Requires2FA: true,
				TempToken:   tempToken,
				CreatedAt:   time.Now(),
			})
			return
		}
		http.Redirect(w, r, fmt.Sprintf("%s/oauth/callback#requires_2fa=1&temp_token=%s", frontendURL, tempToken), http.StatusTemporaryRedirect) //nolint:gosec // frontendURL is server config
		return
	}

	jwtToken, err := auth.GenerateAccessToken(s.cfg.JWTSecret, user.ID, user.Email, user.Username, user.Role.String(), user.TokenVersion)
	if err != nil {
		s.oauthError(w, r, "internal error", desktop, session)
		return
	}

	refreshToken, err := auth.GenerateRandomToken()
	if err != nil {
		s.oauthError(w, r, "internal error", desktop, session)
		return
	}

	s.db.InsertRefreshToken(r.Context(), &types.RefreshToken{
		ID:        uuid.New().String(),
		UserID:    user.ID,
		TokenHash: auth.HashToken(refreshToken),
		ExpiresAt: time.Now().Add(auth.RefreshTokenDuration),
		IP:        s.clientIP(r),
		UserAgent: r.UserAgent(),
	})

	if desktop && session != "" {
		s.desktopRelayRedirect(w, r, frontendURL, session, &desktopOAuthResult{
			AccessToken:  jwtToken,
			RefreshToken: refreshToken,
			CreatedAt:    time.Now(),
		})
		return
	}

	// Web: also set the httpOnly refresh cookie (see setRefreshCookie's comment
	// in auth.go) so the frontend never has to persist the fragment value.
	setRefreshCookie(w, refreshToken)

	// Web: Use URL fragment (#) so tokens are NOT sent in Referrer headers or server logs.
	redirectURL := fmt.Sprintf("%s/oauth/callback#access_token=%s&refresh_token=%s",
		frontendURL, jwtToken, refreshToken)
	http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
}

// oauthError redirects to the frontend with an error message (or stores error for desktop poll).
func (s *Server) oauthError(w http.ResponseWriter, r *http.Request, errMsg string, desktop bool, session string) {
	frontendURL := strings.TrimRight(s.cfg.FrontendURL, "/")
	if frontendURL == "" {
		frontendURL = "http://localhost:3000"
	}

	if desktop && session != "" {
		s.storeDesktopResult(session, &desktopOAuthResult{
			Error:     errMsg,
			CreatedAt: time.Now(),
			Approved:  true,
		})
		http.Redirect(w, r, fmt.Sprintf("%s/oauth/desktop-relay?error=%s", frontendURL, errMsg), http.StatusTemporaryRedirect)
		return
	}

	http.Redirect(w, r, fmt.Sprintf("%s/oauth/callback?error=%s", frontendURL, errMsg), http.StatusTemporaryRedirect)
}

// validHexLen reports whether v is hex-encoded and decodes to exactly n bytes.
func validHexLen(v string, n int) bool {
	d, err := hex.DecodeString(v)
	return err == nil && len(d) == n
}

const desktopLegacyChallenge = "-"

// desktopApprovalCode is the short code the desktop app shows and the relay page
// repeats, so the person can confirm the browser sign-in belongs to their app.
func desktopApprovalCode(challenge string) string {
	if len(challenge) < 6 || challenge == desktopLegacyChallenge {
		return ""
	}
	return strings.ToUpper(challenge[:6])
}

// storeDesktopResult stores a result under the public session id and binds it to the
// PKCE challenge carried in key ("<session>:<challenge>"). A result carrying tokens
// stays unreleased until the person approves it from the browser that signed in.
func (s *Server) storeDesktopResult(key string, res *desktopOAuthResult) {
	session, challenge, ok := strings.Cut(key, ":")
	if !ok {
		return
	}
	if challenge == desktopLegacyChallenge {
		challenge = ""
	}
	res.Challenge = challenge
	s.desktopSessionsMu.Lock()
	s.desktopSessions[session] = res
	s.desktopSessionsMu.Unlock()
}

// desktopRelayRedirect stores a pending result and sends the browser to the relay
// page with a one-time approval token in the fragment. Only the browser that
// completed the sign-in ever sees that token.
func (s *Server) desktopRelayRedirect(w http.ResponseWriter, r *http.Request, frontendURL, key string, res *desktopOAuthResult) {
	tok := make([]byte, 16)
	if _, err := rand.Read(tok); err != nil {
		s.oauthError(w, r, "internal error", true, key)
		return
	}
	res.ApprovalTok = hex.EncodeToString(tok)
	s.storeDesktopResult(key, res)
	session, challenge, _ := strings.Cut(key, ":")
	http.Redirect(w, r, fmt.Sprintf("%s/oauth/desktop-relay#session=%s&approve=%s&code=%s", //nolint:gosec // frontendURL is server config
		frontendURL, session, res.ApprovalTok, desktopApprovalCode(challenge)), http.StatusTemporaryRedirect)
}

// HandleDesktopOAuthApprove releases a pending desktop sign-in. The approval token
// only reaches the browser that finished the provider login, which is what binds
// the result to a person who chose to hand it to the desktop app.
// POST /api/auth/oauth/desktop-approve {session, token}
func (s *Server) HandleDesktopOAuthApprove(w http.ResponseWriter, r *http.Request) {
	if !s.devMode && !s.desktopPollLimiter.allow(s.clientIP(r)) {
		http.Error(w, `{"error":"too many requests"}`, http.StatusTooManyRequests)
		return
	}
	var req struct {
		Session string `json:"session"`
		Token   string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || !validHexLen(req.Session, 16) || !validHexLen(req.Token, 16) {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}
	s.desktopSessionsMu.Lock()
	result, ok := s.desktopSessions[req.Session]
	ok = ok && result.ApprovalTok != "" && subtle.ConstantTimeCompare([]byte(req.Token), []byte(result.ApprovalTok)) == 1
	if ok {
		result.Approved = true
	}
	s.desktopSessionsMu.Unlock()
	if !ok {
		http.Error(w, `{"error":"no pending sign-in for this approval"}`, http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// HandleDesktopOAuthPoll returns stored OAuth tokens for a desktop session once the
// sign-in was approved in the browser. A session started with a PKCE challenge also
// needs the verifier; sessions from older apps (no challenge) rely on approval alone.
// GET /api/auth/oauth/desktop-poll?session=<id>[&verifier=<secret>]
func (s *Server) HandleDesktopOAuthPoll(w http.ResponseWriter, r *http.Request) {
	if !s.devMode && !s.desktopPollLimiter.allow(s.clientIP(r)) {
		http.Error(w, `{"error":"too many requests"}`, http.StatusTooManyRequests)
		return
	}
	session := r.URL.Query().Get("session")
	if !validHexLen(session, 16) {
		http.Error(w, `{"error":"invalid session"}`, http.StatusBadRequest)
		return
	}
	verifier := r.URL.Query().Get("verifier")
	want := ""
	if verifier != "" {
		if !validHexLen(verifier, 32) {
			http.Error(w, `{"error":"invalid verifier"}`, http.StatusBadRequest)
			return
		}
		sum := sha256.Sum256([]byte(verifier))
		want = hex.EncodeToString(sum[:])
	}

	s.desktopSessionsMu.Lock()
	result, ok := s.desktopSessions[session]
	if ok && result.Approved &&
		(result.Challenge == "" || subtle.ConstantTimeCompare([]byte(want), []byte(result.Challenge)) == 1) {
		delete(s.desktopSessions, session)
	} else {
		ok = false
	}
	for k, v := range s.desktopSessions {
		if time.Since(v.CreatedAt) > 5*time.Minute {
			delete(s.desktopSessions, k)
		}
	}
	s.desktopSessionsMu.Unlock()

	if !ok {
		w.WriteHeader(http.StatusNotFound)
		w.Write([]byte(`{"status":"pending"}`))
		return
	}

	writeJSON(w, http.StatusOK, result)
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
