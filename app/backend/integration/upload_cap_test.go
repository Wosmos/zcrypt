//go:build integration

package integration_test

import (
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The web upload path caps a single file at 10 GiB — init must reject larger
// declared sizes with 413 before any session or platform work happens.
func TestUploadInitPerFileCap(t *testing.T) {
	ts := setupTestServer(t)
	token := ts.registerAndLogin("cap@example.com", "SecurePass@123!")
	ts.enableMockStorage("cap@example.com")

	salt := make([]byte, 32)
	_, err := rand.Read(salt)
	require.NoError(t, err)

	initReq := func(size int64) map[string]interface{} {
		return map[string]interface{}{
			"filename":      "big.bin",
			"original_size": size,
			"sha256":        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
			"salt":          base64.StdEncoding.EncodeToString(salt),
			"chunk_count":   1,
			"chunk_size":    10 * 1024 * 1024,
		}
	}

	const tenGiB = int64(10) << 30

	t.Run("over the cap rejected with 413", func(t *testing.T) {
		resp := ts.POST("/api/upload/init", initReq(tenGiB+1), token)
		assert.Equal(t, http.StatusRequestEntityTooLarge, resp.StatusCode)
		resp.Body.Close()
	})

	t.Run("exactly at the cap is not size-rejected", func(t *testing.T) {
		resp := ts.POST("/api/upload/init", initReq(tenGiB), token)
		// Whatever else init decides, it must not be the size guard firing.
		assert.NotEqual(t, http.StatusRequestEntityTooLarge, resp.StatusCode)
		resp.Body.Close()
	})
}
