//go:build integration

package integration_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/zcrypt/zcrypt/types"
)

// genUUID returns a fresh UUID string for a directly-inserted audit row's PK.
func genUUID(t *testing.T) string {
	t.Helper()
	return uuid.NewString()
}

// loginToken logs in an EXISTING user and returns their access token (used after
// promoting a user to admin, so the new token carries the admin role).
func (ts *testServer) loginToken(email, password string) string {
	ts.t.Helper()
	resp := ts.POST("/api/auth/login", map[string]string{"email": email, "password": password}, "")
	var out struct {
		AccessToken string `json:"access_token"`
	}
	decodeJSON(ts.t, resp, &out)
	require.NotEmpty(ts.t, out.AccessToken, "login must return an access token")
	return out.AccessToken
}

// deleteWithBody sends a DELETE carrying a JSON body (the admin re-auth path
// reads {password, code} from the request body).
func (ts *testServer) deleteWithBody(path string, body interface{}, token string) *http.Response {
	ts.t.Helper()
	data, err := json.Marshal(body)
	require.NoError(ts.t, err)
	req, err := http.NewRequest("DELETE", ts.URL+path, bytes.NewReader(data))
	require.NoError(ts.t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", uniqueTestIP())
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	require.NoError(ts.t, err)
	return resp
}

// makeAdmin promotes a registered user to the system admin role and returns them.
func (ts *testServer) makeAdmin(ctx context.Context, email string) *types.User {
	ts.t.Helper()
	u, err := ts.db.GetUserByEmail(ctx, email)
	require.NoError(ts.t, err)
	require.NoError(ts.t, ts.db.SetUserRole(ctx, u.ID, types.RoleAdmin))
	return u
}

// clearAudit empties the audit log so a chain-verification test sees only its
// own events. VerifyAuditChain is global by design, and sibling tests (tamper,
// deletion) intentionally break the shared chain — tests run sequentially, so a
// clean slate at the top isolates each one.
func (ts *testServer) clearAudit(ctx context.Context) {
	ts.t.Helper()
	_, err := ts.db.Pool().Exec(ctx, `DELETE FROM audit_events`)
	require.NoError(ts.t, err)
}

func TestAdminDeleteUserRequiresReauth(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	const adminEmail = "lp-admin@example.com"
	const adminPass = "SecurePass@123!"

	adminToken := ts.registerAndLogin(adminEmail, adminPass)
	ts.makeAdmin(ctx, adminEmail)
	// Re-login so the token carries the admin role.
	adminToken = ts.loginToken(adminEmail, adminPass)

	victim := ts.registerAndLogin("lp-victim@example.com", "SecurePass@123!")
	_ = victim
	victimUser, err := ts.db.GetUserByEmail(ctx, "lp-victim@example.com")
	require.NoError(t, err)

	t.Run("no password is rejected", func(t *testing.T) {
		resp := ts.deleteWithBody("/api/admin/users/"+victimUser.ID, map[string]string{}, adminToken)
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
		resp.Body.Close()
		assert.Equal(t, 1, ts.countScalar(`SELECT count(*) FROM users WHERE id=$1`, victimUser.ID),
			"victim must still exist after a denied delete")
	})

	t.Run("wrong password is rejected", func(t *testing.T) {
		resp := ts.deleteWithBody("/api/admin/users/"+victimUser.ID,
			map[string]string{"password": "WrongPass@1!"}, adminToken)
		assert.Equal(t, http.StatusUnauthorized, resp.StatusCode)
		resp.Body.Close()
		assert.Equal(t, 1, ts.countScalar(`SELECT count(*) FROM users WHERE id=$1`, victimUser.ID))
	})

	t.Run("correct password deletes", func(t *testing.T) {
		resp := ts.deleteWithBody("/api/admin/users/"+victimUser.ID,
			map[string]string{"password": adminPass}, adminToken)
		requireStatus(t, resp, http.StatusOK)
		assert.Equal(t, 0, ts.countScalar(`SELECT count(*) FROM users WHERE id=$1`, victimUser.ID),
			"victim removed after re-auth")
	})

	t.Run("a denied delete is itself audited", func(t *testing.T) {
		// The audit write is async (fire-and-forget goroutine), so poll briefly.
		require.Eventually(t, func() bool {
			return ts.countScalar(`SELECT count(*) FROM audit_events WHERE event_type='admin_user_delete_denied'`) >= 1
		}, 3*time.Second, 50*time.Millisecond, "denied delete attempts leave an audit trail")
	})
}

func TestAuditChainTamperEvidence(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	const adminEmail = "chain-admin@example.com"
	const adminPass = "SecurePass@123!"
	ts.registerAndLogin(adminEmail, adminPass)
	ts.makeAdmin(ctx, adminEmail)
	adminToken := ts.loginToken(adminEmail, adminPass)
	ts.clearAudit(ctx) // isolate: verify only this test's chain

	// Append a handful of events synchronously so the chain has known links
	// (HTTP-triggered audits are async and would race the assertions).
	var ids []string
	for i := 0; i < 5; i++ {
		e := &types.AuditEvent{
			ID:        genUUID(t),
			EventType: "test_event",
			IP:        "1.2.3.4",
			Metadata:  map[string]interface{}{"i": i},
		}
		require.NoError(t, ts.db.InsertAuditEvent(ctx, e))
		ids = append(ids, e.ID)
	}

	// The chain verifies clean via the admin endpoint.
	var res struct {
		Valid    bool  `json:"valid"`
		Checked  int   `json:"checked"`
		BreakSeq int64 `json:"break_seq"`
	}
	body := requireStatus(t, ts.GET("/api/admin/audit/verify", adminToken), http.StatusOK)
	require.NoError(t, jsonUnmarshal(body, &res))
	assert.True(t, res.Valid, "freshly-built chain must verify")
	assert.GreaterOrEqual(t, res.Checked, 5)

	// Tamper: rewrite one event's metadata directly in the DB, as an attacker
	// with DB access would to cover their tracks.
	var tamperedSeq int64
	require.NoError(t, ts.db.Pool().QueryRow(ctx,
		`UPDATE audit_events SET metadata = '{"i":999}' WHERE id=$1 RETURNING seq`, ids[2]).Scan(&tamperedSeq))

	body = requireStatus(t, ts.GET("/api/admin/audit/verify", adminToken), http.StatusOK)
	require.NoError(t, jsonUnmarshal(body, &res))
	assert.False(t, res.Valid, "a tampered row must break the chain")
	assert.Equal(t, tamperedSeq, res.BreakSeq, "the break is reported at the tampered row")
}

func TestAuditChainDetectsDeletion(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	ts.clearAudit(ctx)

	var ids []string
	for i := 0; i < 5; i++ {
		e := &types.AuditEvent{ID: genUUID(t), EventType: "test_event2", IP: "1.2.3.4", Metadata: map[string]interface{}{"i": i}}
		require.NoError(t, ts.db.InsertAuditEvent(ctx, e))
		ids = append(ids, e.ID)
	}

	// Delete a middle event — the following event's prev_hash now points at a
	// hash that is no longer its predecessor, so the chain must break.
	_, err := ts.db.Pool().Exec(ctx, `DELETE FROM audit_events WHERE id=$1`, ids[2])
	require.NoError(t, err)

	res, err := ts.db.VerifyAuditChain(ctx)
	require.NoError(t, err)
	assert.False(t, res.Valid, "deleting a row must break the chain")
	assert.NotEmpty(t, res.BreakError)
}

// TestAuditChainConcurrentInsertsStayLinear proves the advisory lock serializes
// concurrent audit writes into a single valid chain — no two events fork off the
// same predecessor.
func TestAuditChainConcurrentInsertsStayLinear(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	ts.clearAudit(ctx)

	var wg sync.WaitGroup
	for i := 0; i < 25; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			e := &types.AuditEvent{ID: genUUID(t), EventType: "conc", IP: "1.1.1.1", Metadata: map[string]interface{}{"n": n}}
			_ = ts.db.InsertAuditEvent(ctx, e)
		}(i)
	}
	wg.Wait()

	res, err := ts.db.VerifyAuditChain(ctx)
	require.NoError(t, err)
	assert.True(t, res.Valid, "concurrent inserts must stay a linear valid chain (break=%d: %s)", res.BreakSeq, res.BreakError)
	assert.GreaterOrEqual(t, res.Checked, 25)
}

// TestAuditChainSurvivesUserDeletion proves the tamper-evidence chain is NOT
// broken by a legitimate user deletion — audit rows keep the actor id verbatim
// (the FK cascade that used to null it, breaking the chain, was removed).
func TestAuditChainSurvivesUserDeletion(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()

	victim := ts.registerAndLogin("chain-userdel@example.com", "SecurePass@123!")
	_ = victim
	u, err := ts.db.GetUserByEmail(ctx, "chain-userdel@example.com")
	require.NoError(t, err)
	ts.clearAudit(ctx)

	// Audit event attributed to the victim, then a couple more so the victim's
	// row is mid-chain.
	uid := u.ID
	require.NoError(t, ts.db.InsertAuditEvent(ctx, &types.AuditEvent{ID: genUUID(t), UserID: &uid, EventType: "test_actor", IP: "1.2.3.4"}))
	require.NoError(t, ts.db.InsertAuditEvent(ctx, &types.AuditEvent{ID: genUUID(t), EventType: "after1", IP: "1.2.3.4"}))
	require.NoError(t, ts.db.InsertAuditEvent(ctx, &types.AuditEvent{ID: genUUID(t), EventType: "after2", IP: "1.2.3.4"}))

	before, err := ts.db.VerifyAuditChain(ctx)
	require.NoError(t, err)
	require.True(t, before.Valid)

	// Delete the user; their audit row must stay intact (user_id retained).
	require.NoError(t, ts.db.DeleteUser(ctx, u.ID))

	after, err := ts.db.VerifyAuditChain(ctx)
	require.NoError(t, err)
	assert.True(t, after.Valid, "user deletion must not break the audit chain (break=%d: %s)", after.BreakSeq, after.BreakError)
	assert.GreaterOrEqual(t, ts.countScalar(`SELECT count(*) FROM audit_events WHERE user_id=$1`, u.ID), 1,
		"the deleted user's audit row retains their id verbatim (not nulled)")
}
