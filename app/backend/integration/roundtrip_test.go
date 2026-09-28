//go:build integration

package integration_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/zcrypt/zcrypt/chunks"
)

// TestUploadDownloadRoundTripVerifiesCiphertext closes a real gap: existing
// upload tests (TestUploadPipeline, TestPurgeDeletesBlobsFromPlatform) stop at
// complete/list/delete and never download a chunk back. This drives the full
// store round trip -- init, chunk, complete, sync -- then downloads the chunk
// through the adapter and confirms the bytes it gets back hash-match the
// sha256 recorded in the DB, proving ciphertext integrity survives the whole
// pipeline. The Go backend never sees plaintext (compression/encryption is
// entirely client-side, see docs/CRYPTO_FORMAT.md), so this is transport/
// storage integrity over the ciphertext wire bytes, not a plaintext round
// trip -- that belongs to app/core's Rust suite instead.
func TestUploadDownloadRoundTripVerifiesCiphertext(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("roundtrip@example.com", "SecurePass@123!")
	mock := ts.enableMockStorage("roundtrip@example.com")

	fileID := ts.uploadAndSync(ctx, token, "roundtrip.bin", 1)

	chunk, err := ts.db.GetChunkByIndex(ctx, fileID, 0)
	require.NoError(t, err)
	require.NotEmpty(t, chunk.RemotePath, "chunk must have synced to the platform before it can be downloaded back")
	require.NotEmpty(t, chunk.SHA256)

	data, err := mock.Download(ctx, *chunk)
	require.NoError(t, err)
	assert.Equal(t, chunk.SHA256, chunks.HashBytes(data),
		"ciphertext downloaded back from the platform must hash-match the sha256 recorded at upload time")
}
