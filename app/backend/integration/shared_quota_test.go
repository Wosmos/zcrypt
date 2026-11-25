//go:build integration

package integration_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/zcrypt/zcrypt/index"
	"github.com/zcrypt/zcrypt/types"
)

// The shared-pool cap counts only files on the shared pool. A user with
// gigabytes on their own Telegram must still be able to put a small file on
// the shared pool, while an admin quota keeps counting everything.
func TestSharedQuotaIgnoresOwnStorage(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	email := "sharedcap-" + uuid.NewString()[:8] + "@example.com"
	ts.registerAndLogin(email, "SecurePass@123!")
	user, err := ts.db.GetUserByEmail(ctx, email)
	require.NoError(t, err)
	pool := ts.db.Pool()

	_, err = pool.Exec(ctx, `INSERT INTO platform_tokens (user_id, platform, username, token_encrypted, token_nonce, is_global)
		VALUES ($1, 'telegram', 'mybot', '\x00', '\x00', FALSE)`, user.ID)
	require.NoError(t, err)

	addFile := func(size int64, account string) {
		t.Helper()
		var fileID string
		require.NoError(t, pool.QueryRow(ctx, `INSERT INTO files (user_id, original_name, original_size, sha256, salt)
			VALUES ($1, 'f', $2, 'aa', '\x00') RETURNING id`, user.ID, size).Scan(&fileID))
		_, err := pool.Exec(ctx, `INSERT INTO chunks (file_id, user_id, idx, size, sha256, platform, account, repo)
			VALUES ($1, $2, 0, $3, 'aa', 'telegram', $4, 'r')`, fileID, user.ID, size, account)
		require.NoError(t, err)
	}
	addFile(5000, "mybot")    // on the user's own bot
	addFile(300, "sharedbot") // on the shared pool

	shared, err := ts.db.GetUserSharedStorageUsed(ctx, user.ID)
	require.NoError(t, err)
	require.Equal(t, int64(300), shared)
	all, err := ts.db.GetUserStorageUsed(ctx, user.ID)
	require.NoError(t, err)
	require.Equal(t, int64(5300), all)

	next := &types.FileMetadata{ID: uuid.NewString(), OriginalName: "n", OriginalSize: 600, SHA256: "aa", Salt: []byte{0}, IV: []byte{}, Status: types.StatusUploading}
	require.NoError(t, ts.db.InsertFileWithinQuota(ctx, user.ID, next, 1000, true))

	over := &types.FileMetadata{ID: uuid.NewString(), OriginalName: "o", OriginalSize: 600, SHA256: "aa", Salt: []byte{0}, IV: []byte{}, Status: types.StatusUploading}
	var full *index.QuotaExceededError
	require.True(t, errors.As(ts.db.InsertFileWithinQuota(ctx, user.ID, over, 1000, false), &full))
}
