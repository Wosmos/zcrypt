//go:build integration

package integration_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/zcrypt/zcrypt/types"
)

type relayQuota struct {
	RelayUsedBytes    int64     `json:"relay_used_bytes"`
	RelayLimitBytes   int64     `json:"relay_limit_bytes"`
	RelayMaxFileBytes int64     `json:"relay_max_file_bytes"`
	RelayResetsAt     time.Time `json:"relay_resets_at"`
}

type relayRefusal struct {
	Code       string    `json:"code"`
	LimitBytes int64     `json:"limit_bytes"`
	UsedBytes  int64     `json:"used_bytes"`
	ResetsAt   time.Time `json:"resets_at"`
}

func relayTag() string { return uuid.NewString()[:8] }

func (ts *testServer) relayQuotaOf(token string) relayQuota {
	ts.t.Helper()
	var q relayQuota
	require.NoError(ts.t, json.Unmarshal(requireStatus(ts.t, ts.GET("/api/quota", token), http.StatusOK), &q))
	return q
}

func (ts *testServer) relayInit(token string, size int64, sha string) *http.Response {
	ts.t.Helper()
	return ts.POST("/api/upload/init", uploadInitBody(size, 1, 0, sha), token)
}

func (ts *testServer) byosInit(token, platform string, size int64, sha string) *http.Response {
	ts.t.Helper()
	return ts.POST("/api/upload/init", map[string]interface{}{
		"encrypted_name": "direct.bin",
		"original_size":  size,
		"sha256":         sha,
		"salt":           validSalt,
		"chunk_count":    1,
		"platform":       platform,
		"mode":           types.UploadModeBYOSDirect,
	}, token)
}

func (ts *testServer) relayUploadOneChunk(token string, size int64, body []byte, sha string) string {
	ts.t.Helper()
	var init struct {
		SessionID string `json:"session_id"`
		FileID    string `json:"file_id"`
	}
	require.NoError(ts.t, json.Unmarshal(requireStatus(ts.t, ts.relayInit(token, size, sha), http.StatusOK), &init))
	requireStatus(ts.t, ts.PUT("/api/upload/"+init.SessionID+"/chunk/0", body, token), http.StatusOK)
	requireStatus(ts.t, ts.PUT("/api/upload/"+init.SessionID+"/chunk/0", body, token), http.StatusOK)
	requireStatus(ts.t, ts.POST("/api/upload/"+init.SessionID+"/complete", map[string]interface{}{}, token), http.StatusOK)
	return init.FileID
}

func relayChunk(n int) []byte {
	b := make([]byte, n)
	for i := range b {
		b[i] = byte(i)
	}
	return b
}

func TestRelayUploadCountsBytesButDirectDoesNot(t *testing.T) {
	ts := setupTestServer(t)
	tag := relayTag()
	relayEmail := "relay-count-" + tag + "@example.com"
	relayToken := ts.registerAndLogin(relayEmail, newTestPassword())
	ts.enableMockStorage(relayEmail)

	ts.relayUploadOneChunk(relayToken, 100, relayChunk(128), "rc-"+tag)
	assert.Equal(t, int64(128), ts.relayQuotaOf(relayToken).RelayUsedBytes,
		"a chunk is counted once, its duplicate re-PUT is not")

	directEmail := "relay-direct-" + tag + "@example.com"
	directToken := ts.registerAndLogin(directEmail, newTestPassword())
	ts.givePersonalToken(directEmail, types.PlatformGitHub, "octocat")
	var init struct {
		SessionID string `json:"session_id"`
	}
	require.NoError(t, json.Unmarshal(requireStatus(t, ts.byosInit(directToken, types.PlatformGitHub, 100, "dc-"+tag), http.StatusOK), &init))
	repoID := "github_octocat_quiet-otter_" + tag
	requireStatus(t, ts.POST("/api/repos/register", map[string]interface{}{
		"id": repoID, "platform": types.PlatformGitHub, "account": "octocat",
		"name": "quiet-otter", "url": "octocat/quiet-otter", "max_bytes": 850 << 20,
	}, directToken), http.StatusOK)
	requireStatus(t, ts.POST("/api/upload/"+init.SessionID+"/confirm/0", map[string]interface{}{
		"sha256": "directchunk", "size": 128, "remote_path": "ab/cd.bin", "compressed": false,
		"platform": types.PlatformGitHub, "account": "octocat", "repo_id": repoID, "committed": true,
	}, directToken), http.StatusOK)
	requireStatus(t, ts.POST("/api/upload/"+init.SessionID+"/complete", map[string]interface{}{}, directToken), http.StatusOK)

	assert.Zero(t, ts.relayQuotaOf(directToken).RelayUsedBytes, "a direct upload never passes through the server")
}

func TestRelayFileTooLargeOnlyRefusesRelay(t *testing.T) {
	t.Setenv("ZCRYPT_RELAY_MAX_FILE_BYTES", "1000")
	ts := setupTestServer(t)
	tag := relayTag()

	relayEmail := "relay-big-" + tag + "@example.com"
	relayToken := ts.registerAndLogin(relayEmail, newTestPassword())
	ts.enableMockStorage(relayEmail)
	var refusal relayRefusal
	require.NoError(t, json.Unmarshal(requireStatus(t, ts.relayInit(relayToken, 2000, "rb-"+tag), http.StatusRequestEntityTooLarge), &refusal))
	assert.Equal(t, types.ErrCodeRelayFileTooLarge, refusal.Code)
	assert.Equal(t, int64(1000), refusal.LimitBytes)
	requireStatus(t, ts.relayInit(relayToken, 1000, "rs-"+tag), http.StatusOK)

	directEmail := "relay-big-direct-" + tag + "@example.com"
	directToken := ts.registerAndLogin(directEmail, newTestPassword())
	ts.givePersonalToken(directEmail, types.PlatformTelegram, "bigbot")
	requireStatus(t, ts.byosInit(directToken, types.PlatformTelegram, 2000, "db-"+tag), http.StatusOK)
}

func TestRelayAllowanceRefusesUploadsButNeverDownloads(t *testing.T) {
	t.Setenv("ZCRYPT_RELAY_MONTHLY_BYTES", "200")
	ts := setupTestServer(t)
	tag := relayTag()
	email := "relay-month-" + tag + "@example.com"
	token := ts.registerAndLogin(email, newTestPassword())
	ts.enableMockStorage(email)

	fileID := ts.relayUploadOneChunk(token, 100, relayChunk(128), "ma-"+tag)
	requireStatus(t, ts.GET("/api/files/"+fileID+"/chunks/0", token), http.StatusOK)
	assert.Equal(t, int64(256), ts.relayQuotaOf(token).RelayUsedBytes)

	var refusal relayRefusal
	require.NoError(t, json.Unmarshal(requireStatus(t, ts.relayInit(token, 50, "mb-"+tag), http.StatusForbidden), &refusal))
	assert.Equal(t, types.ErrCodeRelayAllowanceExceeded, refusal.Code)
	assert.Equal(t, int64(256), refusal.UsedBytes)
	assert.Equal(t, int64(200), refusal.LimitBytes)
	y, m, _ := time.Now().UTC().Date()
	assert.True(t, refusal.ResetsAt.Equal(time.Date(y, m+1, 1, 0, 0, 0, 0, time.UTC)), refusal.ResetsAt.String())

	body := requireStatus(t, ts.GET("/api/files/"+fileID+"/chunks/0", token), http.StatusOK)
	assert.Equal(t, relayChunk(128), body, "downloads keep working past the allowance")
	assert.Equal(t, int64(384), ts.relayQuotaOf(token).RelayUsedBytes, "and are still counted")
}

func TestRelayShareDownloadCountsAgainstOwner(t *testing.T) {
	ts := setupTestServer(t)
	tag := relayTag()
	email := "relay-share-" + tag + "@example.com"
	token := ts.registerAndLogin(email, newTestPassword())
	ts.enableMockStorage(email)
	fileID := ts.relayUploadOneChunk(token, 100, relayChunk(64), "sh-"+tag)

	var share struct {
		Token string `json:"token"`
	}
	require.NoError(t, json.Unmarshal(requireStatus(t, ts.POST("/api/shares", map[string]interface{}{
		"file_id": fileID, "wrapped_cek": "wrapped", "max_downloads": 0,
	}, token), http.StatusOK), &share))
	require.NotEmpty(t, share.Token)
	requireStatus(t, ts.GET("/api/share/"+share.Token+"/chunks/0", ""), http.StatusOK)
	assert.Equal(t, int64(128), ts.relayQuotaOf(token).RelayUsedBytes)
}

func TestRelayLimitsExemptAdmins(t *testing.T) {
	t.Setenv("ZCRYPT_RELAY_MAX_FILE_BYTES", "1000")
	t.Setenv("ZCRYPT_RELAY_MONTHLY_BYTES", "1")
	ts := setupTestServer(t)
	ctx := context.Background()
	tag := relayTag()
	email := "relay-admin-" + tag + "@example.com"
	pass := newTestPassword()
	ts.registerAndLogin(email, pass)
	ts.makeAdmin(ctx, email)
	token := ts.loginToken(email, pass)
	ts.enableMockStorage(email)

	ts.relayUploadOneChunk(token, 100, relayChunk(64), "aa-"+tag)
	requireStatus(t, ts.relayInit(token, 5000, "ab-"+tag), http.StatusOK)

	q := ts.relayQuotaOf(token)
	assert.Equal(t, int64(64), q.RelayUsedBytes, "admins are still counted")
	assert.Zero(t, q.RelayLimitBytes)
	assert.Zero(t, q.RelayMaxFileBytes)
}

func TestRelayQuotaFields(t *testing.T) {
	t.Setenv("ZCRYPT_RELAY_MAX_FILE_BYTES", "")
	t.Setenv("ZCRYPT_RELAY_MONTHLY_BYTES", "")
	ts := setupTestServer(t)
	token := ts.registerAndLogin("relay-quota-"+relayTag()+"@example.com", newTestPassword())
	q := ts.relayQuotaOf(token)
	assert.Zero(t, q.RelayUsedBytes)
	assert.Equal(t, int64(20)<<30, q.RelayLimitBytes)
	assert.Equal(t, int64(2)<<30, q.RelayMaxFileBytes)
	y, m, _ := time.Now().UTC().Date()
	assert.True(t, q.RelayResetsAt.Equal(time.Date(y, m+1, 1, 0, 0, 0, 0, time.UTC)), q.RelayResetsAt.String())

	t.Setenv("ZCRYPT_RELAY_MAX_FILE_BYTES", "0")
	t.Setenv("ZCRYPT_RELAY_MONTHLY_BYTES", "0")
	q = ts.relayQuotaOf(token)
	assert.Zero(t, q.RelayLimitBytes, "0 means unlimited")
	assert.Zero(t, q.RelayMaxFileBytes, "0 means unlimited")
}

func TestAdminUsersRelayFieldsAndHeavyFilter(t *testing.T) {
	t.Setenv("ZCRYPT_RELAY_ALERT_DAILY_BYTES", "1000")
	ts := setupTestServer(t)
	ctx := context.Background()
	tag := relayTag()
	pass := newTestPassword()
	adminEmail := "relay-adm-" + tag + "@example.com"
	ts.registerAndLogin(adminEmail, pass)
	ts.makeAdmin(ctx, adminEmail)
	adminToken := ts.loginToken(adminEmail, pass)

	heavyEmail := "relay-heavy-" + tag + "@example.com"
	ts.registerAndLogin(heavyEmail, pass)
	heavy, err := ts.db.GetUserByEmail(ctx, heavyEmail)
	require.NoError(t, err)
	lightEmail := "relay-light-" + tag + "@example.com"
	ts.registerAndLogin(lightEmail, pass)
	light, err := ts.db.GetUserByEmail(ctx, lightEmail)
	require.NoError(t, err)

	require.NoError(t, ts.db.AddRelayUsage(ctx, heavy.ID, 900, 0))
	require.NoError(t, ts.db.AddRelayUsage(ctx, heavy.ID, 0, 200))
	require.NoError(t, ts.db.AddRelayUsage(ctx, light.ID, 300, 0))
	_, err = ts.db.Pool().Exec(ctx,
		`INSERT INTO relay_usage (user_id, day, up_bytes) VALUES ($1, (NOW() AT TIME ZONE 'UTC')::date - 1, 400), ($1, (NOW() AT TIME ZONE 'UTC')::date - 2, 5000)`,
		light.ID)
	require.NoError(t, err)

	today := time.Now().UTC()
	lightMonth := int64(300)
	for days, n := range map[int]int64{1: 400, 2: 5000} {
		if today.AddDate(0, 0, -days).Month() == today.Month() {
			lightMonth += n
		}
	}

	type row struct {
		Email           string `json:"email"`
		Relay24hBytes   int64  `json:"relay_24h_bytes"`
		RelayMonthBytes int64  `json:"relay_month_bytes"`
		HeavyRelay      bool   `json:"heavy_relay"`
	}
	var page struct {
		Users []row `json:"users"`
		Total int   `json:"total"`
	}
	ts.adminGet("/api/admin/users?q="+tag, adminToken, http.StatusOK, &page)
	byEmail := map[string]row{}
	for _, u := range page.Users {
		byEmail[u.Email] = u
	}
	assert.Equal(t, row{heavyEmail, 1100, 1100, true}, byEmail[heavyEmail])
	assert.Equal(t, row{lightEmail, 700, lightMonth, false}, byEmail[lightEmail],
		"the 24h window is today and yesterday only")

	ts.adminGet("/api/admin/users?heavy_relay=1&q="+tag, adminToken, http.StatusOK, &page)
	require.Equal(t, 1, page.Total)
	require.Len(t, page.Users, 1)
	assert.Equal(t, heavyEmail, page.Users[0].Email)
	assert.True(t, page.Users[0].HeavyRelay)

	ts.adminGet("/api/admin/users?heavy_relay=0&q="+tag, adminToken, http.StatusOK, &page)
	assert.Equal(t, 3, page.Total)
	ts.adminGet("/api/admin/users?heavy_relay=yes", adminToken, http.StatusBadRequest, nil)

	var detail struct {
		User row `json:"user"`
	}
	ts.adminGet(fmt.Sprintf("/api/admin/users/%s", heavy.ID), adminToken, http.StatusOK, &detail)
	assert.Equal(t, row{heavyEmail, 1100, 1100, true}, detail.User)

	t.Setenv("ZCRYPT_RELAY_ALERT_DAILY_BYTES", "0")
	ts.adminGet("/api/admin/users?heavy_relay=1&q="+tag, adminToken, http.StatusOK, &page)
	assert.Zero(t, page.Total, "a zero threshold flags nobody")
}
