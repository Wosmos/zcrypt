//go:build integration

package integration_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/zcrypt/zcrypt/config"
)

const adminPass = "SecurePass@123!"

type resendStub struct {
	*httptest.Server
	mu    sync.Mutex
	items []map[string]any
}

func newResendStub(t *testing.T) *resendStub {
	t.Helper()
	rs := &resendStub{}
	rs.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		var items []map[string]any
		if r.URL.Path == "/emails/batch" {
			_ = json.Unmarshal(raw, &items)
		}
		rs.mu.Lock()
		rs.items = append(rs.items, items...)
		rs.mu.Unlock()
		w.WriteHeader(200)
		_, _ = w.Write([]byte(`{"data":[]}`))
	}))
	t.Cleanup(rs.Close)
	return rs
}

func (rs *resendStub) sent() []map[string]any {
	rs.mu.Lock()
	defer rs.mu.Unlock()
	return append([]map[string]any(nil), rs.items...)
}

func (rs *resendStub) waitFor(t *testing.T, n int) []map[string]any {
	t.Helper()
	require.Eventually(t, func() bool { return len(rs.sent()) >= n }, 5*time.Second, 20*time.Millisecond)
	return rs.sent()
}

func (rs *resendStub) recipients() []string {
	var out []string
	for _, it := range rs.sent() {
		for _, to := range it["to"].([]any) {
			out = append(out, to.(string))
		}
	}
	return out
}

func serverWithEmail(t *testing.T, rs *resendStub) *testServer {
	t.Helper()
	ts := setupTestServerWith(t, func(c *config.Config) {
		c.Email = &config.EmailConfig{APIKey: "re_test", From: "zcrypt <noreply@zcrypt.test>", BaseURL: rs.URL}
	})
	cleanDB(t, ts.db)
	return ts
}

func (ts *testServer) send(method, path string, body any, token string) *http.Response {
	ts.t.Helper()
	data, err := json.Marshal(body)
	require.NoError(ts.t, err)
	req, err := http.NewRequest(method, ts.URL+path, bytes.NewReader(data))
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

func (ts *testServer) adminToken(email string) string {
	ts.t.Helper()
	ts.registerAndLogin(email, adminPass)
	ts.makeAdmin(context.Background(), email)
	return ts.loginToken(email, adminPass)
}

func (ts *testServer) idOf(email string) string {
	ts.t.Helper()
	u, err := ts.db.GetUserByEmail(context.Background(), email)
	require.NoError(ts.t, err)
	return u.ID
}

func (ts *testServer) verifyEmail(email string) {
	ts.t.Helper()
	_, err := ts.db.Pool().Exec(context.Background(), `UPDATE users SET email_verified = TRUE WHERE email = $1`, email)
	require.NoError(ts.t, err)
}

type bulkResp struct {
	Results []struct {
		ID    string `json:"id"`
		OK    bool   `json:"ok"`
		Error string `json:"error"`
	} `json:"results"`
}

func TestSinglePlanChangeSendsNotification(t *testing.T) {
	rs := newResendStub(t)
	ts := serverWithEmail(t, rs)
	admin := ts.adminToken("n-admin@example.com")
	ts.registerAndLogin("n-user@example.com", adminPass)
	uid := ts.idOf("n-user@example.com")

	resp := ts.send("PUT", "/api/admin/users/"+uid+"/plan", map[string]any{"plan": "pro", "note": "Thanks <b>for</b> helping"}, admin)
	requireStatus(t, resp, http.StatusOK)

	items := rs.waitFor(t, 1)
	assert.Equal(t, []string{"n-user@example.com"}, rs.recipients())
	html := items[0]["html"].(string)
	assert.Contains(t, html, "Plan:</strong> Free &rarr; Pro")
	assert.Contains(t, html, "Thanks &lt;b&gt;for&lt;/b&gt; helping")
	assert.Equal(t, "Your zcrypt plan changed", items[0]["subject"])

	require.Eventually(t, func() bool {
		return ts.countScalar(`SELECT count(*) FROM audit_events WHERE event_type='admin_plan_change' AND metadata->>'notified'='true'`) == 1
	}, 3*time.Second, 50*time.Millisecond)
}

func TestSingleChangesRespectNotifyFalseAndNoteLimit(t *testing.T) {
	rs := newResendStub(t)
	ts := serverWithEmail(t, rs)
	admin := ts.adminToken("nf-admin@example.com")
	ts.registerAndLogin("nf-user@example.com", adminPass)
	uid := ts.idOf("nf-user@example.com")

	resp := ts.send("PUT", "/api/admin/users/"+uid+"/plan", map[string]any{"plan": "pro", "notify": false}, admin)
	requireStatus(t, resp, http.StatusOK)
	resp = ts.send("PUT", "/api/admin/users/"+uid+"/quota", map[string]any{"quota_bytes": 5 << 30, "note": strings.Repeat("x", 501)}, admin)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	resp.Body.Close()

	time.Sleep(200 * time.Millisecond)
	assert.Empty(t, rs.sent())
}

func TestSingleQuotaChangeEmailsOldToNew(t *testing.T) {
	rs := newResendStub(t)
	ts := serverWithEmail(t, rs)
	admin := ts.adminToken("q-admin@example.com")
	ts.registerAndLogin("q-user@example.com", adminPass)
	uid := ts.idOf("q-user@example.com")
	_, err := ts.db.Pool().Exec(context.Background(), `UPDATE users SET storage_quota_bytes = $1 WHERE id = $2`, int64(5<<30), uid)
	require.NoError(t, err)

	resp := ts.send("PUT", "/api/admin/users/"+uid+"/quota", map[string]any{"quota_bytes": int64(20 << 30)}, admin)
	requireStatus(t, resp, http.StatusOK)
	items := rs.waitFor(t, 1)
	assert.Contains(t, items[0]["html"].(string), "Storage limit:</strong> 5 GB &rarr; 20 GB")
	require.Eventually(t, func() bool {
		return ts.countScalar(`SELECT count(*) FROM audit_events WHERE event_type='admin_quota_change'`) == 1
	}, 3*time.Second, 50*time.Millisecond)
}

func TestNotificationSkippedWhenEmailNotConfigured(t *testing.T) {
	ts := setupTestServer(t)
	cleanDB(t, ts.db)
	admin := ts.adminToken("nc-admin@example.com")
	ts.registerAndLogin("nc-user@example.com", adminPass)
	uid := ts.idOf("nc-user@example.com")
	resp := ts.send("PUT", "/api/admin/users/"+uid+"/plan", map[string]any{"plan": "pro"}, admin)
	requireStatus(t, resp, http.StatusOK)
}

func TestSingleDeleteNotifiesUser(t *testing.T) {
	rs := newResendStub(t)
	ts := serverWithEmail(t, rs)
	admin := ts.adminToken("d-admin@example.com")
	ts.registerAndLogin("d-user@example.com", adminPass)
	uid := ts.idOf("d-user@example.com")

	resp := ts.send("DELETE", "/api/admin/users/"+uid, map[string]any{"password": adminPass, "note": "spam"}, admin)
	requireStatus(t, resp, http.StatusOK)
	items := rs.waitFor(t, 1)
	assert.Equal(t, "Your zcrypt account was deleted", items[0]["subject"])
	assert.Equal(t, []string{"d-user@example.com"}, rs.recipients())
}

func TestBulkSetPlanQuotaAndPerIDResults(t *testing.T) {
	rs := newResendStub(t)
	ts := serverWithEmail(t, rs)
	admin := ts.adminToken("b-admin@example.com")
	ts.registerAndLogin("b-one@example.com", adminPass)
	ts.registerAndLogin("b-two@example.com", adminPass)
	one, two := ts.idOf("b-one@example.com"), ts.idOf("b-two@example.com")
	ghost := "00000000-0000-4000-8000-0000000000aa"

	resp := ts.send("POST", "/api/admin/users/bulk", map[string]any{
		"ids": []string{one, two, ghost}, "action": "set_plan", "value": "pro",
	}, admin)
	var out bulkResp
	decodeJSON(t, resp, &out)
	require.Len(t, out.Results, 3)
	byID := map[string]bool{}
	for _, r := range out.Results {
		byID[r.ID] = r.OK
		if r.ID == ghost {
			assert.Equal(t, "user not found", r.Error)
		}
	}
	assert.True(t, byID[one])
	assert.True(t, byID[two])
	assert.False(t, byID[ghost])
	assert.Equal(t, 2, ts.countScalar(`SELECT count(*) FROM users WHERE plan='pro'`))
	rs.waitFor(t, 2)

	resp = ts.send("POST", "/api/admin/users/bulk", map[string]any{
		"ids": []string{one, two}, "action": "set_quota", "value": int64(10 << 30), "notify": false,
	}, admin)
	requireStatus(t, resp, http.StatusOK)
	assert.Equal(t, 2, ts.countScalar(`SELECT count(*) FROM users WHERE storage_quota_bytes = $1`, int64(10<<30)))
	assert.Len(t, rs.sent(), 2, "notify=false sends nothing")

	require.Eventually(t, func() bool {
		return ts.countScalar(`SELECT count(*) FROM audit_events WHERE event_type='admin_plan_change' AND metadata->>'bulk'='true'`) == 2
	}, 3*time.Second, 50*time.Millisecond, "one audit event per user")
}

func TestBulkRoleAndDeleteRules(t *testing.T) {
	rs := newResendStub(t)
	ts := serverWithEmail(t, rs)
	admin := ts.adminToken("br-admin@example.com")
	ts.registerAndLogin("br-user@example.com", adminPass)
	ts.registerAndLogin("br-user2@example.com", adminPass)
	adminID := ts.idOf("br-admin@example.com")
	u1, u2 := ts.idOf("br-user@example.com"), ts.idOf("br-user2@example.com")

	for _, action := range []string{"set_role", "delete"} {
		resp := ts.send("POST", "/api/admin/users/bulk", map[string]any{
			"ids": []string{u1, adminID}, "action": action, "value": "user", "password": adminPass,
		}, admin)
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode, action)
		resp.Body.Close()
	}
	assert.Equal(t, 3, ts.countScalar(`SELECT count(*) FROM users`))

	resp := ts.send("POST", "/api/admin/users/bulk", map[string]any{
		"ids": []string{u1}, "action": "set_role", "value": "admin",
	}, admin)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode, "role change needs re-auth")
	resp.Body.Close()

	resp = ts.send("POST", "/api/admin/users/bulk", map[string]any{
		"ids": []string{u1}, "action": "set_role", "value": "admin", "password": adminPass,
	}, admin)
	requireStatus(t, resp, http.StatusOK)
	assert.Equal(t, 2, ts.countScalar(`SELECT count(*) FROM users WHERE role='admin'`))
	items := rs.waitFor(t, 1)
	assert.Contains(t, items[0]["html"].(string), "Account role:</strong> Member &rarr; Administrator")

	resp = ts.send("POST", "/api/admin/users/bulk", map[string]any{
		"ids": []string{u1, u2}, "action": "delete", "password": adminPass,
	}, admin)
	var out bulkResp
	decodeJSON(t, resp, &out)
	for _, r := range out.Results {
		assert.True(t, r.OK, r.Error)
	}
	assert.Equal(t, 1, ts.countScalar(`SELECT count(*) FROM users`))
}

func TestBulkValidationAndAuthz(t *testing.T) {
	rs := newResendStub(t)
	ts := serverWithEmail(t, rs)
	admin := ts.adminToken("bv-admin@example.com")
	user := ts.registerAndLogin("bv-user@example.com", adminPass)

	resp := ts.send("POST", "/api/admin/users/bulk", map[string]any{"ids": []string{}, "action": "set_plan", "value": "pro"}, admin)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	resp.Body.Close()
	resp = ts.send("POST", "/api/admin/users/bulk", map[string]any{"ids": []string{"bad"}, "action": "set_plan", "value": "pro"}, admin)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	resp.Body.Close()
	resp = ts.send("POST", "/api/admin/users/bulk", map[string]any{"ids": []string{ts.idOf("bv-user@example.com")}, "action": "set_plan", "value": "pro"}, user)
	assert.Equal(t, http.StatusForbidden, resp.StatusCode)
	resp.Body.Close()
}

func TestEmailDryRunExcludesOptedOutAndUnverified(t *testing.T) {
	rs := newResendStub(t)
	ts := serverWithEmail(t, rs)
	admin := ts.adminToken("e-admin@example.com")
	for _, e := range []string{"e-ok@example.com", "e-optout@example.com", "e-unverified@example.com", "e-pro@example.com"} {
		ts.registerAndLogin(e, adminPass)
	}
	ts.verifyEmail("e-admin@example.com")
	ts.verifyEmail("e-ok@example.com")
	ts.verifyEmail("e-optout@example.com")
	ts.verifyEmail("e-pro@example.com")
	_, err := ts.db.Pool().Exec(context.Background(), `UPDATE users SET email_opt_out = TRUE WHERE email = 'e-optout@example.com'`)
	require.NoError(t, err)
	_, err = ts.db.Pool().Exec(context.Background(), `UPDATE users SET plan = 'pro' WHERE email = 'e-pro@example.com'`)
	require.NoError(t, err)

	count := func(body map[string]any) int {
		body["subject"], body["body"], body["dry_run"] = "Hi", "Hello", true
		resp := ts.send("POST", "/api/admin/emails", body, admin)
		var out struct {
			Count int `json:"recipient_count"`
		}
		decodeJSON(t, resp, &out)
		return out.Count
	}
	assert.Equal(t, 3, count(map[string]any{"audience": "all"}))
	assert.Equal(t, 1, count(map[string]any{"audience": "plan:pro"}))
	assert.Equal(t, 1, count(map[string]any{"audience": "ids", "ids": []string{
		ts.idOf("e-ok@example.com"), ts.idOf("e-optout@example.com"), ts.idOf("e-unverified@example.com")}}))
	assert.Empty(t, rs.sent(), "dry run sends nothing")
}

func TestEmailCampaignSendTestAndHistory(t *testing.T) {
	rs := newResendStub(t)
	ts := serverWithEmail(t, rs)
	admin := ts.adminToken("c-admin@example.com")
	ts.registerAndLogin("c-one@example.com", adminPass)
	ts.registerAndLogin("c-two@example.com", adminPass)
	for _, e := range []string{"c-admin@example.com", "c-one@example.com", "c-two@example.com"} {
		ts.verifyEmail(e)
	}

	resp := ts.send("POST", "/api/admin/emails", map[string]any{"subject": "Launch", "body": "See https://zcrypt.cloud", "audience": "all", "test": true}, admin)
	requireStatus(t, resp, http.StatusOK)
	items := rs.waitFor(t, 1)
	assert.Equal(t, []string{"c-admin@example.com"}, rs.recipients())
	assert.Equal(t, "[Test] Launch", items[0]["subject"])

	resp = ts.send("POST", "/api/admin/emails", map[string]any{"subject": "Launch", "body": "See https://zcrypt.cloud", "audience": "all"}, admin)
	var started struct {
		ID    string `json:"id"`
		Count int    `json:"recipient_count"`
	}
	require.Equal(t, http.StatusAccepted, resp.StatusCode)
	decodeJSON(t, resp, &started)
	assert.Equal(t, 3, started.Count)
	require.NotEmpty(t, started.ID)

	items = rs.waitFor(t, 4)
	for _, it := range items[1:] {
		assert.NotContains(t, it, "reply_to")
		assert.Equal(t, "zcrypt <noreply@zcrypt.test>", it["from"])
		headers := it["headers"].(map[string]any)
		assert.Contains(t, headers["List-Unsubscribe"], "/api/email/unsubscribe?token=")
		assert.Equal(t, "List-Unsubscribe=One-Click", headers["List-Unsubscribe-Post"])
	}

	var camp struct {
		SentCount   int        `json:"sent_count"`
		FailedCount int        `json:"failed_count"`
		FinishedAt  *time.Time `json:"finished_at"`
	}
	require.Eventually(t, func() bool {
		r := ts.GET("/api/admin/emails/"+started.ID, admin)
		camp.FinishedAt = nil
		decodeJSON(t, r, &camp)
		return camp.FinishedAt != nil
	}, 5*time.Second, 50*time.Millisecond)
	assert.Equal(t, 3, camp.SentCount)
	assert.Zero(t, camp.FailedCount)

	var list struct {
		Campaigns []struct {
			ID string `json:"id"`
		} `json:"campaigns"`
		Total int `json:"total"`
	}
	decodeJSON(t, ts.GET("/api/admin/emails", admin), &list)
	require.Len(t, list.Campaigns, 1)
	assert.Equal(t, 1, list.Total)
	assert.Equal(t, started.ID, list.Campaigns[0].ID)

	r := ts.GET("/api/admin/emails/00000000-0000-4000-8000-0000000000bb", admin)
	assert.Equal(t, http.StatusNotFound, r.StatusCode)
	r.Body.Close()
}

func TestEmailSendValidation(t *testing.T) {
	rs := newResendStub(t)
	ts := serverWithEmail(t, rs)
	admin := ts.adminToken("v-admin@example.com")
	for _, body := range []map[string]any{
		{"subject": "", "body": "b", "audience": "all"},
		{"subject": "s", "body": "", "audience": "all"},
		{"subject": "s", "body": "b", "audience": "plan:nope"},
		{"subject": "s", "body": "b", "audience": "ids"},
		{"subject": "s", "body": "b", "audience": "all"},
	} {
		resp := ts.send("POST", "/api/admin/emails", body, admin)
		assert.Equal(t, http.StatusBadRequest, resp.StatusCode, "%v", body)
		resp.Body.Close()
	}
}

func TestUnsubscribeFlow(t *testing.T) {
	rs := newResendStub(t)
	ts := serverWithEmail(t, rs)
	admin := ts.adminToken("u-admin@example.com")
	userTok := ts.registerAndLogin("u-user@example.com", adminPass)
	ts.verifyEmail("u-user@example.com")
	ts.verifyEmail("u-admin@example.com")
	uid := ts.idOf("u-user@example.com")

	resp := ts.send("POST", "/api/admin/emails", map[string]any{"subject": "S", "body": "B", "audience": "ids", "ids": []string{uid}}, admin)
	require.Equal(t, http.StatusAccepted, resp.StatusCode)
	resp.Body.Close()
	items := rs.waitFor(t, 1)
	link := items[0]["headers"].(map[string]any)["List-Unsubscribe"].(string)
	link = strings.Trim(link, "<>")
	u, err := url.Parse(link)
	require.NoError(t, err)

	bad := ts.GET("/api/email/unsubscribe?token=garbage", "")
	assert.Equal(t, http.StatusBadRequest, bad.StatusCode)
	bad.Body.Close()
	assert.Equal(t, 0, ts.countScalar(`SELECT count(*) FROM users WHERE email_opt_out`))

	ok := ts.GET("/api/email/unsubscribe?token="+url.QueryEscape(u.Query().Get("token")), "")
	body, _ := io.ReadAll(ok.Body)
	ok.Body.Close()
	assert.Equal(t, http.StatusOK, ok.StatusCode)
	assert.Contains(t, ok.Header.Get("Content-Type"), "text/html")
	assert.Contains(t, string(body), "unsubscribed")
	assert.Equal(t, 1, ts.countScalar(`SELECT count(*) FROM users WHERE email_opt_out AND id = $1`, uid))

	var prefs struct {
		OptOut bool `json:"email_opt_out"`
	}
	decodeJSON(t, ts.GET("/api/email/preferences", userTok), &prefs)
	assert.True(t, prefs.OptOut)

	resp = ts.send("PUT", "/api/email/preferences", map[string]any{"email_opt_out": false}, userTok)
	requireStatus(t, resp, http.StatusOK)
	assert.Equal(t, 0, ts.countScalar(`SELECT count(*) FROM users WHERE email_opt_out`))

	resp = ts.send("PUT", "/api/email/preferences", map[string]any{}, userTok)
	assert.Equal(t, http.StatusBadRequest, resp.StatusCode)
	resp.Body.Close()
}
