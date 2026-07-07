//go:build integration

package integration_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// dbFileScheme reads a file's stored sha256_scheme directly.
func dbFileScheme(ts *testServer, t *testing.T, fileID string) string {
	t.Helper()
	var s string
	require.NoError(t, ts.db.Pool().QueryRow(context.Background(),
		`SELECT sha256_scheme FROM files WHERE id=$1`, fileID).Scan(&s))
	return s
}

func initUpload(ts *testServer, t *testing.T, token string, body map[string]interface{}) map[string]interface{} {
	t.Helper()
	resp := ts.POST("/api/upload/init", body, token)
	raw := requireStatus(t, resp, http.StatusOK)
	var out map[string]interface{}
	require.NoError(t, json.Unmarshal(raw, &out))
	return out
}

// TestUploadSHA256SchemeStored proves the confirmation-of-file fix at the storage
// layer: an upgraded client's per-user keyed MAC is persisted with scheme
// 'hmac_v1', while a legacy client (no scheme) is labeled 'plain' with no
// backfill — and both round-trip through the file-meta endpoint.
func TestUploadSHA256SchemeStored(t *testing.T) {
	ts := setupTestServer(t)
	token := ts.registerAndLogin("scheme@example.com", "SecurePass@123!")
	ts.enableMockStorage("scheme@example.com")

	t.Run("hmac_v1 upload is stored verbatim", func(t *testing.T) {
		out := initUpload(ts, t, token, map[string]interface{}{
			"filename":      "keyed.bin",
			"original_size": 1234,
			"sha256":        "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2", // opaque MAC shape
			"sha256_scheme": "hmac_v1",
			"salt":          validSalt,
			"chunk_count":   1,
		})
		fileID := out["file_id"].(string)
		assert.Equal(t, "hmac_v1", dbFileScheme(ts, t, fileID), "MAC scheme persisted")

		var sess string
		require.NoError(t, ts.db.Pool().QueryRow(context.Background(),
			`SELECT sha256_scheme FROM upload_sessions WHERE file_id=$1`, fileID).Scan(&sess))
		assert.Equal(t, "hmac_v1", sess, "session carries the scheme too")

		body := requireStatus(t, ts.GET("/api/files/"+fileID+"/meta", token), http.StatusOK)
		var meta struct {
			SHA256Scheme string `json:"sha256_scheme"`
		}
		require.NoError(t, jsonUnmarshal(body, &meta))
		assert.Equal(t, "hmac_v1", meta.SHA256Scheme, "meta endpoint returns the scheme so the client picks the verify path")
	})

	t.Run("legacy upload without scheme defaults to plain", func(t *testing.T) {
		out := initUpload(ts, t, token, map[string]interface{}{
			"filename":      "legacy.bin",
			"original_size": 555,
			"sha256":        "0000000000000000000000000000000000000000000000000000000000000001",
			"salt":          validSalt,
			"chunk_count":   1,
		})
		assert.Equal(t, "plain", dbFileScheme(ts, t, out["file_id"].(string)),
			"an old client's upload is labeled legacy plaintext-SHA with no backfill")
	})
}

// TestUploadResumeSurvivesHMACScheme is the guardrail on the previously-fragile
// dedup/resume path: a keyed-MAC upload must still resume server-authoritatively
// (match on sha256+size), and a different MAC must NOT false-match.
func TestUploadResumeSurvivesHMACScheme(t *testing.T) {
	ts := setupTestServer(t)
	token := ts.registerAndLogin("scheme-resume@example.com", "SecurePass@123!")
	ts.enableMockStorage("scheme-resume@example.com")

	const mac = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
	first := initUpload(ts, t, token, map[string]interface{}{
		"filename": "resume.bin", "original_size": 4096, "sha256": mac,
		"sha256_scheme": "hmac_v1", "salt": validSalt, "chunk_count": 1,
	})
	require.NotEqual(t, true, first["resumed"], "first init creates a fresh session")
	firstSession := first["session_id"].(string)

	// Re-init with the SAME (mac, size) — as a second device would — must resume
	// onto the SAME session, not restart from zero.
	again := initUpload(ts, t, token, map[string]interface{}{
		"filename": "resume.bin", "original_size": 4096, "sha256": mac,
		"sha256_scheme": "hmac_v1", "salt": validSalt, "chunk_count": 1,
	})
	assert.Equal(t, true, again["resumed"], "same keyed MAC + size resumes")
	assert.Equal(t, firstSession, again["session_id"], "resume lands on the original session")

	// A DIFFERENT MAC (different content) must create a fresh session, never
	// false-match the first.
	other := initUpload(ts, t, token, map[string]interface{}{
		"filename": "other.bin", "original_size": 4096,
		"sha256":        "1111111111111111111111111111111111111111111111111111111111111111",
		"sha256_scheme": "hmac_v1", "salt": validSalt, "chunk_count": 1,
	})
	assert.NotEqual(t, true, other["resumed"], "a different MAC does not false-match")
	assert.NotEqual(t, firstSession, other["session_id"])
}
