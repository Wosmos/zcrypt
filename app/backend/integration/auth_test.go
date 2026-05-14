//go:build integration

package integration_test

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRegister(t *testing.T) {
	ts := setupTestServer(t)

	t.Run("valid registration succeeds", func(t *testing.T) {
		resp := ts.POST("/api/auth/register", map[string]string{
			"email":    "test@example.com",
			"password": "SecurePass@123!",
			"username": "testuser",
		}, "")

		body := requireStatus(t, resp, http.StatusCreated)
		var result struct {
			AccessToken  string `json:"access_token"`
			RefreshToken string `json:"refresh_token"`
		}
		require.NoError(t, jsonUnmarshal(body, &result))
		assert.NotEmpty(t, result.AccessToken)
		assert.NotEmpty(t, result.RefreshToken)
	})

	t.Run("duplicate email rejected", func(t *testing.T) {
		ts.POST("/api/auth/register", map[string]string{
			"email":    "dup@example.com",
			"password": "SecurePass@123!",
			"username": "dupuser1",
		}, "").Body.Close()

		resp := ts.POST("/api/auth/register", map[string]string{
			"email":    "dup@example.com",
			"password": "SecurePass@123!",
			"username": "dupuser2",
		}, "")
		assert.Equal(t, http.StatusConflict, resp.StatusCode)
		resp.Body.Close()
	})

	t.Run("weak password rejected", func(t *testing.T) {
		resp := ts.POST("/api/auth/register", map[string]string{
			"email":    "weak@example.com",
			"password": "1234",
			"username": "weakuser",
		}, "")
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
		resp.Body.Close()
	})

	t.Run("invalid email rejected", func(t *testing.T) {
		resp := ts.POST("/api/auth/register", map[string]string{
			"email":    "notanemail",
			"password": "SecurePass@123!",
			"username": "validuser",
		}, "")
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
		resp.Body.Close()
	})

	t.Run("missing fields rejected", func(t *testing.T) {
		resp := ts.POST("/api/auth/register", map[string]string{
			"email": "missing@example.com",
		}, "")
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
		resp.Body.Close()
	})
}

func TestLogin(t *testing.T) {
	ts := setupTestServer(t)
	const email = "login@example.com"
	const password = "SecurePass@123!"

	// Setup: register user
	ts.registerAndLogin(email, password)

	t.Run("valid login returns tokens", func(t *testing.T) {
		resp := ts.POST("/api/auth/login", map[string]string{
			"email":    email,
			"password": password,
		}, "")
		body := requireStatus(t, resp, http.StatusOK)
		var result struct {
			AccessToken  string `json:"access_token"`
			RefreshToken string `json:"refresh_token"`
		}
		require.NoError(t, jsonUnmarshal(body, &result))
		assert.NotEmpty(t, result.AccessToken)
		assert.NotEmpty(t, result.RefreshToken)
	})

	t.Run("wrong password returns 401", func(t *testing.T) {
		resp := ts.POST("/api/auth/login", map[string]string{
			"email":    email,
			"password": "WrongPassword!",
		}, "")
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
		resp.Body.Close()
	})

	t.Run("nonexistent user returns 401", func(t *testing.T) {
		resp := ts.POST("/api/auth/login", map[string]string{
			"email":    "ghost@example.com",
			"password": password,
		}, "")
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
		resp.Body.Close()
	})
}

func TestTokenRefresh(t *testing.T) {
	ts := setupTestServer(t)

	// Register and get tokens
	resp := ts.POST("/api/auth/register", map[string]string{
		"email":    "refresh@example.com",
		"password": "SecurePass@123!",
		"username": "refreshuser",
	}, "")
	body := requireStatus(t, resp, http.StatusCreated)
	var tokens struct {
		AccessToken  string `json:"access_token"`
		RefreshToken string `json:"refresh_token"`
	}
	require.NoError(t, jsonUnmarshal(body, &tokens))

	t.Run("valid refresh token issues new access token", func(t *testing.T) {
		resp := ts.POST("/api/auth/refresh", map[string]string{
			"refresh_token": tokens.RefreshToken,
		}, "")
		body := requireStatus(t, resp, http.StatusOK)
		var result struct {
			AccessToken string `json:"access_token"`
		}
		require.NoError(t, jsonUnmarshal(body, &result))
		assert.NotEmpty(t, result.AccessToken)
	})

	t.Run("invalid refresh token returns 401", func(t *testing.T) {
		resp := ts.POST("/api/auth/refresh", map[string]string{
			"refresh_token": "fake-refresh-token-that-does-not-exist",
		}, "")
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
		resp.Body.Close()
	})
}

func TestAuthMiddleware(t *testing.T) {
	ts := setupTestServer(t)

	t.Run("unauthenticated request to /api/files returns 401", func(t *testing.T) {
		resp := ts.GET("/api/files", "")
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
		resp.Body.Close()
	})

	t.Run("invalid JWT returns 401", func(t *testing.T) {
		resp := ts.GET("/api/files", "not.a.valid.jwt")
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
		resp.Body.Close()
	})

	t.Run("valid JWT allows access", func(t *testing.T) {
		token := ts.registerAndLogin("authtest@example.com", "SecurePass@123!")
		resp := ts.GET("/api/files", token)
		assert.Equal(t, http.StatusOK, resp.StatusCode)
		resp.Body.Close()
	})
}

func TestAdminOnly(t *testing.T) {
	ts := setupTestServer(t)

	t.Run("regular user cannot access admin endpoints", func(t *testing.T) {
		token := ts.registerAndLogin("regular@example.com", "SecurePass@123!")
		resp := ts.GET("/api/admin/users", token)
		// Should be 403 Forbidden (authenticated but not admin)
		assert.Equal(t, http.StatusForbidden, resp.StatusCode)
		resp.Body.Close()
	})
}
