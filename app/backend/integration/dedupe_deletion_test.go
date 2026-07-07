//go:build integration

package integration_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/zcrypt/zcrypt/index"
)

// insertFile creates a minimal file row for a user and returns its id.
func (ts *testServer) insertFile(ctx context.Context, userID, name string) string {
	ts.t.Helper()
	var id string
	err := ts.db.Pool().QueryRow(ctx,
		`INSERT INTO files (user_id, original_name, original_size, sha256, salt)
		 VALUES ($1, $2, 100, 'deadbeef', '\x00') RETURNING id`, userID, name).Scan(&id)
	require.NoError(ts.t, err)
	return id
}

// insertChunk inserts a chunk row directly, returning its chunk_id. size,
// remotePath and plannedPath let a test reproduce synced / crash-window /
// duplicate states with a deterministic dedupe winner (the dedupe order prefers
// a present remote_path, then larger size, then chunk_id).
func (ts *testServer) insertChunk(ctx context.Context, fileID, userID, platform string, idx int, size int64, remotePath, plannedPath string) string {
	ts.t.Helper()
	var id string
	err := ts.db.Pool().QueryRow(ctx,
		`INSERT INTO chunks (file_id, user_id, idx, size, sha256, platform, account, repo, remote_path, planned_remote_path)
		 VALUES ($1, $2, $3, $4, 'abc', $5, 'acct', 'repo1', $6, $7) RETURNING chunk_id`,
		fileID, userID, idx, size, platform, remotePath, plannedPath).Scan(&id)
	require.NoError(ts.t, err)
	return id
}

// clearUserDeletions removes the pending_deletions rows a test created. The
// deletion tests elsewhere assert GLOBAL pending_deletions counts (they each
// drain to empty), so a test that deliberately leaves rows queued must clean up
// after itself or it contaminates those counts. Tests run sequentially, so a
// scoped cleanup at teardown restores the empty-queue invariant.
func (ts *testServer) clearUserDeletions(ctx context.Context, userID string) {
	_, err := ts.db.Pool().Exec(ctx, `DELETE FROM pending_deletions WHERE user_id = $1`, userID)
	require.NoError(ts.t, err)
}

// TestDedupeChunksQueuesLoserBlobs proves the dedupe migration does not silently
// strand the platform blobs of the duplicate rows it deletes: a git loser's path
// is queued for deletion, while a Telegram loser that only has a planned path
// (an unparseable filename, not message IDs) is NOT queued.
func TestDedupeChunksQueuesLoserBlobs(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	ts.registerAndLogin("dedupe@example.com", "SecurePass@123!")
	user, err := ts.db.GetUserByEmail(ctx, "dedupe@example.com")
	require.NoError(t, err)
	t.Cleanup(func() { ts.clearUserDeletions(ctx, user.ID) })

	// Drop the unique index so we can plant duplicates the way the racy
	// check-then-insert historically did. Recreate it no matter what — other
	// tests insert chunks with ON CONFLICT (file_id, idx), which errors while the
	// index is missing, so a mid-test failure must not leave it dropped.
	_, err = ts.db.Pool().Exec(ctx, `DROP INDEX IF EXISTS uq_chunks_file_idx`)
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = ts.db.Pool().Exec(ctx, `CREATE UNIQUE INDEX IF NOT EXISTS uq_chunks_file_idx ON chunks (file_id, idx)`)
	})

	gitFile := ts.insertFile(ctx, user.ID, "git.bin")
	tgFile := ts.insertFile(ctx, user.ID, "tg.bin")

	// GitHub (file_id, idx=0): two synced duplicates. The winner is deterministic
	// via the larger size (the dedupe order is remote_path-present, then size
	// DESC, then chunk_id); the loser's blob must be queued so it isn't stranded.
	ts.insertChunk(ctx, gitFile, user.ID, "github", 0, 200, "aa/winner.bin", "aa/winner.bin")
	ts.insertChunk(ctx, gitFile, user.ID, "github", 0, 100, "bb/loser.bin", "bb/loser.bin")

	// Telegram (file_id, idx=0): winner is synced (real message-id path, larger
	// size); loser has ONLY a planned filename. That planned path must NOT be
	// queued — the Telegram adapter can't parse a filename into message IDs.
	ts.insertChunk(ctx, tgFile, user.ID, "telegram", 0, 200, "123:456,124:457", "chunk_real.bin")
	ts.insertChunk(ctx, tgFile, user.ID, "telegram", 0, 100, "", "chunk_planned_only.bin")

	require.Equal(t, 4, ts.countScalar(`SELECT count(*) FROM chunks WHERE user_id=$1`, user.ID),
		"four duplicate rows planted")

	// Run the dedupe migration in isolation.
	_, err = ts.db.Pool().Exec(ctx, index.DedupeChunksSQL())
	require.NoError(t, err)

	// Exactly one row survives per (file_id, idx), and it is the intended winner.
	assert.Equal(t, 1, ts.countScalar(`SELECT count(*) FROM chunks WHERE file_id=$1`, gitFile),
		"git duplicate collapsed to one row")
	assert.Equal(t, 1, ts.countScalar(
		`SELECT count(*) FROM chunks WHERE file_id=$1 AND remote_path='aa/winner.bin'`, gitFile),
		"the larger-size git row survives as the winner")
	assert.Equal(t, 1, ts.countScalar(`SELECT count(*) FROM chunks WHERE file_id=$1`, tgFile),
		"telegram duplicate collapsed to one row")

	// The git loser's blob is queued for deletion (not stranded).
	assert.Equal(t, 1, ts.countScalar(
		`SELECT count(*) FROM pending_deletions WHERE remote_path='bb/loser.bin'`),
		"git loser blob queued for deletion")

	// The Telegram planned-only loser is NOT queued (unactionable filename), and
	// no Telegram deletion is queued for this user at all.
	assert.Equal(t, 0, ts.countScalar(
		`SELECT count(*) FROM pending_deletions WHERE remote_path='chunk_planned_only.bin'`),
		"telegram planned-only loser must not be queued")
	assert.Equal(t, 0, ts.countScalar(
		`SELECT count(*) FROM pending_deletions WHERE platform='telegram' AND user_id=$1`, user.ID),
		"no telegram deletion queued for the surviving/real rows either")

	// Idempotent: re-running finds nothing new to delete or queue.
	before := ts.countScalar(`SELECT count(*) FROM pending_deletions`)
	_, err = ts.db.Pool().Exec(ctx, index.DedupeChunksSQL())
	require.NoError(t, err)
	assert.Equal(t, before, ts.countScalar(`SELECT count(*) FROM pending_deletions`),
		"second dedupe run is a no-op")
}

// TestTelegramPlannedPathNotQueuedOnPurge proves the live deletion path (not just
// the migration) refuses to queue a Telegram planned filename: purging a Telegram
// file whose chunk never synced queues nothing, so the deletion worker is never
// wedged on an unparseable path. A git chunk in the same crash state IS queued.
func TestTelegramPlannedPathNotQueuedOnPurge(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	token := ts.registerAndLogin("tgpurge@example.com", "SecurePass@123!")
	user, err := ts.db.GetUserByEmail(ctx, "tgpurge@example.com")
	require.NoError(t, err)
	t.Cleanup(func() { ts.clearUserDeletions(ctx, user.ID) })

	// Telegram chunk in the crash state: remote_path empty, only a planned filename.
	tgFile := ts.insertFile(ctx, user.ID, "tg-crash.bin")
	ts.insertChunk(ctx, tgFile, user.ID, "telegram", 0, 100, "", "planned_only.bin")

	requireStatus(t, ts.DELETE("/api/files/"+tgFile+"/purge", token), 200)
	// Scope to this chunk's planned filename — pending_deletions is shared across
	// tests, so a global count would see other tests' queued rows.
	assert.Zero(t, ts.countScalar(
		`SELECT count(*) FROM pending_deletions WHERE remote_path='planned_only.bin'`),
		"telegram planned-only chunk must not be queued on purge")

	// Contrast: a git chunk in the same crash state IS queued via planned fallback.
	gitFile := ts.insertFile(ctx, user.ID, "git-crash.bin")
	ts.insertChunk(ctx, gitFile, user.ID, "github", 0, 100, "", "aa/planned.bin")
	requireStatus(t, ts.DELETE("/api/files/"+gitFile+"/purge", token), 200)
	assert.Equal(t, 1, ts.countScalar(
		`SELECT count(*) FROM pending_deletions WHERE remote_path='aa/planned.bin'`),
		"git planned-only chunk IS queued via planned fallback")
}

// TestUpdateChunkRemotePathRowsAffected proves the DB signal the sync worker uses
// to detect a chunk purged mid-flight: marking a live chunk reports 1 row, and
// marking a vanished chunk reports 0 (the worker then queues the orphan blob).
func TestUpdateChunkRemotePathRowsAffected(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	ts.registerAndLogin("rowsaffected@example.com", "SecurePass@123!")
	user, err := ts.db.GetUserByEmail(ctx, "rowsaffected@example.com")
	require.NoError(t, err)
	t.Cleanup(func() { ts.clearUserDeletions(ctx, user.ID) })

	fileID := ts.insertFile(ctx, user.ID, "mark.bin")
	chunkID := ts.insertChunk(ctx, fileID, user.ID, "github", 0, 100, "", "aa/plan.bin")

	rows, err := ts.db.UpdateChunkRemotePath(ctx, chunkID, "aa/real.bin")
	require.NoError(t, err)
	assert.EqualValues(t, 1, rows, "marking a live chunk affects one row")

	// Simulate purge-mid-flight: the chunk row is gone when the mark lands.
	_, err = ts.db.Pool().Exec(ctx, `DELETE FROM chunks WHERE chunk_id=$1`, chunkID)
	require.NoError(t, err)

	rows, err = ts.db.UpdateChunkRemotePath(ctx, chunkID, "aa/real.bin")
	require.NoError(t, err)
	assert.EqualValues(t, 0, rows, "marking a vanished chunk affects zero rows")

	// The worker's response: queue the orphan blob directly.
	require.NoError(t, ts.db.QueueChunkDeletion(ctx, user.ID, "github", "acct", "repo1", "aa/real.bin"))
	assert.Equal(t, 1, ts.countScalar(
		`SELECT count(*) FROM pending_deletions WHERE remote_path='aa/real.bin'`),
		"orphan blob queued for deletion")
}
