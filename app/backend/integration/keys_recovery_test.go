//go:build integration

package integration_test

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func recoveryBlob(fill byte) string {
	raw := bytes.Repeat([]byte{fill}, 12+16+24)
	return "rk1:" + base64.StdEncoding.EncodeToString(raw)
}

func (ts *testServer) putRecovery(token, blob string) *http.Response {
	ts.t.Helper()
	payload, err := json.Marshal(map[string]string{"blob": blob})
	require.NoError(ts.t, err)
	req, err := http.NewRequest("PUT", ts.URL+"/api/keys/recovery", bytes.NewReader(payload))
	require.NoError(ts.t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", uniqueTestIP())
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	require.NoError(ts.t, err)
	return resp
}

func TestRecoveryKit(t *testing.T) {
	ts := setupTestServer(t)
	cleanDB(t, ts.db)
	owner := ts.registerAndLogin("recovery-owner@example.com", "SecurePass@123!")
	other := ts.registerAndLogin("recovery-other@example.com", "SecurePass@123!")
	requireStatus(t, ts.POST("/api/keys", publishKeyBody(), owner), http.StatusOK)

	type kit struct {
		Blob      string `json:"blob"`
		CreatedAt string `json:"created_at"`
	}
	type keyStatus struct {
		RecoveryKitSet       bool    `json:"recovery_kit_set"`
		RecoveryKitCreatedAt *string `json:"recovery_kit_created_at"`
	}

	t.Run("authentication is required", func(t *testing.T) {
		resp := ts.GET("/api/keys/recovery", "")
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
		resp.Body.Close()
		resp = ts.putRecovery("", recoveryBlob(1))
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
		resp.Body.Close()
		resp = ts.DELETE("/api/keys/recovery", "")
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
		resp.Body.Close()
	})

	t.Run("404 and not-set before a kit exists", func(t *testing.T) {
		resp := ts.GET("/api/keys/recovery", owner)
		assert.Equal(t, http.StatusNotFound, resp.StatusCode)
		resp.Body.Close()

		var st keyStatus
		require.NoError(t, json.Unmarshal(requireStatus(t, ts.GET("/api/keys/me", owner), http.StatusOK), &st))
		assert.False(t, st.RecoveryKitSet)
		assert.Nil(t, st.RecoveryKitCreatedAt)
	})

	t.Run("invalid blobs are rejected", func(t *testing.T) {
		for _, bad := range []string{"", "no-prefix", "rk1:!!!", "rk1:" + base64.StdEncoding.EncodeToString([]byte("x"))} {
			resp := ts.putRecovery(owner, bad)
			assert.Equal(t, http.StatusBadRequest, resp.StatusCode, "blob %q", bad)
			resp.Body.Close()
		}
	})

	t.Run("set then get returns the blob and flags key status", func(t *testing.T) {
		requireStatus(t, ts.putRecovery(owner, recoveryBlob(1)), http.StatusOK)

		var got kit
		require.NoError(t, json.Unmarshal(requireStatus(t, ts.GET("/api/keys/recovery", owner), http.StatusOK), &got))
		assert.Equal(t, recoveryBlob(1), got.Blob)
		assert.NotEmpty(t, got.CreatedAt)

		var st keyStatus
		require.NoError(t, json.Unmarshal(requireStatus(t, ts.GET("/api/keys/me", owner), http.StatusOK), &st))
		assert.True(t, st.RecoveryKitSet)
		require.NotNil(t, st.RecoveryKitCreatedAt)
	})

	t.Run("another user cannot read it", func(t *testing.T) {
		resp := ts.GET("/api/keys/recovery", other)
		assert.Equal(t, http.StatusNotFound, resp.StatusCode)
		resp.Body.Close()
	})

	t.Run("another user deleting does not touch it", func(t *testing.T) {
		requireStatus(t, ts.DELETE("/api/keys/recovery", other), http.StatusOK)
		requireStatus(t, ts.GET("/api/keys/recovery", owner), http.StatusOK)
	})

	t.Run("replacing overwrites the old blob", func(t *testing.T) {
		requireStatus(t, ts.putRecovery(owner, recoveryBlob(2)), http.StatusOK)
		var got kit
		require.NoError(t, json.Unmarshal(requireStatus(t, ts.GET("/api/keys/recovery", owner), http.StatusOK), &got))
		assert.Equal(t, recoveryBlob(2), got.Blob)
		assert.NotEqual(t, recoveryBlob(1), got.Blob)
	})

	t.Run("delete removes it", func(t *testing.T) {
		requireStatus(t, ts.DELETE("/api/keys/recovery", owner), http.StatusOK)
		resp := ts.GET("/api/keys/recovery", owner)
		assert.Equal(t, http.StatusNotFound, resp.StatusCode)
		resp.Body.Close()

		var st keyStatus
		require.NoError(t, json.Unmarshal(requireStatus(t, ts.GET("/api/keys/me", owner), http.StatusOK), &st))
		assert.False(t, st.RecoveryKitSet)
	})
}
