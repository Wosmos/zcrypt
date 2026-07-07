//go:build integration

package integration_test

import (
	"context"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// TestUploadEncryptedNameStored proves the zero-knowledge name path: a client that
// sends encrypted_name (and an empty filename) results in files.original_name=”
// and files.encrypted_name=<ciphertext>, the plaintext name is never persisted
// (including in audit_events), and the meta endpoint round-trips encrypted_name.
func TestUploadEncryptedNameStored(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("encname@example.com", "SecurePass@123!")
	ts.enableMockStorage("encname@example.com")

	const encName = "QUFBQUFBQUFBQUFBencrypted-name-b64=="

	t.Run("zk upload stores ciphertext name, empty original_name", func(t *testing.T) {
		out := initUpload(ts, t, token, map[string]interface{}{
			"encrypted_name": encName,
			"filename":       "", // zero-knowledge: no plaintext name
			"original_size":  100,
			"sha256":         "abc123",
			"sha256_scheme":  "hmac_v1",
			"salt":           validSalt,
			"chunk_count":    1,
		})
		fileID := out["file_id"].(string)

		var origName, storedEnc string
		require.NoError(t, ts.db.Pool().QueryRow(ctx,
			`SELECT original_name, encrypted_name FROM files WHERE id=$1`, fileID).Scan(&origName, &storedEnc))
		assert.Equal(t, "", origName, "server must not store a plaintext name for a zk upload")
		assert.Equal(t, encName, storedEnc, "encrypted name persisted verbatim")

		// The upload session carries the ciphertext name too (cross-device resume UI).
		var sessEnc string
		require.NoError(t, ts.db.Pool().QueryRow(ctx,
			`SELECT encrypted_name FROM upload_sessions WHERE file_id=$1`, fileID).Scan(&sessEnc))
		assert.Equal(t, encName, sessEnc)

		// Meta endpoint round-trips it so the client can decrypt for display/save.
		body := requireStatus(t, ts.GET("/api/files/"+fileID+"/meta", token), http.StatusOK)
		var meta struct {
			OriginalName  string `json:"original_name"`
			EncryptedName string `json:"encrypted_name"`
		}
		require.NoError(t, jsonUnmarshal(body, &meta))
		assert.Equal(t, "", meta.OriginalName)
		assert.Equal(t, encName, meta.EncryptedName)
	})

	t.Run("the plaintext name never reaches the audit log", func(t *testing.T) {
		// No audit_events metadata should carry a 'filename' key at all now.
		assert.Zero(t, ts.countScalar(
			`SELECT count(*) FROM audit_events WHERE metadata ? 'filename'`),
			"upload audit events must not persist any filename")
	})

	t.Run("legacy plaintext filename still works", func(t *testing.T) {
		out := initUpload(ts, t, token, map[string]interface{}{
			"filename":      "legacy-name.txt",
			"original_size": 50,
			"sha256":        "def456",
			"salt":          validSalt,
			"chunk_count":   1,
		})
		var origName, storedEnc string
		require.NoError(t, ts.db.Pool().QueryRow(ctx,
			`SELECT original_name, encrypted_name FROM files WHERE id=$1`, out["file_id"].(string)).Scan(&origName, &storedEnc))
		assert.Equal(t, "legacy-name.txt", origName, "a legacy client's plaintext name is stored as before")
		assert.Equal(t, "", storedEnc)
	})

	t.Run("a name with base64 slashes is not rejected as a bad path", func(t *testing.T) {
		// encrypted_name is base64 and routinely contains '/' and '+'; the path
		// validation must not run on it (it only guards a legacy filename).
		resp := ts.POST("/api/upload/init", map[string]interface{}{
			"encrypted_name": "a/b+c/d==",
			"original_size":  10,
			"sha256":         "ghi789",
			"salt":           validSalt,
			"chunk_count":    1,
		}, token)
		requireStatus(t, resp, http.StatusOK)
	})
}
