//go:build integration

package integration_test

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"

	"github.com/zcrypt/zcrypt/types"
)

// One query must return what GET /api/quota used to read in seven.
func TestQuotaSnapshotMatchesSeparateReads(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	email := "snap-" + uuid.NewString()[:8] + "@example.com"
	ts.registerAndLogin(email, "SecurePass@123!")
	user, err := ts.db.GetUserByEmail(ctx, email)
	require.NoError(t, err)
	pool := ts.db.Pool()

	_, err = pool.Exec(ctx, `UPDATE users SET role = 'user', plan = 'pro', storage_quota_bytes = 4242 WHERE id = $1`, user.ID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO platform_tokens (user_id, platform, username, token_encrypted, token_nonce, is_global)
		VALUES ($1, 'telegram', 'mybot', '\x00', '\x00', FALSE)`, user.ID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO files (user_id, original_name, original_size, sha256, salt, status)
		VALUES ($1, 'a', 700, 'aa', '\x00', 'complete')`, user.ID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO decoy_files (user_id, name, size) VALUES ($1, 'd', 33)`, user.ID)
	require.NoError(t, err)
	_, err = pool.Exec(ctx, `INSERT INTO relay_usage (user_id, day, up_bytes, down_bytes)
		VALUES ($1, (NOW() AT TIME ZONE 'UTC')::date, 10, 5)`, user.ID)
	require.NoError(t, err)

	snap, err := ts.db.QuotaSnapshot(ctx, user.ID, false)
	require.NoError(t, err)
	require.Equal(t, types.RoleUser, snap.Role)
	require.Equal(t, "pro", snap.Plan)
	require.NotNil(t, snap.StorageQuota)
	require.Equal(t, int64(4242), *snap.StorageQuota)
	require.Equal(t, int64(700), snap.UsedBytes)
	require.True(t, snap.HasPersonal)

	relay, err := ts.db.RelayTotals(ctx, user.ID)
	require.NoError(t, err)
	require.Equal(t, relay, snap.Relay)
	require.Equal(t, int64(15), snap.Relay.Day)

	decoy, err := ts.db.QuotaSnapshot(ctx, user.ID, true)
	require.NoError(t, err)
	require.Equal(t, int64(33), decoy.UsedBytes)
}

// The quota shown matches the cap enforced at upload: shared cap for a user
// without own storage, unlimited for an admin.
func TestQuotaEndpointAdminUnlimited(t *testing.T) {
	t.Setenv("ZCRYPT_SHARED_QUOTA_BYTES", "100")
	ts := setupTestServer(t)
	ctx := context.Background()
	suffix := uuid.NewString()[:8]
	userToken := ts.registerAndLogin("quser-"+suffix+"@example.com", "SecurePass@123!")
	adminEmail := "qadmin-" + suffix + "@example.com"
	adminToken := ts.registerAndLogin(adminEmail, "SecurePass@123!")
	_, err := ts.db.Pool().Exec(ctx, `UPDATE users SET role = 'admin' WHERE email = $1`, adminEmail)
	require.NoError(t, err)

	var q types.QuotaInfo
	decodeJSON(t, ts.GET("/api/quota", userToken), &q)
	require.Equal(t, int64(100), q.QuotaBytes)
	require.False(t, q.IsUnlimited)
	require.NotZero(t, q.RelayLimitBytes)

	q = types.QuotaInfo{}
	decodeJSON(t, ts.GET("/api/quota", adminToken), &q)
	require.Zero(t, q.QuotaBytes)
	require.True(t, q.IsUnlimited)
}
