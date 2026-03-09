package disguise

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestChunkFilename(t *testing.T) {
	name, err := ChunkFilename()
	require.NoError(t, err)
	assert.True(t, strings.HasSuffix(name, ".bin"), "filename should end in .bin")
	assert.Len(t, name, 16+4, "should be 16 hex chars + .bin")
}

func TestChunkFilenameUnique(t *testing.T) {
	names := make(map[string]bool)
	for i := 0; i < 100; i++ {
		name, err := ChunkFilename()
		require.NoError(t, err)
		assert.False(t, names[name], "duplicate filename generated")
		names[name] = true
	}
}

func TestCommitMessage(t *testing.T) {
	msg := CommitMessage()
	assert.NotEmpty(t, msg)
	// Should contain a conventional commit prefix
	assert.True(t,
		strings.HasPrefix(msg, "chore:") ||
			strings.HasPrefix(msg, "fix:") ||
			strings.HasPrefix(msg, "refactor:"),
		"commit message should start with conventional prefix: %s", msg,
	)
}

func TestRepoName(t *testing.T) {
	name := RepoName(1)
	assert.NotEmpty(t, name)
	assert.True(t, strings.HasSuffix(name, "-v1"))

	name5 := RepoName(5)
	assert.True(t, strings.HasSuffix(name5, "-v5"))
}

func TestReadmeContent(t *testing.T) {
	content := ReadmeContent("my-repo")
	assert.Contains(t, content, "# my-repo")
	assert.Contains(t, content, "auto-managed")
}
