//go:build integration

package integration_test

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
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
	token := ts.registerAndLogin(email, newTestPassword())
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

	t.Run("parallel chunks cannot share the same declared-size headroom", func(t *testing.T) {
		var init struct {
			SessionID string `json:"session_id"`
		}
		require.NoError(t, json.Unmarshal(requireStatus(t, ts.POST("/api/upload/init", uploadInitBody(100, 2, 0, "d1"), token), http.StatusOK), &init))
		var wg sync.WaitGroup
		codes := make([]int, 2)
		for i := range codes {
			wg.Add(1)
			go func(i int) {
				defer wg.Done()
				resp := ts.PUT("/api/upload/"+init.SessionID+"/chunk/"+strconv.Itoa(i), make([]byte, 128), token)
				resp.Body.Close()
				codes[i] = resp.StatusCode
			}(i)
		}
		wg.Wait()
		assert.ElementsMatch(t, []int{http.StatusOK, http.StatusRequestEntityTooLarge}, codes)
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

func TestPresignReservesDeclaredSize(t *testing.T) {
	ts := setupTestServer(t)
	const email = "presign-budget@example.com"
	token := ts.registerAndLogin(email, newTestPassword())
	user, err := ts.db.GetUserByEmail(context.Background(), email)
	require.NoError(t, err)
	ts.srv.InjectTestAdapter(user.ID, "mock", "testacct", newMockDirectAdapter(), 10<<30)

	var init struct {
		SessionID    string `json:"session_id"`
		DirectUpload bool   `json:"direct_upload"`
	}
	require.NoError(t, json.Unmarshal(requireStatus(t, ts.POST("/api/upload/init", uploadInitBody(100, 2, 0, hex64), token), http.StatusOK), &init))
	require.True(t, init.DirectUpload)

	presign := func(idx string) int {
		resp := ts.POST("/api/upload/"+init.SessionID+"/presign/"+idx, map[string]interface{}{"sha256": hex64, "size": 100}, token)
		resp.Body.Close()
		return resp.StatusCode
	}
	assert.Equal(t, http.StatusOK, presign("0"))
	assert.Equal(t, http.StatusRequestEntityTooLarge, presign("1"), "an unconfirmed presign must count against the declared size")
	assert.Equal(t, http.StatusOK, presign("0"), "re-presigning the same index replaces its reservation")
}
