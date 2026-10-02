//go:build integration

package integration_test

import (
	"encoding/json"
	"net/http"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func uploadInitBody(size int64, count int, chunkSize int64, sha string) map[string]interface{} {
	return map[string]interface{}{
		"filename":      "q.bin",
		"original_size": size,
		"sha256":        sha,
		"salt":          validSalt,
		"chunk_count":   count,
		"chunk_size":    chunkSize,
	}
}

func TestUploadSizeIsEnforced(t *testing.T) {
	ts := setupTestServer(t)
	const email = "upload-quota@example.com"
	token := ts.registerAndLogin(email, "SecurePass@123!")
	ts.enableMockStorage(email)
	const mib = int64(1) << 20

	t.Run("chunk_count must match size and chunk_size", func(t *testing.T) {
		requireStatus(t, ts.POST("/api/upload/init", uploadInitBody(100, 50, 1*mib, "a1"), token), http.StatusBadRequest)
		requireStatus(t, ts.POST("/api/upload/init", uploadInitBody(10, 11, 0, "a2"), token), http.StatusBadRequest)
	})

	t.Run("chunks cannot carry more than the declared size", func(t *testing.T) {
		var init struct {
			SessionID string `json:"session_id"`
		}
		require.NoError(t, json.Unmarshal(requireStatus(t, ts.POST("/api/upload/init", uploadInitBody(100, 1, 0, "b1"), token), http.StatusOK), &init))
		requireStatus(t, ts.PUT("/api/upload/"+init.SessionID+"/chunk/0", make([]byte, 64<<10), token), http.StatusRequestEntityTooLarge)
		requireStatus(t, ts.PUT("/api/upload/"+init.SessionID+"/chunk/0", make([]byte, 128), token), http.StatusOK)
		requireStatus(t, ts.POST("/api/upload/"+init.SessionID+"/complete", map[string]interface{}{}, token), http.StatusOK)
	})

	t.Run("concurrent inits cannot share the same quota headroom", func(t *testing.T) {
		size := 600 * mib
		var wg sync.WaitGroup
		codes := make([]int, 2)
		for i, sha := range []string{"c1", "c2"} {
			wg.Add(1)
			go func(i int, sha string) {
				defer wg.Done()
				resp := ts.POST("/api/upload/init", uploadInitBody(size, 60, 10*mib, sha), token)
				resp.Body.Close()
				codes[i] = resp.StatusCode
			}(i, sha)
		}
		wg.Wait()
		assert.ElementsMatch(t, []int{http.StatusOK, http.StatusRequestEntityTooLarge}, codes,
			"two 600 MiB inits against a 1 GiB shared quota: only one may reserve")
	})
}
