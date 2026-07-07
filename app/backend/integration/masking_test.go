//go:build integration

package integration_test

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/zcrypt/zcrypt/cmd"
)

// TestPublicShareMetaMasksSizeAndTime proves size/timestamp masking on the public
// share endpoints: the size is coarsened to a band, the precision-leaking
// compressed/encrypted sizes are gone, and the timestamp is day-granular — while
// the OWNER's own view and the stored value stay byte-exact.
func TestPublicShareMetaMasksSizeAndTime(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("mask@example.com", "SecurePass@123!")
	user, err := ts.db.GetUserByEmail(ctx, "mask@example.com")
	require.NoError(t, err)

	// A deliberately odd true size that is NOT a ladder value.
	const trueSize = int64(3_000_001)
	fileID := ts.insertFile(ctx, user.ID, "report.pdf")
	_, err = ts.db.Pool().Exec(ctx, `UPDATE files SET original_size=$1, compressed_size=$1, encrypted_size=$1 WHERE id=$2`, trueSize, fileID)
	require.NoError(t, err)

	// Owner path stays byte-exact.
	ownerBody := requireStatus(t, ts.GET("/api/files/"+fileID+"/meta", token), http.StatusOK)
	var owner struct {
		OriginalSize int64 `json:"original_size"`
	}
	require.NoError(t, jsonUnmarshal(ownerBody, &owner))
	assert.Equal(t, trueSize, owner.OriginalSize, "owner sees the exact size")

	// Create a public share.
	shareBody := requireStatus(t, ts.POST("/api/shares", map[string]interface{}{
		"file_id":     fileID,
		"wrapped_cek": "dGVzdA==",
	}, token), http.StatusOK)
	var share struct {
		Token string `json:"token"`
	}
	require.NoError(t, jsonUnmarshal(shareBody, &share))
	require.NotEmpty(t, share.Token)

	// Public meta: size bucketed, precision fields absent, timestamp coarsened.
	pubBody := requireStatus(t, ts.GET("/api/share/"+share.Token+"/meta", ""), http.StatusOK)
	var raw map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(pubBody, &raw))

	var pubSize int64
	require.NoError(t, json.Unmarshal(raw["original_size"], &pubSize))
	assert.Equal(t, cmd.SizeBucket(trueSize), pubSize, "public size is the coarse bucket")
	assert.NotEqual(t, trueSize, pubSize, "public size must not be the exact size")

	_, hasCompressed := raw["compressed_size"]
	_, hasEncrypted := raw["encrypted_size"]
	assert.False(t, hasCompressed, "compressed_size must be dropped (it leaks exact size)")
	assert.False(t, hasEncrypted, "encrypted_size must be dropped (it leaks exact size)")

	var createdAt string
	require.NoError(t, json.Unmarshal(raw["created_at"], &createdAt))
	assert.Contains(t, createdAt, "T00:00:00Z", "created_at coarsened to UTC midnight")
}

// TestStorageAccountingUsesTrueBytes locks in the store-true invariant: masking
// lives only in the public response layer, so usage accounting must sum the
// exact bytes, never a bucket. Guards a future 'simplification' that buckets the
// stored column.
func TestStorageAccountingUsesTrueBytes(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("mask-acct@example.com", "SecurePass@123!")
	mock := ts.enableMockStorage("mask-acct@example.com")
	user, err := ts.db.GetUserByEmail(ctx, "mask-acct@example.com")
	require.NoError(t, err)

	// Upload + sync a real file so chunks (with true byte sizes) exist on the mock.
	ts.uploadAndSync(ctx, token, "acct.bin", 2)

	used, err := ts.db.GetUserStorageUsed(ctx, user.ID)
	require.NoError(t, err)

	// The exact stored size total (accounting sums files.original_size) — NOT a bucket.
	var trueBytes int64
	require.NoError(t, ts.db.Pool().QueryRow(ctx,
		`SELECT COALESCE(SUM(original_size),0) FROM files WHERE user_id=$1`, user.ID).Scan(&trueBytes))

	assert.Equal(t, trueBytes, used, "storage accounting must use exact bytes, not a bucket")
	assert.Positive(t, trueBytes, "sanity: a file was accounted")
	// Prove it isn't the coarsened value: the true size and its bucket differ here.
	assert.NotEqual(t, cmd.SizeBucket(trueBytes), used, "accounting must not be the bucketed size")
	assert.Positive(t, mock.blobCount(), "sanity: chunks actually landed")
}
