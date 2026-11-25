//go:build integration

package integration_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCompleteRecordsSizesFromStoredChunksNotTheClient(t *testing.T) {
	ts := setupTestServer(t)
	token := ts.registerAndLogin("sizes-owner@example.com", "SecurePass@123!")
	ts.enableMockStorage("sizes-owner@example.com")

	initBody := requireStatus(t, ts.POST("/api/upload/init", map[string]interface{}{
		"encrypted_name": "sizes.bin",
		"original_size":  80,
		"sha256":         "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
		"salt":           validSalt,
		"chunk_count":    2,
	}, token), http.StatusOK)
	var init struct {
		SessionID string `json:"session_id"`
		FileID    string `json:"file_id"`
	}
	require.NoError(t, json.Unmarshal(initBody, &init))

	requireStatus(t, ts.PUT("/api/upload/"+init.SessionID+"/chunk/0", bytes.Repeat([]byte{1}, 40), token), http.StatusOK)
	requireStatus(t, ts.PUT("/api/upload/"+init.SessionID+"/chunk/1", bytes.Repeat([]byte{2}, 60), token), http.StatusOK)

	requireStatus(t, ts.POST("/api/upload/"+init.SessionID+"/complete", map[string]interface{}{
		"encrypted_size":  999999,
		"compressed_size": 888888,
	}, token), http.StatusOK)

	var encrypted, compressed int64
	require.Eventually(t, func() bool {
		err := ts.db.Pool().QueryRow(context.Background(),
			`SELECT encrypted_size, compressed_size FROM files WHERE id = $1`, init.FileID).Scan(&encrypted, &compressed)
		return err == nil && encrypted == 100
	}, 5*time.Second, 25*time.Millisecond)
	assert.EqualValues(t, 100, encrypted, "the stored chunks decide the encrypted size")
	assert.EqualValues(t, 100-2*28, compressed, "the compressed size is the stored total minus 28 bytes of envelope per chunk")
}
