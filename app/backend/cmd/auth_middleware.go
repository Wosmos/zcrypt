package cmd

import (
	"context"
	"log"
	"net/http"
	"strings"

	"github.com/zcrypt/zcrypt/auth"
	"github.com/zcrypt/zcrypt/types"
)

type contextKey string

const userContextKey contextKey = "user_claims"

// AuthMiddleware validates the JWT from the Authorization header
// and injects Claims into the request context.
func (s *Server) AuthMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		token := strings.TrimPrefix(header, "Bearer ")
		claims, err := auth.ValidateAccessToken(s.cfg.JWTSecret, token)
		if err != nil {
			http.Error(w, `{"error":"invalid or expired token"}`, http.StatusUnauthorized)
			return
		}
		// Per-user rate limiting: 100 req/min
		if !s.userLimiter.allow(claims.Sub) {
			http.Error(w, `{"error":"too many requests, please slow down"}`, http.StatusTooManyRequests)
			return
		}
		ctx := context.WithValue(r.Context(), userContextKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	}
}

// AdminMiddleware validates JWT and checks for admin role.
func (s *Server) AdminMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return s.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		claims := GetUserClaims(r)
		if claims == nil || claims.Role != types.RoleAdmin.String() {
			http.Error(w, `{"error":"admin access required"}`, http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ShareRateLimitMiddleware applies IP-based rate limiting to public share endpoints.
func (s *Server) ShareRateLimitMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ip := extractClientIP(r)
		if !s.shareLimiter.allow(ip) {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", "5")
			w.WriteHeader(http.StatusTooManyRequests)
			w.Write([]byte(`{"error":"too many requests"}`))
			return
		}
		next.ServeHTTP(w, r)
	}
}

// extractClientIP gets the client IP from proxy headers or RemoteAddr.
func extractClientIP(r *http.Request) string {
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

// internalError logs the real error and returns a generic message to the client.
func internalError(w http.ResponseWriter, msg string, err error) {
	log.Printf("error: %s: %v", msg, err)
	http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
}

// MaxBodyMiddleware limits the request body size for JSON endpoints.
// This prevents attackers from sending enormous payloads to exhaust memory.
func MaxBodyMiddleware(maxBytes int64, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
		next.ServeHTTP(w, r)
	}
}

// GetUserClaims extracts the JWT claims from the request context.
func GetUserClaims(r *http.Request) *auth.Claims {
	claims, _ := r.Context().Value(userContextKey).(*auth.Claims)
	return claims
}

// GetUserID extracts the user ID from the request context.
func GetUserID(r *http.Request) string {
	claims := GetUserClaims(r)
	if claims == nil {
		return ""
	}
	return claims.Sub
}

// IsAdmin returns whether the current user has admin role.
func IsAdmin(r *http.Request) bool {
	claims := GetUserClaims(r)
	return claims != nil && claims.Role == types.RoleAdmin.String()
}

// IsDecoy returns whether the current session is in decoy mode.
func IsDecoy(r *http.Request) bool {
	claims := GetUserClaims(r)
	return claims != nil && claims.Decoy
}
