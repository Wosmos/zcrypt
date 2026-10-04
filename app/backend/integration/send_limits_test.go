//go:build integration

package integration_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/zcrypt/zcrypt/adapters"
)

const mib = 1024 * 1024

func pinnedSenderIP() (string, string) {
	a, b := rand.Intn(256), rand.Intn(256)
	return fmt.Sprintf("100.%d.%d.9", a, b), fmt.Sprintf("100.%d.%d.0", a, b)
}

func (ts *testServer) sendInitFrom(ip, token string, size, chunks int, burn bool) (int, map[string]interface{}) {
	ts.t.Helper()
	raw, err := json.Marshal(map[string]interface{}{
		"filename":        "note.txt",
		"original_size":   size,
		"sha256":          strings.Repeat("a", 64),
		"salt":            base64.StdEncoding.EncodeToString(make([]byte, 32)),
		"chunk_count":     chunks,
		"burn_after_read": burn,
	})
	require.NoError(ts.t, err)
	req, err := http.NewRequest(http.MethodPost, ts.URL+"/api/send/init", bytes.NewReader(raw))
	require.NoError(ts.t, err)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Forwarded-For", ip)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	require.NoError(ts.t, err)
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	out := map[string]interface{}{}
	_ = json.Unmarshal(body, &out)
	return resp.StatusCode, out
}

func (ts *testServer) sendUploadChunk(sid string, idx int, payload []byte) {
	ts.t.Helper()
	sum := sha256.Sum256(payload)
	req, err := http.NewRequest(http.MethodPut, fmt.Sprintf("%s/api/send/%s/chunk/%d", ts.URL, sid, idx), bytes.NewReader(payload))
	require.NoError(ts.t, err)
	req.Header.Set("X-Chunk-SHA256", hex.EncodeToString(sum[:]))
	req.Header.Set("X-Forwarded-For", uniqueTestIP())
	resp, err := http.DefaultClient.Do(req)
	require.NoError(ts.t, err)
	resp.Body.Close()
	require.Equal(ts.t, http.StatusOK, resp.StatusCode)
}

func (ts *testServer) seedSendUsage(ip, userID string, size int64) {
	ts.t.Helper()
	ctx := context.Background()
	var uid interface{}
	if userID != "" {
		uid = userID
	}
	_, err := ts.db.Pool().Exec(ctx, `INSERT INTO send_usage (sender_ip, user_id, bytes) VALUES ($1, $2, $3)`, ip, uid, size)
	require.NoError(ts.t, err)
	ts.t.Cleanup(func() {
		_, _ = ts.db.Pool().Exec(context.Background(), `DELETE FROM send_usage WHERE sender_ip = $1`, ip)
	})
}

func (ts *testServer) newAdmin() string {
	ts.t.Helper()
	email := "admin-" + uuid.NewString() + "@example.com"
	pw := newTestPassword()
	ts.registerAndLogin(email, pw)
	ts.makeAdmin(context.Background(), email)
	return ts.loginToken(email, pw)
}

func (ts *testServer) getJSON(path, token string, wantStatus int) map[string]interface{} {
	ts.t.Helper()
	out := map[string]interface{}{}
	require.NoError(ts.t, json.Unmarshal(requireStatus(ts.t, ts.GET(path, token), wantStatus), &out))
	return out
}

func (ts *testServer) setSendPlatformDirect(value string) {
	ts.t.Helper()
	require.NoError(ts.t, ts.db.SetSystemSetting(context.Background(), "send_platform", value))
	ts.t.Cleanup(func() { _ = ts.db.SetSystemSetting(context.Background(), "send_platform", "auto") })
}

func TestSendDailyCapAnonymousAndLoggedIn(t *testing.T) {
	ts := setupTestServer(t)
	ts.srv.InjectGlobalTestAdapter("mock:acct", newKeepAdapter())
	ip, coarse := pinnedSenderIP()

	ts.seedSendUsage(coarse, "", 480*mib)

	status, body := ts.sendInitFrom(ip, "", 50*mib, 5, false)
	assert.Equal(t, http.StatusTooManyRequests, status)
	assert.Equal(t, "send_daily_limit", body["code"])
	assert.Equal(t, true, body["login_required"])
	assert.Contains(t, body["error"], "log in to send more")

	status, _ = ts.sendInitFrom(ip, "", 1*mib, 1, false)
	assert.Equal(t, http.StatusOK, status, "a send that fits under the remaining allowance is accepted")

	email := "sender-" + uuid.NewString() + "@example.com"
	token := ts.registerAndLogin(email, newTestPassword())
	status, body = ts.sendInitFrom(ip, token, 50*mib, 5, false)
	require.Equal(t, http.StatusOK, status, "a signed-in sender is not held to the IP cap")

	var owner string
	require.NoError(t, ts.db.Pool().QueryRow(context.Background(),
		`SELECT COALESCE(user_id::text, '') FROM send_transfers WHERE id = $1`, body["session_id"]).Scan(&owner))
	user, err := ts.db.GetUserByEmail(context.Background(), email)
	require.NoError(t, err)
	assert.Equal(t, user.ID, owner, "the transfer remembers the signed-in sender")

	ts.seedSendUsage(coarse, user.ID, 5*1024*mib-10*mib)
	status, body = ts.sendInitFrom(ip, token, 50*mib, 5, false)
	assert.Equal(t, http.StatusTooManyRequests, status, "the per-user daily cap still applies")
	assert.Equal(t, "send_daily_limit", body["code"])
	assert.Equal(t, false, body["login_required"])

	status, _ = ts.sendInitFrom(ip, "not-a-valid-token", 1*mib, 1, false)
	assert.Equal(t, http.StatusOK, status, "an invalid session degrades to anonymous instead of failing")
}

func TestSendDailyCapSurvivesDeletingTheTransfer(t *testing.T) {
	ts := setupTestServer(t)
	ts.srv.InjectGlobalTestAdapter("mock:acct", newKeepAdapter())
	ip, coarse := pinnedSenderIP()
	ts.seedSendUsage(coarse, "", 460*mib)

	status, body := ts.sendInitFrom(ip, "", 30*mib, 3, false)
	require.Equal(t, http.StatusOK, status)
	_, err := ts.db.DeleteSendTransfer(context.Background(), body["session_id"].(string))
	require.NoError(t, err)

	status, _ = ts.sendInitFrom(ip, "", 30*mib, 3, false)
	assert.Equal(t, http.StatusTooManyRequests, status, "deleting a send does not refund its quota")
}

func TestBurnAfterReadDeletesChunksOnceFullyRead(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	ts.srv.InjectGlobalTestAdapter("mock:acct", newKeepAdapter())

	status, body := ts.sendInitFrom(uniqueTestIP(), "", 128, 2, true)
	require.Equal(t, http.StatusOK, status)
	sid, token := body["session_id"].(string), body["token"].(string)
	ts.sendUploadChunk(sid, 0, bytes.Repeat([]byte{1}, 64))
	ts.sendUploadChunk(sid, 1, bytes.Repeat([]byte{2}, 64))
	requireStatus(t, ts.POST("/api/send/"+sid+"/complete", map[string]interface{}{}, ""), http.StatusOK)

	chunks, err := ts.db.GetSendChunks(ctx, sid)
	require.NoError(t, err)
	require.Len(t, chunks, 2)
	paths := []string{chunks[0].RemotePath, chunks[1].RemotePath}
	queued := func() int {
		return ts.countScalar(`SELECT count(*) FROM pending_deletions WHERE remote_path = ANY($1)`, paths)
	}
	transferRows := func() int {
		return ts.countScalar(`SELECT count(*) FROM send_transfers WHERE id = $1`, sid)
	}

	assert.Equal(t, http.StatusOK, ts.sendGet("/api/send/"+token+"/meta"))
	assert.Equal(t, http.StatusOK, ts.sendGet("/api/send/"+token+"/chunks/1"), "the last chunk may arrive first")
	assert.Equal(t, 1, transferRows(), "the transfer survives until every chunk was read")
	assert.Equal(t, 0, queued())

	assert.Equal(t, http.StatusOK, ts.sendGet("/api/send/"+token+"/chunks/0"))
	assert.Equal(t, 0, transferRows(), "the consumed transfer is deleted")
	assert.Equal(t, 2, queued(), "its chunks are queued for platform deletion")
	assert.Equal(t, http.StatusNotFound, ts.sendGet("/api/send/"+token+"/chunks/0"))
}

func TestNonBurnSendIsKeptAfterDownload(t *testing.T) {
	ts := setupTestServer(t)
	ts.srv.InjectGlobalTestAdapter("mock:acct", newKeepAdapter())

	status, body := ts.sendInitFrom(uniqueTestIP(), "", 64, 1, false)
	require.Equal(t, http.StatusOK, status)
	sid, token := body["session_id"].(string), body["token"].(string)
	ts.sendUploadChunk(sid, 0, bytes.Repeat([]byte{3}, 64))
	requireStatus(t, ts.POST("/api/send/"+sid+"/complete", map[string]interface{}{}, ""), http.StatusOK)

	assert.Equal(t, http.StatusOK, ts.sendGet("/api/send/"+token+"/meta"))
	assert.Equal(t, http.StatusOK, ts.sendGet("/api/send/"+token+"/chunks/0"))
	assert.Equal(t, 1, ts.countScalar(`SELECT count(*) FROM send_transfers WHERE id = $1`, sid))
}

func TestAdminSendStorageEndpoints(t *testing.T) {
	ts := setupTestServer(t)
	keep := newKeepAdapter()
	ts.srv.InjectGlobalTestAdapters(map[string]adapters.PlatformAdapter{"github:ga": keep, "telegram:tb": keep})
	ts.setSendPlatformDirect("auto")
	admin := ts.newAdmin()
	user := ts.registerAndLogin("plain-"+uuid.NewString()+"@example.com", newTestPassword())

	requireStatus(t, ts.GET("/api/admin/send/storage", user), http.StatusForbidden)
	requireStatus(t, ts.PUT("/api/admin/send/platform", []byte(`{"platform":"telegram"}`), user), http.StatusForbidden)
	requireStatus(t, ts.GET("/api/admin/health/details", user), http.StatusForbidden)

	got := ts.getJSON("/api/admin/send/storage", admin, http.StatusOK)
	assert.Equal(t, "auto", got["platform_setting"])
	assert.Equal(t, []interface{}{
		map[string]interface{}{"key": "github:ga", "platform": "github", "account": "ga"},
		map[string]interface{}{"key": "telegram:tb", "platform": "telegram", "account": "tb"},
	}, got["options"])
	assert.Equal(t, map[string]interface{}{
		"max_file_bytes":   float64(50 * mib),
		"anon_daily_bytes": float64(500 * mib),
		"user_daily_bytes": float64(5 * 1024 * mib),
	}, got["limits"])
	active := got["active"].(map[string]interface{})
	assert.Equal(t, "github", active["platform"])
	assert.Contains(t, active, "repo")

	status, body := ts.sendInitFrom(uniqueTestIP(), "", 64, 1, false)
	require.Equal(t, http.StatusOK, status)
	ts.sendUploadChunk(body["session_id"].(string), 0, bytes.Repeat([]byte{4}, 64))
	chunks, err := ts.db.GetSendChunks(context.Background(), body["session_id"].(string))
	require.NoError(t, err)
	require.Len(t, chunks, 1)

	got = ts.getJSON("/api/admin/send/storage", admin, http.StatusOK)
	usage := got["usage"].(map[string]interface{})
	assert.GreaterOrEqual(t, usage["transfers"].(float64), float64(1))
	assert.GreaterOrEqual(t, usage["chunks"].(float64), float64(1))
	assert.GreaterOrEqual(t, usage["bytes"].(float64), float64(64))
	assert.NotNil(t, usage["oldest_expires_at"])
	found := false
	for _, l := range usage["by_location"].([]interface{}) {
		loc := l.(map[string]interface{})
		if loc["repo"] == chunks[0].Repo && loc["platform"] == "github" {
			found = true
			assert.GreaterOrEqual(t, loc["chunks"].(float64), float64(1))
		}
	}
	assert.True(t, found, "the repo holding our chunk is listed")
}

func TestSendPlatformSettingIsHonoured(t *testing.T) {
	ts := setupTestServer(t)
	keep := newKeepAdapter()
	ts.srv.InjectGlobalTestAdapters(map[string]adapters.PlatformAdapter{"github:ga": keep, "telegram:tb": keep})
	ts.setSendPlatformDirect("auto")
	admin := ts.newAdmin()

	requireStatus(t, ts.PUT("/api/admin/send/platform", []byte(`{"platform":"gitlab"}`), admin), http.StatusBadRequest)
	requireStatus(t, ts.PUT("/api/admin/send/platform", []byte(`{"platform":"nonsense"}`), admin), http.StatusBadRequest)
	requireStatus(t, ts.PUT("/api/admin/send/platform", []byte(`{"platform":"telegram"}`), admin), http.StatusOK)

	got := ts.getJSON("/api/admin/send/storage", admin, http.StatusOK)
	assert.Equal(t, "telegram", got["platform_setting"])
	assert.Equal(t, "telegram", got["active"].(map[string]interface{})["platform"])

	status, body := ts.sendInitFrom(uniqueTestIP(), "", 64, 1, false)
	require.Equal(t, http.StatusOK, status)
	assert.Equal(t, "telegram", body["platform"])
	sid := body["session_id"].(string)
	ts.sendUploadChunk(sid, 0, bytes.Repeat([]byte{5}, 64))
	chunks, err := ts.db.GetSendChunks(context.Background(), sid)
	require.NoError(t, err)
	require.Len(t, chunks, 1)
	assert.Equal(t, "telegram", chunks[0].Platform)
	assert.Equal(t, "tb", chunks[0].Account)

	ts.setSendPlatformDirect("gitlab")
	status, _ = ts.sendInitFrom(uniqueTestIP(), "", 64, 1, false)
	assert.Equal(t, http.StatusServiceUnavailable, status, "a chosen platform with no adapter fails instead of storing elsewhere")

	requireStatus(t, ts.PUT("/api/admin/send/platform", []byte(`{"platform":"auto"}`), admin), http.StatusOK)
	status, _ = ts.sendInitFrom(uniqueTestIP(), "", 64, 1, false)
	assert.Equal(t, http.StatusOK, status)
}

func TestAdminHealthDetails(t *testing.T) {
	ts := setupTestServer(t)
	ctx := context.Background()
	admin := ts.newAdmin()

	email := "health-" + uuid.NewString() + "@example.com"
	token := ts.registerAndLogin(email, newTestPassword())
	ts.enableMockStorage(email)
	s1, degraded := ts.initRelayUpload(token, "one.bin", 1)
	s2, damaged := ts.initRelayUpload(token, "two.bin", 2)
	requireStatus(t, ts.POST("/api/upload/"+s1+"/complete", map[string]interface{}{}, token), http.StatusOK)
	requireStatus(t, ts.POST("/api/upload/"+s2+"/complete", map[string]interface{}{}, token), http.StatusOK)
	ts.srv.SyncAllChunks(ctx)
	changed, err := ts.db.MarkFileDegraded(ctx, degraded)
	require.NoError(t, err)
	require.True(t, changed)
	_, err = ts.db.MarkFilesDamaged(ctx, []string{damaged})
	require.NoError(t, err)
	u, err := ts.db.GetUserByEmail(ctx, email)
	require.NoError(t, err)

	got := ts.getJSON("/api/admin/health/details", admin, http.StatusOK)
	totals := got["totals"].(map[string]interface{})
	assert.GreaterOrEqual(t, totals["degraded_files"].(float64), float64(1))
	assert.GreaterOrEqual(t, totals["damaged_files"].(float64), float64(1))
	assert.Contains(t, totals, "stuck_chunks")

	var row map[string]interface{}
	for _, r := range got["users"].([]interface{}) {
		if m := r.(map[string]interface{}); m["user_id"] == u.ID {
			row = m
		}
	}
	require.NotNil(t, row, "the user with problem files is listed")
	assert.Equal(t, float64(1), row["degraded_files"])
	assert.Equal(t, float64(1), row["damaged_files"])
	assert.Equal(t, email, row["email"])
	assert.LessOrEqual(t, len(got["users"].([]interface{})), 50)

	samples := got["sample_files"].([]interface{})
	require.NotEmpty(t, samples)
	assert.LessOrEqual(t, len(samples), 20)
	for _, s := range samples {
		m := s.(map[string]interface{})
		assert.Len(t, m, 4, "id, user_id, status, reason and nothing else")
		assert.Contains(t, []interface{}{"degraded", "damaged"}, m["status"])
	}
	raw, _ := json.Marshal(got)
	assert.NotContains(t, string(raw), "one.bin")
	assert.NotContains(t, string(raw), "two.bin")
}
