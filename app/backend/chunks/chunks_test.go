package chunks

import (
	"crypto/rand"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestHashBytes(t *testing.T) {
	hash1 := HashBytes([]byte("hello"))
	hash2 := HashBytes([]byte("hello"))
	hash3 := HashBytes([]byte("world"))

	assert.Equal(t, hash1, hash2)
	assert.NotEqual(t, hash1, hash3)
	assert.Len(t, hash1, 64) // SHA-256 hex = 64 chars
}

func TestHashFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.bin")
	data := []byte("hash this file content")
	require.NoError(t, os.WriteFile(path, data, 0600))

	hash, err := HashFile(path)
	require.NoError(t, err)
	assert.Equal(t, HashBytes(data), hash)
}

func TestVerifyChunk(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "chunk.bin")
	data := []byte("chunk data here")
	require.NoError(t, os.WriteFile(path, data, 0600))

	expectedHash := HashBytes(data)

	// Valid hash
	err := VerifyChunk(path, expectedHash)
	assert.NoError(t, err)

	// Invalid hash
	err = VerifyChunk(path, "0000000000000000000000000000000000000000000000000000000000000000")
	assert.Error(t, err)
}

func TestSplitAndMergeSmallFile(t *testing.T) {
	dir := t.TempDir()
	srcPath := filepath.Join(dir, "small.bin")
	outDir := filepath.Join(dir, "chunks")
	mergedPath := filepath.Join(dir, "merged.bin")

	// Small file (< 10MB) should produce 1 chunk
	data := []byte("small file content that fits in one chunk")
	require.NoError(t, os.WriteFile(srcPath, data, 0600))
	require.NoError(t, os.MkdirAll(outDir, 0700))

	chunkPaths, err := SplitFile(srcPath, outDir)
	require.NoError(t, err)
	assert.Len(t, chunkPaths, 1)

	// Merge back
	err = MergeFiles(chunkPaths, mergedPath)
	require.NoError(t, err)

	merged, err := os.ReadFile(mergedPath)
	require.NoError(t, err)
	assert.Equal(t, data, merged)
}

func TestSplitAndMergeLargeFile(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping large file test in short mode")
	}

	dir := t.TempDir()
	srcPath := filepath.Join(dir, "large.bin")
	outDir := filepath.Join(dir, "chunks")
	mergedPath := filepath.Join(dir, "merged.bin")

	// Create file slightly over 2 chunks (10MB each = 20MB + extra)
	size := ChunkSize*2 + 1024
	data := make([]byte, size)
	rand.Read(data)
	require.NoError(t, os.WriteFile(srcPath, data, 0600))
	require.NoError(t, os.MkdirAll(outDir, 0700))

	chunkPaths, err := SplitFile(srcPath, outDir)
	require.NoError(t, err)
	assert.Len(t, chunkPaths, 3)

	// Verify each chunk hash
	for _, cp := range chunkPaths {
		chunkData, _ := os.ReadFile(cp)
		expected := HashBytes(chunkData)
		assert.NoError(t, VerifyChunk(cp, expected))
	}

	// Merge and verify
	err = MergeFiles(chunkPaths, mergedPath)
	require.NoError(t, err)

	merged, err := os.ReadFile(mergedPath)
	require.NoError(t, err)
	assert.Equal(t, data, merged)
}

func TestSplitExactChunkBoundary(t *testing.T) {
	dir := t.TempDir()
	srcPath := filepath.Join(dir, "exact.bin")
	outDir := filepath.Join(dir, "chunks")

	// Exactly 1 chunk size
	data := make([]byte, ChunkSize)
	rand.Read(data)
	require.NoError(t, os.WriteFile(srcPath, data, 0600))
	require.NoError(t, os.MkdirAll(outDir, 0700))

	chunkPaths, err := SplitFile(srcPath, outDir)
	require.NoError(t, err)
	assert.Len(t, chunkPaths, 1)
}

func TestMergeEmptySlice(t *testing.T) {
	dir := t.TempDir()
	mergedPath := filepath.Join(dir, "merged.bin")

	err := MergeFiles([]string{}, mergedPath)
	require.NoError(t, err)

	merged, _ := os.ReadFile(mergedPath)
	assert.Empty(t, merged)
}
