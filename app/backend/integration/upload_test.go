//go:build integration

package integration_test

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// validSalt is a 32-byte (256-bit) salt, base64-encoded, as /api/upload/init
// requires. Shorter salts are rejected with "salt must be 32 bytes".
var validSalt = base64.StdEncoding.EncodeToString(make([]byte, 32))

func TestUploadPipeline(t *testing.T) {
	ts := setupTestServer(t)
	token := ts.registerAndLogin("uploader@example.com", "SecurePass@123!")
	ts.enableMockStorage("uploader@example.com")

	t.Run("full upload cycle: init → chunk → complete → list → delete", func(t *testing.T) {
		// 1. Init upload session
		initResp := ts.POST("/api/upload/init", map[string]interface{}{
			"filename":      "hello.txt",
			"original_size": 11,
			"sha256":        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
			"salt":          validSalt,
			"chunk_count":   1,
		}, token)

		initBody := requireStatus(t, initResp, http.StatusOK)
		var initResult struct {
			SessionID string `json:"session_id"`
			FileID    string `json:"file_id"`
		}
		require.NoError(t, json.Unmarshal(initBody, &initResult))
		assert.NotEmpty(t, initResult.SessionID)
		assert.NotEmpty(t, initResult.FileID)

		// 2. Upload single chunk (PUT /api/upload/{sid}/chunk/{idx}). The body
		// must be at least 28 bytes (12B IV + 16B GCM tag) to pass validation.
		chunkResp := ts.PUT(
			"/api/upload/"+initResult.SessionID+"/chunk/0",
			[]byte("encrypted-chunk-payload-0123456789ABCDEF"),
			token,
		)
		requireStatus(t, chunkResp, http.StatusOK)

		// 3. Complete upload (POST /api/upload/{sid}/complete)
		completeResp := ts.POST(
			"/api/upload/"+initResult.SessionID+"/complete",
			map[string]interface{}{},
			token,
		)
		requireStatus(t, completeResp, http.StatusOK)

		// 4. File appears in list. /api/files returns a bare JSON array.
		listResp := ts.GET("/api/files", token)
		listBody := requireStatus(t, listResp, http.StatusOK)
		var listResult []struct {
			ID           string `json:"id"`
			OriginalName string `json:"original_name"`
		}
		require.NoError(t, json.Unmarshal(listBody, &listResult))
		require.Len(t, listResult, 1)
		assert.Equal(t, "hello.txt", listResult[0].OriginalName)

		// 5. Delete file
		deleteResp := ts.DELETE("/api/files/"+listResult[0].ID, token)
		requireStatus(t, deleteResp, http.StatusOK)

		// 6. File no longer in list
		listResp2 := ts.GET("/api/files", token)
		listBody2 := requireStatus(t, listResp2, http.StatusOK)
		var listResult2 []interface{}
		require.NoError(t, json.Unmarshal(listBody2, &listResult2))
		assert.Len(t, listResult2, 0)
	})

	t.Run("upload init with zero chunk_count rejected", func(t *testing.T) {
		resp := ts.POST("/api/upload/init", map[string]interface{}{
			"filename":      "bad.txt",
			"original_size": 100,
			"sha256":        "aaaa",
			"salt":          validSalt,
			"chunk_count":   0,
		}, token)
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
		resp.Body.Close()
	})

	t.Run("upload init with negative size rejected", func(t *testing.T) {
		resp := ts.POST("/api/upload/init", map[string]interface{}{
			"filename":      "bad.txt",
			"original_size": -1,
			"sha256":        "aaaa",
			"salt":          validSalt,
			"chunk_count":   1,
		}, token)
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
		resp.Body.Close()
	})

	t.Run("upload chunk to non-existent session returns 404", func(t *testing.T) {
		resp := ts.PUT("/api/upload/00000000-0000-0000-0000-000000000000/chunk/0",
			[]byte("test chunk data"), token)
		assert.Equal(t, http.StatusNotFound, resp.StatusCode)
		resp.Body.Close()
	})
}

func TestUploadQuota(t *testing.T) {
	ts := setupTestServer(t)
	token := ts.registerAndLogin("quotauser@example.com", "SecurePass@123!")

	// Quota endpoint should return reasonable values
	t.Run("quota endpoint returns usage and limit", func(t *testing.T) {
		resp := ts.GET("/api/quota", token)
		body := requireStatus(t, resp, http.StatusOK)
		var result struct {
			UsedBytes  int64 `json:"used_bytes"`
			LimitBytes int64 `json:"limit_bytes"`
		}
		require.NoError(t, json.Unmarshal(body, &result))
		assert.GreaterOrEqual(t, result.LimitBytes, int64(0))
		assert.GreaterOrEqual(t, result.UsedBytes, int64(0))
	})
}

func TestFileOwnership(t *testing.T) {
	ts := setupTestServer(t)

	tokenA := ts.registerAndLogin("userA@example.com", "SecurePass@123!")
	tokenB := ts.registerAndLogin("userB@example.com", "SecurePass@123!")
	ts.enableMockStorage("userA@example.com")

	// User A uploads a file
	initResp := ts.POST("/api/upload/init", map[string]interface{}{
		"filename":      "private.txt",
		"original_size": 10,
		"sha256":        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"salt":          validSalt,
		"chunk_count":   1,
	}, tokenA)
	initBody := requireStatus(t, initResp, http.StatusOK)
	var initResult struct {
		FileID string `json:"file_id"`
	}
	require.NoError(t, json.Unmarshal(initBody, &initResult))

	t.Run("user B cannot delete user A's file (IDOR protection)", func(t *testing.T) {
		ts.DELETE("/api/files/"+initResult.FileID, tokenB).Body.Close()
		// Deletes are scoped by user_id, so user B's request matches no rows it
		// owns and is a harmless no-op (the API returns an idempotent 200). The
		// security guarantee is that user A's file is NOT removed — verify it
		// still exists rather than asserting a particular status code.
		f, err := ts.db.GetFileByIDUnsafe(context.Background(), initResult.FileID)
		require.NoError(t, err)
		require.NotNil(t, f, "user A's file must survive user B's delete attempt")
	})

	t.Run("user B cannot see user A's files in their list", func(t *testing.T) {
		resp := ts.GET("/api/files", tokenB)
		body := requireStatus(t, resp, http.StatusOK)
		var result []interface{}
		require.NoError(t, json.Unmarshal(body, &result))
		assert.Len(t, result, 0, "user B should not see user A's files")
	})
}
