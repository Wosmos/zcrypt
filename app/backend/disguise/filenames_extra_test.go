package disguise

import (
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var shardedRe = regexp.MustCompile(`^[0-9a-f]{2}/[0-9a-f]{14}\.bin$`)

func TestShardedChunkFilename(t *testing.T) {
	name, err := ShardedChunkFilename()
	require.NoError(t, err)

	// Expect "xx/<14 hex chars>.bin" (16 hex total split 2/14).
	assert.True(t, shardedRe.MatchString(name), "unexpected sharded name: %q", name)
	assert.True(t, strings.HasSuffix(name, ".bin"))

	shard, rest, ok := strings.Cut(name, "/")
	require.True(t, ok, "should contain a shard separator")
	assert.Len(t, shard, 2, "shard dir should be 2 hex chars")
	assert.Len(t, strings.TrimSuffix(rest, ".bin"), 14, "chunk name should be 14 hex chars")
}

func TestShardedChunkFilenameStructure(t *testing.T) {
	// The full 16-hex-char name is split as shard(2) + "/" + remainder(14).
	name, err := ShardedChunkFilename()
	require.NoError(t, err)
	shard, rest, _ := strings.Cut(name, "/")
	remainder := strings.TrimSuffix(rest, ".bin")
	fullHex := shard + remainder
	assert.Len(t, fullHex, 16, "reconstructed hex name should be 16 chars")
	assert.Regexp(t, "^[0-9a-f]{16}$", fullHex)
}

func TestShardedChunkFilenameUnique(t *testing.T) {
	names := make(map[string]bool)
	for i := 0; i < 100; i++ {
		name, err := ShardedChunkFilename()
		require.NoError(t, err)
		assert.False(t, names[name], "duplicate sharded filename generated: %s", name)
		names[name] = true
	}
}
