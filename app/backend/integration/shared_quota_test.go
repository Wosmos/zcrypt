//go:build integration

package integration_test

import (
	"context"
	"errors"
	"net/http"
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

// Admins run the shared pool on their own tokens, so its cap doesn't apply to
// them, while a regular user on the same pool is refused.
func TestSharedQuotaSkipsAdmins(t *testing.T) {
	t.Setenv("ZCRYPT_SHARED_QUOTA_BYTES", "100")
	ts := setupTestServer(t)
	ctx := context.Background()
	suffix := uuid.NewString()[:8]
	userEmail, adminEmail := "capuser-"+suffix+"@example.com", "capadmin-"+suffix+"@example.com"
	userToken := ts.registerAndLogin(userEmail, "SecurePass@123!")
	adminToken := ts.registerAndLogin(adminEmail, "SecurePass@123!")
	_, err := ts.db.Pool().Exec(ctx, `UPDATE users SET role = 'admin' WHERE email = $1`, adminEmail)
	require.NoError(t, err)
	ts.enableMockStorage(userEmail)
	ts.enableMockStorage(adminEmail)

	initBody := map[string]interface{}{
		"encrypted_name": "big.bin",
		"original_size":  1000,
		"sha256":         "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"salt":           validSalt,
		"chunk_count":    1,
	}
	body := requireStatus(t, ts.POST("/api/upload/init", initBody, userToken), http.StatusRequestEntityTooLarge)
	require.Contains(t, string(body), types.ErrCodeSharedStorageFull)
	requireStatus(t, ts.POST("/api/upload/init", initBody, adminToken), http.StatusOK)
}
