package cmd

import (
	"context"
	"net/http"
	"strings"

	"github.com/zpush/zpush/auth"
	"github.com/zpush/zpush/types"
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
