package compression

import (
	"crypto/rand"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCompressDecompress(t *testing.T) {
	dir := t.TempDir()
	srcPath := filepath.Join(dir, "original.bin")
	compPath := filepath.Join(dir, "compressed.zst")
	decPath := filepath.Join(dir, "decompressed.bin")

	original := []byte("Hello, this is test data for zstd compression. Repeated content helps compression ratio. " +
		"Repeated content helps compression ratio. Repeated content helps compression ratio.")
	require.NoError(t, os.WriteFile(srcPath, original, 0600))

	// Compress
	err := CompressFile(srcPath, compPath)
	require.NoError(t, err)

	compressed, err := os.ReadFile(compPath)
	require.NoError(t, err)
	assert.Less(t, len(compressed), len(original), "compressed should be smaller for repetitive data")

	// Decompress
	err = DecompressFile(compPath, decPath)
	require.NoError(t, err)

	decompressed, err := os.ReadFile(decPath)
	require.NoError(t, err)
	assert.Equal(t, original, decompressed)
}

func TestCompressDecompressRandom(t *testing.T) {
	dir := t.TempDir()
	srcPath := filepath.Join(dir, "random.bin")
	compPath := filepath.Join(dir, "compressed.zst")
	decPath := filepath.Join(dir, "decompressed.bin")

	// Random data is incompressible but roundtrip must still work
	data := make([]byte, 4096)
	rand.Read(data)
	require.NoError(t, os.WriteFile(srcPath, data, 0600))

	require.NoError(t, CompressFile(srcPath, compPath))
	require.NoError(t, DecompressFile(compPath, decPath))

	decompressed, err := os.ReadFile(decPath)
	require.NoError(t, err)
	assert.Equal(t, data, decompressed)
}

func TestCompressEmptyFile(t *testing.T) {
	dir := t.TempDir()
	srcPath := filepath.Join(dir, "empty.bin")
	compPath := filepath.Join(dir, "compressed.zst")
	decPath := filepath.Join(dir, "decompressed.bin")

	require.NoError(t, os.WriteFile(srcPath, []byte{}, 0600))

	require.NoError(t, CompressFile(srcPath, compPath))
	require.NoError(t, DecompressFile(compPath, decPath))

	decompressed, err := os.ReadFile(decPath)
	require.NoError(t, err)
	assert.Empty(t, decompressed)
}

func TestCompressMissingSource(t *testing.T) {
	dir := t.TempDir()
	err := CompressFile(filepath.Join(dir, "nonexistent"), filepath.Join(dir, "out.zst"))
	assert.Error(t, err)
}

func TestDecompressMissingSource(t *testing.T) {
	dir := t.TempDir()
	err := DecompressFile(filepath.Join(dir, "nonexistent"), filepath.Join(dir, "out.bin"))
	assert.Error(t, err)
}
