package auth

import (
	"regexp"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGenerateBackupCodes(t *testing.T) {
	codes, err := GenerateBackupCodes(BackupCodeCount)
	require.NoError(t, err)
	require.Len(t, codes, BackupCodeCount)

	format := regexp.MustCompile(`^[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}$`)
	seen := map[string]bool{}
	for _, c := range codes {
		assert.Regexp(t, format, c, "code must be 4 hex groups")
		assert.False(t, seen[c], "codes must be unique: %s", c)
		seen[c] = true
	}
}

func TestGenerateBackupCodesUniqueAcrossCalls(t *testing.T) {
	a, err := GenerateBackupCodes(5)
	require.NoError(t, err)
	b, err := GenerateBackupCodes(5)
	require.NoError(t, err)
	assert.NotEqual(t, a, b, "each generation must be random")
}

func TestNormalizeBackupCode(t *testing.T) {
	// Dashes and spaces stripped, letters lowercased — so any reasonable way the
	// user retypes the code hashes to the same value.
	canonical := "abcd1234ef567890"
	for _, in := range []string{
		"abcd-1234-ef56-7890",
		"ABCD-1234-EF56-7890",
		"abcd 1234 ef56 7890",
		"  ABCD1234EF567890  ", // surrounding spaces stripped, inner none
		"abcd1234ef567890",
	} {
		// Trim leading/trailing spaces case: NormalizeBackupCode strips ALL spaces.
		assert.Equal(t, canonical, NormalizeBackupCode(in), "input %q", in)
	}
}

func TestNormalizeBackupCodeThenHashMatches(t *testing.T) {
	codes, err := GenerateBackupCodes(1)
	require.NoError(t, err)
	stored := HashToken(NormalizeBackupCode(codes[0]))
	// The same code, retyped uppercase without dashes, must hash identically.
	retyped := HashToken(NormalizeBackupCode("  " + codes[0] + "  "))
	assert.Equal(t, stored, retyped)
}
