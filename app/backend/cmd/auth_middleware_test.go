package cmd

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/zcrypt/zcrypt/auth"
	"github.com/zcrypt/zcrypt/config"
)

const mwTestSecret = "test-secret-that-is-at-least-32-chars-long"

// newTestServer builds a minimal Server for middleware tests. devMode=true skips
// the per-user rate limiter; the token-version cache uses ttl=0 so the loader is
// consulted on every call (deterministic). The loader stands in for the DB.
func newTestServer(load func(ctx context.Context, userID string) (int, error)) *Server {
	return &Server{
		cfg:           &config.Config{JWTSecret: mwTestSecret},
		devMode:       true,
		tokenVersions: newTokenVersionCache(0, load),
	}
}

func callAuthMiddleware(s *Server, token string) *httptest.ResponseRecorder {
	handler := s.AuthMiddleware(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	r := httptest.NewRequest(http.MethodGet, "/api/files", nil)
	r.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	handler(rec, r)
	return rec
}

// TestAuthMiddlewareEnforcesTokenVersion is the S2 regression: bumping a user's
// token_version (password reset / admin role change) must immediately reject
// access tokens carrying the old version, instead of letting them live until
// expiry.
func TestAuthMiddlewareEnforcesTokenVersion(t *testing.T) {
	// Access token minted at version 0.
	token, err := auth.GenerateAccessToken(mwTestSecret, "user-1", "u@test.com", "user", "user", 0)
	if err != nil {
		t.Fatalf("generate token: %v", err)
	}

	t.Run("current version matches -> allowed", func(t *testing.T) {
		s := newTestServer(func(context.Context, string) (int, error) { return 0, nil })
		if rec := callAuthMiddleware(s, token); rec.Code != http.StatusOK {
			t.Fatalf("status = %d, want 200", rec.Code)
		}
	})

	t.Run("version bumped -> token revoked", func(t *testing.T) {
		// Simulate a reset/role-change having incremented token_version to 1.
		s := newTestServer(func(context.Context, string) (int, error) { return 1, nil })
		if rec := callAuthMiddleware(s, token); rec.Code != http.StatusUnauthorized {
			t.Fatalf("status = %d, want 401 (revoked)", rec.Code)
		}
	})

	t.Run("version lookup error -> 500", func(t *testing.T) {
		s := newTestServer(func(context.Context, string) (int, error) { return 0, errors.New("db down") })
		if rec := callAuthMiddleware(s, token); rec.Code != http.StatusInternalServerError {
			t.Fatalf("status = %d, want 500", rec.Code)
		}
	})
}

// TestAuthMiddlewareRejectsTempToken is the S1 regression at the HTTP layer: the
// 2FA temp token must not be accepted by AuthMiddleware as an access token.
func TestAuthMiddlewareRejectsTempToken(t *testing.T) {
	temp, err := auth.GenerateTempToken(mwTestSecret, "user-1")
	if err != nil {
		t.Fatalf("generate temp token: %v", err)
	}
	s := newTestServer(func(context.Context, string) (int, error) { return 0, nil })
	if rec := callAuthMiddleware(s, temp); rec.Code != http.StatusUnauthorized {
		t.Fatalf("temp token accepted as access token: status = %d, want 401", rec.Code)
	}
}
