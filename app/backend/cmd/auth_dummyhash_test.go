package cmd

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/zcrypt/zcrypt/auth"
	"golang.org/x/crypto/bcrypt"
)

// The login timing-equalization only works if the dummy hash costs exactly as
// much to compare as a real user's hash. If someone bumps the cost in
// auth.HashPassword without regenerating dummyPasswordHash, this fails.
func TestDummyPasswordHashMatchesRealCost(t *testing.T) {
	dummyCost, err := bcrypt.Cost([]byte(dummyPasswordHash))
	require.NoError(t, err, "dummyPasswordHash must be a valid bcrypt hash")

	real, err := auth.HashPassword("probe")
	require.NoError(t, err)
	realCost, err := bcrypt.Cost([]byte(real))
	require.NoError(t, err)

	assert.Equal(t, realCost, dummyCost,
		"dummy hash cost (%d) must match auth.HashPassword cost (%d) — regenerate it after a cost change",
		dummyCost, realCost)

	// The comparison must run the full bcrypt work and fail as a mismatch, not
	// bail out early on a malformed hash.
	err = auth.CheckPassword("any password at all", dummyPasswordHash)
	assert.ErrorIs(t, err, bcrypt.ErrMismatchedHashAndPassword)
}
