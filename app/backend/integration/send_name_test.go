//go:build integration

package integration_test

import (
	"encoding/base64"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

// A sealed send filename is base64 ciphertext, which routinely contains "/".
// The path-safety check must only apply to plaintext names.
func TestSendInitAcceptsSealedNameWithSlash(t *testing.T) {
	ts := setupTestServer(t)
	body := func(name string) map[string]interface{} {
		return map[string]interface{}{
			"filename":      name,
			"original_size": 10,
			"sha256":        strings.Repeat("a", 64),
			"salt":          base64.StdEncoding.EncodeToString(make([]byte, 32)),
			"chunk_count":   1,
		}
	}
	errorOf := func(resp *http.Response) string {
		defer resp.Body.Close()
		b, _ := io.ReadAll(resp.Body)
		return string(b)
	}

	sealed := errorOf(ts.POST("/api/send/init", body("enc1:ab/cd+ef/gh=="), ""))
	assert.NotContains(t, sealed, "invalid filename")

	plain := errorOf(ts.POST("/api/send/init", body("../etc/passwd"), ""))
	assert.Contains(t, plain, "invalid filename")
}
