package cmd

import (
	"context"
	"net/http"
	"strings"

	"github.com/zpush/zpush/auth"
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
		ctx := context.WithValue(r.Context(), userContextKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	}
}

// GetUserClaims extracts the JWT claims from the request context.
func GetUserClaims(r *http.Request) *auth.Claims {
	claims, _ := r.Context().Value(userContextKey).(*auth.Claims)
	return claims
}
